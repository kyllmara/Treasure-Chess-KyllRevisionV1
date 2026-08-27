/**
 * 3D Chess Board Types
 *
 * Type definitions for the 3D chess rendering system.
 * Supports both WebGL/Three.js and Unity rendering backends.
 *
 * @module lib/chess3d/types
 */

import type { Square, PieceSymbol, Color } from "chess.js";

// ============================================================================
// Rendering Modes
// ============================================================================

/** Available rendering backends for the chess board */
export type RenderingMode = "2d" | "3d-native" | "unity";

/** Quality presets for 3D rendering */
export type QualityPreset = "low" | "medium" | "high" | "ultra";

/** Piece style for rendering */
export type PieceStyle = "classic" | "unity";

// ============================================================================
// 3D Board Themes
// ============================================================================

/** 3D board material types */
export type BoardMaterial =
  | "wood-oak"
  | "wood-walnut"
  | "wood-mahogany"
  | "marble-white"
  | "marble-black"
  | "metal-gold"
  | "metal-silver"
  | "glass"
  | "crystal";

/** 3D piece material types */
export type PieceMaterial =
  | "wood-classic"
  | "marble"
  | "metal-gold"
  | "metal-silver"
  | "glass"
  | "crystal"
  | "obsidian"
  | "ivory";

/** Complete 3D theme configuration */
export interface Theme3D {
  id: string;
  name: string;
  description: string;
  boardMaterial: BoardMaterial;
  lightSquareColor: string;
  darkSquareColor: string;
  whitePieceMaterial: PieceMaterial;
  blackPieceMaterial: PieceMaterial;
  whitePieceColor: string;
  blackPieceColor: string;
  boardBorderColor: string;
  boardBorderWidth: number;
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  shadowIntensity: number;
  reflectionIntensity: number;
  premium: boolean;
}

// ============================================================================
// Camera and View Settings
// ============================================================================

/** Camera position presets */
export type CameraPreset =
  | "white-side"      // View from white's perspective
  | "black-side"      // View from black's perspective
  | "top-down"        // Bird's eye view
  | "isometric"       // Classic isometric angle
  | "dramatic"        // Low angle dramatic view
  | "spectator";      // Side view for spectating

/** Camera configuration */
export interface CameraConfig {
  preset: CameraPreset;
  fov: number;           // Field of view (degrees)
  distance: number;      // Distance from board center
  height: number;        // Camera height
  rotationX: number;     // Pitch rotation (degrees)
  rotationY: number;     // Yaw rotation (degrees)
  enableOrbit: boolean;  // Allow user to rotate camera
  enableZoom: boolean;   // Allow user to zoom
  minZoom: number;
  maxZoom: number;
  autoRotate: boolean;   // Auto-rotate during idle
  autoRotateSpeed: number;
}

// ============================================================================
// Animation Settings
// ============================================================================

/** Piece movement animation types */
export type MoveAnimationType =
  | "slide"           // Simple slide across board
  | "arc"             // Arc trajectory (lift and place)
  | "hop"             // Small hop movement
  | "teleport"        // Instant move with fade effect
  | "float";          // Floating/gliding movement

/** Capture animation types */
export type CaptureAnimationType =
  | "fade"            // Captured piece fades out
  | "explode"         // Particle explosion
  | "shatter"         // Piece shatters
  | "dissolve"        // Dissolve effect
  | "sweep";          // Captured piece swept away

/** Animation type alias */
export type AnimationType = MoveAnimationType | CaptureAnimationType;

/** Animation configuration */
export interface AnimationConfig {
  moveType: MoveAnimationType;
  captureType: CaptureAnimationType;
  moveDuration: number;          // ms
  captureDuration: number;       // ms
  selectionPulseDuration: number; // ms
  checkShakeDuration: number;    // ms
  checkShakeIntensity: number;   // 0-1
  checkmateEffectDuration: number; // ms
  enableParticles: boolean;
  enableMoveAnimations: boolean;
  particleIntensity: number;     // 0-1
  enableShadowAnimation: boolean;
  easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring" | "bounce";
}

// ============================================================================
// Visual Effects
// ============================================================================

/** Visual effect types */
export interface VisualEffects {
  // Selection effects
  selectionGlow: boolean;
  selectionGlowColor: string;
  selectionGlowIntensity: number;
  selectionRing: boolean;
  selectionRingColor: string;

  // Move indicators
  possibleMoveIndicator: "dot" | "ring" | "glow" | "highlight";
  possibleMoveColor: string;
  possibleMoveOpacity: number;
  captureMoveIndicator: "cross" | "ring" | "pulse" | "target";
  captureMoveColor: string;

  // Last move highlight
  lastMoveHighlight: boolean;
  lastMoveColor: string;
  lastMoveOpacity: number;

  // Check effects
  checkIndicator: "glow" | "pulse" | "ring" | "shake";
  checkColor: string;
  checkIntensity: number;

  // Checkmate effects
  checkmateEffect: "explosion" | "crown" | "rays" | "confetti";
  checkmateParticles: boolean;

