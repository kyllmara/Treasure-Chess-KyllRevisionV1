/**
 * 3D Chess Board Module
 *
 * Central export for all 3D chess board functionality.
 * Provides Unity integration, native 3D rendering, themes, and configuration.
 *
 * @module lib/chess3d
 *
 * @example
 * ```typescript
 * import {
 *   useChess3DStore,
 *   getTheme,
 *   ChessBoard3D,
 *   UnityChessBoard,
 * } from '@/lib/chess3d';
 *
 * // Use the store to get/set 3D settings
 * const { enable3D, setTheme } = useChess3DStore();
 *
 * // Get a specific theme
 * const theme = getTheme('treasure-purple');
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Rendering
  RenderingMode,
  QualityPreset,
  PieceStyle,
  BoardMaterial,
  PieceMaterial,
  // Theme
  Theme3D,
  // Camera
  CameraPreset,
  CameraConfig,
  // Animation
  AnimationType,
  AnimationConfig,
  // Effects
  VisualEffects,
  // Config
  ChessBoard3DConfig,
  UnityBridgeConfig,
  // Unity Communication
  UnityMessageType,
  UnityEventType,
  UnityMessage,
  UnityEvent,
  // Chess Types (re-exported for convenience)
  Square,
} from "./types";

// ============================================================================
// Theme Exports
// ============================================================================

export {
  // Individual themes
  THEME_CLASSIC_WOOD,
  THEME_WALNUT_MAPLE,
  THEME_MAHOGANY_ELITE,
  THEME_WHITE_MARBLE,
  THEME_OBSIDIAN_PEARL,
  THEME_ROYAL_GOLD,
  THEME_CRYSTAL,
  THEME_TREASURE_PURPLE,
  THEME_ECO_GREEN,
  THEME_MIDNIGHT_BLUE,
  THEME_RETRO,
  // Theme collections
  THEMES_3D,
  FREE_THEMES,
  PREMIUM_THEMES,
  DEFAULT_THEME_ID,
  // Theme utilities
  getTheme,
  isThemePremium,
  getAvailableThemes,
  map2DThemeTo3D,
  getThemePreviewGradient,
  getThemeColors,
} from "./themes";

// ============================================================================
// Store Exports
// ============================================================================

export {
  // Main store hook
  useChess3DStore,
  // Selectors
  select3DConfig,
  selectTheme,
  selectAnimations,
  selectEffects,
  selectRenderingMode,
  selectIs3DEnabled,
  // Quality utilities
  detectRecommendedQuality,
  applyAutoDetectedQuality,
} from "./store";

// ============================================================================
// Unity Bridge Exports
// ============================================================================

export {
  // Main class
  UnityBridge,
  // Singleton access
  getUnityBridge,
  resetUnityBridge,
  // React hook
  useUnityBridge,
  // Global event handler
  handleUnityMessage,
  // Types
  type UnityBridgeState,
} from "./unityBridge";

// ============================================================================
// Preset Exports
// ============================================================================

export { CAMERA_PRESETS, QUALITY_PRESETS } from "./types";

// ============================================================================
// Component Re-exports (for convenience)
// ============================================================================

// These are re-exported here but components should typically import directly
// from @/components for better tree-shaking

/**
 * @deprecated Import ChessBoard3D directly from '@/components/ChessBoard3D'
 */
export { ChessBoard3D } from "../../components/ChessBoard3D";

/**
 * @deprecated Import UnityChessBoard directly from '@/components/UnityChessBoard'
 */
export { UnityChessBoard } from "../../components/UnityChessBoard";
