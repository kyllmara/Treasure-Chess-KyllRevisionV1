/**
 * Tournament Refund Entry Edge Function
 *
 * Handles both single unregistration refunds and bulk cancellation refunds.
 * Sends USDC from the vault back to user wallet(s) on-chain.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Wallet,
  Contract,
  JsonRpcProvider,
  parseUnits,
  formatUnits,
} from "https://esm.sh/ethers@6";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAULT_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const BASE_RPC_URL =
  Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const USDC_CONTRACT_ADDRESS =
  Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

interface RefundRequest {
  tournamentId: string;
  userId?: string;       // single unregister (user-initiated)
  bulkRefund?: boolean;  // cancel tournament (admin/service)
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
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    let callerUserId: string | null = null;
    let isServiceRole = false;

    // Check if service role
    if (token === SUPABASE_SERVICE_KEY) {
      isServiceRole = true;
    } else {
      // Verify JWT signature via Supabase Auth (prevents JWT forgery attacks)
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
      if (authError || !user) {
        console.error("[tournament-refund-entry] JWT verification failed:", authError?.message);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerUserId = user.id;
    }

    // --- Parse request ---
    const body: RefundRequest = await req.json();
    const { tournamentId, userId, bulkRefund } = body;

    if (!tournamentId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing tournamentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Bulk refund requires service role
    if (bulkRefund && !isServiceRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Bulk refund requires service role" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single unregister: user can only refund themselves
    const targetUserId = bulkRefund ? undefined : (userId || callerUserId);
    if (!bulkRefund && !targetUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-service callers can only refund themselves
    if (!isServiceRole && targetUserId !== callerUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Can only refund your own registration" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // --- Find registrations to refund ---
    let query = supabase
      .from("tournament_registrations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .not("entry_tx_hash", "is", null)
      .is("refund_tx_hash", null);

    if (!bulkRefund && targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    const { data: registrations, error: regErr } = await query;

    if (regErr) {
      console.error("[tournament-refund-entry] Failed to load registrations:", regErr);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load registrations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!registrations || registrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, refunded: [], message: "No refundable registrations found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Process refunds on-chain ---
    let provider: JsonRpcProvider | null = null;
    let vault: Wallet | null = null;
    let usdc: Contract | null = null;

    if (VAULT_PRIVATE_KEY) {
      provider = new JsonRpcProvider(BASE_RPC_URL);
      vault = new Wallet(VAULT_PRIVATE_KEY, provider);
      usdc = new Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, vault);
    }

    const refunded: Array<{
      userId: string;
      wallet: string;
      usdc: string;
      txHash: string;
    }> = [];
    const errors: Array<{ userId: string; error: string }> = [];

    for (const reg of registrations) {
      if (!reg.wallet_address || !reg.entry_usdc_amount) {
        errors.push({ userId: reg.user_id, error: "Missing wallet or amount" });
        continue;
      }

      const usdcWei = parseUnits(Number(reg.entry_usdc_amount).toFixed(6), 6);
      console.log(`[tournament-refund-entry] Refunding ${formatUnits(usdcWei, 6)} USDC to ${reg.wallet_address}`);

      let txHash: string;

      if (vault && usdc && provider) {
        try {
          const feeData = await provider.getFeeData();
          const gasMultiplier = 120n;
          const maxFeePerGas = feeData.maxFeePerGas ? (feeData.maxFeePerGas * gasMultiplier) / 100n : undefined;
          const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * gasMultiplier) / 100n : undefined;

          const tx = await usdc.transfer(reg.wallet_address, usdcWei, { maxFeePerGas, maxPriorityFeePerGas });
          const receipt = await tx.wait();

          if (receipt.status === 0) {
            throw new Error("Transfer reverted on-chain");
          }

          txHash = receipt.hash;
          console.log(`[tournament-refund-entry] Refund confirmed: ${txHash}`);
        } catch (txErr: unknown) {
          const msg = txErr instanceof Error ? txErr.message : "Transfer failed";
          console.error(`[tournament-refund-entry] Refund failed for ${reg.user_id}:`, txErr);
          errors.push({ userId: reg.user_id, error: msg });
          continue;
        }
      } else {
        // Demo mode
        txHash = `0xdemo_refund_${Date.now().toString(16)}`;
      }

      // Update registration with refund tx hash via DB function
      const { error: unregErr } = await supabase.rpc(
        "unregister_from_tournament_on_chain",
        {
          p_tournament_id: tournamentId,
          p_user_id: reg.user_id,
          p_refund_tx_hash: txHash,
        }
      );

      if (unregErr) {
        console.error(`[tournament-refund-entry] DB unregister failed for ${reg.user_id}:`, unregErr);
        // On-chain refund succeeded but DB failed — log for reconciliation
        console.error("[tournament-refund-entry] MANUAL RECONCILIATION NEEDED:", {
          tournamentId,
          userId: reg.user_id,
          txHash,
        });
      }

      refunded.push({
        userId: reg.user_id,
        wallet: reg.wallet_address,
        usdc: Number(reg.entry_usdc_amount).toFixed(6),
        txHash,
      });
    }

    console.log(`[tournament-refund-entry] Complete: ${refunded.length} refunded, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ success: true, refunded, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[tournament-refund-entry] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
