/**
 * useSoundAndHaptics Hook
 *
 * Unified hook for playing sounds and haptic feedback together.
 * Integrates with settings store for user preferences.
 *
 * @example
 * const { playMove, playCapture, playWin } = useSoundAndHaptics();
 *
 * // On piece move
 * playMove();
 *
 * // On capture
 * playCapture();
 */

import { useCallback, useEffect, useRef } from "react";
import { AudioManager, playSound, type SoundEffect } from "@/lib/audio";
import { HapticsManager, hapticMove, hapticSelection } from "@/lib/haptics";
import { useSettingsStore } from "@/stores/settingsStore";

// ============================================================================
// Types
// ============================================================================

export interface MoveOptions {
  isCapture?: boolean;
  isCheck?: boolean;
  isCastle?: boolean;
  isPromotion?: boolean;
}

export interface UseSoundAndHapticsReturn {
  // Basic controls
  playSound: (effect: SoundEffect, volume?: number) => void;
  playHaptic: (type: "light" | "medium" | "heavy" | "success" | "warning" | "error") => void;

  // Chess moves
  playMove: (options?: MoveOptions) => void;
  playPiecePickup: () => void;
  playPieceDrop: () => void;
  playIllegalMove: () => void;

  // Game events
  playGameStart: () => void;
  playGameEnd: () => void;
  playWin: () => void;
  playLose: () => void;
  playDraw: () => void;

  // Timer
  playLowTime: () => void;
  playTimeout: () => void;

  // UI
  playButtonPress: () => void;
  playToggle: () => void;
  playNotification: () => void;
  playDeposit: () => void;
  playAchievement: () => void;
  playError: () => void;

  // Settings
  isSoundEnabled: boolean;
  isHapticEnabled: boolean;
  toggleSound: () => void;
  toggleHaptics: () => void;

  // Initialization
  initialize: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSoundAndHaptics(): UseSoundAndHapticsReturn {
  const {
    audio,
    haptics,
    toggleSound,
    toggleHaptics,
    initialize: initSettings,
  } = useSettingsStore();

  const isInitialized = useRef(false);

  // Initialize audio and settings
  const initialize = useCallback(async () => {
    if (isInitialized.current) return;

    try {
      await AudioManager.initialize();
      initSettings();
      isInitialized.current = true;
    } catch (error) {
      console.error("Failed to initialize sound and haptics:", error);
    }
  }, [initSettings]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // ============================================================================
  // Basic Controls
  // ============================================================================

  const playSoundEffect = useCallback(
    (effect: SoundEffect, volume?: number) => {
      if (audio.soundEnabled) {
        AudioManager.play(effect, volume);
      }
    },
    [audio.soundEnabled]
  );

  const playHaptic = useCallback(
    (type: "light" | "medium" | "heavy" | "success" | "warning" | "error") => {
      if (!haptics.hapticEnabled) return;

      switch (type) {
        case "light":
          HapticsManager.light();
          break;
        case "medium":
          HapticsManager.medium();
          break;
        case "heavy":
          HapticsManager.heavy();
          break;
        case "success":
          HapticsManager.success();
          break;
        case "warning":
          HapticsManager.warning();
          break;
        case "error":
          HapticsManager.error();
          break;
      }
    },
    [haptics.hapticEnabled]
  );

  // ============================================================================
  // Chess Moves
  // ============================================================================

  const playMove = useCallback(
    (options: MoveOptions = {}) => {
      const { isCapture, isCheck, isCastle, isPromotion } = options;

      // Play sound
      if (audio.soundEnabled) {
        AudioManager.playMoveSound(options);
      }

      // Play haptic
      if (haptics.hapticEnabled && haptics.hapticOnMove) {
        if (isCheck) {
          HapticsManager.check();
        } else if (isCapture && haptics.hapticOnCapture) {
          HapticsManager.capture();
        } else if (isCastle) {
          HapticsManager.castle();
        } else if (isPromotion) {
          HapticsManager.promote();
        } else {
          HapticsManager.move();
        }
      }
    },
    [audio.soundEnabled, haptics.hapticEnabled, haptics.hapticOnMove, haptics.hapticOnCapture]
  );

  const playPiecePickup = useCallback(() => {
    if (haptics.hapticEnabled) {
      HapticsManager.selection();
    }
  }, [haptics.hapticEnabled]);

  const playPieceDrop = useCallback(() => {
    // Only haptic, no sound (the move sound handles this)
    if (haptics.hapticEnabled) {
      HapticsManager.light();
    }
  }, [haptics.hapticEnabled]);

  const playIllegalMove = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("illegal");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.illegal();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  // ============================================================================
  // Game Events
  // ============================================================================

  const playGameStart = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("gameStart");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.gameStart();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playGameEnd = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("gameEnd");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.gameEnd();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playWin = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("win");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.win();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playLose = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("lose");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.lose();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playDraw = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("draw");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.draw();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  // ============================================================================
  // Timer
  // ============================================================================

  const playLowTime = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("lowTime");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.lowTime();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playTimeout = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("timeout");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.timeout();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  // ============================================================================
  // UI
  // ============================================================================

  const playButtonPress = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("button", 0.5);
    }
    if (haptics.hapticEnabled && haptics.hapticOnButton) {
      HapticsManager.buttonPress();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled, haptics.hapticOnButton]);

  const playToggle = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("toggle", 0.4);
    }
    if (haptics.hapticEnabled) {
      HapticsManager.toggle();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playNotification = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("notification");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.success();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playDeposit = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("deposit");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.success();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playAchievement = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("achievement");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.success();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  const playError = useCallback(() => {
    if (audio.soundEnabled) {
      AudioManager.play("error");
    }
    if (haptics.hapticEnabled) {
      HapticsManager.error();
    }
  }, [audio.soundEnabled, haptics.hapticEnabled]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Basic controls
    playSound: playSoundEffect,
    playHaptic,

    // Chess moves
    playMove,
    playPiecePickup,
    playPieceDrop,
    playIllegalMove,

    // Game events
    playGameStart,
    playGameEnd,
    playWin,
    playLose,
    playDraw,

    // Timer
    playLowTime,
    playTimeout,

    // UI
    playButtonPress,
    playToggle,
    playNotification,
    playDeposit,
    playAchievement,
    playError,

    // Settings
    isSoundEnabled: audio.soundEnabled,
    isHapticEnabled: haptics.hapticEnabled,
    toggleSound,
    toggleHaptics,

    // Initialization
    initialize,
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default useSoundAndHaptics;
