/**
 * transak-session
 *
 * Generates a Transak Secure Widget URL server-side so the API secret
 * is never exposed to the client. Called by the app before opening
 * the Transak widget.
 *
 * POST /functions/v1/transak-session
 * Body: { fiatAmount: number, fiatCurrency?: string }
 * Returns: { url: string }
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const TRANSAK_API_KEY = Deno.env.get("TRANSAK_API_KEY") || "";
const TRANSAK_API_SECRET = Deno.env.get("TRANSAK_API_SECRET") || "";
const VAULT_ADDRESS = Deno.env.get("VAULT_ADDRESS") || "0x8b490D45A94DC7a967D1bDA4B160Fa1c99445EEa";

// Sandbox/test API keys (issued pre-KYB) only work against Transak's staging
// environment. Set TRANSAK_ENV=staging while using test credentials; switch
// to "production" once KYB is approved and live keys are issued.
const TRANSAK_ENV = (Deno.env.get("TRANSAK_ENV") || "production").toLowerCase();
const TRANSAK_BASE_URL = TRANSAK_ENV === "staging" ? "https://global-stg.transak.com" : "https://global.transak.com";
const TRANSAK_API_BASE = TRANSAK_ENV === "staging" ? "https://api-stg.transak.com" : "https://api.transak.com";

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
    // Verify caller is an authenticated user
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

    const { fiatAmount, fiatCurrency = "GBP" } = await req.json();
    if (!fiatAmount || fiatAmount < 5) {
      return new Response(JSON.stringify({ error: "Minimum deposit is $5" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!TRANSAK_API_KEY || !TRANSAK_API_SECRET) {
      return new Response(JSON.stringify({ error: "Transak not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Get Transak access token
    const tokenResp = await fetch(`${TRANSAK_API_BASE}/api/v2/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: TRANSAK_API_KEY,
        secret: TRANSAK_API_SECRET,
      }),
    });

    const tokenData = await tokenResp.json();
    const accessToken = tokenData?.data?.accessToken;

    if (!accessToken) {
      console.error("Transak auth failed:", JSON.stringify(tokenData));
      return new Response(JSON.stringify({ error: "Transak auth failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Create widget session
    const sessionResp = await fetch(`${TRANSAK_API_BASE}/api/v2/partner/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access-token": accessToken,
      },
      body: JSON.stringify({
        apiKey: TRANSAK_API_KEY,
        cryptoCurrencyCode: "USDC",
        network: "base",
        walletAddress: VAULT_ADDRESS,
        disableWalletAddressForm: true,
        fiatCurrency,
        fiatAmount,
        isFeeCalculationHidden: false,
        productsAvailed: "BUY",
        exchangeScreenTitle: "Deposit to High Stakes Chess",
        partnerOrderId: `hsc_${user.id}_${Date.now()}`,
        partnerCustomerId: user.id,
      }),
    });

    const sessionData = await sessionResp.json();

    // Transak may return the full URL or just a sessionId
    const sessionId = sessionData?.data?.sessionId || sessionData?.sessionId;
    const widgetUrl = sessionData?.data?.url ||
      (sessionId ? `${TRANSAK_BASE_URL}/?sessionId=${sessionId}` : null);

    if (!widgetUrl) {
      console.error("Transak session failed:", JSON.stringify(sessionData));
      return new Response(JSON.stringify({ error: "Could not create payment session" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: widgetUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("transak-session error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
