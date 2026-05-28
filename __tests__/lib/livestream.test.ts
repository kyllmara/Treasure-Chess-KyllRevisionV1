/**
 * Livestream Service Tests
 *
 * Tests for livestream utility functions, formatting, and validation.
 */

import {
  formatStreamDuration,
  formatViewerCount,
  getQualityColor,
  isValidRtmpUrl,
  isValidStreamKey,
} from "@/lib/livestream";
import {
  RESOLUTION_CONFIGS,
  PLATFORM_INFO,
  DEFAULT_STREAM_SETTINGS,
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_GAME_INFO_CONFIG,
  createLivestreamError,
  type StreamPlatform,
  type StreamResolution,
  type StreamConnectionState,
  type LivestreamErrorCode,
} from "@/types/livestream";

// ============================================================================
// Format Functions Tests
// ============================================================================

describe("Livestream Formatting", () => {
  describe("formatStreamDuration", () => {
    it("should format zero seconds", () => {
      expect(formatStreamDuration(0)).toBe("0:00");
    });

    it("should format seconds under a minute", () => {
      expect(formatStreamDuration(45)).toBe("0:45");
    });

    it("should format one minute", () => {
      expect(formatStreamDuration(60)).toBe("1:00");
    });

    it("should format minutes and seconds", () => {
      expect(formatStreamDuration(125)).toBe("2:05");
      expect(formatStreamDuration(599)).toBe("9:59");
    });

    it("should format hours", () => {
      expect(formatStreamDuration(3600)).toBe("1:00:00");
      expect(formatStreamDuration(3661)).toBe("1:01:01");
    });

    it("should format multiple hours", () => {
      expect(formatStreamDuration(7265)).toBe("2:01:05");
      expect(formatStreamDuration(36000)).toBe("10:00:00");
    });
  });

  describe("formatViewerCount", () => {
    it("should format small numbers directly", () => {
      expect(formatViewerCount(0)).toBe("0");
      expect(formatViewerCount(1)).toBe("1");
      expect(formatViewerCount(100)).toBe("100");
      expect(formatViewerCount(999)).toBe("999");
    });

    it("should format thousands with K suffix", () => {
      expect(formatViewerCount(1000)).toBe("1.0K");
      expect(formatViewerCount(1500)).toBe("1.5K");
      expect(formatViewerCount(10000)).toBe("10.0K");
      expect(formatViewerCount(999999)).toBe("1000.0K");
    });

    it("should format millions with M suffix", () => {
      expect(formatViewerCount(1000000)).toBe("1.0M");
      expect(formatViewerCount(1500000)).toBe("1.5M");
      expect(formatViewerCount(10000000)).toBe("10.0M");
    });
  });

  describe("getQualityColor", () => {
    it("should return green for excellent quality", () => {
      expect(getQualityColor("excellent")).toBe("#22C55E");
    });

    it("should return lime for good quality", () => {
      expect(getQualityColor("good")).toBe("#84CC16");
    });

    it("should return amber for fair quality", () => {
      expect(getQualityColor("fair")).toBe("#F59E0B");
    });

    it("should return red for poor quality", () => {
      expect(getQualityColor("poor")).toBe("#EF4444");
    });
  });
});

// ============================================================================
// Validation Functions Tests
// ============================================================================

