/**
 * Get Stream Key Edge Function
 *
 * Securely retrieves and decrypts a user's stream key for a connected platform.
 * This ensures stream keys are never stored in plain text and are only
 * decrypted when needed for streaming.
 *
 * Endpoints:
 * - POST /get-stream-key { userId, platform }
 *
 * Returns the decrypted RTMP URL and stream key.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface GetStreamKeyRequest {
  userId: string;
  platform: "twitch" | "tiktok" | "kick" | "custom";
}

interface StreamKeyResponse {
  success: boolean;
  rtmpUrl: string;
  streamKey: string;
  error?: string;
}

// ============================================================================
// Platform RTMP Configurations
// ============================================================================

const PLATFORM_RTMP_URLS: Record<string, string> = {
  twitch: "rtmps://live.twitch.tv/app",
  tiktok: "rtmps://push.tiktok.com/live",
  kick: "rtmps://fa723fc1b171.global-contribute.live-video.net/app",
  custom: "",
};

// ============================================================================
// Decryption Utilities
// ============================================================================

async function decryptToken(encrypted: string, key: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, "0").slice(0, 32));

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt stream key");
  }
}

// ============================================================================
// Twitch Stream Key Retrieval
// ============================================================================

async function getTwitchStreamKey(
  accessToken: string,
  broadcasterId: string
): Promise<string> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");

  if (!clientId) {
    throw new Error("Twitch client ID not configured");
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/streams/key?broadcaster_id=${broadcasterId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Twitch stream key fetch failed:", errorText);

    if (response.status === 401) {
      throw new Error("Twitch token expired - please reconnect");
    }

    throw new Error(`Failed to get Twitch stream key: ${response.status}`);
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error("No stream key returned from Twitch");
  }

  return data.data[0].stream_key;
}

// ============================================================================
// TikTok Live Room Creation
// ============================================================================

interface TikTokLiveRoomResponse {
  data: {
    room_id: string;
    stream_key: string;
    stream_url: string;
    status: string;
    live_url: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

async function createTikTokLiveRoom(
  accessToken: string,
  title: string
): Promise<{ rtmpUrl: string; streamKey: string; roomId: string }> {
  const response = await fetch("https://open.tiktokapis.com/v2/live/create/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: title || "Treasure Chess Stream",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TikTok live room creation failed:", errorText);

    if (response.status === 401) {
      throw new Error("TikTok token expired - please reconnect");
    }

    throw new Error(`Failed to create TikTok live room: ${response.status}`);
  }

  const data: TikTokLiveRoomResponse = await response.json();

  if (data.error?.code) {
    if (data.error.code === "access_token_invalid") {
      throw new Error("TikTok token expired - please reconnect");
    }
    throw new Error(`TikTok API error: ${data.error.message}`);
  }

  return {
    rtmpUrl: data.data.stream_url,
    streamKey: data.data.stream_key,
    roomId: data.data.room_id,
  };
}

// ============================================================================
// Token Refresh
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

    const body: GetStreamKeyRequest & { title?: string } = await req.json();
    const { userId, platform, title } = body;

    // Validate request
    if (!userId || !platform) {
      return jsonResponse({ error: "Missing required fields: userId, platform" }, 400);
    }

    // Verify user matches token
    if (user.id !== userId) {
      return jsonResponse({ error: "Unauthorized - user mismatch" }, 403);
    }

    // Get platform connection
    const { data: connection, error: connError } = await supabase
      .from("platform_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      return jsonResponse({
        success: false,
        error: `No active ${platform} connection found. Please connect your ${platform} account first.`,
      }, 404);
    }

    // Check if token is expired and refresh if needed
    let accessToken: string;
    const tokenExpired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();

    if (tokenExpired && connection.refresh_token_encrypted) {
      console.log(`Token expired for ${platform}, refreshing...`);

      const refreshTokenDecrypted = await decryptToken(connection.refresh_token_encrypted, encryptionKey);

      let newTokens;
      if (platform === "twitch") {
        newTokens = await refreshTwitchToken(refreshTokenDecrypted);
      } else if (platform === "tiktok") {
        newTokens = await refreshTikTokToken(refreshTokenDecrypted);
      } else {
        throw new Error(`Token refresh not supported for ${platform}`);
      }

      // Encrypt and store new tokens
      const newAccessTokenEncrypted = await encryptToken(newTokens.accessToken, encryptionKey);
      const newRefreshTokenEncrypted = await encryptToken(newTokens.refreshToken, encryptionKey);
      const newExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000).toISOString();

      await supabase.rpc("refresh_platform_token", {
        p_user_id: userId,
        p_platform: platform,
        p_access_token_encrypted: newAccessTokenEncrypted,
        p_refresh_token_encrypted: newRefreshTokenEncrypted,
        p_token_expires_at: newExpiresAt,
      });

      accessToken = newTokens.accessToken;
    } else {
      accessToken = await decryptToken(connection.access_token_encrypted, encryptionKey);
    }

    // Get stream key based on platform
    let rtmpUrl: string;
    let streamKey: string;

    if (platform === "twitch") {
      rtmpUrl = PLATFORM_RTMP_URLS.twitch;
      streamKey = await getTwitchStreamKey(accessToken, connection.platform_user_id);
    } else if (platform === "tiktok") {
      // TikTok requires creating a live room to get stream key
      const liveRoom = await createTikTokLiveRoom(accessToken, title || "Treasure Chess Stream");
      rtmpUrl = liveRoom.rtmpUrl;
      streamKey = liveRoom.streamKey;

      // Store room ID for later (to end the stream)
      await supabase
        .from("platform_connections")
        .update({ metadata: { tiktok_room_id: liveRoom.roomId } })
        .eq("id", connection.id);
    } else if (platform === "kick" || platform === "custom") {
      // For Kick and custom RTMP, get stored stream key
      const { data: settings } = await supabase
        .from("stream_settings")
        .select("custom_rtmp_url, custom_stream_key_encrypted")
        .eq("user_id", userId)
        .single();

      if (platform === "kick") {
        rtmpUrl = PLATFORM_RTMP_URLS.kick;
      } else {
        rtmpUrl = settings?.custom_rtmp_url || "";
      }

      if (!settings?.custom_stream_key_encrypted) {
        return jsonResponse({
          success: false,
          error: `Please enter your ${platform === "kick" ? "Kick" : "custom"} stream key in settings`,
        }, 400);
      }

      streamKey = await decryptToken(settings.custom_stream_key_encrypted, encryptionKey);
    } else {
      return jsonResponse({ success: false, error: "Invalid platform" }, 400);
    }

    // Log access for security auditing
    await supabase.from("stream_events").insert({
      session_id: null, // Will be set when stream starts
      event_type: "stream_key_accessed",
      metadata: {
        user_id: userId,
        platform,
        accessed_at: new Date().toISOString(),
      },
    });

    return jsonResponse({
      success: true,
      rtmpUrl,
      streamKey,
    });
  } catch (error) {
    console.error("Get stream key error:", error);
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
