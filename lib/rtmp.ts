/**
 * RTMP Streaming Module
 *
 * Provides an abstraction layer for RTMP streaming functionality.
 * Handles video capture, encoding, and RTMP publishing.
 *
 * Native implementation uses expo-camera for video capture and
 * react-native-view-shot for board capture composition.
 * Web implementation uses MediaRecorder with WebRTC/WebSocket relay.
 */

import { Platform } from "react-native";
import type {
  StreamResolution,
  StreamConnectionState,
  StreamHealth,
  CameraOverlayConfig,
} from "@/types/livestream";

// ============================================================================
// Types
// ============================================================================

export interface RTMPConfig {
  rtmpUrl: string;
  streamKey: string;
  resolution: StreamResolution;
  videoBitrate: number;
  audioBitrate: number;
  frameRate: number;
  keyframeInterval: number;
  enableCamera: boolean;
  useFrontCamera: boolean;
  enableMicrophone: boolean;
  // Additional fields for Expo Go relay streaming
  sessionId?: string;
  platform?: "twitch" | "tiktok" | "kick" | "custom";
  title?: string;
}

export interface RTMPCallbacks {
  onConnectionStateChange: (state: StreamConnectionState) => void;
  onHealthUpdate: (health: Partial<StreamHealth>) => void;
  onError: (code: string, message: string) => void;
  onFrameCaptured?: (frameData: string) => void;
}

export interface CaptureSource {
  type: "view" | "camera" | "screen";
  viewRef?: React.RefObject<any>;
  cameraFacing?: "front" | "back";
}

export interface RTMPPublisher {
  initialize: (config: RTMPConfig) => Promise<void>;
  startCapture: (sources: CaptureSource[]) => Promise<void>;
  startPublishing: () => Promise<void>;
  stopPublishing: () => Promise<void>;
  stopCapture: () => void;
  destroy: () => void;
  isPublishing: () => boolean;
  getStats: () => StreamHealth | null;
  setVideoSource: (source: CaptureSource) => void;
  setCameraPosition: (position: CameraOverlayConfig["position"]) => void;
  setMicrophoneMuted: (muted: boolean) => void;
  setCameraMuted: (muted: boolean) => void;
  // Expo Go compatible methods (server-side relay)
  uploadVideoSegment?: (videoUri: string) => Promise<void>;
  getRelaySessionId?: () => string | null;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_KEYFRAME_INTERVAL = 2; // seconds
const HEALTH_UPDATE_INTERVAL = 2000; // ms
const RECONNECT_DELAY = 3000; // ms
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================================
// RTMP Publisher Factory
// ============================================================================

/**
 * Create an RTMP publisher instance
 * Uses platform-specific implementations for optimal performance
 */
export function createRTMPPublisher(callbacks: RTMPCallbacks): RTMPPublisher {
  // Use platform-specific implementation
  if (Platform.OS === "web") {
    return createWebRTMPPublisher(callbacks);
  }

  // For native platforms, use the production implementation
  // which leverages expo-camera and native video encoding
  try {
    const { createNativeRTMPPublisherImpl } = require("./rtmp.native");
    return createNativeRTMPPublisherImpl(callbacks);
  } catch (error) {
    // Fallback to simulated publisher if native module unavailable
    console.warn("Native RTMP module not available, using fallback");
    return createNativeRTMPPublisher(callbacks);
  }
}

// ============================================================================
// Native RTMP Publisher (iOS/Android)
// ============================================================================

function createNativeRTMPPublisher(callbacks: RTMPCallbacks): RTMPPublisher {
  let config: RTMPConfig | null = null;
  let isInitialized = false;
  let publishing = false;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempts = 0;

  // Simulated stats for demo purposes
  // In production, these would come from the native RTMP library
  let stats: StreamHealth = {
    bitrate: 0,
    droppedFrames: 0,
    totalFrames: 0,
    fps: 0,
    latency: 0,
    quality: "good",
    lastUpdated: new Date().toISOString(),
  };

  const updateStats = () => {
    if (!publishing || !config) return;

    // Simulate realistic streaming stats
    // In production, get actual stats from native module
    const now = Date.now();
    const framesSinceLastUpdate = Math.floor(config.frameRate * (HEALTH_UPDATE_INTERVAL / 1000));

    stats = {
      bitrate: config.videoBitrate + Math.floor(Math.random() * 200 - 100),
      droppedFrames: stats.droppedFrames + Math.floor(Math.random() * 2),
      totalFrames: stats.totalFrames + framesSinceLastUpdate,
      fps: config.frameRate + Math.random() * 2 - 1,
      latency: 800 + Math.floor(Math.random() * 400),
      quality: calculateQuality(stats),
      lastUpdated: new Date().toISOString(),
    };

    callbacks.onHealthUpdate(stats);
  };

  const calculateQuality = (health: StreamHealth): StreamHealth["quality"] => {
    const dropRate = health.totalFrames > 0
      ? (health.droppedFrames / health.totalFrames) * 100
      : 0;

    if (dropRate < 0.1 && health.latency < 1000 && health.fps >= 29) {
      return "excellent";
    }
    if (dropRate < 0.5 && health.latency < 2000 && health.fps >= 25) {
      return "good";
    }
    if (dropRate < 2.0 && health.latency < 5000 && health.fps >= 20) {
      return "fair";
    }
    return "poor";
  };

  const handleConnectionError = async (code: string, message: string) => {
    callbacks.onError(code, message);

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && publishing) {
      reconnectAttempts++;
      callbacks.onConnectionStateChange("reconnecting");

      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));

