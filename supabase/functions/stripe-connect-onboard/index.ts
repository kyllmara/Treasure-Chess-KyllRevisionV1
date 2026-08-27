/**
 * stripe-connect-onboard
 *
 * Creates a Stripe Connect Express account for a player (if they don't have one)
 * and returns a hosted onboarding URL. The player completes KYC there — we never
 * touch their sensitive data.
 *
 * POST /functions/v1/stripe-connect-onboard
 * Body: { return_url: string }   — deep-link back into the app after onboarding
 * Returns: { onboarding_url: string, account_id: string }
 *
 * Required Supabase secrets: STRIPE_SECRET_KEY
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function stripePost(path: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // Stripe redirects here after onboarding (GET). Issue a real 302 to the
  // app's custom scheme — openAuthSessionAsync intercepts this and auto-closes.
  if (req.method === "GET") {
    return new Response(null, {
      status: 302,
      headers: { Location: "treasurechess://withdraw" },
    });
  }

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

    // Verify JWT and get auth user
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile (service role so we can write back the account ID)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email, stripe_connect_account_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await req.json(); // consume body (return_url no longer used — Stripe requires HTTPS)

    // Stripe account_links require HTTPS URLs — use Supabase URL as the redirect target.
    // The player closes the browser after onboarding; the app detects browser dismissal.
    const https_return_url = `${SUPABASE_URL}/functions/v1/stripe-connect-onboard`;

    let accountId = profile.stripe_connect_account_id;

    // Create Connect Express account if player doesn't have one
    if (!accountId) {
      const account = await stripePost("/accounts", {
        type: "express",
        country: "US",
        ...(profile.email ? { email: profile.email } : {}),
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
      });

      if (account.error) {
        console.error("[stripe-connect-onboard] Failed to create account:", account.error);
        return new Response(JSON.stringify({ error: account.error.message ?? "Failed to create Connect account" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      accountId = account.id;

      // Persist the account ID to the player's profile
      await adminClient
        .from("profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", profile.id);
    }

    // Generate a fresh onboarding / re-onboarding link
    const link = await stripePost("/account_links", {
      account: accountId,
      refresh_url: https_return_url,
      return_url: https_return_url,
      type: "account_onboarding",
    });

    if (link.error) {
      console.error("[stripe-connect-onboard] Failed to create account link:", link.error);
      return new Response(JSON.stringify({ error: link.error.message ?? "Failed to create onboarding link" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ onboarding_url: link.url, account_id: accountId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-connect-onboard] Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
