/**
 * Transak Webhook Handler
 *
 * Edge Function to process Transak payment webhooks.
 * Handles order completed, failed, and other status updates.
 *
 * Webhook URL: https://<project>.supabase.co/functions/v1/transak-webhook
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

// Types
interface TransakOrder {
  id: string;
  partnerOrderId?: string;
  status:
    | "AWAITING_PAYMENT_FROM_USER"
    | "PAYMENT_DONE_MARKED_BY_USER"
    | "PROCESSING"
    | "PENDING_DELIVERY_FROM_TRANSAK"
    | "ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK"
    | "COMPLETED"
    | "CANCELLED"
    | "FAILED"
    | "REFUNDED"
    | "EXPIRED";
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency: string;
  cryptoAmount: number;
  walletAddress: string;
  transactionHash?: string;
  totalFeeInFiat: number;
  createdAt: string;
  completedAt?: string;
  statusReason?: string;
  network?: string;
  isBuyOrSell: "BUY" | "SELL";
}

interface TransakWebhookPayload {
  eventID: string;
  webhookData: TransakOrder;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TRANSAK_WEBHOOK_SECRET = Deno.env.get("TRANSAK_WEBHOOK_SECRET") || "";
const TRANSAK_API_KEY = Deno.env.get("TRANSAK_API_KEY") || "";

// Create Supabase client with service role (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Verify Transak webhook authentication
 * Transak uses API key in header for webhook authentication
 */
function verifyAuthentication(req: Request): boolean {
  if (!TRANSAK_WEBHOOK_SECRET && !TRANSAK_API_KEY) {
    console.warn("Transak webhook secret not configured");
    return false;
  }

  // Transak sends access-token header
  const accessToken = req.headers.get("access-token");

  if (!accessToken) {
    return false;
  }

  // Verify against webhook secret or API key
  return (
    accessToken === TRANSAK_WEBHOOK_SECRET || accessToken === TRANSAK_API_KEY
  );
}

/**
 * Map Transak status to our order status
 */
function mapStatus(
  transakStatus: string
): "pending" | "waiting_payment" | "processing" | "completed" | "failed" | "cancelled" | "refunded" {
  const statusMap: Record<string, "pending" | "waiting_payment" | "processing" | "completed" | "failed" | "cancelled" | "refunded"> = {
    AWAITING_PAYMENT_FROM_USER: "waiting_payment",
    PAYMENT_DONE_MARKED_BY_USER: "waiting_payment",
    PROCESSING: "processing",
    PENDING_DELIVERY_FROM_TRANSAK: "processing",
    ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK: "processing",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    FAILED: "failed",
    REFUNDED: "refunded",
    EXPIRED: "cancelled",
  };

  return statusMap[transakStatus] || "pending";
}

/**
 * Process order completion
 */
