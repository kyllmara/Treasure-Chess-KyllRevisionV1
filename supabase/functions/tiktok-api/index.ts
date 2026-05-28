/**
 * TikTok API Proxy Edge Function
 *
 * Proxies requests to the TikTok Live API with proper authentication.
 * Handles token refresh and provides a secure way to interact with TikTok
 * without exposing credentials to the client.
 *
 * Endpoints:
 * - POST /tiktok-api { action, userId, data }
 *
 * Actions:
 * - check_live_eligibility: Check if user can go live
 * - create_live_room: Create a live stream room
 * - end_live_room: End an active live stream
 * - get_live_info: Get current live stream info
 * - get_user_info: Get user profile info
 * - update_live_info: Update live stream title
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface TikTokAPIRequest {
  action: string;
  userId: string;
  data?: Record<string, any>;
}

interface TikTokResponse {
  data: any;
  error?: {
    code: string;
    message: string;
    log_id?: string;
  };
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

async function refreshTikTokToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_key: clientKey!,
      client_secret: clientSecret!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh TikTok token");
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
    const newTokens = await refreshTikTokToken(refreshTokenDecrypted);

    const newAccessTokenEncrypted = await encryptToken(newTokens.accessToken, encryptionKey);
    const newRefreshTokenEncrypted = await encryptToken(newTokens.refreshToken, encryptionKey);
    const newExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

    await supabase.rpc("refresh_platform_token", {
      p_user_id: connection.user_id,
      p_platform: "tiktok",
      p_access_token_encrypted: newAccessTokenEncrypted,
      p_refresh_token_encrypted: newRefreshTokenEncrypted,
      p_token_expires_at: newExpiresAt,
    });

    return newTokens.accessToken;
  }

  return decryptToken(connection.access_token_encrypted, encryptionKey);
}

// ============================================================================
// TikTok API Helpers
// ============================================================================

async function tiktokFetch(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<TikTokResponse> {
  const response = await fetch(`https://open.tiktokapis.com/v2${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`TikTok API error (${response.status}):`, errorText);
    throw new Error(`TikTok API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// API Actions
// ============================================================================

async function checkLiveEligibility(accessToken: string): Promise<TikTokResponse> {
  return tiktokFetch("/live/check_eligibility/", accessToken, {
    method: "POST",
  });
}

async function createLiveRoom(
  accessToken: string,
  title: string
): Promise<TikTokResponse> {
  return tiktokFetch("/live/create/", accessToken, {
    method: "POST",
    body: JSON.stringify({
      title,
    }),
  });
}

async function endLiveRoom(accessToken: string, roomId: string): Promise<TikTokResponse> {
  return tiktokFetch("/live/end/", accessToken, {
    method: "POST",
    body: JSON.stringify({
      room_id: roomId,
    }),
  });
}

async function getLiveInfo(accessToken: string, roomId: string): Promise<TikTokResponse> {
  return tiktokFetch(`/live/info/?room_id=${roomId}`, accessToken);
}

async function getUserInfo(accessToken: string): Promise<TikTokResponse> {
  return tiktokFetch(
    "/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
    accessToken
  );
}

async function updateLiveInfo(
  accessToken: string,
  roomId: string,
  title: string
): Promise<TikTokResponse> {
  return tiktokFetch("/live/update/", accessToken, {
    method: "POST",
    body: JSON.stringify({
      room_id: roomId,
      title,
    }),
  });
}

async function getLiveViewerList(accessToken: string, roomId: string): Promise<TikTokResponse> {
  return tiktokFetch(`/live/viewers/?room_id=${roomId}`, accessToken);
}

async function getLiveGiftList(accessToken: string, roomId: string): Promise<TikTokResponse> {
  return tiktokFetch(`/live/gifts/?room_id=${roomId}`, accessToken);
}

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

    const body: TikTokAPIRequest = await req.json();
    const { action, userId, data } = body;

    // Validate request
    if (!action || !userId) {
      return jsonResponse({ error: "Missing required fields: action, userId" }, 400);
    }

    // Verify user matches token
    if (user.id !== userId) {
      return jsonResponse({ error: "Unauthorized - user mismatch" }, 403);
    }

    // Get TikTok connection
    const { data: connection, error: connError } = await supabase
      .from("platform_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      return jsonResponse({
        success: false,
        error: "No active TikTok connection found. Please connect your TikTok account first.",
      }, 404);
    }

    // Get valid access token (refreshes if needed)
    const accessToken = await getValidAccessToken(connection, supabase, encryptionKey);

    // Execute action
    let result: TikTokResponse;

    switch (action) {
      case "check_live_eligibility":
        result = await checkLiveEligibility(accessToken);
        break;

      case "create_live_room":
        if (!data?.title) {
          return jsonResponse({ error: "Missing title for live room" }, 400);
        }
        result = await createLiveRoom(accessToken, data.title);

        // Store room ID in connection metadata
        if (result.data?.room_id) {
          await supabase
            .from("platform_connections")
            .update({
              metadata: {
                ...connection.metadata,
                tiktok_room_id: result.data.room_id,
              },
            })
            .eq("id", connection.id);
        }
        break;

      case "end_live_room":
        const roomId = data?.roomId || connection.metadata?.tiktok_room_id;
        if (!roomId) {
          return jsonResponse({ error: "No active live room found" }, 400);
        }
        result = await endLiveRoom(accessToken, roomId);

        // Clear room ID from metadata
        await supabase
          .from("platform_connections")
          .update({
            metadata: {
              ...connection.metadata,
              tiktok_room_id: null,
            },
          })
          .eq("id", connection.id);
        break;

      case "get_live_info":
        const infoRoomId = data?.roomId || connection.metadata?.tiktok_room_id;
        if (!infoRoomId) {
          return jsonResponse({ error: "No room ID provided" }, 400);
        }
        result = await getLiveInfo(accessToken, infoRoomId);
        break;

      case "get_user_info":
        result = await getUserInfo(accessToken);
        break;

      case "update_live_info":
        const updateRoomId = data?.roomId || connection.metadata?.tiktok_room_id;
        if (!updateRoomId) {
          return jsonResponse({ error: "No active live room found" }, 400);
        }
        if (!data?.title) {
          return jsonResponse({ error: "Missing title for update" }, 400);
        }
        result = await updateLiveInfo(accessToken, updateRoomId, data.title);
        break;

      case "get_viewer_list":
        const viewerRoomId = data?.roomId || connection.metadata?.tiktok_room_id;
        if (!viewerRoomId) {
          return jsonResponse({ error: "No room ID provided" }, 400);
        }
        result = await getLiveViewerList(accessToken, viewerRoomId);
        break;

      case "get_gift_list":
        const giftRoomId = data?.roomId || connection.metadata?.tiktok_room_id;
        if (!giftRoomId) {
          return jsonResponse({ error: "No room ID provided" }, 400);
        }
        result = await getLiveGiftList(accessToken, giftRoomId);
        break;

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    // Check for TikTok API errors
    if (result.error?.code) {
      return jsonResponse({
        success: false,
        error: result.error.message,
        code: result.error.code,
      }, 400);
    }

    return jsonResponse({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error("TikTok API error:", error);
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
