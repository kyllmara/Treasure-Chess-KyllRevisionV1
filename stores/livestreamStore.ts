/**
 * Livestream Store
 *
 * Centralized state management for livestream functionality.
 * Handles stream configuration, session state, and platform connections.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  StreamPlatform,
  StreamResolution,
  StreamConnectionState,
  StreamSession,
  StreamHealth,
  StreamConfig,
  PlatformConnection,
  CameraPosition,
  CameraOverlayConfig,
  GameInfoOverlayConfig,
  AudioConfig,
} from "@/types/livestream";
import {
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_GAME_INFO_CONFIG,
  RESOLUTION_CONFIGS,
  PLATFORM_INFO,
} from "@/types/livestream";

// ============================================================================
// Types
// ============================================================================

export interface StreamPreferences {
  /** Default streaming platform */
  defaultPlatform: StreamPlatform | null;
  /** Default video resolution */
  defaultResolution: StreamResolution;
  /** Saved stream keys (encrypted in production) */
  savedStreamKeys: Partial<Record<StreamPlatform, string>>;
  /** Audio configuration */
  audio: AudioConfig;
  /** Camera overlay configuration */
  camera: CameraOverlayConfig;
  /** Game info overlay configuration */
  gameInfo: GameInfoOverlayConfig;
  /** Auto-start recording */
  autoRecord: boolean;
  /** Default stream title template */
  defaultTitleTemplate: string;
}

export interface LivestreamState {
  // =========================================================================
  // Stream State
  // =========================================================================

  /** Whether currently streaming */
  isStreaming: boolean;
  /** Current stream session */
  currentSession: StreamSession | null;
  /** Current connection state */
  connectionState: StreamConnectionState;
  /** Current stream health */
  health: StreamHealth | null;
  /** Current viewer count */
  viewerCount: number;
  /** Stream error message */
  error: string | null;
  /** Whether stream is loading */
  isLoading: boolean;

  // =========================================================================
  // Configuration
  // =========================================================================

  /** User's stream preferences */
  preferences: StreamPreferences;
  /** Platform connections */
  platformConnections: PlatformConnection[];
  /** Currently selected platform for setup */
  selectedPlatform: StreamPlatform | null;
  /** Current stream configuration being edited */
  pendingConfig: Partial<StreamConfig> | null;

  // =========================================================================
  // UI State
  // =========================================================================

  /** Whether settings modal is visible */
  isSettingsModalVisible: boolean;
  /** Whether platform picker is visible */
  isPlatformPickerVisible: boolean;
  /** Whether stream is being prepared */
  isPreparing: boolean;
  /** Preview mode enabled */
  isPreviewMode: boolean;
  /** Camera muted */
  isCameraMuted: boolean;
  /** Microphone muted */
  isMicrophoneMuted: boolean;

  // =========================================================================
  // Actions
  // =========================================================================

  // Stream Actions
  setStreamSession: (session: StreamSession | null) => void;
  setConnectionState: (state: StreamConnectionState) => void;
  setHealth: (health: StreamHealth | null) => void;
  setViewerCount: (count: number) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;

  // Configuration Actions
  setPreferences: (prefs: Partial<StreamPreferences>) => void;
  setAudioConfig: (config: Partial<AudioConfig>) => void;
  setCameraConfig: (config: Partial<CameraOverlayConfig>) => void;
  setGameInfoConfig: (config: Partial<GameInfoOverlayConfig>) => void;
  setSelectedPlatform: (platform: StreamPlatform | null) => void;
  setPendingConfig: (config: Partial<StreamConfig> | null) => void;
  saveStreamKey: (platform: StreamPlatform, key: string) => void;
  clearStreamKey: (platform: StreamPlatform) => void;

  // Platform Connection Actions
  setPlatformConnections: (connections: PlatformConnection[]) => void;
  addPlatformConnection: (connection: PlatformConnection) => void;
  removePlatformConnection: (platform: StreamPlatform) => void;
  updatePlatformConnection: (platform: StreamPlatform, updates: Partial<PlatformConnection>) => void;

  // UI Actions
  setSettingsModalVisible: (visible: boolean) => void;
  setPlatformPickerVisible: (visible: boolean) => void;
  setIsPreparing: (preparing: boolean) => void;
  setIsPreviewMode: (preview: boolean) => void;
  toggleCameraMuted: () => void;
  toggleMicrophoneMuted: () => void;

  // Utility Actions
  resetStreamState: () => void;
  resetToDefaults: () => void;
  buildStreamConfig: () => StreamConfig | null;
}

// ============================================================================
// Default Values
// ============================================================================

const defaultPreferences: StreamPreferences = {
  defaultPlatform: null,
  defaultResolution: "720p",
  savedStreamKeys: {},
  audio: DEFAULT_AUDIO_CONFIG,
  camera: DEFAULT_CAMERA_CONFIG,
  gameInfo: DEFAULT_GAME_INFO_CONFIG,
  autoRecord: false,
  defaultTitleTemplate: "Playing Chess on Treasure Chess! 🎮♟️",
};

