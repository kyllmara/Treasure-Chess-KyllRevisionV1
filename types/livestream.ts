/**
 * Livestream Types
 *
 * Type definitions for the livestream integration system supporting
 * RTMP streaming to TikTok, Twitch, and Kick platforms.
 */

// ============================================================================
// Platform Types
// ============================================================================

/**
 * Supported streaming platforms
 */
export type StreamPlatform = "twitch" | "tiktok" | "kick" | "custom";

/**
 * Platform-specific configuration
 */
export interface PlatformConfig {
  twitch: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
  };
  tiktok: {
    clientKey: string;
    redirectUri: string;
    scopes: string[];
  };
  kick: {
    // Kick uses manual stream key only
    rtmpUrl: string;
  };
  custom: {
    rtmpUrl?: string;
  };
}

/**
 * Platform connection status
 */
export interface PlatformConnection {
  platform: StreamPlatform;
  isConnected: boolean;
  username?: string;
  channelId?: string;
  channelUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  connectedAt?: string;
}

// ============================================================================
// Stream Configuration
// ============================================================================

/**
 * Video resolution presets
 */
export type StreamResolution = "480p" | "720p" | "1080p";

/**
 * Resolution configuration details
 */
export interface ResolutionConfig {
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
  label: string;
}

/**
 * Available resolution configurations
 */
export const RESOLUTION_CONFIGS: Record<StreamResolution, ResolutionConfig> = {
  "480p": {
    width: 854,
    height: 480,
    bitrate: 1500,
    frameRate: 30,
    label: "480p (1.5 Mbps)",
  },
  "720p": {
    width: 1280,
    height: 720,
    bitrate: 3000,
    frameRate: 30,
    label: "720p (3 Mbps)",
  },
  "1080p": {
    width: 1920,
    height: 1080,
    bitrate: 6000,
    frameRate: 30,
    label: "1080p (6 Mbps)",
  },
};

/**
 * Audio configuration
 */
export interface AudioConfig {
  enabled: boolean;
  bitrate: number;
  sampleRate: number;
  channels: 1 | 2;
}

/**
 * Camera position for picture-in-picture
 */
export type CameraPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Camera overlay configuration
 */
export interface CameraOverlayConfig {
  enabled: boolean;
  position: CameraPosition;
  size: "small" | "medium" | "large";
  borderRadius: number;
  borderColor: string;
  useFrontCamera: boolean;
}

/**
 * Game info overlay configuration
 */
export interface GameInfoOverlayConfig {
  showPlayerNames: boolean;
  showRatings: boolean;
  showTimer: boolean;
  showMoveHistory: boolean;
  showStakes: boolean;
  position: "top" | "bottom" | "side";
}

/**
 * Complete stream configuration
 */
export interface StreamConfig {
  platform: StreamPlatform;
  streamKey: string;
  rtmpUrl: string;
  resolution: StreamResolution;
  audio: AudioConfig;
  camera: CameraOverlayConfig;
  gameInfo: GameInfoOverlayConfig;
  title: string;
  description?: string;
  tags?: string[];
}

// ============================================================================
// Stream State
// ============================================================================

/**
 * Stream connection states
 */
export type StreamConnectionState =
  | "idle"
  | "initializing"
  | "connecting"
  | "connected"
  | "streaming"
  | "reconnecting"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Stream health indicators
 */
export interface StreamHealth {
  bitrate: number;
  droppedFrames: number;
  totalFrames: number;
  fps: number;
  latency: number;
  quality: "excellent" | "good" | "fair" | "poor";
  lastUpdated: string;
}

/**
 * Active stream session
 */
export interface StreamSession {
  id: string;
  userId: string;
  gameId: string | null;
  platform: StreamPlatform;
  streamKey: string;
  rtmpUrl: string;
  config: StreamConfig;
  connectionState: StreamConnectionState;
  health: StreamHealth | null;
  viewerCount: number;
  peakViewerCount: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  errorMessage: string | null;
}

/**
 * Stream statistics
 */
export interface StreamStats {
  totalStreams: number;
  totalDurationSeconds: number;
  totalViewers: number;
  averageViewers: number;
  peakViewers: number;
  lastStreamAt: string | null;
}

// ============================================================================
// Platform OAuth
// ============================================================================

/**
 * OAuth state for platform connections
 */
export interface OAuthState {
  platform: StreamPlatform;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  initiatedAt: string;
}

/**
 * OAuth token response
 */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

/**
 * Twitch user info
 */
export interface TwitchUserInfo {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  broadcasterType: "partner" | "affiliate" | "";
}

/**
 * TikTok user info
 */
export interface TikTokUserInfo {
  openId: string;
  unionId?: string;
  displayName: string;
  avatarUrl: string;
  isLiveEnabled: boolean;
}

// ============================================================================
// Stream Events
// ============================================================================

/**
 * Stream event types
 */
