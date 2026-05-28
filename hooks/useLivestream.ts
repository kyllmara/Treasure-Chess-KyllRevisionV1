/**
 * Livestream Hooks
 *
 * React hooks for livestream functionality including streaming control,
 * platform connections, and real-time updates.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLivestreamStore,
  useStreamState,
  useStreamPreferences,
  usePlatformConnections as usePlatformConnectionsStore,
  useStreamActions,
} from "@/stores/livestreamStore";
import * as LivestreamService from "@/lib/livestream";
import {
  createRTMPPublisher,
  isRTMPSupported,
  requestMediaPermissions,
  type RTMPPublisher,
  type RTMPConfig,
} from "@/lib/rtmp";
import type {
  StreamPlatform,
  StreamConfig,
  StreamSession,
  StreamConnectionState,
  StreamHealth,
  PlatformConnection,
  StartStreamResult,
  StopStreamResult,
  ConnectPlatformResult,
  LivestreamError,
  RESOLUTION_CONFIGS,
} from "@/types/livestream";

// ============================================================================
// useLivestream - Main Streaming Hook
// ============================================================================

export interface UseLivestreamOptions {
  gameId?: string;
  autoConnect?: boolean;
}

export interface UseLivestreamReturn {
  // State
  isStreaming: boolean;
  session: StreamSession | null;
  connectionState: StreamConnectionState;
  health: StreamHealth | null;
  viewerCount: number;
  error: string | null;
  isLoading: boolean;
  isSupported: boolean;

  // Actions
  startStream: (config?: Partial<StreamConfig>) => Promise<StartStreamResult>;
  stopStream: () => Promise<StopStreamResult>;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
  clearError: () => void;
}

export function useLivestream(options: UseLivestreamOptions = {}): UseLivestreamReturn {
  const { gameId } = options;
  const { user } = useAuth();
  const userId = user?.id;

  // Store state
  const streamState = useStreamState();
  const preferences = useStreamPreferences();
  const actions = useStreamActions();

  // Local state
  const [isSupported] = useState(() => isRTMPSupported());

  // Refs
  const publisherRef = useRef<RTMPPublisher | null>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // =========================================================================
  // RTMP Publisher Management
  // =========================================================================

  const initializePublisher = useCallback(() => {
    if (publisherRef.current) return;

    publisherRef.current = createRTMPPublisher({
      onConnectionStateChange: (state) => {
        actions.setConnectionState(state);
      },
      onHealthUpdate: (health) => {
        actions.setHealth(health as StreamHealth);
      },
      onError: (code, message) => {
        actions.setError(`${code}: ${message}`);
      },
    });
  }, [actions]);

  const destroyPublisher = useCallback(() => {
    if (publisherRef.current) {
      publisherRef.current.destroy();
      publisherRef.current = null;
    }
  }, []);

  // =========================================================================
  // Stream Actions
  // =========================================================================

  const startStream = useCallback(
    async (configOverrides?: Partial<StreamConfig>): Promise<StartStreamResult> => {
      if (!userId) {
        return {
          success: false,
          error: { code: "UNKNOWN_ERROR", message: "Not authenticated" },
        };
      }

      if (!isSupported) {
        return {
          success: false,
          error: { code: "UNKNOWN_ERROR", message: "Streaming not supported on this device" },
        };
      }

      actions.setIsLoading(true);
      actions.setError(null);

      try {
        // Build config from store + overrides
        const baseConfig = actions.buildStreamConfig();
        if (!baseConfig) {
          return {
            success: false,
            error: { code: "UNKNOWN_ERROR", message: "Invalid stream configuration" },
          };
        }

        const config: StreamConfig = {
          ...baseConfig,
          ...configOverrides,
        };

        // Validate stream key
        if (!config.streamKey) {
          return {
            success: false,
            error: { code: "INVALID_STREAM_KEY", message: "Stream key is required" },
          };
        }

        // Initialize RTMP publisher
        initializePublisher();
        if (!publisherRef.current) {
          return {
            success: false,
            error: { code: "UNKNOWN_ERROR", message: "Failed to initialize streaming" },
          };
        }

        // Initialize publisher with config
        const resolutionConfig = RESOLUTION_CONFIGS[config.resolution];
        const rtmpConfig: RTMPConfig = {
          rtmpUrl: config.rtmpUrl,
          streamKey: config.streamKey,
          resolution: config.resolution,
          videoBitrate: resolutionConfig.bitrate,
          audioBitrate: config.audio.bitrate,
          frameRate: resolutionConfig.frameRate,
          keyframeInterval: 2,
          enableCamera: config.camera.enabled,
          useFrontCamera: config.camera.useFrontCamera,
          enableMicrophone: config.audio.enabled,
        };

        await publisherRef.current.initialize(rtmpConfig);

        // Start capture
        await publisherRef.current.startCapture([
          { type: "view" }, // Chess board view
          ...(config.camera.enabled ? [{ type: "camera" as const, cameraFacing: config.camera.useFrontCamera ? "front" as const : "back" as const }] : []),
        ]);

        // Create session in database
        const result = await LivestreamService.startStream(userId, config, gameId);

        if (!result.success || !result.session) {
          destroyPublisher();
          return result;
        }

        // Start publishing
        await publisherRef.current.startPublishing();

        // Update database state
        await LivestreamService.updateStreamState(result.session.id, "streaming");

        // Store session
        actions.setStreamSession(result.session);

        // Subscribe to real-time updates
        subscriptionRef.current = LivestreamService.subscribeToStream(result.session.id, {
          onStateChange: actions.setConnectionState,
          onViewerCountChange: actions.setViewerCount,
          onHealthUpdate: actions.setHealth,
          onError: (error) => actions.setError(error.message),
        });

        return result;
      } catch (error) {
        destroyPublisher();
        const message = error instanceof Error ? error.message : "Failed to start stream";
        actions.setError(message);
        return {
          success: false,
          error: { code: "UNKNOWN_ERROR", message },
        };
      } finally {
        actions.setIsLoading(false);
      }
    },
    [userId, isSupported, gameId, actions, initializePublisher, destroyPublisher]
  );

  const stopStream = useCallback(async (): Promise<StopStreamResult> => {
    actions.setIsLoading(true);

    try {
      // Stop RTMP publisher
      if (publisherRef.current) {
        await publisherRef.current.stopPublishing();
        publisherRef.current.stopCapture();
        destroyPublisher();
      }

      // Unsubscribe from real-time updates
      if (subscriptionRef.current) {
        await LivestreamService.unsubscribeFromChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }

      // End session in database
      const session = streamState.session;
      if (session) {
        const result = await LivestreamService.stopStream(session.id);
        actions.resetStreamState();
        return result;
      }

      actions.resetStreamState();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to stop stream";
      return {
        success: false,
        error: { code: "UNKNOWN_ERROR", message },
      };
    } finally {
      actions.setIsLoading(false);
    }
  }, [streamState.session, actions, destroyPublisher]);

  const pauseStream = useCallback(async (): Promise<void> => {
    // Note: True pause requires RTMP library support
    // For now, just update the state
    if (streamState.session) {
      await LivestreamService.updateStreamState(streamState.session.id, "paused");
    }
  }, [streamState.session]);

  const resumeStream = useCallback(async (): Promise<void> => {
    if (streamState.session) {
      await LivestreamService.updateStreamState(streamState.session.id, "streaming");
    }
  }, [streamState.session]);

  const updateTitle = useCallback(
    async (title: string): Promise<void> => {
      if (!streamState.session || !userId) return;

      // Update platform title if connected
      const platform = streamState.session.platform;
      if (platform === "twitch") {
        await LivestreamService.setTwitchStreamInfo(userId, title);
      }

      // Update database
      // Note: Would need to add this to the service
    },
    [streamState.session, userId]
  );

  const clearError = useCallback(() => {
    actions.setError(null);
  }, [actions]);

  // =========================================================================
  // App State Handling
  // =========================================================================

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - stream continues but we pause updates
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App coming to foreground - resume updates
        if (streamState.session) {
          // Refresh session state
          const session = await LivestreamService.getStreamSession(streamState.session.id);
          if (session) {
            actions.setStreamSession(session);
          }
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [streamState.session, actions]);

  // =========================================================================
  // Cleanup
  // =========================================================================

  useEffect(() => {
    return () => {
      destroyPublisher();
      if (subscriptionRef.current) {
        LivestreamService.unsubscribeFromChannel(subscriptionRef.current);
      }
    };
  }, [destroyPublisher]);

  // =========================================================================
  // Return
  // =========================================================================

  return {
    isStreaming: streamState.isStreaming,
    session: streamState.session,
    connectionState: streamState.connectionState,
    health: streamState.health,
    viewerCount: streamState.viewerCount,
    error: streamState.error,
    isLoading: streamState.isLoading,
    isSupported,
    startStream,
    stopStream,
    pauseStream,
    resumeStream,
    updateTitle,
    clearError,
  };
}

// ============================================================================
// usePlatformConnections - Platform OAuth Management
// ============================================================================

export interface UsePlatformConnectionsReturn {
  connections: PlatformConnection[];
  isLoading: boolean;
  error: string | null;
  connectPlatform: (platform: StreamPlatform) => Promise<ConnectPlatformResult>;
  disconnectPlatform: (platform: StreamPlatform) => Promise<void>;
  refreshConnections: () => Promise<void>;
  isConnected: (platform: StreamPlatform) => boolean;
  getConnection: (platform: StreamPlatform) => PlatformConnection | undefined;
}

export function usePlatformConnections(): UsePlatformConnectionsReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const connections = usePlatformConnectionsStore();
  const store = useLivestreamStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch connections on mount
  useEffect(() => {
    if (userId) {
      refreshConnections();
    }
  }, [userId]);

  const refreshConnections = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const conns = await LivestreamService.getPlatformConnections(userId);
      store.setPlatformConnections(conns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connections");
    } finally {
      setIsLoading(false);
    }
  }, [userId, store]);

  const connectPlatform = useCallback(
    async (platform: StreamPlatform): Promise<ConnectPlatformResult> => {
      if (!userId) {
        return {
          success: false,
          error: { code: "UNKNOWN_ERROR", message: "Not authenticated" },
        };
      }

      setIsLoading(true);
      setError(null);

      try {
        // For platforms with OAuth (Twitch, TikTok), we need to initiate the OAuth flow
        // This would typically open a browser/WebView for the user to authorize
        //
        // For this implementation, we'll assume the OAuth code has already been obtained
        // In a real app, you would:
        // 1. Generate a state token
        // 2. Open the OAuth URL in a browser
        // 3. Handle the callback with the authorization code
        // 4. Exchange the code for tokens

        if (platform === "kick" || platform === "custom") {
          // These platforms don't support OAuth
          // User must manually enter stream key
          return {
            success: false,
            error: {
              code: "INVALID_STREAM_KEY",
              message: `${platform === "kick" ? "Kick" : "Custom RTMP"} requires manual stream key entry`,
            },
          };
        }

        // For OAuth platforms, return a "pending" state that indicates
        // the app should open the OAuth flow
        const state = generateOAuthState();

        if (platform === "twitch") {
          const authUrl = LivestreamService.getTwitchOAuthUrl(state);
          // In a real app, open this URL and handle the callback
          console.log("Open Twitch OAuth:", authUrl);
        } else if (platform === "tiktok") {
          const authUrl = LivestreamService.getTikTokOAuthUrl(state);
          // In a real app, open this URL and handle the callback
          console.log("Open TikTok OAuth:", authUrl);
        }

        // For demo purposes, simulate a successful connection
        // In production, this would be called after the OAuth callback
        const mockConnection: PlatformConnection = {
          platform,
          isConnected: true,
          username: `demo_${platform}_user`,
          channelId: `${platform}_${Date.now()}`,
          connectedAt: new Date().toISOString(),
        };

        store.addPlatformConnection(mockConnection);

        return {
          success: true,
          connection: mockConnection,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Connection failed";
        setError(message);
        return {
          success: false,
          error: { code: "OAUTH_FAILED", message },
        };
      } finally {
        setIsLoading(false);
      }
    },
    [userId, store]
  );

  const disconnectPlatform = useCallback(
    async (platform: StreamPlatform): Promise<void> => {
      if (!userId) return;

      setIsLoading(true);
      setError(null);

      try {
        await LivestreamService.disconnectPlatform(userId, platform);
        store.removePlatformConnection(platform);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Disconnect failed");
      } finally {
        setIsLoading(false);
      }
    },
    [userId, store]
  );

  const isConnected = useCallback(
    (platform: StreamPlatform): boolean => {
      return connections.some((c) => c.platform === platform && c.isConnected);
    },
    [connections]
  );

  const getConnection = useCallback(
    (platform: StreamPlatform): PlatformConnection | undefined => {
      return connections.find((c) => c.platform === platform);
    },
    [connections]
  );

  return {
    connections,
    isLoading,
    error,
    connectPlatform,
    disconnectPlatform,
    refreshConnections,
    isConnected,
    getConnection,
  };
}

// ============================================================================
// useStreamSettings - Stream Configuration
// ============================================================================

export interface UseStreamSettingsReturn {
  resolution: StreamConfig["resolution"];
  setResolution: (resolution: StreamConfig["resolution"]) => void;
  cameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => void;
  cameraPosition: StreamConfig["camera"]["position"];
  setCameraPosition: (position: StreamConfig["camera"]["position"]) => void;
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  showPlayerNames: boolean;
  setShowPlayerNames: (show: boolean) => void;
  showTimer: boolean;
  setShowTimer: (show: boolean) => void;
  showStakes: boolean;
  setShowStakes: (show: boolean) => void;
}

export function useStreamSettings(): UseStreamSettingsReturn {
  const store = useLivestreamStore();
  const preferences = useStreamPreferences();

  return {
    resolution: preferences.defaultResolution,
    setResolution: (resolution) => store.setPreferences({ defaultResolution: resolution }),

    cameraEnabled: preferences.camera.enabled,
    setCameraEnabled: (enabled) => store.setCameraConfig({ enabled }),

    cameraPosition: preferences.camera.position,
    setCameraPosition: (position) => store.setCameraConfig({ position }),

    audioEnabled: preferences.audio.enabled,
    setAudioEnabled: (enabled) => store.setAudioConfig({ enabled }),

    showPlayerNames: preferences.gameInfo.showPlayerNames,
    setShowPlayerNames: (show) => store.setGameInfoConfig({ showPlayerNames: show }),

    showTimer: preferences.gameInfo.showTimer,
    setShowTimer: (show) => store.setGameInfoConfig({ showTimer: show }),

    showStakes: preferences.gameInfo.showStakes,
    setShowStakes: (show) => store.setGameInfoConfig({ showStakes: show }),
  };
}

// ============================================================================
// useLiveStreams - Browse Live Streams
// ============================================================================

export interface LiveStreamEntry {
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
}

export interface UseLiveStreamsReturn {
  streams: LiveStreamEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLiveStreams(platform?: StreamPlatform): UseLiveStreamsReturn {
  const [streams, setStreams] = useState<LiveStreamEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscriptionRef = useRef<RealtimeChannel | null>(null);

  const fetchStreams = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await LivestreamService.getLiveStreams(platform, 50);
      setStreams(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load streams");
    } finally {
      setIsLoading(false);
    }
  }, [platform]);

  // Initial fetch
  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  // Real-time updates
  useEffect(() => {
    subscriptionRef.current = LivestreamService.subscribeToLiveStreams(async () => {
      // Refresh when any stream changes
      await fetchStreams();
    });

    return () => {
      if (subscriptionRef.current) {
        LivestreamService.unsubscribeFromChannel(subscriptionRef.current);
      }
    };
  }, [fetchStreams]);

  return {
    streams,
    isLoading,
    error,
    refresh: fetchStreams,
  };
}

// ============================================================================
// useStreamStatistics - User's Streaming Stats
// ============================================================================

export interface UseStreamStatisticsReturn {
  totalStreams: number;
  totalDurationSeconds: number;
  totalViewers: number;
  averageViewers: number;
  peakViewers: number;
  lastStreamAt: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStreamStatistics(): UseStreamStatisticsReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [stats, setStats] = useState({
    totalStreams: 0,
    totalDurationSeconds: 0,
    totalViewers: 0,
    averageViewers: 0,
    peakViewers: 0,
    lastStreamAt: null as string | null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await LivestreamService.getStreamStatistics(userId);
      if (data) {
        setStats(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load statistics");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    ...stats,
    isLoading,
    error,
    refresh: fetchStats,
  };
}

// ============================================================================
// useViewerCount - Real-time Viewer Count
// ============================================================================

export function useViewerCount(sessionId?: string): {
  viewerCount: number;
  isSubscribed: boolean;
} {
  const [viewerCount, setViewerCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setViewerCount(0);
      setIsSubscribed(false);
      return;
    }

    // Subscribe to viewer count updates
    subscriptionRef.current = LivestreamService.subscribeToStream(sessionId, {
      onViewerCountChange: setViewerCount,
    });

    setIsSubscribed(true);

    return () => {
      if (subscriptionRef.current) {
        LivestreamService.unsubscribeFromChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [sessionId]);

  return { viewerCount, isSubscribed };
}

// ============================================================================
// useMediaPermissions - Camera/Microphone Permission Check
// ============================================================================

export interface UseMediaPermissionsReturn {
  hasCameraPermission: boolean | null;
  hasMicrophonePermission: boolean | null;
  isChecking: boolean;
  requestPermissions: () => Promise<{ camera: boolean; microphone: boolean }>;
}

export function useMediaPermissions(): UseMediaPermissionsReturn {
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const checkPermissions = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await requestMediaPermissions();
      setHasCameraPermission(result.camera);
      setHasMicrophonePermission(result.microphone);
      return result;
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Check on mount
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  return {
    hasCameraPermission,
    hasMicrophonePermission,
    isChecking,
    requestPermissions: checkPermissions,
  };
}

// ============================================================================
// Utilities
// ============================================================================

function generateOAuthState(): string {
  const array = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 32; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Exports
// ============================================================================

export {
  type UseLivestreamOptions,
  type UseLivestreamReturn,
  type UsePlatformConnectionsReturn,
  type UseStreamSettingsReturn,
  type LiveStreamEntry,
  type UseLiveStreamsReturn,
  type UseStreamStatisticsReturn,
  type UseMediaPermissionsReturn,
};
