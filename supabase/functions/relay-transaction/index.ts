/**
 * Non-Custodial Relay Transaction Edge Function
 *
 * Enables gasless transactions using ERC-2771 meta-transactions.
 * Users keep their own USDC - only the transaction gas is paid by the platform.
 *
 * How it works:
 * 1. User signs an ERC-2771 ForwardRequest off-chain
 * 2. This relay verifies the signature and parameters
 * 3. Platform wallet calls forwarder.execute() with the signed request
 * 4. Forwarder calls the escrow contract, which sees the original user as msg.sender
 * 5. User's USDC is pulled directly from their wallet into escrow
 *
 * Key differences from custodial:
 * - Users keep their own USDC (non-custodial)
 * - USDC approval is done via EIP-2612 permit (not ERC2771) in createGameWithPermit
 * - Only gas is paid by the platform
 * - Escrow holds funds during game, then distributes to winner
 *
 * Supported operations:
 * - createGame: User signs to create a game with their USDC (requires prior approval or use createGameWithPermit)
 * - createGameWithPermit: Atomic approval + game creation via EIP-2612 permit
 * - joinGame: User signs to join a game with their USDC
 * - joinGameWithPermit: Atomic approval + join via EIP-2612 permit
 * - cancelGame: User signs to cancel their game
 * - claimTimeoutWin: User signs to claim a timeout win
 *
 * NOTE: approveUsdc via ERC2771 is NOT supported because USDC doesn't implement ERC2771.
 * All approvals must go through the permit-based functions (createGameWithPermit, joinGameWithPermit).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ethers,
  Wallet,
  Contract,
  JsonRpcProvider,
  parseUnits,
  formatUnits,
  AbiCoder,
} from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ERC2771Forwarder ABI (OpenZeppelin)
const FORWARDER_ABI = [
  "function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) payable returns (bool)",
  "function verify((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature)) view returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
];

// Escrow contract ABI
const ESCROW_ABI = [
  "function createGame(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds)",
  "function joinGame(bytes32 gameId)",
  "function cancelGame(bytes32 gameId)",
  "function claimTimeoutWin(bytes32 gameId)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
];

// USDC ABI
const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
];

// Supported operations
type RelayOperation =
  | "createGame"
  | "createGameWithPermit"
  | "joinGame"
  | "joinGameWithPermit"
  | "cancelGame"
  | "claimTimeoutWin"
  | "payEntryFee";

// Request for payEntryFee operation (permit-based, not forwarder-based)
interface PayEntryFeeRequest {
  operation: "payEntryFee";
  userAddress: string;
  amountUsdc: string;
  challengeId: string;
  attemptId?: string;
  permit: {
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
}

interface ForwardRequest {
  from: string;
  to: string;
  value: bigint;
  gas: bigint;
  nonce?: string; // Nonce used when signing (for debugging)
  deadline: number;
  data: string;
  signature: string;
}

interface RelayRequest {
  operation: RelayOperation;
  forwardRequest: ForwardRequest;
  // Additional metadata for logging
  params?: {
    gameId?: string;
    wagerUsdc?: string;
    timeoutSeconds?: number;
  };
}

interface RelayResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  gasUsed?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY");
    const FORWARDER_ADDRESS = Deno.env.get("FORWARDER_ADDRESS");
    const ESCROW_CONTRACT_ADDRESS = Deno.env.get("ESCROW_CONTRACT_ADDRESS");
    const USDC_CONTRACT_ADDRESS =
      Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const BASE_RPC_URL =
      Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";

    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY not configured");
    }
    if (!FORWARDER_ADDRESS) {
      throw new Error("FORWARDER_ADDRESS not configured");
    }
    if (!ESCROW_CONTRACT_ADDRESS) {
      throw new Error("ESCROW_CONTRACT_ADDRESS not configured");
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    console.log("[relay] Auth header present:", !!authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract token
    const token = authHeader.replace("Bearer ", "");
    console.log("[relay] Token length:", token.length);

    // Verify JWT signature via Supabase Auth (prevents JWT forgery attacks)
    let userId: string | null = null;
    let userEmail: string | null = null;

    const supabaseForAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user: authUser }, error: authError } = await supabaseForAuth.auth.getUser(token);
    if (authError || !authUser) {
      console.error("[relay] JWT verification failed:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    userId = authUser.id;
    userEmail = authUser.email ?? null;
    console.log("[relay] Token verified:", { userId });

    // Create Supabase client with service role for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Parse request - peek at operation first
    const rawRequest = await req.json();
    const { operation } = rawRequest;

    // Handle payEntryFee operation separately (uses permit, not forwarder)
    if (operation === "payEntryFee") {
      const entryFeeRequest = rawRequest as PayEntryFeeRequest;
      const { userAddress, amountUsdc, challengeId, attemptId, permit } = entryFeeRequest;

      console.log("[relay] Processing payEntryFee:", { userAddress, amountUsdc, challengeId });

      if (!userAddress || !amountUsdc || !challengeId || !permit) {
        throw new Error("Missing required fields for payEntryFee");
      }

      // Rate limiting (DB-backed — survives cold starts)
      const { data: rateLimitOk } = await supabase.rpc('check_and_increment_relay_rate', {
        p_address: userAddress,
        p_limit: 10,
      });
      if (!rateLimitOk) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get vault address from database — never use a hardcoded fallback
      const { data: VAULT_ADDRESS, error: vaultErr } = await supabase.rpc("get_vault_address");
      if (vaultErr || !VAULT_ADDRESS) {
        throw new Error("Vault address not configured in database");
      }

      // Initialize provider and platform wallet
      const provider = new JsonRpcProvider(BASE_RPC_URL);
      const platformWallet = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);

      console.log(`[relay] Platform wallet: ${platformWallet.address}, Vault: ${VAULT_ADDRESS}`);

      // Create USDC contract instance
      const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, platformWallet);

      // Parse amount (USDC has 6 decimals)
      const amount = parseUnits(amountUsdc, 6);

      // Check user's USDC balance
      const balance = await usdc.balanceOf(userAddress);
      if (balance < amount) {
        throw new Error(`Insufficient USDC balance: have ${formatUnits(balance, 6)}, need ${amountUsdc}`);
      }

      console.log("[relay] User balance OK, executing permit...");

      // Execute permit (allows platform wallet to spend user's USDC)
      try {
        const permitTx = await usdc.permit(
          userAddress,                    // owner
          platformWallet.address,         // spender (platform wallet)
          amount,                         // value
          permit.deadline,                // deadline
          permit.v,                       // v
          permit.r,                       // r
          permit.s                        // s
        );
        await permitTx.wait();
        console.log("[relay] Permit executed:", permitTx.hash);
      } catch (permitError: any) {
        console.error("[relay] Permit failed:", permitError);
        throw new Error(`Permit failed: ${permitError.message || permitError}`);
      }

      // Execute transfer from user to vault
      console.log("[relay] Executing transfer to vault...");
      const transferTx = await usdc.transferFrom(
        userAddress,    // from
        VAULT_ADDRESS,  // to
        amount          // amount
      );
      const receipt = await transferTx.wait();
      console.log("[relay] Transfer complete:", transferTx.hash);

      // Log the collection
      await supabase.from("admin_logs").insert({
        action: "house_entry_fee_collected",
        admin_id: userId,
        target_id: challengeId,
        details: {
          userAddress,
          amountUsdc,
          challengeId,
          attemptId,
          txHash: transferTx.hash,
          vaultAddress: VAULT_ADDRESS,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          txHash: transferTx.hash,
          blockNumber: receipt.blockNumber,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Standard forwarder-based operations
    const request: RelayRequest = rawRequest;
    const { forwardRequest, params } = request;

    if (!operation || !forwardRequest) {
      throw new Error("Missing operation or forwardRequest");
    }

    // Validate forward request
    if (!forwardRequest.from || !forwardRequest.to || !forwardRequest.data || !forwardRequest.signature) {
      throw new Error("Invalid forwardRequest: missing required fields");
    }

    // Rate limiting by user address (DB-backed — survives cold starts)
    const { data: rateLimitOk } = await supabase.rpc('check_and_increment_relay_rate', {
      p_address: forwardRequest.from,
      p_limit: 10,
    });
    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the target contract is what we expect
    // NOTE: Only the escrow contract is allowed as a target.
    // USDC does NOT support ERC2771, so we cannot relay approve() calls to it.
    // All USDC approvals must be done via EIP-2612 permit (in createGameWithPermit).
    // Also allow old escrow for cancelling games during migration
    const OLD_ESCROW_ADDRESS = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
    const allowedTargets = [
      ESCROW_CONTRACT_ADDRESS.toLowerCase(),
      OLD_ESCROW_ADDRESS.toLowerCase(),
    ];
    if (!allowedTargets.includes(forwardRequest.to.toLowerCase())) {
      throw new Error(`Invalid target contract. Only escrow (${ESCROW_CONTRACT_ADDRESS}) or old escrow (${OLD_ESCROW_ADDRESS}) are supported for relay.`);
    }

    console.log(`[relay] Processing ${operation} from ${forwardRequest.from}`);

    // Initialize provider and platform wallet
    const provider = new JsonRpcProvider(BASE_RPC_URL);
    const platformWallet = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);

    console.log(`[relay] Platform wallet: ${platformWallet.address}`);

    // Initialize forwarder contract
    const forwarder = new Contract(FORWARDER_ADDRESS, FORWARDER_ABI, platformWallet);

    // Debug: Log the forward request details
    console.log(`[relay] ForwardRequest details:`, {
      from: forwardRequest.from,
      to: forwardRequest.to,
      value: forwardRequest.value?.toString() || "0",
      gas: forwardRequest.gas?.toString(),
      deadline: forwardRequest.deadline,
      dataLength: forwardRequest.data?.length,
      signatureLength: forwardRequest.signature?.length,
      nonceFromClient: forwardRequest.nonce,
    });

    // Get the current on-chain nonce for this user
    const onChainNonce = await forwarder.nonces(forwardRequest.from);
    console.log(`[relay] On-chain nonce for ${forwardRequest.from}: ${onChainNonce.toString()}`);
    console.log(`[relay] Client signed with nonce: ${forwardRequest.nonce || "not provided"}`);

    // Check for nonce mismatch
    if (forwardRequest.nonce !== undefined && forwardRequest.nonce !== onChainNonce.toString()) {
      console.error(`[relay] NONCE MISMATCH! Client: ${forwardRequest.nonce}, On-chain: ${onChainNonce.toString()}`);
    }

    // Get the forwarder's EIP-712 domain
    try {
      const domain = await forwarder.eip712Domain();
      console.log(`[relay] Forwarder EIP712 domain:`, {
        name: domain[1],
        version: domain[2],
        chainId: domain[3].toString(),
        verifyingContract: domain[4],
      });
    } catch (domainError) {
      console.error(`[relay] Could not fetch EIP712 domain:`, domainError);
    }

    // Parse numeric values (sent as strings from client for JSON compatibility)
    const parsedValue = BigInt(forwardRequest.value || "0");
    const parsedGas = BigInt(forwardRequest.gas || "350000");
    const parsedDeadline = Number(forwardRequest.deadline);

    console.log(`[relay] Parsed values:`, {
      value: parsedValue.toString(),
      gas: parsedGas.toString(),
      deadline: parsedDeadline,
    });

    // Build the request struct for contract calls
    const requestStruct = {
      from: forwardRequest.from,
      to: forwardRequest.to,
      value: parsedValue,
      gas: parsedGas,
      deadline: parsedDeadline,
      data: forwardRequest.data,
      signature: forwardRequest.signature,
    };

    // Verify the signature is valid before submitting
    console.log(`[relay] Calling forwarder.verify()...`);
    console.log(`[relay] Request struct:`, JSON.stringify({
      from: requestStruct.from,
      to: requestStruct.to,
      value: requestStruct.value.toString(),
      gas: requestStruct.gas.toString(),
      deadline: requestStruct.deadline,
      dataLength: requestStruct.data.length,
      signatureLength: requestStruct.signature.length,
    }));

    let isValid = false;
    try {
      isValid = await forwarder.verify(requestStruct);
      console.log(`[relay] Verification result: ${isValid}`);
    } catch (verifyError) {
      console.error(`[relay] verify() threw an exception:`, verifyError);
      // Continue anyway - let execute() fail with a proper error
    }

    if (!isValid) {
      // Try to recover the signer manually to debug
      console.error(`[relay] Signature verification FAILED. Debug info:`);
      console.error(`[relay] - Expected nonce from contract: ${onChainNonce.toString()}`);
      console.error(`[relay] - Signature: ${forwardRequest.signature.substring(0, 66)}...`);
      console.error(`[relay] - Data prefix: ${forwardRequest.data.substring(0, 66)}...`);

      // Manually compute the EIP-712 hash and recover signer
      try {
        const ForwardRequestType = "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)";
        const typeHash = ethers.keccak256(ethers.toUtf8Bytes(ForwardRequestType));
        console.error(`[relay] - ForwardRequest typehash: ${typeHash}`);

        // Get domain from contract for comparison
        const domain = await forwarder.eip712Domain();
        console.error(`[relay] - Contract domain name: "${domain[1]}", version: "${domain[2]}", chainId: ${domain[3].toString()}, verifyingContract: ${domain[4]}`);

        // Encode the struct hash - following OpenZeppelin's exact encoding
        const abiCoder = new AbiCoder();
        const dataHash = ethers.keccak256(forwardRequest.data);
        console.error(`[relay] - Data hash: ${dataHash}`);

        // Log the exact values being encoded
        console.error(`[relay] - Encoding struct with:`);
        console.error(`[relay]   - typeHash: ${typeHash}`);
        console.error(`[relay]   - from: ${forwardRequest.from}`);
        console.error(`[relay]   - to: ${forwardRequest.to}`);
        console.error(`[relay]   - value: ${parsedValue.toString()}`);
        console.error(`[relay]   - gas: ${parsedGas.toString()}`);
        console.error(`[relay]   - nonce: ${onChainNonce.toString()}`);
        console.error(`[relay]   - deadline: ${parsedDeadline}`);
        console.error(`[relay]   - dataHash: ${dataHash}`);

        const structHash = ethers.keccak256(
          abiCoder.encode(
            ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint48", "bytes32"],
            [typeHash, forwardRequest.from, forwardRequest.to, parsedValue, parsedGas, onChainNonce, parsedDeadline, dataHash]
          )
        );
        console.error(`[relay] - Computed struct hash: ${structHash}`);

        // Compute domain separator
        const domainSeparator = ethers.keccak256(
          abiCoder.encode(
            ["bytes32", "bytes32", "bytes32", "uint256", "address"],
            [
              ethers.keccak256(ethers.toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
              ethers.keccak256(ethers.toUtf8Bytes(domain[1])), // name
              ethers.keccak256(ethers.toUtf8Bytes(domain[2])), // version
              domain[3], // chainId
              domain[4], // verifyingContract
            ]
          )
        );
        console.error(`[relay] - Computed domain separator: ${domainSeparator}`);

        // Compute the full EIP-712 hash
        const digest = ethers.keccak256(
          ethers.concat([
            ethers.toUtf8Bytes("\x19\x01"),
            domainSeparator,
            structHash
          ])
        );
        console.error(`[relay] - Computed digest: ${digest}`);

        // Recover signer
        const recoveredSigner = ethers.recoverAddress(digest, forwardRequest.signature);
        console.error(`[relay] - Expected from: ${forwardRequest.from}`);
        console.error(`[relay] - Recovered signer: ${recoveredSigner}`);
        console.error(`[relay] - Match: ${recoveredSigner.toLowerCase() === forwardRequest.from.toLowerCase()}`);

        // If the signer matches but verify() failed, there might be a deeper issue
        if (recoveredSigner.toLowerCase() === forwardRequest.from.toLowerCase()) {
          console.error(`[relay] - SIGNER MATCHES but verify() failed! This suggests:`);
          console.error(`[relay]   1. Target contract might not trust the forwarder`);
          console.error(`[relay]   2. Or there's a subtle encoding difference`);

          // Check if target trusts forwarder (only for escrow, not USDC)
          if (forwardRequest.to.toLowerCase() === ESCROW_CONTRACT_ADDRESS.toLowerCase()) {
            try {
              const targetAbi = ["function isTrustedForwarder(address forwarder) view returns (bool)"];
              const target = new Contract(forwardRequest.to, targetAbi, provider);
              const trustsForwarder = await target.isTrustedForwarder(FORWARDER_ADDRESS);
              console.error(`[relay]   - Target trusts forwarder: ${trustsForwarder}`);
            } catch (trustErr) {
              console.error(`[relay]   - Could not check if target trusts forwarder:`, trustErr);
            }
          } else {
            console.error(`[relay]   - Target is not escrow, cannot check isTrustedForwarder`);
          }
        }
      } catch (debugError) {
        console.error(`[relay] - Debug recovery failed:`, debugError);
      }

      throw new Error("Invalid signature - verification failed");
    }

    // Check deadline hasn't passed
    const now = Math.floor(Date.now() / 1000);
    if (now > forwardRequest.deadline) {
      throw new Error("Request has expired");
    }

    // Execute the forwarded transaction with retry logic for gas price issues
    console.log(`[relay] Executing forwarded transaction...`);

    // Get current gas prices and add buffer for replacement
    const feeData = await provider.getFeeData();
    console.log(`[relay] Current fee data:`, {
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    });

    // Add 20% buffer to gas prices to avoid replacement issues
    const gasMultiplier = 120n; // 120%
    const maxFeePerGas = feeData.maxFeePerGas ? (feeData.maxFeePerGas * gasMultiplier) / 100n : undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * gasMultiplier) / 100n : undefined;

    let tx;
    try {
      tx = await forwarder.execute(requestStruct, {
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
    } catch (sendError: any) {
      // If replacement underpriced, try with higher gas
      if (sendError.code === "REPLACEMENT_UNDERPRICED" || sendError.message?.includes("replacement")) {
        console.log(`[relay] Replacement underpriced, retrying with higher gas...`);
        const higherMultiplier = 150n; // 150%
        const higherMaxFee = feeData.maxFeePerGas ? (feeData.maxFeePerGas * higherMultiplier) / 100n : undefined;
        const higherPriorityFee = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * higherMultiplier) / 100n : undefined;

        tx = await forwarder.execute(requestStruct, {
          maxFeePerGas: higherMaxFee,
          maxPriorityFeePerGas: higherPriorityFee,
        });
      } else {
        throw sendError;
      }
    }

    console.log(`[relay] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();

    console.log(`[relay] Transaction confirmed in block ${receipt.blockNumber}, status: ${receipt.status}`);
    console.log(`[relay] Transaction logs count: ${receipt.logs?.length || 0}`);

    // Check if the transaction actually succeeded
    // status: 1 = success, 0 = reverted
    if (receipt.status === 0) {
      console.error(`[relay] Transaction reverted! Hash: ${receipt.hash}`);

      // Log the failed transaction
      await supabase.from("relay_transactions").insert({
        user_id: userId,
        operation,
        params: params || {},
        tx_hash: receipt.hash,
        success: false,
        gas_used: receipt.gasUsed?.toString(),
        created_at: new Date().toISOString(),
      });

      // Provide operation-specific error messages
      let errorMessage = "Transaction reverted on-chain.";
      if (operation === "cancelGame") {
        errorMessage = "Failed to cancel game. Either the game has already been cancelled/completed, or you are not the creator.";
      } else if (operation === "claimTimeoutWin") {
        errorMessage = "Failed to claim timeout win. The game may not be active or the timeout hasn't been reached yet.";
      } else {
        errorMessage = "Transaction reverted. This may be due to insufficient USDC balance, invalid permit signature, or the game already exists.";
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Even if receipt.status is 1, the inner call might have failed
    // Check if we got meaningful logs from the escrow contract
    // The forwarder at 0x566124d8... and escrow should emit events on success
    // If we only see the Polygon fee log (0x0000...1010), the inner call likely failed
    const meaningfulLogs = receipt.logs?.filter(
      (log: any) => log.address.toLowerCase() !== "0x0000000000000000000000000000000000001010"
    ) || [];

    console.log(`[relay] Meaningful logs (excluding fee): ${meaningfulLogs.length}`);

    if (meaningfulLogs.length === 0) {
      console.error(`[relay] No meaningful logs - inner call likely failed! Hash: ${receipt.hash}`);

      // Log the failed transaction
      await supabase.from("relay_transactions").insert({
        user_id: userId,
        operation,
        params: params || {},
        tx_hash: receipt.hash,
        success: false,
        gas_used: receipt.gasUsed?.toString(),
        created_at: new Date().toISOString(),
      });

      // Provide operation-specific error messages
      let errorMessage = "Transaction completed but inner call failed.";
      if (operation === "cancelGame") {
        errorMessage = "Failed to cancel game. Either the game has already been cancelled/completed, another player has joined, or you are not the creator.";
      } else if (operation === "claimTimeoutWin") {
        errorMessage = "Failed to claim timeout win. The game may not be active, or the timeout hasn't been reached yet.";
      } else {
        errorMessage = "Transaction completed but inner call failed. This may be due to insufficient USDC balance, invalid permit signature, or the game already exists.";
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log the successful relay transaction
    await supabase.from("relay_transactions").insert({
      user_id: userId,
      operation,
      params: params || {},
      tx_hash: receipt.hash,
      success: true,
      gas_used: receipt.gasUsed?.toString(),
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[relay] Error:", error);

    // Try to extract more detailed error information
    let errorMessage = error.message || "Unknown error";
    let errorCode = null;
    let errorReason = null;

    // Extract operation from the request if available
    let currentOperation: string | null = null;
    try {
      const reqBody = await req.clone().json();
      currentOperation = reqBody?.operation;
    } catch {
      // Ignore - request body already consumed
    }

    // Check for ethers.js call exceptions which contain revert reasons
    if (error.code === "CALL_EXCEPTION") {
      errorCode = error.code;
      errorReason = error.reason;

      // Try to decode common error selectors
      if (error.data) {
        const errorSelectors: Record<string, string> = {
          "0xd6bda275": "FailedCall - transaction failed on-chain",
          "0x2b835c65": "InvalidWagerAmount - wager below minimum (1 USDC) or above maximum",
          "0x0ab805f9": "GameAlreadyExists - game ID already used",
          "0xfb8f41b2": "ERC20InsufficientAllowance - need to approve USDC first",
          "0xe450d38c": "ERC20InsufficientBalance - not enough USDC in wallet",
          "0x8f8af25f": "InvalidGameStatus - game is not in expected state for this action",
          "0x30cd7471": "NotPlayer1 - only the game creator can cancel the game",
          "0x73c3e6bb": "NotGamePlayer - you are not a participant in this game",
          "0x0c84c4da": "TimeoutNotReached - cannot claim timeout yet",
        };

        const selector = error.data.slice(0, 10).toLowerCase();
        const decodedError = errorSelectors[selector];
        if (decodedError) {
          // Provide context-specific messages for certain operations
          if (selector === "0xd6bda275") {
            // FailedCall - give operation-specific message
            if (currentOperation === "cancelGame") {
              errorMessage = "Cannot cancel this game. It may have already been cancelled, completed, or another player joined.";
            } else if (currentOperation === "claimTimeoutWin") {
              errorMessage = "Cannot claim timeout. The game may not be active or the timeout hasn't been reached.";
            } else {
              errorMessage = "FailedCall - likely permit failed or insufficient USDC balance/allowance";
            }
          } else {
            errorMessage = decodedError;
          }
        }
      }

      // Check for string error message in revert
      if (error.revert?.args?.[0]) {
        errorMessage = error.revert.args[0];
      }
    }

    console.error("[relay] Parsed error:", {
      message: errorMessage,
      code: errorCode,
      reason: errorReason,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        code: errorCode,
        reason: errorReason,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