describe("Livestream Validation", () => {
  describe("isValidRtmpUrl", () => {
    it("should accept valid RTMP URLs", () => {
      expect(isValidRtmpUrl("rtmp://live.twitch.tv/app")).toBe(true);
      expect(isValidRtmpUrl("rtmps://live.twitch.tv/app")).toBe(true);
      expect(isValidRtmpUrl("rtmp://a.rtmp.youtube.com/live2")).toBe(true);
      expect(isValidRtmpUrl("rtmp://push.tiktok.com/live")).toBe(true);
    });

    it("should reject invalid URLs", () => {
      expect(isValidRtmpUrl("http://example.com")).toBe(false);
      expect(isValidRtmpUrl("https://example.com")).toBe(false);
      expect(isValidRtmpUrl("ftp://example.com")).toBe(false);
      expect(isValidRtmpUrl("")).toBe(false);
      expect(isValidRtmpUrl("not a url")).toBe(false);
    });

    it("should handle edge cases", () => {
      expect(isValidRtmpUrl("rtmp://")).toBe(false);
      expect(isValidRtmpUrl("rtmp://a")).toBe(true);
      expect(isValidRtmpUrl("RTMP://example.com")).toBe(true); // Case insensitive
    });
  });

  describe("isValidStreamKey", () => {
    it("should accept valid stream keys", () => {
      expect(isValidStreamKey("live_123456789")).toBe(true);
      expect(isValidStreamKey("sk-abcdefghij")).toBe(true);
      expect(isValidStreamKey("1234567890")).toBe(true);
      expect(isValidStreamKey("abcdefghij")).toBe(true);
    });

    it("should reject short stream keys", () => {
      expect(isValidStreamKey("")).toBe(false);
      expect(isValidStreamKey("short")).toBe(false);
      expect(isValidStreamKey("123456789")).toBe(false); // 9 chars
    });

    it("should reject keys with invalid characters", () => {
      expect(isValidStreamKey("key with spaces")).toBe(false);
      expect(isValidStreamKey("key!@#$%^&*()")).toBe(false);
      expect(isValidStreamKey("key.with.dots")).toBe(false);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("Livestream Constants", () => {
  describe("RESOLUTION_CONFIGS", () => {
    it("should have all resolution presets", () => {
      expect(RESOLUTION_CONFIGS["480p"]).toBeDefined();
      expect(RESOLUTION_CONFIGS["720p"]).toBeDefined();
      expect(RESOLUTION_CONFIGS["1080p"]).toBeDefined();
    });

    it("should have valid dimensions for each resolution", () => {
      expect(RESOLUTION_CONFIGS["480p"].width).toBe(854);
      expect(RESOLUTION_CONFIGS["480p"].height).toBe(480);

      expect(RESOLUTION_CONFIGS["720p"].width).toBe(1280);
      expect(RESOLUTION_CONFIGS["720p"].height).toBe(720);

      expect(RESOLUTION_CONFIGS["1080p"].width).toBe(1920);
      expect(RESOLUTION_CONFIGS["1080p"].height).toBe(1080);
    });

    it("should have increasing bitrates", () => {
      expect(RESOLUTION_CONFIGS["480p"].bitrate).toBeLessThan(
        RESOLUTION_CONFIGS["720p"].bitrate
      );
      expect(RESOLUTION_CONFIGS["720p"].bitrate).toBeLessThan(
        RESOLUTION_CONFIGS["1080p"].bitrate
      );
    });

    it("should have valid frame rates", () => {
      Object.values(RESOLUTION_CONFIGS).forEach((config) => {
        expect(config.frameRate).toBeGreaterThanOrEqual(24);
        expect(config.frameRate).toBeLessThanOrEqual(60);
      });
    });
  });

  describe("PLATFORM_INFO", () => {
    it("should have all platform configurations", () => {
      const platforms: StreamPlatform[] = ["twitch", "tiktok", "kick", "custom"];
      platforms.forEach((platform) => {
        expect(PLATFORM_INFO[platform]).toBeDefined();
      });
    });

    it("should have required properties for each platform", () => {
      Object.entries(PLATFORM_INFO).forEach(([platform, info]) => {
        expect(info.name).toBeDefined();
        expect(info.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(info.icon).toBeDefined();
        expect(typeof info.supportsOAuth).toBe("boolean");
        expect(typeof info.requiresManualKey).toBe("boolean");
      });
    });

    it("should have valid RTMP URLs for streaming platforms", () => {
      expect(PLATFORM_INFO.twitch.rtmpUrl).toContain("twitch.tv");
      expect(PLATFORM_INFO.tiktok.rtmpUrl).toContain("tiktok.com");
      expect(PLATFORM_INFO.kick.rtmpUrl).toContain("live-video.net");
    });

    it("should mark OAuth platforms correctly", () => {
      expect(PLATFORM_INFO.twitch.supportsOAuth).toBe(true);
      expect(PLATFORM_INFO.tiktok.supportsOAuth).toBe(true);
      expect(PLATFORM_INFO.kick.supportsOAuth).toBe(false);
      expect(PLATFORM_INFO.custom.supportsOAuth).toBe(false);
    });

    it("should mark manual key platforms correctly", () => {
      expect(PLATFORM_INFO.twitch.requiresManualKey).toBe(false);
      expect(PLATFORM_INFO.tiktok.requiresManualKey).toBe(false);
      expect(PLATFORM_INFO.kick.requiresManualKey).toBe(true);
      expect(PLATFORM_INFO.custom.requiresManualKey).toBe(true);
    });
  });

  describe("Default Configurations", () => {
    it("should have valid default stream settings", () => {
      expect(DEFAULT_STREAM_SETTINGS.default_resolution).toBe("720p");
      expect(DEFAULT_STREAM_SETTINGS.camera_enabled).toBe(true);
      expect(DEFAULT_STREAM_SETTINGS.show_player_names).toBe(true);
      expect(DEFAULT_STREAM_SETTINGS.show_timer).toBe(true);
    });

    it("should have valid default audio config", () => {
      expect(DEFAULT_AUDIO_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AUDIO_CONFIG.bitrate).toBeGreaterThan(0);
      expect(DEFAULT_AUDIO_CONFIG.sampleRate).toBeGreaterThan(0);
      expect([1, 2]).toContain(DEFAULT_AUDIO_CONFIG.channels);
    });

    it("should have valid default camera config", () => {
      expect(DEFAULT_CAMERA_CONFIG.enabled).toBe(true);
      expect(["top-left", "top-right", "bottom-left", "bottom-right"]).toContain(
        DEFAULT_CAMERA_CONFIG.position
      );
      expect(["small", "medium", "large"]).toContain(DEFAULT_CAMERA_CONFIG.size);
    });

    it("should have valid default game info config", () => {
      expect(DEFAULT_GAME_INFO_CONFIG.showPlayerNames).toBe(true);
      expect(DEFAULT_GAME_INFO_CONFIG.showRatings).toBe(true);
      expect(DEFAULT_GAME_INFO_CONFIG.showTimer).toBe(true);
      expect(["top", "bottom", "side"]).toContain(DEFAULT_GAME_INFO_CONFIG.position);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Livestream Error Handling", () => {
  describe("createLivestreamError", () => {
    it("should create error with required fields", () => {
      const error = createLivestreamError(
        "STREAM_NOT_FOUND",
        "Stream not found"
      );

      expect(error.code).toBe("STREAM_NOT_FOUND");
      expect(error.message).toBe("Stream not found");
      expect(error.recoverable).toBe(false);
      expect(error.timestamp).toBeDefined();
    });

    it("should create recoverable error", () => {
      const error = createLivestreamError(
        "CONNECTION_FAILED",
        "Connection lost",
        true
      );

      expect(error.recoverable).toBe(true);
    });

    it("should include details when provided", () => {
      const details = { attemptCount: 3, lastError: "timeout" };
      const error = createLivestreamError(
        "RTMP_ERROR",
        "RTMP connection failed",
        true,
        details
      );

      expect(error.details).toEqual(details);
    });

    it("should have ISO timestamp format", () => {
      const error = createLivestreamError("UNKNOWN_ERROR", "Test error");
      const timestamp = new Date(error.timestamp);

      expect(timestamp.toISOString()).toBe(error.timestamp);
    });
  });

  describe("Error codes coverage", () => {
    const errorCodes: LivestreamErrorCode[] = [
      "STREAM_ALREADY_ACTIVE",
      "STREAM_NOT_FOUND",
      "PLATFORM_NOT_CONNECTED",
      "INVALID_STREAM_KEY",
      "CONNECTION_FAILED",
      "RTMP_ERROR",
      "CAMERA_PERMISSION_DENIED",
      "MICROPHONE_PERMISSION_DENIED",
      "INSUFFICIENT_BANDWIDTH",
      "PLATFORM_RATE_LIMITED",
      "OAUTH_FAILED",
      "TOKEN_EXPIRED",
      "UNKNOWN_ERROR",
    ];

    it("should support all error codes", () => {
      errorCodes.forEach((code) => {
        const error = createLivestreamError(code, `Error: ${code}`);
        expect(error.code).toBe(code);
      });
    });
  });
});

// ============================================================================
// Connection State Tests
// ============================================================================

describe("Stream Connection States", () => {
  const validStates: StreamConnectionState[] = [
    "idle",
    "initializing",
    "connecting",
    "connected",
    "streaming",
    "reconnecting",
    "paused",
    "stopping",
    "stopped",
    "error",
  ];

  it("should have all expected connection states", () => {
    expect(validStates).toHaveLength(10);
  });

  describe("State transitions", () => {
    it("should have logical state progression for successful stream", () => {
      const successPath: StreamConnectionState[] = [
        "idle",
        "initializing",
        "connecting",
        "connected",
        "streaming",
        "stopping",
        "stopped",
      ];

      // Verify all states are valid
      successPath.forEach((state) => {
        expect(validStates).toContain(state);
      });
    });

    it("should have logical state progression for failed stream", () => {
      const failPath: StreamConnectionState[] = [
        "idle",
        "initializing",
        "connecting",
        "error",
      ];

      failPath.forEach((state) => {
        expect(validStates).toContain(state);
      });
    });

    it("should have reconnection state", () => {
      expect(validStates).toContain("reconnecting");
    });
  });
});

// ============================================================================
// Resolution Configuration Tests
// ============================================================================

describe("Resolution Configurations", () => {
  describe("Aspect ratios", () => {
    it("should maintain 16:9 aspect ratio for all resolutions", () => {
      Object.entries(RESOLUTION_CONFIGS).forEach(([res, config]) => {
        const aspectRatio = config.width / config.height;
        // Allow small floating point tolerance
        expect(Math.abs(aspectRatio - 16 / 9)).toBeLessThan(0.01);
      });
    });
  });

  describe("Bitrate recommendations", () => {
    it("should have reasonable bitrates for each resolution", () => {
      // 480p should be 1-2 Mbps
      expect(RESOLUTION_CONFIGS["480p"].bitrate).toBeGreaterThanOrEqual(1000);
      expect(RESOLUTION_CONFIGS["480p"].bitrate).toBeLessThanOrEqual(2000);

      // 720p should be 2.5-4 Mbps
      expect(RESOLUTION_CONFIGS["720p"].bitrate).toBeGreaterThanOrEqual(2500);
      expect(RESOLUTION_CONFIGS["720p"].bitrate).toBeLessThanOrEqual(4000);

      // 1080p should be 4-8 Mbps
      expect(RESOLUTION_CONFIGS["1080p"].bitrate).toBeGreaterThanOrEqual(4000);
      expect(RESOLUTION_CONFIGS["1080p"].bitrate).toBeLessThanOrEqual(8000);
    });
  });

  describe("Labels", () => {
    it("should have human-readable labels", () => {
      expect(RESOLUTION_CONFIGS["480p"].label).toContain("480p");
      expect(RESOLUTION_CONFIGS["720p"].label).toContain("720p");
      expect(RESOLUTION_CONFIGS["1080p"].label).toContain("1080p");
    });

    it("should include bitrate in labels", () => {
      Object.values(RESOLUTION_CONFIGS).forEach((config) => {
        expect(config.label).toMatch(/Mbps/);
      });
    });
  });
});

// ============================================================================
// Platform-specific Tests
// ============================================================================

describe("Platform-specific Configurations", () => {
  describe("Twitch", () => {
    it("should have correct Twitch configuration", () => {
      const twitch = PLATFORM_INFO.twitch;
      expect(twitch.name).toBe("Twitch");
      expect(twitch.color).toBe("#9146FF");
      expect(twitch.rtmpUrl).toContain("live.twitch.tv");
      expect(twitch.supportsOAuth).toBe(true);
    });
  });

  describe("TikTok", () => {
    it("should have correct TikTok configuration", () => {
      const tiktok = PLATFORM_INFO.tiktok;
      expect(tiktok.name).toBe("TikTok");
      expect(tiktok.rtmpUrl).toContain("tiktok.com");
      expect(tiktok.supportsOAuth).toBe(true);
    });
  });

  describe("Kick", () => {
    it("should have correct Kick configuration", () => {
      const kick = PLATFORM_INFO.kick;
      expect(kick.name).toBe("Kick");
      expect(kick.color).toBe("#53FC18");
      expect(kick.requiresManualKey).toBe(true);
      expect(kick.supportsOAuth).toBe(false);
    });
  });

  describe("Custom RTMP", () => {
    it("should have correct custom RTMP configuration", () => {
      const custom = PLATFORM_INFO.custom;
      expect(custom.name).toBe("Custom RTMP");
      expect(custom.requiresManualKey).toBe(true);
      expect(custom.supportsOAuth).toBe(false);
      expect(custom.rtmpUrl).toBe("");
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("formatStreamDuration edge cases", () => {
    it("should handle very large durations", () => {
      // 24 hours
      expect(formatStreamDuration(86400)).toBe("24:00:00");
      // 100 hours
      expect(formatStreamDuration(360000)).toBe("100:00:00");
    });

    it("should handle negative values", () => {
      expect(formatStreamDuration(-1)).toBe("0:00");
      expect(formatStreamDuration(-100)).toBe("0:00");
    });
  });

  describe("formatViewerCount edge cases", () => {
    it("should handle very large viewer counts", () => {
      expect(formatViewerCount(100000000)).toBe("100.0M");
      expect(formatViewerCount(1000000000)).toBe("1000.0M");
    });

    it("should handle negative values", () => {
      expect(formatViewerCount(-1)).toBe("-1");
    });
  });

  describe("Stream key validation edge cases", () => {
    it("should handle unicode characters", () => {
      expect(isValidStreamKey("key_with_émoji")).toBe(false);
      expect(isValidStreamKey("ключ_для_стрима")).toBe(false);
    });

    it("should handle exactly 10 characters", () => {
      expect(isValidStreamKey("1234567890")).toBe(true);
      expect(isValidStreamKey("123456789")).toBe(false);
    });
  });
});