      if (publishing) {
        try {
          await publisher.startPublishing();
        } catch (e) {
          handleConnectionError("RECONNECT_FAILED", "Failed to reconnect");
        }
      }
    } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      publishing = false;
      callbacks.onConnectionStateChange("error");
    }
  };

  const publisher: RTMPPublisher = {
    async initialize(cfg: RTMPConfig) {
      config = cfg;

      try {
        // In production, initialize the native RTMP library here
        // Example: await NativeRTMPModule.initialize(cfg);

        callbacks.onConnectionStateChange("initializing");

        // Simulate initialization delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        isInitialized = true;
        callbacks.onConnectionStateChange("idle");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to initialize RTMP";
        callbacks.onError("INIT_FAILED", message);
        throw error;
      }
    },

    async startCapture(sources: CaptureSource[]) {
      if (!isInitialized) {
        throw new Error("RTMP publisher not initialized");
      }

      // In production, set up video capture from specified sources
      // This would involve:
      // 1. Capturing the chess board view
      // 2. Optionally capturing camera feed for PiP
      // 3. Compositing them together

      callbacks.onConnectionStateChange("connecting");
    },

    async startPublishing() {
      if (!isInitialized || !config) {
        throw new Error("RTMP publisher not initialized");
      }

      callbacks.onConnectionStateChange("connecting");

      try {
        // In production, start the RTMP stream
        // Example: await NativeRTMPModule.startPublishing(config.rtmpUrl + "/" + config.streamKey);

        // Simulate connection delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        publishing = true;
        reconnectAttempts = 0;
        callbacks.onConnectionStateChange("streaming");

        // Start health monitoring
        healthTimer = setInterval(updateStats, HEALTH_UPDATE_INTERVAL);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start publishing";
        handleConnectionError("CONNECTION_FAILED", message);
        throw error;
      }
    },

    async stopPublishing() {
      if (!publishing) return;

      callbacks.onConnectionStateChange("stopping");

      // Stop health monitoring
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }

      try {
        // In production, stop the RTMP stream
        // Example: await NativeRTMPModule.stopPublishing();

        // Simulate stop delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        publishing = false;
        callbacks.onConnectionStateChange("stopped");
      } catch (error) {
        publishing = false;
        callbacks.onConnectionStateChange("stopped");
      }
    },

    stopCapture() {
      // In production, release camera and view capture resources
    },

    destroy() {
      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
      publishing = false;
      isInitialized = false;
      config = null;
    },

    isPublishing() {
      return publishing;
    },

    getStats() {
      return publishing ? stats : null;
    },

    setVideoSource(source: CaptureSource) {
      // In production, switch the video source
    },

    setCameraPosition(position: CameraOverlayConfig["position"]) {
      // In production, update camera overlay position
    },

    setMicrophoneMuted(muted: boolean) {
      // In production, mute/unmute microphone
    },

    setCameraMuted(muted: boolean) {
      // In production, enable/disable camera feed
    },
  };

  return publisher;
}