export type StreamEventType =
  | "stream_started"
  | "stream_stopped"
  | "viewer_joined"
  | "viewer_left"
  | "viewer_count_updated"
  | "connection_state_changed"
  | "health_updated"
  | "error"
  | "chat_message"
  | "donation"
  | "follow"
  | "subscription";

/**
 * Base stream event
 */
export interface StreamEvent {
  type: StreamEventType;
  streamId: string;
  timestamp: string;
  payload: unknown;
}

/**
 * Viewer count update event
 */
export interface ViewerCountEvent extends StreamEvent {
  type: "viewer_count_updated";
  payload: {
    count: number;
    delta: number;
  };
}

/**
 * Connection state change event
 */
export interface ConnectionStateEvent extends StreamEvent {
  type: "connection_state_changed";
  payload: {
    previousState: StreamConnectionState;
    currentState: StreamConnectionState;
    reason?: string;
  };
}

/**
 * Stream error event
 */
export interface StreamErrorEvent extends StreamEvent {
  type: "error";
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Chat message event
 */
export interface ChatMessageEvent extends StreamEvent {
  type: "chat_message";
  payload: {
    id: string;
    userId: string;
    username: string;
    displayName: string;
    message: string;
    badges?: string[];
    color?: string;
    emotes?: Array<{ id: string; positions: string }>;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Start stream result
 */
export interface StartStreamResult {
  success: boolean;
  session?: StreamSession;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Stop stream result
 */
export interface StopStreamResult {
  success: boolean;
  finalStats?: {
    durationSeconds: number;
    peakViewerCount: number;
    averageViewerCount: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Platform connection result
 */
export interface ConnectPlatformResult {
  success: boolean;
  connection?: PlatformConnection;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Stream key retrieval result (for platforms with OAuth)
 */
export interface GetStreamKeyResult {
  success: boolean;
  streamKey?: string;
  rtmpUrl?: string;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Database Types (for Supabase)
// ============================================================================

/**
 * Database row for stream sessions
 */
export interface StreamSessionRow {
  id: string;
  user_id: string;
  game_id: string | null;
  platform: StreamPlatform;
  stream_key_encrypted: string;
  rtmp_url: string;
  resolution: StreamResolution;
  title: string;
  description: string | null;
  connection_state: StreamConnectionState;
  viewer_count: number;
  peak_viewer_count: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row for platform connections
 */
export interface PlatformConnectionRow {
  id: string;
  user_id: string;
  platform: StreamPlatform;
  platform_user_id: string;
  username: string;
  channel_url: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  connected_at: string;
  updated_at: string;
}

/**
 * Database row for stream settings
 */
export interface StreamSettingsRow {
  id: string;
  user_id: string;
  default_platform: StreamPlatform | null;
  default_resolution: StreamResolution;
  camera_enabled: boolean;
  camera_position: CameraPosition;
  camera_size: "small" | "medium" | "large";
  show_player_names: boolean;
  show_ratings: boolean;
  show_timer: boolean;
  show_move_history: boolean;
  show_stakes: boolean;
  auto_save_vod: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * useLivestream hook state
 */
export interface UseLivestreamState {
  isStreaming: boolean;
  session: StreamSession | null;
  connectionState: StreamConnectionState;
  health: StreamHealth | null;
  viewerCount: number;
  error: string | null;
  isLoading: boolean;
}

/**
 * useLivestream hook actions
 */
export interface UseLivestreamActions {
  startStream: (config: Partial<StreamConfig>) => Promise<StartStreamResult>;
  stopStream: () => Promise<StopStreamResult>;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
  updateGameInfo: (gameId: string | null) => Promise<void>;
}

/**
 * usePlatformConnections hook state
 */
export interface UsePlatformConnectionsState {
  connections: PlatformConnection[];
  isLoading: boolean;
  error: string | null;
}

/**
 * usePlatformConnections hook actions
 */
export interface UsePlatformConnectionsActions {
  connectPlatform: (platform: StreamPlatform) => Promise<ConnectPlatformResult>;
  disconnectPlatform: (platform: StreamPlatform) => Promise<void>;
  refreshConnection: (platform: StreamPlatform) => Promise<void>;
  getStreamKey: (platform: StreamPlatform) => Promise<GetStreamKeyResult>;
}

/**
 * useStreamSettings hook state
 */
export interface UseStreamSettingsState {
  settings: StreamSettingsRow | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * useStreamSettings hook actions
 */
export interface UseStreamSettingsActions {
  updateSettings: (settings: Partial<StreamSettingsRow>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * StreamPreview component props
 */
export interface StreamPreviewProps {
  gameId?: string;
  config: StreamConfig;
  isLive: boolean;
  onConfigChange?: (config: Partial<StreamConfig>) => void;
}

/**
 * StreamControls component props
 */
export interface StreamControlsProps {
  isStreaming: boolean;
  connectionState: StreamConnectionState;
  viewerCount: number;
  health: StreamHealth | null;
  onStart: () => void;
  onStop: () => void;
  onSettingsPress: () => void;
  disabled?: boolean;
}

/**
 * StreamOverlay component props
 */
export interface StreamOverlayProps {
  config: GameInfoOverlayConfig;
  playerWhite: {
    username: string;
    rating: number;
    timeRemaining: number;
  };
  playerBlack: {
    username: string;
    rating: number;
    timeRemaining: number;
  };
  moveHistory: string[];
  stakes?: number;
  isWhiteTurn: boolean;
}

/**
 * PlatformPicker component props
 */
export interface PlatformPickerProps {
  selectedPlatform: StreamPlatform | null;
  connections: PlatformConnection[];
  onSelectPlatform: (platform: StreamPlatform) => void;
  onConnectPlatform: (platform: StreamPlatform) => void;
  disabled?: boolean;
}

/**
 * ViewerCounter component props
 */
export interface ViewerCounterProps {
  count: number;
  showLabel?: boolean;
  size?: "small" | "medium" | "large";
  animated?: boolean;
}

/**
 * QualitySelector component props
 */
export interface QualitySelectorProps {
  selectedResolution: StreamResolution;
  onSelectResolution: (resolution: StreamResolution) => void;
  disabled?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Livestream error codes
 */
export type LivestreamErrorCode =
  | "STREAM_ALREADY_ACTIVE"
  | "STREAM_NOT_FOUND"
  | "PLATFORM_NOT_CONNECTED"
  | "INVALID_STREAM_KEY"
  | "CONNECTION_FAILED"
  | "RTMP_ERROR"
  | "CAMERA_PERMISSION_DENIED"
  | "MICROPHONE_PERMISSION_DENIED"
  | "INSUFFICIENT_BANDWIDTH"
  | "PLATFORM_RATE_LIMITED"
  | "OAUTH_FAILED"
  | "TOKEN_EXPIRED"
  | "UNKNOWN_ERROR";

/**
 * Livestream error
 */
export interface LivestreamError {
  code: LivestreamErrorCode;
  message: string;
  details?: unknown;
  recoverable: boolean;
  timestamp: string;
}

/**
 * Create a livestream error
 */
export function createLivestreamError(
  code: LivestreamErrorCode,
  message: string,
  recoverable: boolean = false,
  details?: unknown
): LivestreamError {
  return {
    code,
    message,
    details,
    recoverable,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Platform display information
 */
export const PLATFORM_INFO: Record<
  StreamPlatform,
  {
    name: string;
    color: string;
    icon: string;
    rtmpUrl: string;
    supportsOAuth: boolean;
    requiresManualKey: boolean;
  }
> = {
  twitch: {
    name: "Twitch",
    color: "#9146FF",
    icon: "twitch",
    rtmpUrl: "rtmp://live.twitch.tv/app",
    supportsOAuth: true,
    requiresManualKey: false,
  },
  tiktok: {
    name: "TikTok",
    color: "#000000",
    icon: "music",
    rtmpUrl: "rtmp://push.tiktok.com/live",
    supportsOAuth: true,
    requiresManualKey: false,
  },
  kick: {
    name: "Kick",
    color: "#53FC18",
    icon: "zap",
    rtmpUrl: "rtmp://fa723fc1b171.global-contribute.live-video.net/app",
    supportsOAuth: false,
    requiresManualKey: true,
  },
  custom: {
    name: "Custom RTMP",
    color: "#6366F1",
    icon: "radio",
    rtmpUrl: "",
    supportsOAuth: false,
    requiresManualKey: true,
  },
};

/**
 * Default stream settings
 */
export const DEFAULT_STREAM_SETTINGS: Omit<StreamSettingsRow, "id" | "user_id" | "created_at" | "updated_at"> = {
  default_platform: null,
  default_resolution: "720p",
  camera_enabled: true,
  camera_position: "bottom-right",
  camera_size: "medium",
  show_player_names: true,
  show_ratings: true,
  show_timer: true,
  show_move_history: false,
  show_stakes: true,
  auto_save_vod: false,
};

/**
 * Default audio configuration
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  enabled: true,
  bitrate: 128,
  sampleRate: 44100,
  channels: 2,
};

/**
 * Default camera overlay configuration
 */
export const DEFAULT_CAMERA_CONFIG: CameraOverlayConfig = {
  enabled: true,
  position: "bottom-right",
  size: "medium",
  borderRadius: 12,
  borderColor: "#FFD700",
  useFrontCamera: true,
};

/**
 * Default game info overlay configuration
 */
export const DEFAULT_GAME_INFO_CONFIG: GameInfoOverlayConfig = {
  showPlayerNames: true,
  showRatings: true,
  showTimer: true,
  showMoveHistory: false,
  showStakes: true,
  position: "top",
};
