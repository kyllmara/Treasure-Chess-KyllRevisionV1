/**
 * Send Notification Edge Function
 *
 * Sends push notifications via Expo Push Notification Service.
 * This function can be called directly or triggered by database events.
 *
 * Supported notification types:
 * - your_turn: Opponent made a move
 * - match_found: Matchmaking found an opponent
 * - challenge_received: New challenge invitation
 * - challenge_accepted: Challenge was accepted
 * - game_ended: Game completed (win/lose/draw)
 * - deposit_confirmed: Deposit transaction confirmed
 * - withdrawal_complete: Withdrawal transaction completed
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

type NotificationType =
  | "your_turn"
  | "match_found"
  | "challenge_received"
  | "challenge_accepted"
  | "challenge_declined"
  | "game_ended"
  | "deposit_confirmed"
  | "withdrawal_complete"
  | "achievement_unlocked";

interface NotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
  badge?: number;
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

const NOTIFICATION_CATEGORIES: Record<NotificationType, string> = {
  your_turn: "game_action",
  match_found: "game_action",
  challenge_received: "challenge",
  challenge_accepted: "challenge",
  challenge_declined: "challenge",
  game_ended: "game_action",
  deposit_confirmed: "wallet",
  withdrawal_complete: "wallet",
  achievement_unlocked: "general",
};

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();

    // Handle single notification or batch
    const notifications: NotificationRequest[] = Array.isArray(body) ? body : [body];

    const results = await Promise.all(
      notifications.map((notification) =>
        sendNotification(supabase, notification)
      )
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failureCount,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Send notification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

async function sendNotification(
  supabase: any,
  notification: NotificationRequest
): Promise<{ success: boolean; userId: string; error?: string }> {
  const { userId, type, title, body, data } = notification;

  try {
    // Get user's push token and notification preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("push_token, notifications_enabled, username")
      .eq("id", userId)
      .single();

    if (profileError) {
      console.error(`Failed to fetch profile for ${userId}:`, profileError);
      return { success: false, userId, error: "Profile not found" };
    }

    // Check if notifications are enabled
    if (!profile.notifications_enabled) {
      return { success: false, userId, error: "Notifications disabled" };
    }

    // Check if push token exists
    if (!profile.push_token) {
      return { success: false, userId, error: "No push token" };
    }

    // Validate Expo push token format
    if (!isValidExpoPushToken(profile.push_token)) {
      return { success: false, userId, error: "Invalid push token format" };
    }

    // Build push message
    const message: ExpoPushMessage = {
      to: profile.push_token,
      sound: "default",
      title,
      body,
      data: {
        type,
        ...data,
      },
      categoryId: NOTIFICATION_CATEGORIES[type],
      channelId: "default",
    };

    // Send via Expo Push API
    const ticket = await sendExpoPushNotification(message);

    if (ticket.status === "error") {
      console.error(`Push failed for ${userId}:`, ticket.message);

      // Handle invalid token - remove it from the database
      if (ticket.details?.error === "DeviceNotRegistered") {
        await supabase
          .from("profiles")
          .update({ push_token: null })
          .eq("id", userId);
        return { success: false, userId, error: "Device not registered" };
      }

      return { success: false, userId, error: ticket.message };
    }

    console.log(`Push sent to ${userId} (${type}):`, ticket.id);
    return { success: true, userId };
  } catch (error) {
    console.error(`Failed to send notification to ${userId}:`, error);
    return {
      success: false,
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function isValidExpoPushToken(token: string): boolean {
  return (
    typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["))
  );
}

async function sendExpoPushNotification(
  message: ExpoPushMessage
): Promise<ExpoPushTicket> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();

  // Expo returns an array of tickets, we only send one message
  if (result.data && Array.isArray(result.data) && result.data.length > 0) {
    return result.data[0];
  }

  return { status: "error", message: "Invalid response from Expo" };
}

// ============================================================================
// Convenience Functions for Common Notifications
// ============================================================================

/**
 * Send "Your Turn" notification
 */
