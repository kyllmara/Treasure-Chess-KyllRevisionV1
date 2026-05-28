/**
 * Send Push Notification Edge Function
 *
 * Sends push notifications to multiple devices via Expo Push Notification Service.
 * Used for broadcasting notifications (e.g., when a player joins matchmaking queue).
 *
 * Accepts:
 * - tokens: array of Expo push tokens
 * - title: notification title
 * - body: notification body
 * - data: optional data payload
 */

// ============================================================================
// Types
// ============================================================================

interface BroadcastRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
}

interface ExpoPushMessage {
  to: string;
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
  channelId?: string;
}

interface ExpoPushTicket {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo recommends max 100 per request

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: BroadcastRequest = await req.json();
    const { tokens, title, body: messageBody, data, categoryId } = body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: "No tokens provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!title || !messageBody) {
      return new Response(
        JSON.stringify({ error: "Title and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter valid Expo push tokens
    const validTokens = tokens.filter(isValidExpoPushToken);

    if (validTokens.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          failed: tokens.length,
          error: "No valid Expo push tokens",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build messages
    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body: messageBody,
      data: data || {},
      categoryId: categoryId || "game_action",
      channelId: "default",
    }));

    // Send in batches
    const results: ExpoPushTicket[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      const batchResults = await sendBatch(batch);
      results.push(...batchResults);
    }

    const successCount = results.filter((r) => r.status === "ok").length;
    const failureCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[send-push-notification] Sent ${successCount} notifications, ${failureCount} failed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failureCount,
        total: validTokens.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-push-notification] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function isValidExpoPushToken(token: string): boolean {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

async function sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    if (result.data && Array.isArray(result.data)) {
      return result.data;
    }

    return messages.map(() => ({
      status: "error" as const,
      message: "Invalid response from Expo",
    }));
  } catch (error) {
    console.error("[send-push-notification] Batch send failed:", error);
    return messages.map(() => ({
      status: "error" as const,
      message: error instanceof Error ? error.message : "Batch send failed",
    }));
  }
}