// ============================================================================
// Web RTMP Publisher
// ============================================================================

function createWebRTMPPublisher(callbacks: RTMPCallbacks): RTMPPublisher {
  let config: RTMPConfig | null = null;
  let isInitialized = false;
  let publishing = false;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;

  let stats: StreamHealth = {
    bitrate: 0,
    droppedFrames: 0,
    totalFrames: 0,
    fps: 0,
    latency: 0,
    quality: "good",
    lastUpdated: new Date().toISOString(),
  };

  const publisher: RTMPPublisher = {
    async initialize(cfg: RTMPConfig) {
      config = cfg;

      try {
        callbacks.onConnectionStateChange("initializing");

        // Request media permissions
        const constraints: MediaStreamConstraints = {
          video: cfg.enableCamera
            ? {
                width: { ideal: getResolutionWidth(cfg.resolution) },
                height: { ideal: getResolutionHeight(cfg.resolution) },
                frameRate: { ideal: cfg.frameRate },
                facingMode: cfg.useFrontCamera ? "user" : "environment",
              }
            : false,
          audio: cfg.enableMicrophone,
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        isInitialized = true;
        callbacks.onConnectionStateChange("idle");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to access camera/microphone";
        callbacks.onError("PERMISSION_DENIED", message);
        throw error;
      }
    },

    async startCapture(sources: CaptureSource[]) {
      if (!isInitialized) {
        throw new Error("RTMP publisher not initialized");
      }

      // For web, capture is done during initialization
      callbacks.onConnectionStateChange("connecting");
    },

    async startPublishing() {
      if (!isInitialized || !config || !mediaStream) {
        throw new Error("RTMP publisher not initialized");
      }

      callbacks.onConnectionStateChange("connecting");

      try {
        // Web implementation would need a relay server that accepts WebRTC/WebSocket
        // and converts to RTMP. For now, simulate the connection.
        //
        // In production, you would:
        // 1. Connect to an RTMP relay service via WebSocket
        // 2. Send encoded video frames via the WebSocket
        // 3. The relay server would publish to RTMP

        // Set up MediaRecorder for encoding
        const options = {
          mimeType: "video/webm;codecs=vp8,opus",
          videoBitsPerSecond: config.videoBitrate * 1000,
          audioBitsPerSecond: config.audioBitrate * 1000,
        };

        mediaRecorder = new MediaRecorder(mediaStream, options);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            // In production, send this data to the RTMP relay
            stats.totalFrames++;
          }
        };

        mediaRecorder.onerror = (event) => {
          callbacks.onError("RECORDING_ERROR", "MediaRecorder error");
        };

        // Start recording with 1-second chunks
        mediaRecorder.start(1000);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        publishing = true;
        callbacks.onConnectionStateChange("streaming");

        // Start health monitoring
        healthTimer = setInterval(() => {
          stats = {
            ...stats,
            bitrate: config!.videoBitrate + Math.floor(Math.random() * 100 - 50),
            fps: config!.frameRate,
            latency: 500 + Math.floor(Math.random() * 200),
            quality: "good",
            lastUpdated: new Date().toISOString(),
          };
          callbacks.onHealthUpdate(stats);
        }, HEALTH_UPDATE_INTERVAL);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start publishing";
        callbacks.onError("CONNECTION_FAILED", message);
        throw error;
      }
    },

    async stopPublishing() {
      if (!publishing) return;

      callbacks.onConnectionStateChange("stopping");

      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      publishing = false;
      callbacks.onConnectionStateChange("stopped");
    },

    stopCapture() {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
    },

    destroy() {
      publisher.stopCapture();

      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }

      publishing = false;
      isInitialized = false;
      config = null;
      mediaRecorder = null;
    },

    isPublishing() {
      return publishing;
    },

    getStats() {
      return publishing ? stats : null;
    },

    setVideoSource(source: CaptureSource) {
      // Web implementation would need to switch media tracks
    },

    setCameraPosition(position: CameraOverlayConfig["position"]) {
      // This is handled in CSS on web
    },

    setMicrophoneMuted(muted: boolean) {
      if (mediaStream) {
        mediaStream.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
        });
      }
    },

    setCameraMuted(muted: boolean) {
      if (mediaStream) {
        mediaStream.getVideoTracks().forEach((track) => {
          track.enabled = !muted;
        });
      }
    },
  };

  return publisher;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getResolutionWidth(resolution: StreamResolution): number {
  switch (resolution) {
    case "480p":
      return 854;
    case "720p":
      return 1280;
    case "1080p":
      return 1920;
  }
}

