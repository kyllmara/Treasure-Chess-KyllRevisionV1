/**
 * 3D Chess Board Store
 *
 * Zustand store for managing 3D chess board configuration and state.
 * Persists settings to AsyncStorage.
 *
 * @module lib/chess3d/store
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  RenderingMode,
  QualityPreset,
  CameraPreset,
  ChessBoard3DConfig,
  AnimationConfig,
  VisualEffects,
  Theme3D,
} from "./types";
import { CAMERA_PRESETS, QUALITY_PRESETS } from "./types";
import { THEMES_3D, DEFAULT_THEME_ID, getTheme } from "./themes";

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  moveType: "arc",
  captureType: "fade",
  moveDuration: 300,
  captureDuration: 200,
  selectionPulseDuration: 1000,
  checkShakeDuration: 500,
  checkShakeIntensity: 0.5,
  checkmateEffectDuration: 2000,
  enableParticles: true,
  particleIntensity: 0.5,
  enableShadowAnimation: true,
  easing: "easeInOut",
};

const DEFAULT_VISUAL_EFFECTS: VisualEffects = {
  selectionGlow: true,
  selectionGlowColor: "#FFD700",
  selectionGlowIntensity: 0.8,
  selectionRing: true,
  selectionRingColor: "#FFD700",
  possibleMoveIndicator: "glow",
  possibleMoveColor: "rgba(0, 200, 0, 0.5)",
  possibleMoveOpacity: 0.6,
  captureMoveIndicator: "pulse",
  captureMoveColor: "#FF6B6B",
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
};

// ============================================================================
// Store Interface
// ============================================================================

interface Chess3DStore {
  // Configuration
  renderingMode: RenderingMode;
  qualityPreset: QualityPreset;
  themeId: string;
  cameraPreset: CameraPreset;
  animations: AnimationConfig;
  effects: VisualEffects;

  // Feature flags
  enable3D: boolean;
  enableUnity: boolean;
  autoDetectQuality: boolean;
  reduceMotion: boolean;

  // Computed
  theme: Theme3D;
  config: ChessBoard3DConfig;

  // Actions
  setRenderingMode: (mode: RenderingMode) => void;
  setQualityPreset: (preset: QualityPreset) => void;
  setTheme: (themeId: string) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setAnimations: (animations: Partial<AnimationConfig>) => void;
  setEffects: (effects: Partial<VisualEffects>) => void;
  setEnable3D: (enabled: boolean) => void;
  setEnableUnity: (enabled: boolean) => void;
  setAutoDetectQuality: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  resetToDefaults: () => void;
  applyQualityPreset: (preset: QualityPreset) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useChess3DStore = create<Chess3DStore>()(
  persist(
    (set, get) => ({
      // Default state
      renderingMode: "3d-native",
      qualityPreset: "medium",
      themeId: DEFAULT_THEME_ID,
      cameraPreset: "white-side",
      animations: DEFAULT_ANIMATION_CONFIG,
      effects: DEFAULT_VISUAL_EFFECTS,
      enable3D: true,
      enableUnity: false,
      autoDetectQuality: true,
      reduceMotion: false,

      // Computed getters
      get theme() {
        return getTheme(get().themeId);
      },

      get config(): ChessBoard3DConfig {
        const state = get();
        const cameraSettings = CAMERA_PRESETS[state.cameraPreset];

        return {
          renderingMode: state.renderingMode,
          qualityPreset: state.qualityPreset,
          targetFPS: state.qualityPreset === "low" ? 30 : 60,
          enableAntialiasing: state.qualityPreset !== "low",
          theme: getTheme(state.themeId),
          camera: {
            preset: state.cameraPreset,
            ...cameraSettings,
          },
          animations: state.animations,
          effects: state.effects,
          maxParticles: state.qualityPreset === "ultra" ? 500 : state.qualityPreset === "high" ? 200 : 100,
          lodEnabled: state.qualityPreset === "low" || state.qualityPreset === "medium",
          frustumCulling: true,
          instancedRendering: true,
          reduceMotion: state.reduceMotion,
          highContrastMode: false,
        };
      },

      // Actions
      setRenderingMode: (mode) => set({ renderingMode: mode }),

      setQualityPreset: (preset) => {
        set({ qualityPreset: preset });
        get().applyQualityPreset(preset);
      },

      setTheme: (themeId) => {
        if (THEMES_3D[themeId]) {
          set({ themeId });
        }
      },

      setCameraPreset: (preset) => {
        if (CAMERA_PRESETS[preset]) {
          set({ cameraPreset: preset });
        }
      },

      setAnimations: (animations) =>
        set((state) => ({
          animations: { ...state.animations, ...animations },
        })),

      setEffects: (effects) =>
        set((state) => ({
          effects: { ...state.effects, ...effects },
        })),

      setEnable3D: (enabled) => set({ enable3D: enabled }),

      setEnableUnity: (enabled) => set({ enableUnity: enabled }),

      setAutoDetectQuality: (enabled) => set({ autoDetectQuality: enabled }),

      setReduceMotion: (enabled) => {
        set({ reduceMotion: enabled });
        if (enabled) {
          // Disable particle effects and reduce animation durations
          set((state) => ({
            animations: {
              ...state.animations,
              enableParticles: false,
              moveDuration: 150,
              captureDuration: 100,
            },
            effects: {
              ...state.effects,
              checkmateParticles: false,
              enableBloom: false,
            },
          }));
        }
      },

      resetToDefaults: () =>
        set({
          renderingMode: "3d-native",
          qualityPreset: "medium",
          themeId: DEFAULT_THEME_ID,
          cameraPreset: "white-side",
          animations: DEFAULT_ANIMATION_CONFIG,
          effects: DEFAULT_VISUAL_EFFECTS,
          enable3D: true,
          enableUnity: false,
          autoDetectQuality: true,
          reduceMotion: false,
        }),

      applyQualityPreset: (preset) => {
        const presetConfig = QUALITY_PRESETS[preset];
        if (presetConfig?.effects) {
          set({ effects: presetConfig.effects as VisualEffects });
        }
      },
    }),
    {
      name: "chess-3d-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        renderingMode: state.renderingMode,
        qualityPreset: state.qualityPreset,
        themeId: state.themeId,
        cameraPreset: state.cameraPreset,
        animations: state.animations,
        effects: state.effects,
        enable3D: state.enable3D,
        enableUnity: state.enableUnity,
        autoDetectQuality: state.autoDetectQuality,
        reduceMotion: state.reduceMotion,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

/** Select the full 3D configuration */
export const select3DConfig = (state: Chess3DStore) => state.config;

/** Select the current theme */
export const selectTheme = (state: Chess3DStore) => state.theme;

/** Select animation settings */
export const selectAnimations = (state: Chess3DStore) => state.animations;

/** Select visual effects */
export const selectEffects = (state: Chess3DStore) => state.effects;

/** Select rendering mode */
export const selectRenderingMode = (state: Chess3DStore) => state.renderingMode;

/** Select if 3D is enabled */
export const selectIs3DEnabled = (state: Chess3DStore) => state.enable3D;

// ============================================================================
// Quality Detection
// ============================================================================

/**
 * Detect recommended quality based on device capabilities
 * Returns the recommended quality preset
 */
export function detectRecommendedQuality(): QualityPreset {
  // This would ideally check:
  // - Device model/generation
  // - Available RAM
  // - GPU capabilities
  // - Battery level

  // For now, return "medium" as a safe default
  // In production, use device-info libraries
  return "medium";
}

/**
 * Apply auto-detected quality if enabled
 */
export function applyAutoDetectedQuality(): void {
  const store = useChess3DStore.getState();
  if (store.autoDetectQuality) {
    const recommended = detectRecommendedQuality();
    store.setQualityPreset(recommended);
  }
}
