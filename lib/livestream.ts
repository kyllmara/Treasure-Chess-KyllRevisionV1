/**
 * Livestream Service
 *
 * Core livestream functionality including platform connections, stream sessions,
 * OAuth flows, and realtime subscriptions for RTMP streaming to TikTok, Twitch, and Kick.
 */

import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  StreamPlatform,
  StreamResolution,
  StreamConnectionState,
  StreamConfig,
  StreamSession,
  StreamHealth,
  StreamStats,
  PlatformConnection,
  StartStreamResult,
  StopStreamResult,
  ConnectPlatformResult,
  GetStreamKeyResult,
  TwitchUserInfo,
  TikTokUserInfo,
  OAuthTokenResponse,
  LivestreamError,
  LivestreamErrorCode,
  createLivestreamError,
  PLATFORM_INFO,
  RESOLUTION_CONFIGS,
  StreamSettingsRow,
  DEFAULT_STREAM_SETTINGS,
} from "@/types/livestream";

// ============================================================================
// Configuration
// ============================================================================

const TWITCH_CLIENT_ID = process.env.EXPO_PUBLIC_TWITCH_CLIENT_ID || "";
const TWITCH_REDIRECT_URI = process.env.EXPO_PUBLIC_TWITCH_REDIRECT_URI || "";
const TIKTOK_CLIENT_KEY = process.env.EXPO_PUBLIC_TIKTOK_CLIENT_KEY || "";
const TIKTOK_REDIRECT_URI = process.env.EXPO_PUBLIC_TIKTOK_REDIRECT_URI || "";

// OAuth scopes required for streaming
const TWITCH_SCOPES = [
  "channel:manage:broadcast",
  "channel:read:stream_key",
  "user:read:email",
].join(" ");

const TIKTOK_SCOPES = ["user.info.basic", "live.create"].join(",");

// ============================================================================
// Stream Settings
// ============================================================================

/**
 * Get or create stream settings for a user
 */
export async function getStreamSettings(
  userId: string
): Promise<StreamSettingsRow | null> {
  const { data, error } = await supabase.rpc("get_or_create_stream_settings", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error getting stream settings:", error);
    return null;
  }

  return data;
}

/**
 * Update stream settings
 */
export async function updateStreamSettings(
  userId: string,
  settings: Partial<StreamSettingsRow>
): Promise<StreamSettingsRow | null> {
  const { data, error } = await supabase
    .from("stream_settings")
    .update({
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating stream settings:", error);
    return null;
  }

  return data;
}

// ============================================================================
// Platform Connections
// ============================================================================

/**
 * Get all platform connections for a user
 */
export async function getPlatformConnections(
  userId: string
): Promise<PlatformConnection[]> {
  const { data, error } = await supabase.rpc("get_user_platform_connections", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error getting platform connections:", error);
    return [];
  }

  // Transform to PlatformConnection type (exclude encrypted tokens)
  return (data || []).map((conn: any) => ({
    platform: conn.platform as StreamPlatform,
    isConnected: conn.is_active,
    username: conn.username,
    channelId: conn.platform_user_id,
    channelUrl: conn.channel_url,
    connectedAt: conn.connected_at,
  }));
}

/**
 * Check if a specific platform is connected
 */
export async function isPlatformConnected(
  userId: string,
  platform: StreamPlatform
): Promise<boolean> {
  const { data } = await supabase
    .from("platform_connections")
    .select("is_active")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("is_active", true)
    .single();

  return !!data?.is_active;
}

/**
 * Disconnect a platform
 */
export async function disconnectPlatform(
  userId: string,
  platform: StreamPlatform
): Promise<void> {
  const { error } = await supabase.rpc("disconnect_streaming_platform", {
    p_user_id: userId,
    p_platform: platform,
  });

  if (error) {
    console.error("Error disconnecting platform:", error);
    throw error;
  }
}

// ============================================================================
// OAuth Flows
// ============================================================================

/**
 * Generate OAuth URL for Twitch
 */
export function getTwitchOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: TWITCH_SCOPES,
    state,
    force_verify: "true",
  });

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

/**
 * Generate OAuth URL for TikTok
 */
export function getTikTokOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    redirect_uri: TIKTOK_REDIRECT_URI,
    response_type: "code",
    scope: TIKTOK_SCOPES,
    state,
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

/**
 * Exchange Twitch authorization code for tokens and connect
 */
