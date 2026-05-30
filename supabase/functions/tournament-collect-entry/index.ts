/**
 * Tournament Collect Entry Edge Function
 *
 * Collects tournament entry fees on-chain using EIP-2612 permit + transferFrom.
 * User signs a permit allowing the vault to spend their USDC, then the vault
 * calls permit() + transferFrom() to move USDC from user to vault.
 *
 * Follows the same pattern as process-withdrawal/index.ts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Wallet,
  Contract,
  JsonRpcProvider,
  parseUnits,
  formatUnits,
  Signature,
} from "https://esm.sh/ethers@6";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAULT_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const BASE_RPC_URL =
  Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const USDC_CONTRACT_ADDRESS =
  Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";


// ERC20 ABI with permit and transferFrom for EIP-2612
const ERC20_PERMIT_ABI = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
];

interface PermitData {
  value: string;     // USDC amount in wei (string)
  deadline: number;  // Unix timestamp
  signature: string; // Full EIP-712 signature
}

interface CollectEntryRequest {
  tournamentId: string;
  ownerAddress: string;
  permit: PermitData;
}

function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: verify JWT, extract userId ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    // Verify JWT signature via Supabase Auth (prevents JWT forgery attacks)
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      console.error("[tournament-collect-entry] JWT verification failed:", authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    // --- Parse request ---
    const body: CollectEntryRequest = await req.json();
    const { tournamentId, ownerAddress, permit } = body;

    if (!tournamentId || !ownerAddress || !permit) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!permit.signature || !permit.deadline || !permit.value) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid permit data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // --- Validate tournament ---
    const { data: tournament, error: tournErr } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();

    if (tournErr || !tournament) {
      return new Response(
        JSON.stringify({ success: false, error: "Tournament not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tournament.status !== "registration") {
      return new Response(
        JSON.stringify({ success: false, error: "Tournament is not open for registration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tournament.current_players >= tournament.max_players) {
      return new Response(
        JSON.stringify({ success: false, error: "Tournament is full" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already registered
    const { data: existingReg } = await supabase
      .from("tournament_registrations")
      .select("id, entry_tx_hash")
      .eq("tournament_id", tournamentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingReg) {
      return new Response(
        JSON.stringify({
          success: true,
          registration_id: existingReg.id,
          entry_tx_hash: existingReg.entry_tx_hash,
          idempotent: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Calculate expected USDC using DB-driven rate ---
    const { data: tctRates } = await supabase.rpc("get_tct_rates");
    const tctSellRate = Number(tctRates?.tct_sell_rate ?? 25);
    const expectedUsdc = tournament.entry_fee_tct / tctSellRate;
    const expectedWei = parseUnits(expectedUsdc.toFixed(6), 6);
    const permitWei = BigInt(permit.value);

    if (permitWei < expectedWei) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Permit value too low. Expected ${formatUnits(expectedWei, 6)} USDC, got ${formatUnits(permitWei, 6)}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Verify wallet matches profile ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("embedded_wallet_address")
      .eq("id", userId)
      .single();

    if (profile?.embedded_wallet_address &&
        profile.embedded_wallet_address.toLowerCase() !== ownerAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: false, error: "Wallet address does not match profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Verify permit deadline ---
    const now = Math.floor(Date.now() / 1000);
    if (permit.deadline < now) {
      return new Response(
        JSON.stringify({ success: false, error: "Permit has expired. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- On-chain: permit() + transferFrom() ---
    let txHash: string;

    if (VAULT_PRIVATE_KEY) {
      const provider = new JsonRpcProvider(BASE_RPC_URL);
      const vault = new Wallet(VAULT_PRIVATE_KEY, provider);
      const usdc = new Contract(USDC_CONTRACT_ADDRESS, ERC20_PERMIT_ABI, vault);

      console.log(`[tournament-collect-entry] Entry fee collection:`);
      console.log(`  Tournament: ${tournamentId}`);
      console.log(`  Owner (user): ${ownerAddress}`);
      console.log(`  Spender (vault): ${vault.address}`);
      console.log(`  Amount: ${formatUnits(expectedWei, 6)} USDC`);
      console.log(`  Deadline: ${permit.deadline}`);

      // Check user's USDC balance on-chain
      const userBalance = await usdc.balanceOf(ownerAddress);
      console.log(`  User on-chain USDC: ${formatUnits(userBalance, 6)}`);

      if (userBalance < expectedWei) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Insufficient USDC balance. Has: ${formatUnits(userBalance, 6)}, needs: ${formatUnits(expectedWei, 6)}`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Split the EIP-712 signature into v, r, s
      const sig = Signature.from(permit.signature);
      console.log(`  Permit sig v=${sig.v}, r=${sig.r.substring(0, 20)}..., s=${sig.s.substring(0, 20)}...`);

      // Get gas prices with buffer
      const feeData = await provider.getFeeData();
      const gasMultiplier = 120n;
      const maxFeePerGas = feeData.maxFeePerGas ? (feeData.maxFeePerGas * gasMultiplier) / 100n : undefined;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * gasMultiplier) / 100n : undefined;

      // Step 1: permit()
      console.log(`[tournament-collect-entry] Calling permit()...`);
      const permitTx = await usdc.permit(
        ownerAddress,
        vault.address,
        expectedWei,
        permit.deadline,
        sig.v,
        sig.r,
        sig.s,
        { maxFeePerGas, maxPriorityFeePerGas }
      );
      const permitReceipt = await permitTx.wait();
      console.log(`[tournament-collect-entry] Permit confirmed in block ${permitReceipt.blockNumber}`);

      if (permitReceipt.status === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Permit transaction reverted on-chain" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Step 2: transferFrom()
      console.log(`[tournament-collect-entry] Calling transferFrom(${ownerAddress}, ${vault.address}, ${formatUnits(expectedWei, 6)})...`);
      const transferTx = await usdc.transferFrom(
        ownerAddress,
        vault.address,
        expectedWei,
        { maxFeePerGas, maxPriorityFeePerGas }
      );
      const transferReceipt = await transferTx.wait();
      console.log(`[tournament-collect-entry] TransferFrom confirmed in block ${transferReceipt.blockNumber}`);

      if (transferReceipt.status === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "TransferFrom transaction reverted on-chain" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      txHash = transferReceipt.hash;
    } else {
      // Demo mode
      console.warn("[tournament-collect-entry] No BACKEND_SIGNER_PRIVATE_KEY set - demo mode");
      txHash = `0xdemo_entry_${Date.now().toString(16)}`;
    }

    // --- Register in DB ---
    const { data: regResult, error: regError } = await supabase.rpc(
      "register_for_tournament_on_chain",
      {
        p_tournament_id: tournamentId,
        p_user_id: userId,
        p_entry_tx_hash: txHash,
        p_entry_usdc_amount: expectedUsdc,
        p_wallet_address: ownerAddress,
      }
    );

    if (regError) {
      // TransferFrom succeeded but DB failed — log for manual reconciliation
      console.error("[tournament-collect-entry] DB registration failed after on-chain transfer:", regError);
      console.error("[tournament-collect-entry] MANUAL RECONCILIATION NEEDED:", {
        tournamentId,
        userId,
        txHash,
        amount: expectedUsdc,
        ownerAddress,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Registration failed after on-chain transfer. Funds will be reconciled.",
          entry_tx_hash: txHash,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[tournament-collect-entry] Registration complete:", regResult);

    return new Response(
      JSON.stringify({
        success: true,
        registration_id: regResult.registration_id,
        entry_tx_hash: txHash,
        ...regResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[tournament-collect-entry] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