  // Ambient effects
  enableReflections: boolean;
  enableShadows: boolean;
  shadowSoftness: number;
  enableAmbientOcclusion: boolean;
  enableBloom: boolean;
  bloomIntensity: number;
}

// ============================================================================
// Piece State
// ============================================================================

/** Individual piece state in 3D space */
export interface Piece3DState {
  id: string;
  type: PieceSymbol;
  color: Color;
  square: Square;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  isSelected: boolean;
  isAnimating: boolean;
  animationProgress: number;
  captured: boolean;
}

/** Board square state in 3D */
export interface Square3DState {
  square: Square;
  position: { x: number; y: number; z: number };
  isLight: boolean;
  isHighlighted: boolean;
  highlightType: "selected" | "lastMove" | "possibleMove" | "capture" | "check" | null;
  highlightIntensity: number;
}

// ============================================================================
// Complete 3D Board State
// ============================================================================

/** Complete 3D chess board state */
export interface ChessBoard3DState {
  pieces: Piece3DState[];
  squares: Square3DState[];
  capturedWhite: Piece3DState[];
  capturedBlack: Piece3DState[];
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  isWhiteTurn: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  animatingMove: {
    piece: Piece3DState;
    from: Square;
    to: Square;
    progress: number;
  } | null;
}

// ============================================================================
// Configuration
// ============================================================================

/** Complete 3D chess board configuration */
export interface ChessBoard3DConfig {
  // Rendering
  renderingMode: RenderingMode;
  qualityPreset: QualityPreset;
  targetFPS: 30 | 60;
  enableAntialiasing: boolean;

  // Theme
  theme: Theme3D;

  // Camera
  camera: CameraConfig;

  // Animations
  animations: AnimationConfig;

  // Visual effects
  effects: VisualEffects;

  // Performance
  maxParticles: number;
  lodEnabled: boolean;           // Level of detail
  frustumCulling: boolean;
  instancedRendering: boolean;

  // Accessibility
  reduceMotion: boolean;
  highContrastMode: boolean;
}

// ============================================================================
// Unity Bridge Types
// ============================================================================

/** Message types for Unity bridge communication */
export type UnityMessageType =
  | "INIT"
  | "SET_CONFIG"
  | "SET_POSITION"
  | "MAKE_MOVE"
  | "SELECT_SQUARE"
  | "DESELECT"
  | "SET_POSSIBLE_MOVES"
  | "HIGHLIGHT_LAST_MOVE"
  | "SET_CHECK"
  | "SET_CHECKMATE"
  | "SET_DRAW"
  | "PLAY_ANIMATION"
  | "SET_CAMERA"
  | "RESET_BOARD";

/** Unity bridge message payload */
export interface UnityMessage {
  type: UnityMessageType;
  payload: unknown;
  timestamp: number;
  messageId: string;
}

/** Unity event types (from Unity to React Native) */
export type UnityEventType =
  | "READY"
  | "SQUARE_PRESSED"
  | "PIECE_DRAG_START"
  | "PIECE_DRAG_END"
  | "ANIMATION_COMPLETE"
  | "CAMERA_CHANGED"
  | "ERROR"
  | "PERFORMANCE_METRICS";

/** Unity event payload */
export interface UnityEvent {
  type: UnityEventType;
  payload: unknown;
  timestamp: number;
}

/** Unity bridge configuration */
export interface UnityBridgeConfig {
  unityProjectPath?: string;
  enableDebugMode: boolean;
  messageQueueSize: number;
  reconnectAttempts: number;
  reconnectDelay: number;
  performanceMonitoring: boolean;
}

// ============================================================================
// Props
// ============================================================================

/** Props for the 3D chess board component */
export interface ChessBoard3DProps {
  // Required
  fen: string;

  // Optional state
  selectedSquare?: Square | null;
  possibleMoves?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  isFlipped?: boolean;
  isInteractive?: boolean;

  // Configuration
  config?: Partial<ChessBoard3DConfig>;

  // Callbacks
  onSquarePress?: (square: Square) => void;
  onPieceDragStart?: (square: Square) => void;
  onPieceDragEnd?: (from: Square, to: Square) => void;
  onMoveAnimationComplete?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;