export async function connectTwitch(
  userId: string,
  code: string
): Promise<ConnectPlatformResult> {
  try {
    // Exchange code for tokens via Edge Function
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
      "oauth-callback",
      {
        body: {
          provider: "twitch",
          code,
          redirect_uri: TWITCH_REDIRECT_URI,
        },
      }
    );

    if (tokenError || !tokenData?.access_token) {
      return {
        success: false,
        error: { code: "OAUTH_FAILED", message: tokenError?.message || "Failed to exchange code" },
      };
    }

    // Get Twitch user info
    const userInfo = await fetchTwitchUserInfo(tokenData.access_token);

    // Store connection in database (tokens encrypted by Edge Function)
    const { data: connection, error: connError } = await supabase.rpc(
      "connect_streaming_platform",
      {
        p_user_id: userId,
        p_platform: "twitch",
        p_platform_user_id: userInfo.id,
        p_username: userInfo.login,
        p_display_name: userInfo.displayName,
        p_access_token_encrypted: tokenData.access_token_encrypted,
        p_refresh_token_encrypted: tokenData.refresh_token_encrypted,
        p_token_expires_at: tokenData.expires_at,
        p_channel_url: `https://twitch.tv/${userInfo.login}`,
        p_profile_image_url: userInfo.profileImageUrl,
        p_broadcaster_type: userInfo.broadcasterType,
        p_is_live_enabled: true,
      }
    );

    if (connError) {
      return {
        success: false,
        error: { code: "CONNECTION_FAILED", message: connError.message },
      };
    }

    return {
      success: true,
      connection: {
        platform: "twitch",
        isConnected: true,
        username: userInfo.login,
        channelId: userInfo.id,
        channelUrl: `https://twitch.tv/${userInfo.login}`,
        connectedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return {
      success: false,
      error: {
        code: "OAUTH_FAILED",
        message: e instanceof Error ? e.message : "Unknown error",
      },
    };
  }
}

/**
 * Exchange TikTok authorization code for tokens and connect
 */
export async function connectTikTok(
  userId: string,
  code: string
): Promise<ConnectPlatformResult> {
  try {
    // Exchange code for tokens via Edge Function
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
      "oauth-callback",
      {
        body: {
          provider: "tiktok",
          code,
          redirect_uri: TIKTOK_REDIRECT_URI,
        },
      }
    );

    if (tokenError || !tokenData?.access_token) {
      return {
        success: false,
        error: { code: "OAUTH_FAILED", message: tokenError?.message || "Failed to exchange code" },
      };
    }

    // Get TikTok user info
    const userInfo = await fetchTikTokUserInfo(tokenData.access_token);

    if (!userInfo.isLiveEnabled) {
      return {
        success: false,
        error: {
          code: "PLATFORM_RATE_LIMITED",
          message: "Your TikTok account is not enabled for live streaming",
        },
      };
    }

    // Store connection
    const { data: connection, error: connError } = await supabase.rpc(
      "connect_streaming_platform",
      {
        p_user_id: userId,
        p_platform: "tiktok",
        p_platform_user_id: userInfo.openId,
        p_username: userInfo.displayName,
        p_display_name: userInfo.displayName,
        p_access_token_encrypted: tokenData.access_token_encrypted,
        p_refresh_token_encrypted: tokenData.refresh_token_encrypted,
        p_token_expires_at: tokenData.expires_at,
        p_channel_url: null,
        p_profile_image_url: userInfo.avatarUrl,
        p_broadcaster_type: null,
        p_is_live_enabled: userInfo.isLiveEnabled,
      }
    );

    if (connError) {
      return {
        success: false,
        error: { code: "CONNECTION_FAILED", message: connError.message },
      };
    }

    return {
      success: true,
      connection: {
        platform: "tiktok",
        isConnected: true,
        username: userInfo.displayName,
        channelId: userInfo.openId,
        connectedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    return {
      success: false,
      error: {
        code: "OAUTH_FAILED",
        message: e instanceof Error ? e.message : "Unknown error",
      },
    };
  }
}

/**
 * Fetch Twitch user info using access token
 */
async function fetchTwitchUserInfo(accessToken: string): Promise<TwitchUserInfo> {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": TWITCH_CLIENT_ID,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Twitch user info");
  }

  const data = await response.json();
  const user = data.data[0];

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url,
    broadcasterType: user.broadcaster_type,
  };
}

/**
 * Fetch TikTok user info using access token
 */
async function fetchTikTokUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch TikTok user info");
  }

  const data = await response.json();
  const user = data.data.user;

  // Check if user has live streaming capability
  const liveCheckResponse = await fetch(
    "https://open.tiktokapis.com/v2/live/stream/info/",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  return {
    openId: user.open_id,
    unionId: user.union_id,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    isLiveEnabled: liveCheckResponse.ok,
  };
}