async function processOrderCompleted(
  order: TransakOrder
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the order by partner_order_id or transak ID
    const { data: dbOrder, error: orderError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("provider", "transak")
      .or(
        `provider_order_id.eq.${order.partnerOrderId || order.id},provider_transaction_id.eq.${order.id}`
      )
      .single();

    if (orderError || !dbOrder) {
      console.error("Order not found:", order.id);
      return { success: false, error: "Order not found" };
    }

    // Check if already processed
    if (dbOrder.status === "completed") {
      console.log("Order already processed:", dbOrder.id);
      return { success: true };
    }

    // Calculate TCT amount using DB-driven rate
    const { data: tctRates } = await supabase.rpc("get_tct_rates");
    const usdcToTct = Number(tctRates?.tct_buy_rate ?? 25);
    const usdcAmount = order.cryptoAmount;
    const tctAmount = usdcAmount * usdcToTct;

    // Update order status
    const { error: updateError } = await supabase
      .from("payment_orders")
      .update({
        status: "completed",
        provider_transaction_id: order.id,
        crypto_amount: usdcAmount,
        tct_amount: tctAmount,
        exchange_rate: order.fiatAmount / usdcAmount,
        provider_fee: order.totalFeeInFiat,
        webhook_received_at: new Date().toISOString(),
        webhook_payload: order,
        completed_at: order.completedAt || new Date().toISOString(),
      })
      .eq("id", dbOrder.id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return { success: false, error: updateError.message };
    }

    // Process the completion based on order type
    if (order.isBuyOrSell === "BUY") {
      // Credit user balance for buy orders
      const { error: rpcError } = await supabase.rpc(
        "process_payment_order_completion",
        {
          p_order_id: dbOrder.id,
          p_tct_amount: tctAmount,
        }
      );

      if (rpcError) {
        console.error("Failed to process order completion:", rpcError);
        return { success: false, error: rpcError.message };
      }

      console.log(`Buy order ${dbOrder.id} completed: ${tctAmount} TCT credited`);
    } else {
      // For sell orders, the balance was already locked
      // Now we can finalize the withdrawal
      const { error: rpcError } = await supabase.rpc(
        "process_payment_order_completion",
        {
          p_order_id: dbOrder.id,
          p_tct_amount: tctAmount,
        }
      );

      if (rpcError) {
        console.error("Failed to process sell completion:", rpcError);
        return { success: false, error: rpcError.message };
      }

      // Record against withdrawal limits
      const fiatAmount = order.fiatAmount;
      await supabase.rpc("record_withdrawal_against_limits", {
        p_user_id: dbOrder.user_id,
        p_amount_usd: fiatAmount,
      });

      console.log(`Sell order ${dbOrder.id} completed: ${fiatAmount} USD withdrawn`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error processing order completion:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process order failure
 */
async function processOrderFailed(
  order: TransakOrder
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the order
    const { data: dbOrder, error: orderError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("provider", "transak")
      .or(
        `provider_order_id.eq.${order.partnerOrderId || order.id},provider_transaction_id.eq.${order.id}`
      )
      .single();

    if (orderError || !dbOrder) {
      console.error("Order not found for failed order:", order.id);
      return { success: false, error: "Order not found" };
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("payment_orders")
      .update({
        status: "failed",
        provider_transaction_id: order.id,
        failure_reason: order.statusReason || "Order failed",
        webhook_received_at: new Date().toISOString(),
        webhook_payload: order,
      })
      .eq("id", dbOrder.id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return { success: false, error: updateError.message };
    }

    // If this was a sell order, unlock the user's funds
    if (order.isBuyOrSell === "SELL" && dbOrder.tct_amount) {
      const { error: unlockError } = await supabase.rpc("unlock_balance", {
        p_user_id: dbOrder.user_id,
        p_amount: dbOrder.tct_amount,
      });

      if (unlockError) {
        console.error("Failed to unlock balance:", unlockError);
      }
    }

    console.log(`Order ${dbOrder.id} marked as failed: ${order.statusReason}`);
    return { success: true };
  } catch (error) {
    console.error("Error processing failed order:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Process order refund
 */
async function processOrderRefunded(
  order: TransakOrder
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the order
    const { data: dbOrder, error: orderError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("provider", "transak")
      .or(
        `provider_order_id.eq.${order.partnerOrderId || order.id},provider_transaction_id.eq.${order.id}`
      )
      .single();

    if (orderError || !dbOrder) {
      console.error("Order not found for refund:", order.id);
      return { success: false, error: "Order not found" };
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("payment_orders")
      .update({
        status: "refunded",
        provider_transaction_id: order.id,
        webhook_received_at: new Date().toISOString(),
        webhook_payload: order,
      })
      .eq("id", dbOrder.id);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return { success: false, error: updateError.message };
    }

    // If funds were already credited, we need to reverse them
    if (dbOrder.status === "completed" && dbOrder.tct_amount) {
      // Debit the TCT from user's balance
      const { error: debitError } = await supabase.rpc("debit_balance", {
        p_user_id: dbOrder.user_id,
        p_amount: dbOrder.tct_amount,
        p_description: `Refund for order ${dbOrder.id}`,
      });

      if (debitError) {
        console.error("Failed to debit balance for refund:", debitError);
      }
    }

    console.log(`Order ${dbOrder.id} refunded`);
    return { success: true };
  } catch (error) {
    console.error("Error processing refund:", error);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, access-token",
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
    // Verify authentication
    if (!verifyAuthentication(req) && TRANSAK_WEBHOOK_SECRET) {
      console.error("Invalid webhook authentication");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse payload
    const payload: TransakWebhookPayload = await req.json();
    const order = payload.webhookData;

    console.log(`Received Transak webhook: ${order.status} for order ${order.id}`);

    // Handle different statuses
    let result: { success: boolean; error?: string };

    switch (order.status) {
      case "COMPLETED":
        result = await processOrderCompleted(order);
        break;

      case "FAILED":
      case "CANCELLED":
      case "EXPIRED":
        result = await processOrderFailed(order);
        break;

      case "REFUNDED":
        result = await processOrderRefunded(order);
        break;

      case "AWAITING_PAYMENT_FROM_USER":
      case "PAYMENT_DONE_MARKED_BY_USER":
      case "PROCESSING":
      case "PENDING_DELIVERY_FROM_TRANSAK":
      case "ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK":
        // Update order status for tracking
        const { error } = await supabase
          .from("payment_orders")
          .update({
            status: mapStatus(order.status),
            provider_transaction_id: order.id,
            webhook_received_at: new Date().toISOString(),
            webhook_payload: order,
          })
          .eq("provider", "transak")
          .or(
            `provider_order_id.eq.${order.partnerOrderId || order.id}`
          );

        result = { success: !error, error: error?.message };
        break;

      default:
        console.log("Unhandled order status:", order.status);
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
