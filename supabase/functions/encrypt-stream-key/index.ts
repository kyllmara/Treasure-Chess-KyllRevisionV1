/**
 * Encrypt Stream Key Edge Function
 *
 * Securely encrypts and stores manual stream keys for platforms
 * that don't support OAuth (Kick, Custom RTMP).
 *
 * Endpoints:
 * - POST /encrypt-stream-key { userId, platform, streamKey, rtmpUrl? }
 *
 * The stream key is encrypted before storage and can only be
 * decrypted by the get-stream-key function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface EncryptStreamKeyRequest {
  userId: string;
  platform: "kick" | "custom";
  streamKey: string;
  rtmpUrl?: string; // Required for custom platform
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
// Validation
// ============================================================================

function isValidStreamKey(key: string): boolean {
  // Stream keys should be:
  // - At least 10 characters
  // - Only contain alphanumeric, dashes, underscores
  if (key.length < 10) return false;
  return /^[a-zA-Z0-9_-]+$/.test(key);
}

function isValidRtmpUrl(url: string): boolean {
  // RTMP URLs should start with rtmp:// or rtmps://
  return /^rtmps?:\/\/.+/.test(url);
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

    const body: EncryptStreamKeyRequest = await req.json();
    const { userId, platform, streamKey, rtmpUrl } = body;

    // Validate required fields
    if (!userId || !platform || !streamKey) {
      return jsonResponse(
        { error: "Missing required fields: userId, platform, streamKey" },
        400
      );
    }

    // Verify user matches token
    if (user.id !== userId) {
      return jsonResponse({ error: "Unauthorized - user mismatch" }, 403);
    }

    // Validate platform
    if (platform !== "kick" && platform !== "custom") {
      return jsonResponse(
        { error: "Invalid platform. Must be 'kick' or 'custom'" },
        400
      );
    }

    // Validate stream key
    if (!isValidStreamKey(streamKey)) {
      return jsonResponse(
        { error: "Invalid stream key format. Must be at least 10 alphanumeric characters." },
        400
      );
    }

    // Validate RTMP URL for custom platform
    if (platform === "custom") {
      if (!rtmpUrl) {
        return jsonResponse(
          { error: "RTMP URL is required for custom platform" },
          400
        );
      }
      if (!isValidRtmpUrl(rtmpUrl)) {
        return jsonResponse(
          { error: "Invalid RTMP URL. Must start with rtmp:// or rtmps://" },
          400
        );
      }
    }

    // Encrypt the stream key
    const encryptedStreamKey = await encryptToken(streamKey, encryptionKey);

    // Get or create stream settings
    const { data: existingSettings } = await supabase
      .from("stream_settings")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingSettings) {
      // Update existing settings
      const updateData: Record<string, any> = {
        custom_stream_key_encrypted: encryptedStreamKey,
        updated_at: new Date().toISOString(),
      };

      if (platform === "custom" && rtmpUrl) {
        updateData.custom_rtmp_url = rtmpUrl;
      }

      // For Kick, also store in default_platform if not set
      if (platform === "kick") {
        const { data: currentSettings } = await supabase
          .from("stream_settings")
          .select("default_platform")
          .eq("user_id", userId)
          .single();

        if (!currentSettings?.default_platform) {
          updateData.default_platform = "kick";
        }
      }

      const { error: updateError } = await supabase
        .from("stream_settings")
        .update(updateData)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating stream settings:", updateError);
        return jsonResponse({ error: "Failed to save stream key" }, 500);
      }
    } else {
      // Create new settings
      const insertData: Record<string, any> = {
        user_id: userId,
        custom_stream_key_encrypted: encryptedStreamKey,
        default_platform: platform,
      };

      if (platform === "custom" && rtmpUrl) {
        insertData.custom_rtmp_url = rtmpUrl;
      }

      const { error: insertError } = await supabase
        .from("stream_settings")
        .insert(insertData);

      if (insertError) {
        console.error("Error creating stream settings:", insertError);
        return jsonResponse({ error: "Failed to save stream key" }, 500);
      }
    }

    // Also create/update platform connection for consistency
    const { error: connError } = await supabase
      .from("platform_connections")
      .upsert(
        {
          user_id: userId,
          platform,
          platform_user_id: `manual_${userId}_${platform}`,
          username: platform === "kick" ? "Kick User" : "Custom RTMP",
          display_name: platform === "kick" ? "Kick User" : "Custom RTMP",
          access_token_encrypted: encryptedStreamKey, // Store for consistency
          is_active: true,
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,platform",
        }
      );

    if (connError) {
      console.error("Error storing platform connection:", connError);
      // Don't fail - the main settings were saved
    }

    // Log for security auditing
    await supabase.from("stream_events").insert({
      session_id: null,
      event_type: "stream_key_stored",
      metadata: {
        user_id: userId,
        platform,
        stored_at: new Date().toISOString(),
      },
    });

    return jsonResponse({
      success: true,
      message: `${platform === "kick" ? "Kick" : "Custom"} stream key saved securely`,
      platform,
    });
  } catch (error) {
    console.error("Encrypt stream key error:", error);
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
