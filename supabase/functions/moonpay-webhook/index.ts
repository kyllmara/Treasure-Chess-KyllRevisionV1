/**
 * MoonPay Webhook Handler
 *
 * Edge Function to process MoonPay payment webhooks.
 * Handles payment_completed, payment_failed, and other events.
 *
 * Webhook URL: https://<project>.supabase.co/functions/v1/moonpay-webhook
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { createHmac } from "https://deno.land/std@0.208.0/crypto/mod.ts";

// Types
interface MoonPayTransaction {
  id: string;
  externalTransactionId?: string;
  status:
    | "waitingPayment"
    | "pending"
    | "waitingAuthorization"
    | "completed"
    | "failed";
  baseCurrencyAmount: number;
  baseCurrency: { code: string };
  quoteCurrencyAmount: number;
  quoteCurrency: { code: string };
  walletAddress: string;
  cryptoTransactionId?: string;
  feeAmount: number;
  networkFeeAmount: number;
  extraFeeAmount: number;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
}

interface MoonPayWebhookPayload {
  type: string;
  data: MoonPayTransaction;
}

// Constants
const USDC_TO_TCT = 25;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MOONPAY_WEBHOOK_SECRET = Deno.env.get("MOONPAY_WEBHOOK_SECRET") || "";

// Create Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Verify webhook signature
 */
async function verifySignature(
  payload: string,
  signature: string
): Promise<boolean> {
  if (!MOONPAY_WEBHOOK_SECRET) {
    console.warn("MOONPAY_WEBHOOK_SECRET not configured");
    return false;
  }

  try {
    // MoonPay uses HMAC-SHA256
    const encoder = new TextEncoder();
    const key = encoder.encode(MOONPAY_WEBHOOK_SECRET);
    const data = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures
    const providedSig = signature.replace("sha256=", "");
    return computedSignature === providedSig;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Map MoonPay status to our order status
 */
function mapStatus(
  moonpayStatus: string
): "pending" | "waiting_payment" | "processing" | "completed" | "failed" {
  const statusMap: Record<string, "pending" | "waiting_payment" | "processing" | "completed" | "failed"> = {
    waitingPayment: "waiting_payment",
    pending: "processing",
    waitingAuthorization: "processing",
    completed: "completed",
    failed: "failed",
  };

  return statusMap[moonpayStatus] || "pending";
}

/**
 * Process payment completion
 */
async function processPaymentCompleted(
  transaction: MoonPayTransaction
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the order by provider_order_id
    const { data: order, error: orderError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("provider", "moonpay")
      .eq("provider_order_id", transaction.externalTransactionId || transaction.id)
      .single();

    if (orderError || !order) {
      // Try finding by MoonPay transaction ID
      const { data: orderByTxId, error: txIdError } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("provider", "moonpay")
        .eq("provider_transaction_id", transaction.id)
        .single();

      if (txIdError || !orderByTxId) {
        console.error("Order not found:", transaction.id);
        return { success: false, error: "Order not found" };
      }

      // Use the order found by transaction ID
      return processOrder(orderByTxId, transaction);
    }

    return processOrder(order, transaction);
  } catch (error) {
    console.error("Error processing payment:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process order and credit user
 */
async function processOrder(
  order: Record<string, unknown>,
  transaction: MoonPayTransaction
): Promise<{ success: boolean; error?: string }> {
  // Check if already processed
  if (order.status === "completed") {
    console.log("Order already processed:", order.id);
    return { success: true };
  }

  // Calculate TCT amount
  const usdcAmount = transaction.quoteCurrencyAmount;
  const tctAmount = usdcAmount * USDC_TO_TCT;

  // Update order status
  const { error: updateError } = await supabase
    .from("payment_orders")
    .update({
      status: "completed",
      provider_transaction_id: transaction.id,
      crypto_amount: usdcAmount,
      tct_amount: tctAmount,
      exchange_rate: transaction.baseCurrencyAmount / usdcAmount,
      provider_fee: transaction.feeAmount + transaction.extraFeeAmount,
      network_fee: transaction.networkFeeAmount,
      webhook_received_at: new Date().toISOString(),
      webhook_payload: transaction,
      completed_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("Failed to update order:", updateError);
    return { success: false, error: updateError.message };
  }

  // Process the completion (credit user balance)
  if (order.order_type === "buy") {
    const { error: rpcError } = await supabase.rpc(
      "process_payment_order_completion",
      {
        p_order_id: order.id,
        p_tct_amount: tctAmount,
      }
    );

    if (rpcError) {
      console.error("Failed to process order completion:", rpcError);
      return { success: false, error: rpcError.message };
    }
  }

  console.log(`Order ${order.id} completed: ${tctAmount} TCT credited`);
  return { success: true };
}

/**
 * Process payment failure
 */
async function processPaymentFailed(
  transaction: MoonPayTransaction
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find and update the order
    const { data: order, error: orderError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("provider", "moonpay")
      .or(
        `provider_order_id.eq.${transaction.externalTransactionId || transaction.id},provider_transaction_id.eq.${transaction.id}`
      )
      .single();

    if (orderError || !order) {
      console.error("Order not found for failed payment:", transaction.id);
      return { success: false, error: "Order not found" };
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("payment_orders")
      .update({
        status: "failed",
        provider_transaction_id: transaction.id,
        failure_reason: transaction.failureReason || "Payment failed",
        webhook_received_at: new Date().toISOString(),
        webhook_payload: transaction,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return { success: false, error: updateError.message };
    }

    // If this was a sell order, unlock the user's funds
    if (order.order_type === "sell" && order.tct_amount) {
      const { error: unlockError } = await supabase.rpc("unlock_balance", {
        p_user_id: order.user_id,
        p_amount: order.tct_amount,
      });

      if (unlockError) {
        console.error("Failed to unlock balance:", unlockError);
      }
    }

    console.log(`Order ${order.id} marked as failed: ${transaction.failureReason}`);
    return { success: true };
  } catch (error) {
    console.error("Error processing failed payment:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Main webhook handler
 */
serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, moonpay-signature",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get raw body for signature verification
    const rawBody = await req.text();

    // Verify signature
    const signature = req.headers.get("moonpay-signature") || "";
    const isValid = await verifySignature(rawBody, signature);

    if (!isValid && MOONPAY_WEBHOOK_SECRET) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse payload
    const payload: MoonPayWebhookPayload = JSON.parse(rawBody);
    console.log("Received MoonPay webhook:", payload.type);

    // Handle different event types
    let result: { success: boolean; error?: string };

    switch (payload.type) {
      case "transaction_completed":
        result = await processPaymentCompleted(payload.data);
        break;

      case "transaction_failed":
        result = await processPaymentFailed(payload.data);
        break;

      case "transaction_created":
      case "transaction_updated":
        // Update order status for tracking
        const { error } = await supabase
          .from("payment_orders")
          .update({
            status: mapStatus(payload.data.status),
            provider_transaction_id: payload.data.id,
            webhook_received_at: new Date().toISOString(),
            webhook_payload: payload.data,
          })
          .or(
            `provider_order_id.eq.${payload.data.externalTransactionId || payload.data.id}`
          );

        result = { success: !error, error: error?.message };
        break;

      default:
        console.log("Unhandled webhook event type:", payload.type);
        result = { success: true };
    }

    if (result.success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
