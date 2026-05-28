/**
 * Settings Store
 *
 * Centralized settings management with AsyncStorage persistence.
 * Handles audio, haptics, game preferences, and theme settings.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AudioManager } from "@/lib/audio";
import { HapticsManager } from "@/lib/haptics";

// ============================================================================
// Types
// ============================================================================

// Import from central types to avoid conflicts
import type { BoardTheme, PieceStyle } from "@/types";
export type { BoardTheme, PieceStyle };

export interface AudioSettings {
  /** Master sound enabled */
  soundEnabled: boolean;
  /** Background music enabled */
  musicEnabled: boolean;
  /** Master volume (0-1) */
  masterVolume: number;
  /** Sound effects volume (0-1) */
  soundVolume: number;
  /** Music volume (0-1) */
  musicVolume: number;
}

export interface HapticSettings {
  /** Haptic feedback enabled */
  hapticEnabled: boolean;
  /** Haptic on piece moves */
  hapticOnMove: boolean;
  /** Haptic on captures */
  hapticOnCapture: boolean;
  /** Haptic on button presses */
  hapticOnButton: boolean;
}

export interface GameSettings {
  /** Board color theme */
  boardTheme: BoardTheme;
  /** Piece design style */
  pieceStyle: PieceStyle;
  /** Show legal move hints */
  showLegalMoves: boolean;
  /** Auto-promote to queen */
  autoQueen: boolean;
  /** Require move confirmation */
  confirmMoves: boolean;
  /** Highlight last move */
  highlightLastMove: boolean;
  /** Show coordinates on board */
  showCoordinates: boolean;
  /** Flip board when playing black */
  autoFlipBoard: boolean;
  /** Animation speed (ms) */
  animationSpeed: number;
}

export interface NotificationSettings {
  /** Push notifications enabled */
  pushEnabled: boolean;
  /** Game invites */
  notifyGameInvites: boolean;
  /** Your turn reminders */
  notifyYourTurn: boolean;
  /** Game results */
  notifyGameResults: boolean;
  /** Deposit confirmations */
  notifyDeposits: boolean;
  /** Achievement unlocks */
  notifyAchievements: boolean;
}

interface SettingsState {
  audio: AudioSettings;
  haptics: HapticSettings;
  game: GameSettings;
  notifications: NotificationSettings;
  isInitialized: boolean;

  // Actions
  setAudioSettings: (settings: Partial<AudioSettings>) => void;
  setHapticSettings: (settings: Partial<HapticSettings>) => void;
  setGameSettings: (settings: Partial<GameSettings>) => void;
  setNotificationSettings: (settings: Partial<NotificationSettings>) => void;

  // Quick toggles
  toggleSound: () => void;
  toggleMusic: () => void;
  toggleHaptics: () => void;

  // Reset
  resetToDefaults: () => void;

  // Initialization
  initialize: () => void;
}

// ============================================================================
// Default Settings
// ============================================================================

const defaultAudioSettings: AudioSettings = {
  soundEnabled: true,
  musicEnabled: false,
  masterVolume: 1.0,
  soundVolume: 0.8,
  musicVolume: 0.5,
};

const defaultHapticSettings: HapticSettings = {
  hapticEnabled: true,
  hapticOnMove: true,
  hapticOnCapture: true,
  hapticOnButton: true,
};

const defaultGameSettings: GameSettings = {
  boardTheme: "purple",
  pieceStyle: "unity",
  showLegalMoves: true,
  autoQueen: true,
  confirmMoves: false,
  highlightLastMove: true,
  showCoordinates: true,
  autoFlipBoard: true,
  animationSpeed: 150,
};

