/**
 * Emergency Refund Edge Function
 *
 * On-chain escrow refunds have been removed. The platform runs in custodial
 * mode — there are no on-chain locked funds to refund. Balance disputes are
 * handled via the admin panel (adjust_user_balance / settle_escrow_with_rake).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: "On-chain emergency refund is not available. The platform runs in custodial mode. Contact support for balance issues.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