  // Dimensions
  width?: number;
  height?: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

/** Default camera presets */
export const CAMERA_PRESETS: Record<CameraPreset, Omit<CameraConfig, "preset">> = {
  "white-side": {
    fov: 45,
    distance: 12,
    height: 8,
    rotationX: -35,
    rotationY: 0,
    enableOrbit: true,
    enableZoom: true,
    minZoom: 8,
    maxZoom: 20,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
  "black-side": {
    fov: 45,
    distance: 12,
    height: 8,
    rotationX: -35,
    rotationY: 180,
    enableOrbit: true,
    enableZoom: true,
    minZoom: 8,
    maxZoom: 20,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
  "top-down": {
    fov: 60,
    distance: 10,
    height: 15,
    rotationX: -90,
    rotationY: 0,
    enableOrbit: false,
    enableZoom: true,
    minZoom: 8,
    maxZoom: 18,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
  "isometric": {
    fov: 35,
    distance: 14,
    height: 10,
    rotationX: -45,
    rotationY: -45,
    enableOrbit: true,
    enableZoom: true,
    minZoom: 10,
    maxZoom: 22,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
  "dramatic": {
    fov: 55,
    distance: 10,
    height: 4,
    rotationX: -15,
    rotationY: -30,
    enableOrbit: true,
    enableZoom: true,
    minZoom: 6,
    maxZoom: 16,
    autoRotate: true,
    autoRotateSpeed: 0.5,
  },
  "spectator": {
    fov: 50,
    distance: 16,
    height: 6,
    rotationX: -20,
    rotationY: -90,
    enableOrbit: true,
    enableZoom: true,
    minZoom: 12,
    maxZoom: 24,
    autoRotate: false,
    autoRotateSpeed: 0,
  },
};

/** Quality preset configurations */
export const QUALITY_PRESETS: Record<QualityPreset, Partial<ChessBoard3DConfig>> = {
  low: {
    targetFPS: 30,
    enableAntialiasing: false,
    maxParticles: 50,
    lodEnabled: true,
    effects: {
      selectionGlow: true,
      selectionGlowColor: "#FFD700",
      selectionGlowIntensity: 0.5,
      selectionRing: false,
      selectionRingColor: "#FFD700",
      possibleMoveIndicator: "dot",
      possibleMoveColor: "rgba(0, 0, 0, 0.3)",
      possibleMoveOpacity: 0.5,
      captureMoveIndicator: "ring",
      captureMoveColor: "#E05C5C",
      lastMoveHighlight: true,
      lastMoveColor: "#FFD700",
      lastMoveOpacity: 0.3,
      checkIndicator: "glow",
      checkColor: "#FF0000",
      checkIntensity: 0.6,
      checkmateEffect: "rays",
      checkmateParticles: false,
      enableReflections: false,
      enableShadows: true,
      shadowSoftness: 0.3,
      enableAmbientOcclusion: false,
      enableBloom: false,
      bloomIntensity: 0,
    },
  },
  medium: {
    targetFPS: 60,
    enableAntialiasing: true,
    maxParticles: 100,
    lodEnabled: true,
    effects: {
      selectionGlow: true,
      selectionGlowColor: "#FFD700",
      selectionGlowIntensity: 0.7,
      selectionRing: true,
      selectionRingColor: "#FFD700",
      possibleMoveIndicator: "glow",
      possibleMoveColor: "rgba(0, 255, 0, 0.4)",
      possibleMoveOpacity: 0.6,
      captureMoveIndicator: "pulse",
      captureMoveColor: "#E05C5C",
      lastMoveHighlight: true,
      lastMoveColor: "#FFD700",
      lastMoveOpacity: 0.4,
      checkIndicator: "pulse",
      checkColor: "#FF0000",
      checkIntensity: 0.8,
      checkmateEffect: "crown",
      checkmateParticles: true,
      enableReflections: false,
      enableShadows: true,
      shadowSoftness: 0.5,
      enableAmbientOcclusion: false,
      enableBloom: true,
      bloomIntensity: 0.3,
    },
  },
  high: {
    targetFPS: 60,
    enableAntialiasing: true,
    maxParticles: 200,
    lodEnabled: false,
    effects: {
      selectionGlow: true,
      selectionGlowColor: "#FFD700",
      selectionGlowIntensity: 0.9,
      selectionRing: true,
      selectionRingColor: "#FFD700",
      possibleMoveIndicator: "glow",
      possibleMoveColor: "rgba(0, 255, 0, 0.5)",
      possibleMoveOpacity: 0.7,
      captureMoveIndicator: "target",
      captureMoveColor: "#E05C5C",
      lastMoveHighlight: true,
      lastMoveColor: "#FFD700",
      lastMoveOpacity: 0.5,
      checkIndicator: "shake",
      checkColor: "#FF0000",
      checkIntensity: 1.0,
      checkmateEffect: "explosion",
      checkmateParticles: true,
      enableReflections: true,
      enableShadows: true,
      shadowSoftness: 0.7,
      enableAmbientOcclusion: true,
      enableBloom: true,
      bloomIntensity: 0.5,
    },
  },
  ultra: {
    targetFPS: 60,
    enableAntialiasing: true,
    maxParticles: 500,
    lodEnabled: false,
    effects: {
      selectionGlow: true,
      selectionGlowColor: "#FFD700",
      selectionGlowIntensity: 1.0,
      selectionRing: true,
      selectionRingColor: "#FFD700",
      possibleMoveIndicator: "highlight",
      possibleMoveColor: "rgba(0, 255, 0, 0.6)",
      possibleMoveOpacity: 0.8,
      captureMoveIndicator: "target",
      captureMoveColor: "#E05C5C",
      lastMoveHighlight: true,
      lastMoveColor: "#FFD700",
      lastMoveOpacity: 0.6,
      checkIndicator: "shake",
      checkColor: "#FF0000",
      checkIntensity: 1.0,
      checkmateEffect: "confetti",
      checkmateParticles: true,
      enableReflections: true,
      enableShadows: true,
      shadowSoftness: 1.0,
      enableAmbientOcclusion: true,
      enableBloom: true,
      bloomIntensity: 0.7,
    },
  },
};
