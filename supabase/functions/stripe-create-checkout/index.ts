/**
 * stripe-create-checkout
 *
 * Creates a Stripe Checkout Session for buying TCT with a card.
 * The secret key lives here as a Supabase secret — never in the client.
 *
 * POST /functions/v1/stripe-create-checkout
 * Body: { amount_usd: number }   — must be >= 1
 * Returns: { checkout_url: string, session_id: string }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const USDC_TO_TCT = 25; // 1 USD = 25 TCT
const PLATFORM_FEE_PERCENT = 0.05; // 5% deposit fee — taken as fewer TCT, USD stays on platform

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Verify caller is an authenticated Supabase user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve profiles.id — balances FK references profiles.id, not auth.uid()
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile?.id) {
      console.error("[stripe-create-checkout] Profile not found for auth user:", user.id, profileError);
      return new Response(JSON.stringify({ error: "User profile not found. Please complete your profile setup." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileId = profile.id;

    const { amount_usd } = await req.json();

    if (!amount_usd || typeof amount_usd !== "number" || amount_usd < 1) {
      return new Response(JSON.stringify({ error: "amount_usd must be a number >= 1" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gross_tct = Math.floor(amount_usd * USDC_TO_TCT);
    const fee_tct = Math.floor(gross_tct * PLATFORM_FEE_PERCENT);
    const amount_tct = gross_tct - fee_tct; // TCT credited to player after 5% platform fee
    const amount_cents = Math.round(amount_usd * 100);

    // Create Stripe Checkout Session
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "payment",
        "payment_method_types[]": "card",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(amount_cents),
        "line_items[0][price_data][product_data][name]": "Treasure Chess Tokens",
        "line_items[0][price_data][product_data][description]": `${amount_tct} TCT ($${amount_usd.toFixed(2)} · 5% platform fee applied)`,
        "line_items[0][quantity]": "1",
        "metadata[user_id]": profileId,
        "metadata[amount_tct]": String(amount_tct),
        "metadata[amount_usd]": String(amount_usd),
        // Mobile deep-link redirects — Stripe supports custom URI schemes
        success_url: `treasurechess://deposit?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `treasurechess://deposit?stripe_status=cancel`,
      }),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error("[stripe-create-checkout] Stripe error:", session);
      return new Response(JSON.stringify({ error: session.error?.message ?? "Stripe error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ checkout_url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-create-checkout] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