export async function notifyYourTurn(
  supabase: any,
  userId: string,
  gameId: string,
  opponentName: string
): Promise<boolean> {
  const result = await sendNotification(supabase, {
    userId,
    type: "your_turn",
    title: "Your Turn!",
    body: `${opponentName} made a move. It's your turn to play.`,
    data: { gameId, opponentName },
  });
  return result.success;
}

/**
 * Send "Match Found" notification
 */
export async function notifyMatchFound(
  supabase: any,
  userId: string,
  gameId: string,
  opponentName: string,
  wagerAmount?: number
): Promise<boolean> {
  const body = wagerAmount
    ? `Matched with ${opponentName} for $${wagerAmount.toFixed(2)}`
    : `Matched with ${opponentName}`;

  const result = await sendNotification(supabase, {
    userId,
    type: "match_found",
    title: "Match Found!",
    body,
    data: { gameId, opponentName, amount: wagerAmount },
  });
  return result.success;
}

/**
 * Send "Challenge Received" notification
 */
export async function notifyChallengeReceived(
  supabase: any,
  userId: string,
  challengeId: string,
  opponentName: string,
  wagerAmount: number
): Promise<boolean> {
  const result = await sendNotification(supabase, {
    userId,
    type: "challenge_received",
    title: "New Challenge!",
    body: `${opponentName} challenged you for $${wagerAmount.toFixed(2)}`,
    data: { challengeId, opponentName, amount: wagerAmount },
  });
  return result.success;
}

/**
 * Send "Challenge Accepted" notification
 */
export async function notifyChallengeAccepted(
  supabase: any,
  userId: string,
  challengeId: string,
  gameId: string,
  opponentName: string
): Promise<boolean> {
  const result = await sendNotification(supabase, {
    userId,
    type: "challenge_accepted",
    title: "Challenge Accepted!",
    body: `${opponentName} accepted your challenge. Game is starting!`,
    data: { challengeId, gameId, opponentName },
  });
  return result.success;
}

/**
 * Send "Game Ended" notification
 */
export async function notifyGameEnded(
  supabase: any,
  userId: string,
  gameId: string,
  result: "win" | "lose" | "draw",
  opponentName: string,
  amount?: number
): Promise<boolean> {
  let title: string;
  let body: string;

  switch (result) {
    case "win":
      title = "Victory!";
      body = amount
        ? `You beat ${opponentName} and won $${amount.toFixed(2)}!`
        : `You beat ${opponentName}!`;
      break;
    case "lose":
      title = "Game Over";
      body = `${opponentName} won the game.`;
      break;
    case "draw":
      title = "Draw";
      body = `Your game with ${opponentName} ended in a draw.`;
      break;
  }

  const notifyResult = await sendNotification(supabase, {
    userId,
    type: "game_ended",
    title,
    body,
    data: { gameId, opponentName, result, amount },
  });
  return notifyResult.success;
}

/**
 * Send "Deposit Confirmed" notification
 */
export async function notifyDepositConfirmed(
  supabase: any,
  userId: string,
  amount: number,
  txHash?: string
): Promise<boolean> {
  const result = await sendNotification(supabase, {
    userId,
    type: "deposit_confirmed",
    title: "Deposit Confirmed",
    body: `$${amount.toFixed(2)} has been added to your wallet.`,
    data: { amount, txHash },
  });
  return result.success;
}

/**
 * Send "Withdrawal Complete" notification
 */
export async function notifyWithdrawalComplete(
  supabase: any,
  userId: string,
  amount: number,
  txHash?: string
): Promise<boolean> {
  const result = await sendNotification(supabase, {
    userId,
    type: "withdrawal_complete",
    title: "Withdrawal Complete",
    body: `$${amount.toFixed(2)} has been sent to your wallet.`,
    data: { amount, txHash },
  });
  return result.success;
}
