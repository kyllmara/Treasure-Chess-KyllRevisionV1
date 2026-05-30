/**
 * Tournament Distribute Prizes Edge Function
 *
 * Called after finalize_tournament completes for on-chain tournaments.
 * Sends USDC from the vault to each winner's wallet address.
 *
 * Can be triggered by:
 * - The game-complete edge function (after finalizing the last match)
 * - The tournament-scheduler cron
 * - Manual admin call
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
const SETTLEMENT_API_KEY = Deno.env.get("SETTLEMENT_API_KEY");
const BASE_RPC_URL =
  Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";
const USDC_CONTRACT_ADDRESS =
  Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

interface DistributeRequest {
  tournamentId: string;
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
    // --- Auth: service_role JWT or SETTLEMENT_API_KEY ---
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("X-Settlement-API-Key");

    let isAuthorized = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      if (token === SUPABASE_SERVICE_KEY) {
        isAuthorized = true;
      }
      // NOTE: We do NOT accept unverified JWT claims for service_role.
    }

    if (!isAuthorized && apiKeyHeader && SETTLEMENT_API_KEY && apiKeyHeader === SETTLEMENT_API_KEY) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse request ---
    const body: DistributeRequest = await req.json();
    const { tournamentId } = body;

    if (!tournamentId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing tournamentId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createAdminClient();

    // Load TCT sell rate from platform_config
    const { data: tctRates } = await supabase.rpc("get_tct_rates");
    const tctSellRate = Number(tctRates?.tct_sell_rate ?? 25);

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

    if (tournament.status !== "completed") {
      return new Response(
        JSON.stringify({ success: false, error: "Tournament is not completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tournament.on_chain_pool_usdc || tournament.on_chain_pool_usdc <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Not an on-chain tournament" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Load unpaid prizes ---
    const { data: prizes, error: prizeErr } = await supabase
      .from("tournament_prizes")
      .select("*, user:profiles(id, username)")
      .eq("tournament_id", tournamentId)
      .gt("amount_tct", 0)
      .is("payout_tx_hash", null)
      .order("place");

    if (prizeErr) {
      console.error("[tournament-distribute-prizes] Failed to load prizes:", prizeErr);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to load prizes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prizes || prizes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, distributed: [], message: "No unpaid prizes found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Get winner wallet addresses from registrations ---
    const winnerUserIds = prizes.map((p: { user_id: string }) => p.user_id).filter(Boolean);
    const { data: registrations } = await supabase
      .from("tournament_registrations")
      .select("user_id, wallet_address")
      .eq("tournament_id", tournamentId)
      .in("user_id", winnerUserIds);

    const walletMap = new Map<string, string>();
    if (registrations) {
      for (const reg of registrations) {
        if (reg.wallet_address) {
          walletMap.set(reg.user_id, reg.wallet_address);
        }
      }
    }

    // --- Distribute prizes on-chain ---
    const distributed: Array<{
      place: number;
      wallet: string;
      usdc: string;
      txHash: string;
    }> = [];
    const errors: Array<{ place: number; error: string }> = [];

    let provider: JsonRpcProvider | null = null;
    let vault: Wallet | null = null;
    let usdc: Contract | null = null;

    if (VAULT_PRIVATE_KEY) {
      provider = new JsonRpcProvider(BASE_RPC_URL);
      vault = new Wallet(VAULT_PRIVATE_KEY, provider);
      usdc = new Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, vault);
    }

    for (const prize of prizes) {
      const winnerWallet = walletMap.get(prize.user_id);
      if (!winnerWallet) {
        console.error(`[tournament-distribute-prizes] No wallet for user ${prize.user_id} (place ${prize.place})`);
        errors.push({ place: prize.place, error: "No wallet address found" });
        continue;
      }

      const usdcAmount = prize.amount_tct / tctSellRate;
      const usdcWei = parseUnits(usdcAmount.toFixed(6), 6);

      console.log(`[tournament-distribute-prizes] Paying place ${prize.place}: ${formatUnits(usdcWei, 6)} USDC to ${winnerWallet}`);

      let txHash: string;

      if (vault && usdc && provider) {
        try {
          // Get gas prices with buffer
          const feeData = await provider.getFeeData();
          const gasMultiplier = 120n;
          const maxFeePerGas = feeData.maxFeePerGas ? (feeData.maxFeePerGas * gasMultiplier) / 100n : undefined;
          const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * gasMultiplier) / 100n : undefined;

          const tx = await usdc.transfer(winnerWallet, usdcWei, { maxFeePerGas, maxPriorityFeePerGas });
          const receipt = await tx.wait();

          if (receipt.status === 0) {
            throw new Error("Transfer reverted on-chain");
          }

          txHash = receipt.hash;
          console.log(`[tournament-distribute-prizes] Transfer confirmed: ${txHash}`);
        } catch (txErr: unknown) {
          const msg = txErr instanceof Error ? txErr.message : "Transfer failed";
          console.error(`[tournament-distribute-prizes] Transfer failed for place ${prize.place}:`, txErr);
          errors.push({ place: prize.place, error: msg });
          continue;
        }
      } else {
        // Demo mode
        txHash = `0xdemo_prize_${prize.place}_${Date.now().toString(16)}`;
      }

      // Update prize record
      const { error: updateErr } = await supabase
        .from("tournament_prizes")
        .update({
          payout_tx_hash: txHash,
          payout_usdc_amount: usdcAmount,
          paid_at: new Date().toISOString(),
        })
        .eq("id", prize.id);

      if (updateErr) {
        console.error(`[tournament-distribute-prizes] DB update failed for prize ${prize.id}:`, updateErr);
      }

      distributed.push({
        place: prize.place,
        wallet: winnerWallet,
        usdc: usdcAmount.toFixed(6),
        txHash,
      });
    }

    console.log(`[tournament-distribute-prizes] Complete: ${distributed.length} prizes paid, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ success: true, distributed, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[tournament-distribute-prizes] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
