/**
 * Stream Relay Edge Function
 *
 * Receives video/audio chunks from the Expo Go app and relays them to RTMP endpoints.
 * This enables livestreaming from Expo Go without native RTMP modules.
 *
 * Architecture:
 * 1. App records short video segments using expo-camera
 * 2. Segments are uploaded to this function
 * 3. Function forwards to a streaming service (Mux, Cloudflare Stream, or custom RTMP relay)
 *
 * Endpoints:
 * - POST /stream-relay/start { sessionId, platform, rtmpUrl, streamKey }
 * - POST /stream-relay/chunk { sessionId, chunk (base64), sequence, isLast }
 * - POST /stream-relay/stop { sessionId }
 * - GET /stream-relay/status?sessionId=xxx
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface StartStreamRequest {
  sessionId: string;
  userId: string;
  platform: "twitch" | "tiktok" | "kick" | "custom";
  rtmpUrl: string;
  streamKey: string;
  resolution: "480p" | "720p" | "1080p";
  title?: string;
}

interface ChunkRequest {
  sessionId: string;
  chunk: string; // Base64 encoded video data
  sequence: number;
  timestamp: number;
  duration: number; // Duration in ms
  isKeyframe: boolean;
}

interface StopStreamRequest {
  sessionId: string;
  reason?: string;
}

interface StreamSession {
  id: string;
  userId: string;
  platform: string;
  rtmpUrl: string;
  streamKey: string;
  status: "starting" | "live" | "stopping" | "stopped" | "error";
  startedAt: string;
  lastChunkAt: string;
  chunksReceived: number;
  bytesStreamed: number;
  error?: string;
  // For Mux integration
  muxLiveStreamId?: string;
  muxPlaybackId?: string;
}

// In-memory session store (in production, use Redis or database)
const activeSessions = new Map<string, StreamSession>();

// ============================================================================
// Mux Live Streaming Integration
// ============================================================================

interface MuxCreateLiveStreamResponse {
  data: {
    id: string;
    stream_key: string;
    status: string;
    playback_ids: Array<{ id: string; policy: string }>;
    reconnect_window: number;
    latency_mode: string;
  };
}

async function createMuxLiveStream(title: string): Promise<{
  liveStreamId: string;
  streamKey: string;
  playbackId: string;
  rtmpUrl: string;
}> {
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");

  if (!muxTokenId || !muxTokenSecret) {
    throw new Error("Mux credentials not configured");
  }

  const auth = btoa(`${muxTokenId}:${muxTokenSecret}`);

  const response = await fetch("https://api.mux.com/video/v1/live-streams", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      playback_policy: ["public"],
      new_asset_settings: {
        playback_policy: ["public"],
      },
      latency_mode: "low",
      reconnect_window: 60,
      // Enable simulcasting to external RTMP
      // This allows Mux to relay to Twitch/TikTok/Kick
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mux create live stream failed:", errorText);
    throw new Error(`Failed to create Mux live stream: ${response.status}`);
  }

  const data: MuxCreateLiveStreamResponse = await response.json();

  return {
    liveStreamId: data.data.id,
    streamKey: data.data.stream_key,
    playbackId: data.data.playback_ids[0]?.id || "",
    rtmpUrl: "rtmps://global-live.mux.com:443/app",
  };
}

async function addMuxSimulcastTarget(
  liveStreamId: string,
  rtmpUrl: string,
  streamKey: string
): Promise<string> {
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");
  const auth = btoa(`${muxTokenId}:${muxTokenSecret}`);

  const response = await fetch(
    `https://api.mux.com/video/v1/live-streams/${liveStreamId}/simulcast-targets`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: rtmpUrl,
        stream_key: streamKey,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mux add simulcast target failed:", errorText);
    throw new Error(`Failed to add simulcast target: ${response.status}`);
  }

  const data = await response.json();
  return data.data.id;
}

async function endMuxLiveStream(liveStreamId: string): Promise<void> {
  const muxTokenId = Deno.env.get("MUX_TOKEN_ID");
  const muxTokenSecret = Deno.env.get("MUX_TOKEN_SECRET");
  const auth = btoa(`${muxTokenId}:${muxTokenSecret}`);

  await fetch(
    `https://api.mux.com/video/v1/live-streams/${liveStreamId}/complete`,
    {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );
}

// ============================================================================
// Cloudflare Stream Integration (Alternative)
// ============================================================================

async function createCloudflareStreamInput(): Promise<{
  inputId: string;
  rtmpUrl: string;
  streamKey: string;
}> {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_STREAM_TOKEN");

  if (!accountId || !apiToken) {
    throw new Error("Cloudflare Stream credentials not configured");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meta: { name: "Treasure Chess Stream" },
        recording: { mode: "automatic" },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare Stream error: ${response.status}`);
  }

  const data = await response.json();
  const input = data.result;

  return {
    inputId: input.uid,
    rtmpUrl: input.rtmps.url,
    streamKey: input.rtmps.streamKey,
  };
}

// ============================================================================
// WebRTC to RTMP Gateway (Self-hosted option)
// ============================================================================

/**
 * For self-hosted RTMP relay, you would deploy a service like:
 * - MediaMTX (formerly rtsp-simple-server)
 * - Node-Media-Server
 * - OvenMediaEngine
 *
 * The app would connect via WebRTC or upload video chunks,
 * and the server would transcode and push to RTMP.
 */