const defaultNotificationSettings: NotificationSettings = {
  pushEnabled: true,
  notifyGameInvites: true,
  notifyYourTurn: true,
  notifyGameResults: true,
  notifyDeposits: true,
  notifyAchievements: true,
};

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      audio: defaultAudioSettings,
      haptics: defaultHapticSettings,
      game: defaultGameSettings,
      notifications: defaultNotificationSettings,
      isInitialized: false,

      // ======================================================================
      // Audio Settings
      // ======================================================================

      setAudioSettings: (settings) => {
        set((state) => {
          const oldAudio = state.audio;
          const newAudio = { ...oldAudio, ...settings };

          // Sync with AudioManager
          AudioManager.applySettings({
            soundEnabled: newAudio.soundEnabled,
            musicEnabled: newAudio.musicEnabled,
            masterVolume: newAudio.masterVolume,
            soundVolume: newAudio.soundVolume,
            musicVolume: newAudio.musicVolume,
          });

          // Handle music toggle if changed
          if (settings.musicEnabled !== undefined && settings.musicEnabled !== oldAudio.musicEnabled) {
            if (settings.musicEnabled) {
              AudioManager.playBackgroundMusic();
            } else {
              AudioManager.stopBackgroundMusic();
            }
          }

          return { audio: newAudio };
        });
      },

      // ======================================================================
      // Haptic Settings
      // ======================================================================

      setHapticSettings: (settings) => {
        set((state) => {
          const newHaptics = { ...state.haptics, ...settings };

          // Sync with HapticsManager
          HapticsManager.setEnabled(newHaptics.hapticEnabled);

          return { haptics: newHaptics };
        });
      },

      // ======================================================================
      // Game Settings
      // ======================================================================

      setGameSettings: (settings) => {
        set((state) => ({
          game: { ...state.game, ...settings },
        }));
      },

      // ======================================================================
      // Notification Settings
      // ======================================================================

      setNotificationSettings: (settings) => {
        set((state) => ({
          notifications: { ...state.notifications, ...settings },
        }));
      },

      // ======================================================================
      // Quick Toggles
      // ======================================================================

      toggleSound: () => {
        const current = get().audio.soundEnabled;
        get().setAudioSettings({ soundEnabled: !current });
      },

      toggleMusic: () => {
        const current = get().audio.musicEnabled;
        get().setAudioSettings({ musicEnabled: !current });

        if (!current) {
          AudioManager.playBackgroundMusic();
        } else {
          AudioManager.stopBackgroundMusic();
        }
      },

      toggleHaptics: () => {
        const current = get().haptics.hapticEnabled;
        get().setHapticSettings({ hapticEnabled: !current });
      },

      // ======================================================================
      // Reset
      // ======================================================================

      resetToDefaults: () => {
        set({
          audio: defaultAudioSettings,
          haptics: defaultHapticSettings,
          game: defaultGameSettings,
          notifications: defaultNotificationSettings,
        });

        // Sync with managers
        AudioManager.applySettings(defaultAudioSettings);
        HapticsManager.setEnabled(defaultHapticSettings.hapticEnabled);
      },

      // ======================================================================
      // Initialization
      // ======================================================================

      initialize: () => {
        const state = get();

        // Apply settings to managers
        AudioManager.applySettings({
          soundEnabled: state.audio.soundEnabled,
          musicEnabled: state.audio.musicEnabled,
          masterVolume: state.audio.masterVolume,
          soundVolume: state.audio.soundVolume,
          musicVolume: state.audio.musicVolume,
        });

        HapticsManager.setEnabled(state.haptics.hapticEnabled);

        set({ isInitialized: true });
      },
    }),
    {
      name: "treasure-chess-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        audio: state.audio,
        haptics: state.haptics,
        game: state.game,
        notifications: state.notifications,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when storage is rehydrated
        if (state) {
          state.initialize();
        }
      },
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectAudioSettings = (state: SettingsState) => state.audio;
export const selectHapticSettings = (state: SettingsState) => state.haptics;
export const selectGameSettings = (state: SettingsState) => state.game;
export const selectNotificationSettings = (state: SettingsState) => state.notifications;

export const selectSoundEnabled = (state: SettingsState) => state.audio.soundEnabled;
export const selectMusicEnabled = (state: SettingsState) => state.audio.musicEnabled;
export const selectHapticEnabled = (state: SettingsState) => state.haptics.hapticEnabled;

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to get audio settings
 */
export function useAudioSettings() {
  return useSettingsStore((state) => state.audio);
}

/**
 * Hook to get haptic settings
 */
export function useHapticSettings() {
  return useSettingsStore((state) => state.haptics);
}

/**
 * Hook to get game settings
 */
export function useGameSettings() {
  return useSettingsStore((state) => state.game);
}

/**
 * Hook to get notification settings
 */
export function useNotificationSettings() {
  return useSettingsStore((state) => state.notifications);
}

// ============================================================================
// Default Export
// ============================================================================

export default useSettingsStore;
