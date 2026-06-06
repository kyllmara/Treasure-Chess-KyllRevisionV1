/**
 * Submit Game Result Edge Function
 *
 * On-chain escrow settlement has been removed. The platform runs in custodial
 * mode — all wager settlement is handled atomically by game-complete via the
 * settle_escrow_with_rake database function.
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
      error: "On-chain settlement is disabled. All wager settlement is handled custodially via game-complete.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