// ============================================================================
// Stream Key Retrieval
// ============================================================================

/**
 * Get stream key for a connected platform
 */
export async function getStreamKey(
  userId: string,
  platform: StreamPlatform
): Promise<GetStreamKeyResult> {
  if (platform === "kick" || platform === "custom") {
    // These platforms require manual stream key input
    return {
      success: false,
      error: {
        code: "INVALID_STREAM_KEY",
        message: `${PLATFORM_INFO[platform].name} requires manual stream key input`,
      },
    };
  }

  // Get the stream key via Edge Function (requires decryption)
  const { data, error } = await supabase.functions.invoke("get-stream-key", {
    body: {
      user_id: userId,
      platform,
    },
  });

  if (error || !data?.stream_key) {
    return {
      success: false,
      error: {
        code: "INVALID_STREAM_KEY",
        message: error?.message || "Failed to retrieve stream key",
      },
    };
  }

  return {
    success: true,
    streamKey: data.stream_key,
    rtmpUrl: data.rtmp_url || PLATFORM_INFO[platform].rtmpUrl,
  };
}

// ============================================================================
// Stream Sessions
// ============================================================================

/**
 * Start a new stream session
 */
export async function startStream(
  userId: string,
  config: StreamConfig,
  gameId?: string
): Promise<StartStreamResult> {
  // Validate platform connection (unless custom RTMP)
  if (config.platform !== "custom" && config.platform !== "kick") {
    const isConnected = await isPlatformConnected(userId, config.platform);
    if (!isConnected) {
      return {
        success: false,
        error: {
          code: "PLATFORM_NOT_CONNECTED",
          message: `Please connect your ${PLATFORM_INFO[config.platform].name} account first`,
        },
      };
    }
  }

  const resolution = RESOLUTION_CONFIGS[config.resolution];

  // Encrypt stream key before storing
  const { data: encryptedKey, error: encryptError } = await supabase.functions.invoke(
    "encrypt-stream-key",
    {
      body: { stream_key: config.streamKey },
    }
  );

  if (encryptError) {
    return {
      success: false,
      error: { code: "UNKNOWN_ERROR", message: "Failed to secure stream key" },
    };
  }

  // Create session
  const { data: session, error } = await supabase.rpc("start_stream_session", {
    p_user_id: userId,
    p_platform: config.platform,
    p_rtmp_url: config.rtmpUrl,
    p_stream_key_encrypted: encryptedKey.encrypted,
    p_resolution: config.resolution,
    p_video_bitrate: resolution.bitrate,
    p_title: config.title,
    p_description: config.description || null,
    p_tags: config.tags || null,
    p_game_id: gameId || null,
  });

  if (error) {
    return {
      success: false,
      error: {
        code: error.message.includes("already has an active")
          ? "STREAM_ALREADY_ACTIVE"
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }

  return {
    success: true,
    session: transformSessionRow(session),
  };
}

/**
 * Stop an active stream session
 */
export async function stopStream(sessionId: string): Promise<StopStreamResult> {
  const { data: session, error } = await supabase.rpc("end_stream_session", {
    p_session_id: sessionId,
  });

  if (error) {
    return {
      success: false,
      error: {
        code: error.message.includes("not found")
          ? "STREAM_NOT_FOUND"
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }

  return {
    success: true,
    finalStats: {
      durationSeconds: session.duration_seconds,
      peakViewerCount: session.peak_viewer_count,
      averageViewerCount: session.average_viewer_count || 0,
    },
  };
}

/**
 * Update stream connection state
 */
export async function updateStreamState(
  sessionId: string,
  state: StreamConnectionState,
  errorCode?: string,
  errorMessage?: string
): Promise<StreamSession | null> {
  const { data, error } = await supabase.rpc("update_stream_state", {
    p_session_id: sessionId,
    p_new_state: state,
    p_error_code: errorCode || null,
    p_error_message: errorMessage || null,
  });

  if (error) {
    console.error("Error updating stream state:", error);
    return null;
  }

  return transformSessionRow(data);
}

/**
 * Update viewer count
 */
export async function updateViewerCount(
  sessionId: string,
  count: number
): Promise<void> {
  const { error } = await supabase.rpc("update_viewer_count", {
    p_session_id: sessionId,
    p_viewer_count: count,
  });

  if (error) {
    console.error("Error updating viewer count:", error);
  }
}

/**
 * Update stream health metrics
 */
export async function updateStreamHealth(
  sessionId: string,
  health: {
    bitrate: number;
    fps: number;
    droppedFrames: number;
    totalFrames: number;
    latencyMs: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc("update_stream_health", {
    p_session_id: sessionId,
    p_bitrate: health.bitrate,
    p_fps: health.fps,
    p_dropped_frames: health.droppedFrames,
    p_total_frames: health.totalFrames,
    p_latency_ms: health.latencyMs,
  });

  if (error) {
    console.error("Error updating stream health:", error);
  }
}

/**
 * Get active stream session for a user
 */
export async function getActiveStream(userId: string): Promise<StreamSession | null> {
  const { data, error } = await supabase
    .from("stream_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("connection_state", ["initializing", "connecting", "connected", "streaming", "reconnecting"])
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return transformSessionRow(data);
}

/**
 * Get stream session by ID
 */
export async function getStreamSession(sessionId: string): Promise<StreamSession | null> {
  const { data, error } = await supabase
    .from("stream_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return transformSessionRow(data);
}

/**
 * Get recent streams for a user
 */
export async function getRecentStreams(
  userId?: string,
  platform?: StreamPlatform,
  limit: number = 20
): Promise<StreamSession[]> {
  const { data, error } = await supabase.rpc("get_recent_streams", {
    p_user_id: userId || null,
    p_platform: platform || null,
    p_limit: limit,
    p_include_live: true,
  });

  if (error) {
    console.error("Error fetching recent streams:", error);
    return [];
  }

  return (data || []).map(transformSessionRow);
}

/**
 * Get currently live streams
 */
export async function getLiveStreams(
  platform?: StreamPlatform,
  limit: number = 50
): Promise<Array<{
  sessionId: string;
  userId: string;
  username: string;
  profileImageUrl: string | null;
  platform: StreamPlatform;
  title: string;
  viewerCount: number;
  gameId: string | null;
  startedAt: string;
  durationSeconds: number;
}>> {
  const { data, error } = await supabase.rpc("get_live_streams", {
    p_platform: platform || null,
    p_limit: limit,
  });

  if (error) {
    console.error("Error fetching live streams:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    sessionId: row.session_id,
    userId: row.user_id,
    username: row.username,
    profileImageUrl: row.profile_image_url,
    platform: row.platform as StreamPlatform,
    title: row.title,
    viewerCount: row.viewer_count,
    gameId: row.game_id,
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds,
  }));
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get stream statistics for a user
 */
export async function getStreamStatistics(userId: string): Promise<StreamStats | null> {
  const { data, error } = await supabase.rpc("get_stream_statistics", {
    p_user_id: userId,
  });

  if (error || !data) {
    console.error("Error fetching stream statistics:", error);
    return null;
  }

  return {
    totalStreams: data.total_streams,
    totalDurationSeconds: data.total_duration_seconds,
    totalViewers: data.total_viewers,
    averageViewers: data.average_viewers,
    peakViewers: data.peak_viewers,
    lastStreamAt: data.last_stream_at,
  };
}

// ============================================================================
// Realtime Subscriptions
// ============================================================================

interface StreamSubscriptionCallbacks {
  onStateChange?: (state: StreamConnectionState) => void;
  onViewerCountChange?: (count: number) => void;
  onHealthUpdate?: (health: StreamHealth) => void;
  onError?: (error: LivestreamError) => void;
}

/**
 * Subscribe to stream session updates
 */
export function subscribeToStream(
  sessionId: string,
  callbacks: StreamSubscriptionCallbacks
): RealtimeChannel {
  const channel = supabase
    .channel(`stream:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "stream_sessions",
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const session = payload.new as any;

        if (callbacks.onStateChange && payload.old.connection_state !== session.connection_state) {
          callbacks.onStateChange(session.connection_state);
        }

        if (callbacks.onViewerCountChange && payload.old.viewer_count !== session.viewer_count) {
          callbacks.onViewerCountChange(session.viewer_count);
        }

        if (callbacks.onHealthUpdate && session.last_bitrate) {
          callbacks.onHealthUpdate({
            bitrate: session.last_bitrate,
            droppedFrames: session.dropped_frames,
            totalFrames: session.total_frames,
            fps: session.last_fps,
            latency: session.last_latency_ms,
            quality: session.health_quality,
            lastUpdated: session.updated_at,
          });
        }

        if (callbacks.onError && session.error_code && session.error_code !== payload.old.error_code) {
          callbacks.onError(
            createLivestreamError(
              session.error_code as LivestreamErrorCode,
              session.error_message || "Stream error",
              session.connection_state === "reconnecting"
            )
          );
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to live streams list updates
 */
export function subscribeToLiveStreams(
  onUpdate: (streams: StreamSession[]) => void
): RealtimeChannel {
  const channel = supabase
    .channel("live_streams")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "stream_sessions",
      },
      async () => {
        // Refresh the live streams list
        const streams = await getRecentStreams(undefined, undefined, 50);
        const liveStreams = streams.filter((s) =>
          ["streaming", "connected"].includes(s.connectionState)
        );
        onUpdate(liveStreams);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribeFromChannel(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

// ============================================================================
// Twitch API Helpers
// ============================================================================

/**
 * Set Twitch stream info (title, game)
 */
export async function setTwitchStreamInfo(
  userId: string,
  title: string,
  gameId?: string
): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("twitch-api", {
    body: {
      user_id: userId,
      action: "update_channel",
      title,
      game_id: gameId,
    },
  });

  if (error) {
    console.error("Error setting Twitch stream info:", error);
    return false;
  }

  return data?.success || false;
}

/**
 * Get Twitch stream key
 */
export async function getTwitchStreamKey(userId: string): Promise<string | null> {
  const result = await getStreamKey(userId, "twitch");
  return result.success ? result.streamKey || null : null;
}

// ============================================================================
// TikTok API Helpers
// ============================================================================

/**
 * Create TikTok live room and get stream info
 */
export async function createTikTokLiveRoom(
  userId: string,
  title: string
): Promise<{ streamKey: string; rtmpUrl: string } | null> {
  const { data, error } = await supabase.functions.invoke("tiktok-api", {
    body: {
      user_id: userId,
      action: "create_live",
      title,
    },
  });

  if (error || !data?.stream_key) {
    console.error("Error creating TikTok live room:", error);
    return null;
  }

  return {
    streamKey: data.stream_key,
    rtmpUrl: data.rtmp_url,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Transform database row to StreamSession type
 */
function transformSessionRow(row: any): StreamSession {
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    platform: row.platform as StreamPlatform,
    streamKey: "", // Never expose stream key
    rtmpUrl: row.rtmp_url,
    config: {
      platform: row.platform,
      streamKey: "",
      rtmpUrl: row.rtmp_url,
      resolution: row.resolution as StreamResolution,
      audio: {
        enabled: true,
        bitrate: row.audio_bitrate || 128,
        sampleRate: 44100,
        channels: 2,
      },
      camera: {
        enabled: true,
        position: "bottom-right",
        size: "medium",
        borderRadius: 12,
        borderColor: "#FFD700",
        useFrontCamera: true,
      },
      gameInfo: {
        showPlayerNames: true,
        showRatings: true,
        showTimer: true,
        showMoveHistory: false,
        showStakes: true,
        position: "top",
      },
      title: row.title,
      description: row.description,
      tags: row.tags,
    },
    connectionState: row.connection_state as StreamConnectionState,
    health: row.last_bitrate
      ? {
          bitrate: row.last_bitrate,
          droppedFrames: row.dropped_frames,
          totalFrames: row.total_frames,
          fps: row.last_fps,
          latency: row.last_latency_ms,
          quality: row.health_quality,
          lastUpdated: row.updated_at,
        }
      : null,
    viewerCount: row.viewer_count,
    peakViewerCount: row.peak_viewer_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    errorMessage: row.error_message,
  };
}

/**
 * Format duration for display
 */
export function formatStreamDuration(seconds: number): string {
  // Handle negative values
  if (seconds < 0) {
    return "0:00";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format viewer count for display
 */
export function formatViewerCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get quality indicator color
 */
export function getQualityColor(quality: StreamHealth["quality"]): string {
  switch (quality) {
    case "excellent":
      return "#22C55E"; // green
    case "good":
      return "#84CC16"; // lime
    case "fair":
      return "#F59E0B"; // amber
    case "poor":
      return "#EF4444"; // red
    default:
      return "#6B7280"; // gray
  }
}

/**
 * Validate RTMP URL format
 */
export function isValidRtmpUrl(url: string): boolean {
  return /^rtmps?:\/\/[^\s]+$/i.test(url);
}

/**
 * Validate stream key format (basic check)
 */
export function isValidStreamKey(key: string): boolean {
  return key.length >= 10 && /^[a-zA-Z0-9_-]+$/.test(key);
}
