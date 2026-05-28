/**
 * Process Withdrawal Edge Function
 *
 * Handles USDC withdrawals from user's embedded wallet to external address:
 * - User signs a permit authorizing the platform to spend their USDC
 * - Platform executes the permit and transfers USDC to destination
 * - Platform vault pays gas fees (gasless for user)
 * - Platform takes 1% fee from withdrawal amount
 *
 * Flow:
 * 1. User signs EIP-2612 permit off-chain
 * 2. This function executes permit() on USDC contract
 * 3. This function calls transferFrom() to send USDC to destination
 * 4. 1% fee is sent to platform vault, rest goes to user's destination
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ethers,
  Wallet,
  Contract,
  JsonRpcProvider,
  parseUnits,
  formatUnits,
} from "https://esm.sh/ethers@6";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const POLYGON_RPC_URL = Deno.env.get("POLYGON_RPC_URL") || "https://rpc-amoy.polygon.technology";
const USDC_CONTRACT_ADDRESS = Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
const PLATFORM_VAULT_ADDRESS = Deno.env.get("PLATFORM_VAULT_ADDRESS") || "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";

// Conversion rates
const TCT_TO_USDC_RATE = 1 / 25; // 25 TCT = 1 USDC
const USDC_TO_TCT_RATE = 25; // 1 USDC = 25 TCT
const WITHDRAWAL_FEE_PERCENT = 1; // 1% fee

// Minimum withdrawal in USDC
const MIN_WITHDRAWAL_USDC = 4; // $4 minimum (100 TCT)

// USDC ABI - only what we need
const USDC_ABI = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
];

interface WithdrawalRequest {
  userId: string;
  userAddress: string; // User's embedded wallet address
  destinationAddress: string; // External wallet to send to
  amountUsdc: string; // Amount in USDC (e.g., "10.50")
  permit: {
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
}

interface WithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  txHash?: string;
  error?: string;
  netAmountUsdc?: string;
  feeUsdc?: string;
}

// Helper: Create Supabase admin client
function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Main handler
Deno.serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment
    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY not configured");
    }

    const supabase = createAdminClient();
    const body: WithdrawalRequest = await req.json();

    console.log("[withdrawal] Request received:", {
      userId: body.userId,
      userAddress: body.userAddress,
      destinationAddress: body.destinationAddress,
      amountUsdc: body.amountUsdc,
      hasPermit: !!body.permit,
    });

    // Validate required fields
    if (!body.userId || !body.userAddress || !body.destinationAddress || !body.amountUsdc || !body.permit) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, userAddress, destinationAddress, amountUsdc, permit } = body;

    // Parse and validate amount
    const amount = parseFloat(amountUsdc);
    if (isNaN(amount) || amount < MIN_WITHDRAWAL_USDC) {
      return new Response(
        JSON.stringify({ success: false, error: `Minimum withdrawal is ${MIN_WITHDRAWAL_USDC} USDC` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate fee (1%)
    const feeUsdc = amount * (WITHDRAWAL_FEE_PERCENT / 100);
    const netAmountUsdc = amount - feeUsdc;

    console.log("[withdrawal] Amount breakdown:", {
      totalUsdc: amount,
      feeUsdc,
      netAmountUsdc,
      feePercent: WITHDRAWAL_FEE_PERCENT,
    });

    // Initialize provider and platform wallet
    const provider = new JsonRpcProvider(POLYGON_RPC_URL);
    const platformWallet = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);

    console.log("[withdrawal] Platform wallet:", platformWallet.address);
    console.log("[withdrawal] Vault address:", PLATFORM_VAULT_ADDRESS);

    // Create USDC contract instance
    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, platformWallet);

    // Parse amounts for contract calls (USDC has 6 decimals)
    const totalAmountWei = parseUnits(amount.toFixed(6), 6);
    const feeAmountWei = parseUnits(feeUsdc.toFixed(6), 6);
    const netAmountWei = parseUnits(netAmountUsdc.toFixed(6), 6);

    // Check user's USDC balance
    const balance = await usdc.balanceOf(userAddress);
    console.log("[withdrawal] User USDC balance:", formatUnits(balance, 6));

    if (balance < totalAmountWei) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Insufficient USDC balance: have ${formatUnits(balance, 6)}, need ${amount}`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create withdrawal record (pending)
    // Note: signature is required by DB constraint - store permit signature components
    const permitSignature = `permit:v${permit.v}:r${permit.r}:s${permit.s}`;

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert({
        user_id: userId,
        type: "crypto",
        amount_tct: Math.round(amount * USDC_TO_TCT_RATE),
        fee_tct: Math.round(feeUsdc * USDC_TO_TCT_RATE),
        net_amount_tct: Math.round(netAmountUsdc * USDC_TO_TCT_RATE),
        net_amount_usdc: netAmountUsdc,
        destination_address: destinationAddress,
        signature: permitSignature,
        status: "processing",
      })
      .select()
      .single();

    if (withdrawalError) {
      console.error("[withdrawal] Failed to create withdrawal record:", withdrawalError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create withdrawal record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[withdrawal] Created withdrawal record:", withdrawal.id);

    let txHash: string | undefined;

    try {
      // Step 1: Execute permit (allows platform wallet to spend user's USDC)
      console.log("[withdrawal] Executing permit...");

      const permitTx = await usdc.permit(
        userAddress,              // owner
        platformWallet.address,   // spender (platform wallet)
        totalAmountWei,           // value (total amount including fee)
        permit.deadline,          // deadline
        permit.v,                 // v
        permit.r,                 // r
        permit.s                  // s
      );
      await permitTx.wait();
      console.log("[withdrawal] Permit executed:", permitTx.hash);

      // Step 2: Transfer net amount to destination address
      console.log("[withdrawal] Transferring", netAmountUsdc, "USDC to destination...");

      const transferToDestTx = await usdc.transferFrom(
        userAddress,        // from (user's wallet)
        destinationAddress, // to (external destination)
        netAmountWei        // amount (minus fee)
      );
      const destReceipt = await transferToDestTx.wait();
      console.log("[withdrawal] Transfer to destination complete:", transferToDestTx.hash);

      // Step 3: Transfer fee to platform vault
      if (feeAmountWei > 0n) {
        console.log("[withdrawal] Transferring", feeUsdc, "USDC fee to vault...");

        const transferFeeTx = await usdc.transferFrom(
          userAddress,           // from (user's wallet)
          PLATFORM_VAULT_ADDRESS, // to (platform vault)
          feeAmountWei           // amount (1% fee)
        );
        await transferFeeTx.wait();
        console.log("[withdrawal] Fee transfer complete:", transferFeeTx.hash);
      }

      txHash = transferToDestTx.hash;

      // Update withdrawal record as completed
      await supabase
        .from("withdrawals")
        .update({
          tx_hash: txHash,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id);

      // Record transaction
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "withdraw",
        amount_tct: -Math.round(amount * USDC_TO_TCT_RATE),
        description: `Withdrawal: ${netAmountUsdc.toFixed(2)} USDC to ${destinationAddress.slice(0, 10)}...`,
        withdrawal_id: withdrawal.id,
      });

      // Log to admin logs
      await supabase.from("admin_logs").insert({
        action: "withdrawal_processed",
        admin_id: userId,
        target_id: withdrawal.id,
        details: {
          userAddress,
          destinationAddress,
          totalUsdc: amount,
          feeUsdc,
          netUsdc: netAmountUsdc,
          txHash,
        },
      });

      console.log("[withdrawal] Withdrawal completed successfully");

      return new Response(
        JSON.stringify({
          success: true,
          withdrawalId: withdrawal.id,
          txHash,
          netAmountUsdc: netAmountUsdc.toFixed(2),
          feeUsdc: feeUsdc.toFixed(2),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (txError: any) {
      console.error("[withdrawal] Transaction failed:", txError);

      // Update withdrawal as failed
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          error_message: txError.message || "Transaction failed"
        })
        .eq("id", withdrawal.id);

      // Parse error for user-friendly message
      let errorMessage = "Transaction failed";

      if (txError.message?.includes("permit")) {
        errorMessage = "Permit signature invalid or expired. Please try again.";
      } else if (txError.message?.includes("insufficient") || txError.message?.includes("balance")) {
        errorMessage = "Insufficient USDC balance for withdrawal.";
      } else if (txError.message?.includes("allowance")) {
        errorMessage = "Permit not properly executed. Please try again.";
      } else if (txError.reason) {
        errorMessage = txError.reason;
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("[withdrawal] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
