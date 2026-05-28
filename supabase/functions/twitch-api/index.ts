/**
 * Twitch API Proxy Edge Function
 *
 * Proxies requests to the Twitch API with proper authentication.
 * Handles token refresh and provides a secure way to interact with Twitch
 * without exposing credentials to the client.
 *
 * Endpoints:
 * - POST /twitch-api { action, userId, data }
 *
 * Actions:
 * - get_user_info: Get broadcaster info
 * - set_stream_info: Update stream title/category
 * - get_stream_info: Get current stream info
 * - get_chat_settings: Get chat configuration
 * - start_commercial: Start ad break
 * - get_followers: Get follower count
 * - get_subscribers: Get subscriber count
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface TwitchAPIRequest {
  action: string;
  userId: string;
  data?: Record<string, any>;
}

// ============================================================================
// Decryption Utilities
// ============================================================================

async function decryptToken(encrypted: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key.padEnd(32, "0").slice(0, 32));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encryptedData
  );

  return new TextDecoder().decode(decrypted);
}

async function encryptToken(token: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const keyData = encoder.encode(key.padEnd(32, "0").slice(0, 32));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// ============================================================================
// Token Management
// ============================================================================

async function refreshTwitchToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");
  const clientSecret = Deno.env.get("TWITCH_CLIENT_SECRET");

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Twitch token");
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

async function getValidAccessToken(
  connection: any,
  supabase: any,
  encryptionKey: string
): Promise<string> {
  const tokenExpired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();

  if (tokenExpired && connection.refresh_token_encrypted) {
    console.log("Token expired, refreshing...");

    const refreshTokenDecrypted = await decryptToken(connection.refresh_token_encrypted, encryptionKey);
    const newTokens = await refreshTwitchToken(refreshTokenDecrypted);

    const newAccessTokenEncrypted = await encryptToken(newTokens.accessToken, encryptionKey);
    const newRefreshTokenEncrypted = await encryptToken(newTokens.refreshToken, encryptionKey);
    const newExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

    await supabase.rpc("refresh_platform_token", {
      p_user_id: connection.user_id,
      p_platform: "twitch",
      p_access_token_encrypted: newAccessTokenEncrypted,
      p_refresh_token_encrypted: newRefreshTokenEncrypted,
      p_token_expires_at: newExpiresAt,
    });

    return newTokens.accessToken;
  }

  return decryptToken(connection.access_token_encrypted, encryptionKey);
}

// ============================================================================
// Twitch API Helpers
// ============================================================================

async function twitchFetch(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<any> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");

  const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId!,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Twitch API error (${response.status}):`, errorText);
    throw new Error(`Twitch API error: ${response.status}`);
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

// ============================================================================
// API Actions
// ============================================================================

async function getUserInfo(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/users?id=${broadcasterId}`, accessToken);
}

async function setStreamInfo(
  accessToken: string,
  broadcasterId: string,
  title?: string,
  gameId?: string
): Promise<any> {
  const body: Record<string, string> = {};
  if (title) body.title = title;
  if (gameId) body.game_id = gameId;

  return twitchFetch(`/channels?broadcaster_id=${broadcasterId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function getStreamInfo(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/streams?user_id=${broadcasterId}`, accessToken);
}

async function getChannelInfo(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/channels?broadcaster_id=${broadcasterId}`, accessToken);
}

async function getChatSettings(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/chat/settings?broadcaster_id=${broadcasterId}`, accessToken);
}

async function startCommercial(accessToken: string, broadcasterId: string, length: number): Promise<any> {
  return twitchFetch("/channels/commercial", accessToken, {
    method: "POST",
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      length,
    }),
  });
}

async function getFollowers(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/channels/followers?broadcaster_id=${broadcasterId}`, accessToken);
}

async function getSubscribers(accessToken: string, broadcasterId: string): Promise<any> {
  return twitchFetch(`/subscriptions?broadcaster_id=${broadcasterId}`, accessToken);
}

async function searchGames(accessToken: string, query: string): Promise<any> {
  return twitchFetch(`/search/categories?query=${encodeURIComponent(query)}`, accessToken);
}

async function getGames(accessToken: string, gameIds: string[]): Promise<any> {
  const params = gameIds.map((id) => `id=${id}`).join("&");
  return twitchFetch(`/games?${params}`, accessToken);
}

// Chess category ID on Twitch
const CHESS_GAME_ID = "743";

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("STREAM_TOKEN_ENCRYPTION_KEY") || "default-key-change-in-production";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const body: TwitchAPIRequest = await req.json();
    const { action, userId, data } = body;

    // Validate request
    if (!action || !userId) {
      return jsonResponse({ error: "Missing required fields: action, userId" }, 400);
    }

    // Verify user matches token
    if (user.id !== userId) {
      return jsonResponse({ error: "Unauthorized - user mismatch" }, 403);
    }

    // Get Twitch connection
    const { data: connection, error: connError } = await supabase
      .from("platform_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "twitch")
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      return jsonResponse({
        success: false,
        error: "No active Twitch connection found. Please connect your Twitch account first.",
      }, 404);
    }

    // Get valid access token (refreshes if needed)
    const accessToken = await getValidAccessToken(connection, supabase, encryptionKey);
    const broadcasterId = connection.platform_user_id;

    // Execute action
    let result: any;

    switch (action) {
      case "get_user_info":
        result = await getUserInfo(accessToken, broadcasterId);
        break;

      case "set_stream_info":
        result = await setStreamInfo(
          accessToken,
          broadcasterId,
          data?.title,
          data?.gameId || CHESS_GAME_ID // Default to Chess category
        );
        break;

      case "get_stream_info":
        result = await getStreamInfo(accessToken, broadcasterId);
        break;

      case "get_channel_info":
        result = await getChannelInfo(accessToken, broadcasterId);
        break;

      case "get_chat_settings":
        result = await getChatSettings(accessToken, broadcasterId);
        break;

      case "start_commercial":
        if (!data?.length || ![30, 60, 90, 120, 150, 180].includes(data.length)) {
          return jsonResponse({ error: "Invalid commercial length. Must be 30, 60, 90, 120, 150, or 180" }, 400);
        }
        result = await startCommercial(accessToken, broadcasterId, data.length);
        break;

      case "get_followers":
        result = await getFollowers(accessToken, broadcasterId);
        break;

      case "get_subscribers":
        result = await getSubscribers(accessToken, broadcasterId);
        break;

      case "search_games":
        if (!data?.query) {
          return jsonResponse({ error: "Missing query for game search" }, 400);
        }
        result = await searchGames(accessToken, data.query);
        break;

      case "get_games":
        if (!data?.gameIds || !Array.isArray(data.gameIds)) {
          return jsonResponse({ error: "Missing gameIds array" }, 400);
        }
        result = await getGames(accessToken, data.gameIds);
        break;

      case "set_chess_category":
        // Convenience action to set stream to Chess category
        result = await setStreamInfo(
          accessToken,
          broadcasterId,
          data?.title,
          CHESS_GAME_ID
        );
        break;

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Twitch API error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
});

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