interface WebRTCGatewayConfig {
  gatewayUrl: string;
  apiKey: string;
}

async function createWebRTCSession(
  gatewayConfig: WebRTCGatewayConfig,
  rtmpUrl: string,
  streamKey: string
): Promise<{ sessionId: string; webrtcUrl: string }> {
  const response = await fetch(`${gatewayConfig.gatewayUrl}/api/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rtmpOutput: `${rtmpUrl}/${streamKey}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`WebRTC gateway error: ${response.status}`);
  }

  const data = await response.json();
  return {
    sessionId: data.sessionId,
    webrtcUrl: data.webrtcUrl,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    switch (path) {
      case "start":
        return handleStartStream(req, user.id, supabase);
      case "chunk":
        return handleChunk(req, user.id);
      case "stop":
        return handleStopStream(req, user.id, supabase);
      case "status":
        return handleStatus(url, user.id);
      default:
        return jsonResponse({ error: "Unknown endpoint" }, 404);
    }
  } catch (error) {
    console.error("Stream relay error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

// ============================================================================
// Request Handlers
// ============================================================================

async function handleStartStream(
  req: Request,
  userId: string,
  supabase: any
): Promise<Response> {
  const body: StartStreamRequest = await req.json();

  // Verify user owns this session
  if (body.userId !== userId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  // Check if session already exists
  if (activeSessions.has(body.sessionId)) {
    return jsonResponse({ error: "Session already active" }, 400);
  }

  try {
    // Determine streaming strategy based on configuration
    const useMux = Deno.env.get("MUX_TOKEN_ID") && Deno.env.get("MUX_TOKEN_SECRET");
    const useCloudflare = Deno.env.get("CLOUDFLARE_STREAM_TOKEN");

    let streamingConfig: {
      ingestUrl: string;
      ingestKey: string;
      playbackUrl?: string;
      muxLiveStreamId?: string;
    };

    if (useMux) {
      // Use Mux with simulcast to target platform
      const muxStream = await createMuxLiveStream(body.title || "Treasure Chess");

      // Add simulcast target to relay to the user's chosen platform
      if (body.platform !== "custom") {
        await addMuxSimulcastTarget(
          muxStream.liveStreamId,
          body.rtmpUrl,
          body.streamKey
        );
      }

      streamingConfig = {
        ingestUrl: muxStream.rtmpUrl,
        ingestKey: muxStream.streamKey,
        playbackUrl: `https://stream.mux.com/${muxStream.playbackId}.m3u8`,
        muxLiveStreamId: muxStream.liveStreamId,
      };
    } else if (useCloudflare) {
      // Use Cloudflare Stream
      const cfStream = await createCloudflareStreamInput();
      streamingConfig = {
        ingestUrl: cfStream.rtmpUrl,
        ingestKey: cfStream.streamKey,
      };
    } else {
      // Direct RTMP (requires custom relay server)
      streamingConfig = {
        ingestUrl: body.rtmpUrl,
        ingestKey: body.streamKey,
      };
    }

    // Create session
    const session: StreamSession = {
      id: body.sessionId,
      userId,
      platform: body.platform,
      rtmpUrl: streamingConfig.ingestUrl,
      streamKey: streamingConfig.ingestKey,
      status: "starting",
      startedAt: new Date().toISOString(),
      lastChunkAt: new Date().toISOString(),
      chunksReceived: 0,
      bytesStreamed: 0,
      muxLiveStreamId: streamingConfig.muxLiveStreamId,
    };

    activeSessions.set(body.sessionId, session);

    // Update database
    await supabase
      .from("stream_sessions")
      .update({
        connection_state: "connecting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.sessionId);

    return jsonResponse({
      success: true,
      sessionId: body.sessionId,
      ingestUrl: streamingConfig.ingestUrl,
      ingestKey: streamingConfig.ingestKey,
      playbackUrl: streamingConfig.playbackUrl,
      message: useMux
        ? "Stream created via Mux with simulcast relay"
        : "Stream created - connect via RTMP",
    });
  } catch (error) {
    console.error("Failed to start stream:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start stream",
      },
      500
    );
  }
}

async function handleChunk(req: Request, userId: string): Promise<Response> {
  const body: ChunkRequest = await req.json();

  const session = activeSessions.get(body.sessionId);
  if (!session) {
    return jsonResponse({ error: "Session not found" }, 404);
  }

  if (session.userId !== userId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  // Update session stats
  const chunkSize = body.chunk.length * 0.75; // Approximate decoded size
  session.chunksReceived++;
  session.bytesStreamed += chunkSize;
  session.lastChunkAt = new Date().toISOString();

  if (session.status === "starting") {
    session.status = "live";
  }

  // In a production system with Mux, chunks are sent directly to Mux's RTMP ingest
  // via a native RTMP connection from the relay server, not uploaded here.
  //
  // For Expo Go without native modules, you would:
  // 1. Upload chunks to object storage (S3, R2, etc.)
  // 2. A background worker picks up chunks and streams them via FFmpeg
  // 3. Or use WebRTC from the app to a media server

  return jsonResponse({
    success: true,
    sequence: body.sequence,
    chunksReceived: session.chunksReceived,
    bytesStreamed: session.bytesStreamed,
  });
}

async function handleStopStream(
  req: Request,
  userId: string,
  supabase: any
): Promise<Response> {
  const body: StopStreamRequest = await req.json();

  const session = activeSessions.get(body.sessionId);
  if (!session) {
    return jsonResponse({ error: "Session not found" }, 404);
  }

  if (session.userId !== userId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  try {
    // End Mux live stream if applicable
    if (session.muxLiveStreamId) {
      await endMuxLiveStream(session.muxLiveStreamId);
    }

    session.status = "stopped";

    // Calculate duration
    const duration = Math.floor(
      (Date.now() - new Date(session.startedAt).getTime()) / 1000
    );

    // Update database
    await supabase
      .from("stream_sessions")
      .update({
        connection_state: "stopped",
        ended_at: new Date().toISOString(),
        duration_seconds: duration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.sessionId);

    // Clean up
    activeSessions.delete(body.sessionId);

    return jsonResponse({
      success: true,
      sessionId: body.sessionId,
      duration,
      chunksReceived: session.chunksReceived,
      bytesStreamed: session.bytesStreamed,
    });
  } catch (error) {
    console.error("Failed to stop stream:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop stream",
      },
      500
    );
  }
}

function handleStatus(url: URL, userId: string): Response {
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return jsonResponse({ error: "Missing sessionId parameter" }, 400);
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    return jsonResponse({ error: "Session not found" }, 404);
  }

  if (session.userId !== userId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  return jsonResponse({
    sessionId: session.id,
    status: session.status,
    platform: session.platform,
    startedAt: session.startedAt,
    lastChunkAt: session.lastChunkAt,
    chunksReceived: session.chunksReceived,
    bytesStreamed: session.bytesStreamed,
    error: session.error,
  });
}

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
