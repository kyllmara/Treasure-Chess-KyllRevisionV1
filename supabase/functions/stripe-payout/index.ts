/**
 * stripe-payout
 *
 * Withdraws TCT earnings to a player's connected bank account via Stripe Connect.
 * Takes a 5% platform fee from the USD payout amount.
 *
 * Flow:
 *   1. Verify player is authenticated and has a verified Connect account
 *   2. Deduct TCT from their balance (locks it immediately)
 *   3. Create a Stripe Transfer to their connected account (net of 5% fee)
 *   4. Record the withdrawal transaction
 *
 * POST /functions/v1/stripe-payout
 * Body: { amount_tct: number }
 * Returns: { transfer_id: string, amount_usd: number, fee_usd: number }
 *
 * Required Supabase secrets: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const TCT_TO_USD = 0.04;         // 1 TCT = $0.04
const TOTAL_FEE_PERCENT = 0.065; // 6.5% total: 5% platform + 1.5% Stripe instant payout

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify JWT
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get profile + Connect account ID
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, stripe_connect_account_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: "No payout account set up. Complete onboarding first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount_tct } = await req.json();

    if (!amount_tct || typeof amount_tct !== "number" || amount_tct < 250) {
      return new Response(JSON.stringify({ error: "Minimum withdrawal is 250 TCT ($10)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check balance
    const { data: balance } = await adminClient
      .from("balances")
      .select("available_tct")
      .eq("user_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!balance || balance.available_tct < amount_tct) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate amounts — 6.5% total fee (5% platform + 1.5% Stripe instant payout)
    const gross_usd = amount_tct * TCT_TO_USD;
    const fee_usd = gross_usd * TOTAL_FEE_PERCENT;
    const net_usd = gross_usd - fee_usd;
    const net_cents = Math.floor(net_usd * 100);

    // Deduct TCT from balance immediately (before transfer, so we don't overpay on retry)
    const { error: deductError } = await adminClient.rpc("decrement_balance", {
      p_user_id: profile.id,
      p_amount_tct: amount_tct,
    });

    if (deductError) {
      console.error("[stripe-payout] Failed to deduct balance:", deductError);
      return new Response(JSON.stringify({ error: "Failed to deduct balance" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Stripe Transfer to player's connected account
    const transferRes = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(net_cents),
        currency: "usd",
        destination: profile.stripe_connect_account_id,
        description: `Treasure Chess withdrawal — ${amount_tct} TCT`,
        "metadata[profile_id]": profile.id,
        "metadata[amount_tct]": String(amount_tct),
        "metadata[fee_usd]": fee_usd.toFixed(2),
      }),
    });

    const transfer = await transferRes.json();

    if (!transferRes.ok) {
      // Refund TCT if Stripe transfer failed
      await adminClient.rpc("increment_balance", {
        p_user_id: profile.id,
        p_amount_tct: amount_tct,
      });
      console.error("[stripe-payout] Stripe transfer failed:", transfer.error);
      return new Response(JSON.stringify({ error: transfer.error?.message ?? "Transfer failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger instant payout from connected account → player's debit card
    const payoutRes = await fetch("https://api.stripe.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Stripe-Account": profile.stripe_connect_account_id,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(net_cents),
        currency: "usd",
        method: "instant",
        description: `Treasure Chess withdrawal — ${amount_tct} TCT`,
      }),
    });

    const payout = await payoutRes.json();

    if (!payoutRes.ok) {
      // Transfer succeeded but instant payout failed — refund TCT and reverse transfer
      await adminClient.rpc("increment_balance", { p_user_id: profile.id, p_amount_tct: amount_tct });
      await fetch(`https://api.stripe.com/v1/transfers/${transfer.id}/reversals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      });
      console.error("[stripe-payout] Instant payout failed:", payout.error);
      return new Response(JSON.stringify({ error: payout.error?.message ?? "Instant payout failed. Ensure a debit card is on file in your payout account." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record withdrawal transaction
    await adminClient.from("transactions").insert({
      user_id: profile.id,
      type: "withdraw",
      amount_tct: -amount_tct,
      description: `Withdrawal:${transfer.id}`,
    });

    return new Response(
      JSON.stringify({
        transfer_id: transfer.id,
        payout_id: payout.id,
        amount_usd: net_usd,
        fee_usd: fee_usd,
        gross_usd: gross_usd,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-payout] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
