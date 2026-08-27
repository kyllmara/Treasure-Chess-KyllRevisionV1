/**
 * stripe-webhook
 *
 * Receives Stripe webhook events and credits TCT on successful payment.
 *
 * Event handled: checkout.session.completed
 *
 * Required Supabase secrets:
 *   STRIPE_SECRET_KEY        — sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET    — whsec_... (from Stripe dashboard webhook config)
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

// ============================================================================
// Stripe signature verification (no SDK — pure fetch)
// ============================================================================

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(",").reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts["t"];
    const signature = parts["v1"];
    if (!timestamp || !signature) return false;

    // Reject events older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === signature;
  } catch {
    return false;
  }
}

// ============================================================================
// Credit TCT to a user's balance
// ============================================================================

async function creditTct(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amountTct: number,
  amountUsd: number,
  stripeSessionId: string
): Promise<void> {
  // Idempotency: skip if this session was already processed
  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("description", `Stripe:${stripeSessionId}`)
    .maybeSingle();

  if (existing) {
    console.log(`[stripe-webhook] Session ${stripeSessionId} already processed — skipping`);
    return;
  }

  // Update balance (increment available_tct)
  const { error: balanceError } = await supabase.rpc("increment_balance", {
    p_user_id: userId,
    p_amount_tct: amountTct,
  });

  if (balanceError) {
    // Fallback: direct update, or insert if no row exists yet
    const { data: balance } = await supabase
      .from("balances")
      .select("available_tct, total_deposited_tct")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (balance) {
      const { error: updateError } = await supabase
        .from("balances")
        .update({
          available_tct: balance.available_tct + amountTct,
          total_deposited_tct: (balance.total_deposited_tct ?? 0) + amountTct,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (updateError) throw updateError;
    } else {
      // No balance row yet — create one seeded with the purchased amount
      const { error: insertError } = await supabase
        .from("balances")
        .insert({
          user_id: userId,
          available_tct: amountTct,
          locked_tct: 0,
          total_deposited_tct: amountTct,
          updated_at: new Date().toISOString(),
        });
      if (insertError) throw insertError;
    }
  }

  // Record the transaction for the wallet history
  const { error: txError } = await supabase.from("transactions").insert({
    user_id: userId,
    type: "deposit",
    amount_tct: amountTct,
    description: `Stripe:${stripeSessionId}`,
    balance_before_tct: null,
    balance_after_tct: null,
  });

  if (txError) {
    // Non-fatal — balance was already credited
    console.warn("[stripe-webhook] Failed to insert transaction record:", txError.message);
  }

  console.log(`[stripe-webhook] Credited ${amountTct} TCT ($${amountUsd}) to user ${userId}`);
}

// ============================================================================
// Handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await req.text();

  // Verify signature
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.error("[stripe-webhook] Invalid signature");
      return new Response("Invalid signature", { status: 400 });
    }
  } else {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — skipping verification");
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    // Acknowledge events we don't handle
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as {
    id: string;
    payment_status: string;
    metadata: { user_id?: string; amount_tct?: string; amount_usd?: string };
  };

  if (session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { user_id, amount_tct, amount_usd } = session.metadata ?? {};
  if (!user_id || !amount_tct) {
    console.error("[stripe-webhook] Missing metadata:", session.metadata);
    return new Response("Missing metadata", { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await creditTct(
      supabase,
      user_id,
      parseInt(amount_tct, 10),
      parseFloat(amount_usd ?? "0"),
      session.id
    );
  } catch (err) {
    console.error("[stripe-webhook] Failed to credit TCT:", err);
    // Return 500 so Stripe retries the webhook
    return new Response("Internal error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
