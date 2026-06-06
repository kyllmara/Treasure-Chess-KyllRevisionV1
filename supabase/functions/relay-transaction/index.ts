/**
 * Relay Transaction Edge Function
 *
 * Handles USDC permit-based payments from user wallets to the platform vault.
 * Used for tournament and challenge entry fees.
 *
 * Supported operations:
 * - payEntryFee: EIP-2612 permit + transferFrom to vault (entry fees)
 *
 * On-chain escrow operations (createGame, joinGame, cancelGame, claimTimeoutWin)
 * have been removed. The platform runs in fully custodial mode — wagers are
 * tracked in Supabase and settled via settle_escrow_with_rake.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Wallet,
  Contract,
  JsonRpcProvider,
  parseUnits,
  formatUnits,
} from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// USDC ABI
const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
];

// Request for payEntryFee operation
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
    const USDC_CONTRACT_ADDRESS =
      Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const BASE_RPC_URL =
      Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";

    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY not configured");
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

    // All other operations (createGame, joinGame, cancelGame, claimTimeoutWin) are
    // on-chain escrow operations that have been removed. The platform is custodial.
    return new Response(
      JSON.stringify({
        success: false,
        error: `Operation "${operation}" is not supported. On-chain escrow has been removed. Use the custodial wager flow instead.`,
      }),
      {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[relay] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