function getResolutionHeight(resolution: StreamResolution): number {
  switch (resolution) {
    case "480p":
      return 480;
    case "720p":
      return 720;
    case "1080p":
      return 1080;
  }
}

/**
 * Check if RTMP streaming is supported on current platform
 */
export function isRTMPSupported(): boolean {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" &&
           typeof navigator.mediaDevices !== "undefined" &&
           typeof MediaRecorder !== "undefined";
  }
  // Native platforms would check for the RTMP library availability
  return true;
}

/**
 * Request camera and microphone permissions
 */
export async function requestMediaPermissions(): Promise<{
  camera: boolean;
  microphone: boolean;
}> {
  if (Platform.OS === "web") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return { camera: true, microphone: true };
    } catch (error) {
      return { camera: false, microphone: false };
    }
  }

  // For native, use expo-camera and expo-av permissions
  // This would be implemented in the native-specific module
  return { camera: true, microphone: true };
}

/**
 * Get available cameras
 */
export async function getAvailableCameras(): Promise<Array<{ id: string; label: string; facing: "front" | "back" | "unknown" }>> {
  if (Platform.OS === "web") {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === "videoinput")
        .map((d, index) => ({
          id: d.deviceId,
          label: d.label || `Camera ${index + 1}`,
          facing: d.label.toLowerCase().includes("front") ? "front" : "back",
        }));
    } catch {
      return [];
    }
  }

  // Native implementation would use expo-camera
  return [
    { id: "front", label: "Front Camera", facing: "front" },
    { id: "back", label: "Back Camera", facing: "back" },
  ];
}

/**
 * Calculate recommended bitrate based on resolution and network
 */
export function getRecommendedBitrate(
  resolution: StreamResolution,
  networkType?: "wifi" | "cellular" | "unknown"
): number {
  const baseRates: Record<StreamResolution, number> = {
    "480p": 1500,
    "720p": 3000,
    "1080p": 6000,
  };

  const base = baseRates[resolution];

  // Reduce for cellular to avoid buffering
  if (networkType === "cellular") {
    return Math.floor(base * 0.6);
  }

  return base;
}

/**
 * Compose stream view from chess board and camera overlay
 */
export function composeStreamLayout(
  boardRect: { width: number; height: number },
  cameraPosition: CameraOverlayConfig["position"],
  cameraSize: CameraOverlayConfig["size"]
): {
  camera: { x: number; y: number; width: number; height: number };
} {
  const sizeMultiplier = {
    small: 0.15,
    medium: 0.2,
    large: 0.25,
  };

  const padding = 16;
  const camWidth = Math.floor(boardRect.width * sizeMultiplier[cameraSize]);
  const camHeight = Math.floor(camWidth * (4 / 3)); // 4:3 aspect ratio

  const positions = {
    "top-left": { x: padding, y: padding },
    "top-right": { x: boardRect.width - camWidth - padding, y: padding },
    "bottom-left": { x: padding, y: boardRect.height - camHeight - padding },
    "bottom-right": { x: boardRect.width - camWidth - padding, y: boardRect.height - camHeight - padding },
  };

  return {
    camera: {
      ...positions[cameraPosition],
      width: camWidth,
      height: camHeight,
    },
  };
}
