/**
 * OAuth Callback Edge Function
 *
 * Handles OAuth token exchange for streaming platforms (Twitch, TikTok).
 * This is called after the user authorizes the app on the platform's OAuth page.
 *
 * Endpoints:
 * - POST /oauth-callback { platform, code, redirectUri, userId }
 *
 * Returns the access token and user info for storage.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface OAuthCallbackRequest {
  platform: "twitch" | "tiktok";
  code: string;
  redirectUri: string;
  userId: string;
  state?: string;
}

interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

interface TwitchUserResponse {
  data: Array<{
    id: string;
    login: string;
    display_name: string;
    type: string;
    broadcaster_type: string;
    description: string;
    profile_image_url: string;
    offline_image_url: string;
    email?: string;
  }>;
}

interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

interface TikTokUserResponse {
  data: {
    user: {
      open_id: string;
      union_id: string;
      avatar_url: string;
      avatar_url_100: string;
      avatar_large_url: string;
      display_name: string;
      bio_description: string;
      profile_deep_link: string;
      is_verified: boolean;
      follower_count: number;
      following_count: number;
      likes_count: number;
      video_count: number;
    };
  };
  error: {
    code: string;
    message: string;
  };
}

interface OAuthResult {
  success: boolean;
  platform: string;
  platformUserId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  channelUrl: string;
  broadcasterType?: string;
  isLiveEnabled?: boolean;
  error?: string;
}

// ============================================================================
// Encryption Utilities
// ============================================================================

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

  // Combine IV + encrypted data and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// ============================================================================
// Twitch OAuth
// ============================================================================

async function exchangeTwitchToken(
  code: string,
  redirectUri: string
): Promise<TwitchTokenResponse> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");
  const clientSecret = Deno.env.get("TWITCH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Twitch OAuth credentials not configured");
  }

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Twitch token exchange failed:", errorText);
    throw new Error(`Twitch token exchange failed: ${response.status}`);
  }

  return response.json();
}

async function fetchTwitchUserInfo(
  accessToken: string
): Promise<TwitchUserResponse> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");

  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId!,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Twitch user info: ${response.status}`);
  }

  return response.json();
}

async function handleTwitchCallback(
  code: string,
  redirectUri: string,
  userId: string,
  supabase: any,
  encryptionKey: string
): Promise<OAuthResult> {
  // Exchange code for tokens
  const tokens = await exchangeTwitchToken(code, redirectUri);

  // Fetch user info
  const userResponse = await fetchTwitchUserInfo(tokens.access_token);

  if (!userResponse.data || userResponse.data.length === 0) {
    throw new Error("No Twitch user data returned");
  }

  const user = userResponse.data[0];

  // Encrypt tokens
  const accessTokenEncrypted = await encryptToken(tokens.access_token, encryptionKey);
  const refreshTokenEncrypted = await encryptToken(tokens.refresh_token, encryptionKey);

  // Calculate token expiration
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store connection in database
  const { error: dbError } = await supabase.rpc("connect_streaming_platform", {
    p_user_id: userId,
    p_platform: "twitch",
    p_platform_user_id: user.id,
    p_username: user.login,
    p_display_name: user.display_name,
    p_access_token_encrypted: accessTokenEncrypted,
    p_refresh_token_encrypted: refreshTokenEncrypted,
    p_token_expires_at: tokenExpiresAt,
    p_channel_url: `https://twitch.tv/${user.login}`,
    p_profile_image_url: user.profile_image_url,
    p_broadcaster_type: user.broadcaster_type || "",
    p_is_live_enabled: true,
  });

  if (dbError) {
    console.error("Database error storing Twitch connection:", dbError);
    throw new Error("Failed to store platform connection");
  }

  return {
    success: true,
    platform: "twitch",
    platformUserId: user.id,
    username: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url,
    channelUrl: `https://twitch.tv/${user.login}`,
    broadcasterType: user.broadcaster_type,
  };
}

// ============================================================================
// TikTok OAuth
// ============================================================================

async function exchangeTikTokToken(
  code: string,
  redirectUri: string
): Promise<TikTokTokenResponse> {
  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");

  if (!clientKey || !clientSecret) {
    throw new Error("TikTok OAuth credentials not configured");
  }

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("TikTok token exchange failed:", errorText);
    throw new Error(`TikTok token exchange failed: ${response.status}`);
  }

  return response.json();
}

async function fetchTikTokUserInfo(
  accessToken: string,
  openId: string
): Promise<TikTokUserResponse> {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch TikTok user info: ${response.status}`);
  }

  return response.json();
}

async function checkTikTokLiveAccess(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/live/check_eligibility/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.data?.can_go_live === true;
  } catch {
    return false;
  }
}

async function handleTikTokCallback(
  code: string,
  redirectUri: string,
  userId: string,
  supabase: any,
  encryptionKey: string
): Promise<OAuthResult> {
  // Exchange code for tokens
  const tokens = await exchangeTikTokToken(code, redirectUri);

  // Fetch user info
  const userResponse = await fetchTikTokUserInfo(tokens.access_token, tokens.open_id);

  if (userResponse.error?.code) {
    throw new Error(`TikTok API error: ${userResponse.error.message}`);
  }

  const user = userResponse.data.user;

  // Check live streaming eligibility
  const isLiveEnabled = await checkTikTokLiveAccess(tokens.access_token);

  // Encrypt tokens
  const accessTokenEncrypted = await encryptToken(tokens.access_token, encryptionKey);
  const refreshTokenEncrypted = await encryptToken(tokens.refresh_token, encryptionKey);

  // Calculate token expiration
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store connection in database
  const { error: dbError } = await supabase.rpc("connect_streaming_platform", {
    p_user_id: userId,
    p_platform: "tiktok",
    p_platform_user_id: user.open_id,
    p_username: user.display_name,
    p_display_name: user.display_name,
    p_access_token_encrypted: accessTokenEncrypted,
    p_refresh_token_encrypted: refreshTokenEncrypted,
    p_token_expires_at: tokenExpiresAt,
    p_channel_url: user.profile_deep_link,
    p_profile_image_url: user.avatar_url,
    p_broadcaster_type: null,
    p_is_live_enabled: isLiveEnabled,
  });

  if (dbError) {
    console.error("Database error storing TikTok connection:", dbError);
    throw new Error("Failed to store platform connection");
  }

  return {
    success: true,
    platform: "tiktok",
    platformUserId: user.open_id,
    username: user.display_name,
    displayName: user.display_name,
    profileImageUrl: user.avatar_url,
    channelUrl: user.profile_deep_link,
    isLiveEnabled,
  };
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

    const body: OAuthCallbackRequest = await req.json();
    const { platform, code, redirectUri, userId } = body;

    // Validate required fields
    if (!platform || !code || !redirectUri || !userId) {
      return jsonResponse(
        { error: "Missing required fields: platform, code, redirectUri, userId" },
        400
      );
    }

    // Validate platform
    if (platform !== "twitch" && platform !== "tiktok") {
      return jsonResponse({ error: "Invalid platform. Must be 'twitch' or 'tiktok'" }, 400);
    }

    // Verify user exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    // Handle platform-specific OAuth
    let result: OAuthResult;

    if (platform === "twitch") {
      result = await handleTwitchCallback(code, redirectUri, userId, supabase, encryptionKey);
    } else {
      result = await handleTikTokCallback(code, redirectUri, userId, supabase, encryptionKey);
    }

    return jsonResponse(result);
  } catch (error) {
    console.error("OAuth callback error:", error);
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