const initialStreamState = {
  isStreaming: false,
  currentSession: null,
  connectionState: "idle" as StreamConnectionState,
  health: null,
  viewerCount: 0,
  error: null,
  isLoading: false,
};

const initialUIState = {
  isSettingsModalVisible: false,
  isPlatformPickerVisible: false,
  isPreparing: false,
  isPreviewMode: false,
  isCameraMuted: false,
  isMicrophoneMuted: false,
};

// ============================================================================
// Store
// ============================================================================

export const useLivestreamStore = create<LivestreamState>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialStreamState,
      preferences: defaultPreferences,
      platformConnections: [],
      selectedPlatform: null,
      pendingConfig: null,
      ...initialUIState,

      // =========================================================================
      // Stream Actions
      // =========================================================================

      setStreamSession: (session) => {
        set({
          currentSession: session,
          isStreaming: session !== null && session.connectionState === "streaming",
        });
      },

      setConnectionState: (connectionState) => {
        set({
          connectionState,
          isStreaming: connectionState === "streaming",
        });
      },

      setHealth: (health) => set({ health }),

      setViewerCount: (viewerCount) => set({ viewerCount }),

      setError: (error) => set({ error }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setIsStreaming: (isStreaming) => set({ isStreaming }),

      // =========================================================================
      // Configuration Actions
      // =========================================================================

      setPreferences: (prefs) => {
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        }));
      },

      setAudioConfig: (config) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            audio: { ...state.preferences.audio, ...config },
          },
        }));
      },

      setCameraConfig: (config) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            camera: { ...state.preferences.camera, ...config },
          },
        }));
      },

      setGameInfoConfig: (config) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            gameInfo: { ...state.preferences.gameInfo, ...config },
          },
        }));
      },

      setSelectedPlatform: (selectedPlatform) => set({ selectedPlatform }),

      setPendingConfig: (pendingConfig) => set({ pendingConfig }),

      saveStreamKey: (platform, key) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            savedStreamKeys: {
              ...state.preferences.savedStreamKeys,
              [platform]: key,
            },
          },
        }));
      },

      clearStreamKey: (platform) => {
        set((state) => {
          const { [platform]: _, ...rest } = state.preferences.savedStreamKeys;
          return {
            preferences: {
              ...state.preferences,
              savedStreamKeys: rest,
            },
          };
        });
      },

      // =========================================================================
      // Platform Connection Actions
      // =========================================================================

      setPlatformConnections: (platformConnections) => set({ platformConnections }),

      addPlatformConnection: (connection) => {
        set((state) => {
          // Remove existing connection for this platform
          const filtered = state.platformConnections.filter(
            (c) => c.platform !== connection.platform
          );
          return {
            platformConnections: [...filtered, connection],
          };
        });
      },

      removePlatformConnection: (platform) => {
        set((state) => ({
          platformConnections: state.platformConnections.filter(
            (c) => c.platform !== platform
          ),
        }));
      },

      updatePlatformConnection: (platform, updates) => {
        set((state) => ({
          platformConnections: state.platformConnections.map((c) =>
            c.platform === platform ? { ...c, ...updates } : c
          ),
        }));
      },

      // =========================================================================
      // UI Actions
      // =========================================================================

      setSettingsModalVisible: (isSettingsModalVisible) => set({ isSettingsModalVisible }),

      setPlatformPickerVisible: (isPlatformPickerVisible) => set({ isPlatformPickerVisible }),

      setIsPreparing: (isPreparing) => set({ isPreparing }),

      setIsPreviewMode: (isPreviewMode) => set({ isPreviewMode }),

      toggleCameraMuted: () => {
        set((state) => ({ isCameraMuted: !state.isCameraMuted }));
      },

      toggleMicrophoneMuted: () => {
        set((state) => ({ isMicrophoneMuted: !state.isMicrophoneMuted }));
      },

      // =========================================================================
      // Utility Actions
      // =========================================================================

      resetStreamState: () => {
        set({
          ...initialStreamState,
          ...initialUIState,
          pendingConfig: null,
        });
      },

      resetToDefaults: () => {
        set({
          ...initialStreamState,
          preferences: defaultPreferences,
          ...initialUIState,
          selectedPlatform: null,
          pendingConfig: null,
        });
      },

      buildStreamConfig: () => {
        const state = get();
        const { preferences, selectedPlatform, pendingConfig } = state;

        const platform = pendingConfig?.platform || selectedPlatform || preferences.defaultPlatform;
        if (!platform) return null;

        const platformInfo = PLATFORM_INFO[platform];
        const resolution = pendingConfig?.resolution || preferences.defaultResolution;
        const resolutionConfig = RESOLUTION_CONFIGS[resolution];

        // Get stream key
        let streamKey = pendingConfig?.streamKey || "";
        if (!streamKey && preferences.savedStreamKeys[platform]) {
          streamKey = preferences.savedStreamKeys[platform]!;
        }

        // Build RTMP URL
        let rtmpUrl = pendingConfig?.rtmpUrl || platformInfo.rtmpUrl;
        if (platform === "custom" && preferences.savedStreamKeys.custom) {
          // For custom, the "saved key" might include the full URL
        }

        return {
          platform,
          streamKey,
          rtmpUrl,
          resolution,
          audio: { ...preferences.audio, ...pendingConfig?.audio },
          camera: { ...preferences.camera, ...pendingConfig?.camera },
          gameInfo: { ...preferences.gameInfo, ...pendingConfig?.gameInfo },
          title: pendingConfig?.title || preferences.defaultTitleTemplate,
          description: pendingConfig?.description,
          tags: pendingConfig?.tags || ["chess", "treasure-chess", "gaming"],
        };
      },
    }),
    {
      name: "treasure-chess-livestream",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferences: {
          ...state.preferences,
          // Don't persist stream keys in plain text in production
          // This is just for demo - use SecureStore in production
          savedStreamKeys: state.preferences.savedStreamKeys,
        },
        platformConnections: state.platformConnections.map((c) => ({
          ...c,
          // Don't persist tokens
          accessToken: undefined,
          refreshToken: undefined,
        })),
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectIsStreaming = (state: LivestreamState) => state.isStreaming;
export const selectCurrentSession = (state: LivestreamState) => state.currentSession;
export const selectConnectionState = (state: LivestreamState) => state.connectionState;
export const selectHealth = (state: LivestreamState) => state.health;
export const selectViewerCount = (state: LivestreamState) => state.viewerCount;
export const selectError = (state: LivestreamState) => state.error;
export const selectIsLoading = (state: LivestreamState) => state.isLoading;

export const selectPreferences = (state: LivestreamState) => state.preferences;
export const selectAudioConfig = (state: LivestreamState) => state.preferences.audio;
export const selectCameraConfig = (state: LivestreamState) => state.preferences.camera;
export const selectGameInfoConfig = (state: LivestreamState) => state.preferences.gameInfo;
export const selectDefaultResolution = (state: LivestreamState) => state.preferences.defaultResolution;

export const selectPlatformConnections = (state: LivestreamState) => state.platformConnections;
export const selectSelectedPlatform = (state: LivestreamState) => state.selectedPlatform;
export const selectPendingConfig = (state: LivestreamState) => state.pendingConfig;

export const selectIsCameraMuted = (state: LivestreamState) => state.isCameraMuted;
export const selectIsMicrophoneMuted = (state: LivestreamState) => state.isMicrophoneMuted;
export const selectIsPreviewMode = (state: LivestreamState) => state.isPreviewMode;

/**
 * Select connection for a specific platform
 */
export const selectPlatformConnection = (platform: StreamPlatform) => (state: LivestreamState) =>
  state.platformConnections.find((c) => c.platform === platform);

/**
 * Check if a platform is connected
 */
export const selectIsPlatformConnected = (platform: StreamPlatform) => (state: LivestreamState) =>
  state.platformConnections.some((c) => c.platform === platform && c.isConnected);

/**
 * Get saved stream key for a platform
 */
export const selectSavedStreamKey = (platform: StreamPlatform) => (state: LivestreamState) =>
  state.preferences.savedStreamKeys[platform];

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to get stream state
 */
export function useStreamState() {
  return useLivestreamStore((state) => ({
    isStreaming: state.isStreaming,
    session: state.currentSession,
    connectionState: state.connectionState,
    health: state.health,
    viewerCount: state.viewerCount,
    error: state.error,
    isLoading: state.isLoading,
  }));
}

/**
 * Hook to get stream preferences
 */
export function useStreamPreferences() {
  return useLivestreamStore((state) => state.preferences);
}

/**
 * Hook to get platform connections
 */
export function usePlatformConnections() {
  return useLivestreamStore((state) => state.platformConnections);
}

/**
 * Hook to get stream controls state
 */
export function useStreamControls() {
  return useLivestreamStore((state) => ({
    isCameraMuted: state.isCameraMuted,
    isMicrophoneMuted: state.isMicrophoneMuted,
    isPreviewMode: state.isPreviewMode,
    toggleCameraMuted: state.toggleCameraMuted,
    toggleMicrophoneMuted: state.toggleMicrophoneMuted,
    setIsPreviewMode: state.setIsPreviewMode,
  }));
}

/**
 * Hook to get stream actions
 */
export function useStreamActions() {
  return useLivestreamStore((state) => ({
    setStreamSession: state.setStreamSession,
    setConnectionState: state.setConnectionState,
    setHealth: state.setHealth,
    setViewerCount: state.setViewerCount,
    setError: state.setError,
    setIsLoading: state.setIsLoading,
    resetStreamState: state.resetStreamState,
    buildStreamConfig: state.buildStreamConfig,
  }));
}

// ============================================================================
// Default Export
// ============================================================================

export default useLivestreamStore;
