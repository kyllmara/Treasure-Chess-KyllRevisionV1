/**
 * Haptics Manager
 *
 * Centralized haptic feedback system for Treasure Chess featuring:
 * - Multiple feedback intensities
 * - Chess-specific haptic patterns
 * - Settings integration
 * - Platform-aware fallbacks
 *
 * @example
 * // Simple feedback
 * HapticsManager.light();
 * HapticsManager.medium();
 * HapticsManager.heavy();
 *
 * // Chess-specific
 * HapticsManager.move();
 * HapticsManager.capture();
 * HapticsManager.check();
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// ============================================================================
// Types
// ============================================================================

/**
 * Haptic feedback intensity levels
 */
export type HapticIntensity = "light" | "medium" | "heavy";

/**
 * Haptic notification types
 */
export type HapticNotification = "success" | "warning" | "error";

/**
 * Chess-specific haptic patterns
 */
export type ChessHaptic =
  | "move"
  | "capture"
  | "check"
  | "castle"
  | "promote"
  | "illegal"
  | "gameStart"
  | "gameEnd"
  | "win"
  | "lose"
  | "draw"
  | "lowTime"
  | "timeout";

// ============================================================================
// Haptics Manager Class
// ============================================================================

/**
 * Singleton Haptics Manager
 */
class HapticsManagerClass {
  private enabled = true;
  private isAvailable = Platform.OS === "ios" || Platform.OS === "android";

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Enable or disable haptic feedback globally
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if haptics are enabled
   */
  get isEnabled(): boolean {
    return this.enabled && this.isAvailable;
  }

  // ============================================================================
  // Basic Haptics
  // ============================================================================

  /**
   * Light impact feedback (subtle tap)
   */
  async light(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Silently fail
    }
  }

  /**
   * Medium impact feedback (standard tap)
   */
  async medium(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Silently fail
    }
  }

  /**
   * Heavy impact feedback (strong tap)
   */
  async heavy(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Silently fail
    }
  }

  /**
   * Soft impact feedback (iOS 13+)
   */
  async soft(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    } catch {
      // Fall back to light
      await this.light();
    }
  }

  /**
   * Rigid impact feedback (iOS 13+)
   */
  async rigid(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    } catch {
      // Fall back to heavy
      await this.heavy();
    }
  }

  // ============================================================================
  // Notification Haptics
  // ============================================================================

  /**
   * Success notification feedback
   */
  async success(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Silently fail
    }
  }

  /**
   * Warning notification feedback
   */
  async warning(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Silently fail
    }
  }

  /**
   * Error notification feedback
   */
  async error(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Silently fail
    }
  }

  // ============================================================================
  // Selection Haptics
  // ============================================================================

  /**
   * Selection changed feedback (very light)
   */
  async selection(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await Haptics.selectionAsync();
    } catch {
      // Silently fail
    }
  }

  // ============================================================================
  // Chess-Specific Haptics
  // ============================================================================

  /**
   * Piece moved (light tap)
   */
  async move(): Promise<void> {
    await this.light();
  }

  /**
   * Piece captured (medium double tap)
   */
  async capture(): Promise<void> {
    if (!this.isEnabled) return;

    await this.medium();
    // Small delay then second tap
    setTimeout(() => this.light(), 50);
  }

  /**
   * Check given (warning pattern)
   */
  async check(): Promise<void> {
    await this.warning();
  }

  /**
   * Castling (double medium tap)
   */
  async castle(): Promise<void> {
    if (!this.isEnabled) return;

    await this.medium();
    setTimeout(() => this.medium(), 100);
  }

  /**
   * Pawn promotion (success pattern)
   */
  async promote(): Promise<void> {
    await this.success();
  }

  /**
   * Illegal move attempted (error pattern)
   */
  async illegal(): Promise<void> {
    await this.error();
  }

  /**
   * Game started (medium tap)
   */
  async gameStart(): Promise<void> {
    await this.medium();
  }

  /**
   * Game ended (heavy tap)
   */
  async gameEnd(): Promise<void> {
    await this.heavy();
  }

  /**
   * Player won (celebration pattern)
   */
  async win(): Promise<void> {
    if (!this.isEnabled) return;

    await this.success();
    setTimeout(() => this.light(), 100);
    setTimeout(() => this.medium(), 200);
  }

  /**
   * Player lost (error pattern)
   */
  async lose(): Promise<void> {
    await this.error();
  }

  /**
   * Game drawn (double light tap)
   */
  async draw(): Promise<void> {
    if (!this.isEnabled) return;

    await this.light();
    setTimeout(() => this.light(), 150);
  }

  /**
   * Low time warning (warning pattern)
   */
  async lowTime(): Promise<void> {
    await this.warning();
  }

  /**
   * Time ran out (error pattern)
   */
  async timeout(): Promise<void> {
    await this.error();
  }

  // ============================================================================
  // UI Haptics
  // ============================================================================

  /**
   * Button pressed (light tap)
   */
  async buttonPress(): Promise<void> {
    await this.light();
  }

  /**
   * Toggle switched (selection feedback)
   */
  async toggle(): Promise<void> {
    await this.selection();
  }

  /**
   * Slider changed (selection feedback)
   */
  async slider(): Promise<void> {
    await this.selection();
  }

  /**
   * Long press recognized (medium tap)
   */
  async longPress(): Promise<void> {
    await this.medium();
  }

  /**
   * Drag started (soft tap)
   */
  async dragStart(): Promise<void> {
    await this.soft();
  }

  /**
   * Drag ended/dropped (medium tap)
   */
  async dragEnd(): Promise<void> {
    await this.medium();
  }

  /**
   * Refresh triggered (medium tap)
   */
  async refresh(): Promise<void> {
    await this.medium();
  }

  // ============================================================================
  // Complex Patterns
  // ============================================================================

  /**
   * Play a custom haptic pattern
   * @param pattern - Array of [intensity, delayMs] pairs
   */
  async pattern(pattern: Array<[HapticIntensity, number]>): Promise<void> {
    if (!this.isEnabled) return;

    for (const [intensity, delay] of pattern) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      switch (intensity) {
        case "light":
          await this.light();
          break;
        case "medium":
          await this.medium();
          break;
        case "heavy":
          await this.heavy();
          break;
      }
    }
  }

  /**
   * Play notification haptic by type
   */
  async notification(type: HapticNotification): Promise<void> {
    switch (type) {
      case "success":
        await this.success();
        break;
      case "warning":
        await this.warning();
        break;
      case "error":
        await this.error();
        break;
    }
  }

  /**
   * Play chess haptic by type
   */
  async chess(type: ChessHaptic): Promise<void> {
    switch (type) {
      case "move":
        await this.move();
        break;
      case "capture":
        await this.capture();
        break;
      case "check":
        await this.check();
        break;
      case "castle":
        await this.castle();
        break;
      case "promote":
        await this.promote();
        break;
      case "illegal":
        await this.illegal();
        break;
      case "gameStart":
        await this.gameStart();
        break;
      case "gameEnd":
        await this.gameEnd();
        break;
      case "win":
        await this.win();
        break;
      case "lose":
        await this.lose();
        break;
      case "draw":
        await this.draw();
        break;
      case "lowTime":
        await this.lowTime();
        break;
      case "timeout":
        await this.timeout();
        break;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global HapticsManager instance
 */
export const HapticsManager = new HapticsManagerClass();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Light haptic feedback
 */
export function hapticLight(): void {
  HapticsManager.light();
}

/**
 * Medium haptic feedback
 */
export function hapticMedium(): void {
  HapticsManager.medium();
}

/**
 * Heavy haptic feedback
 */
export function hapticHeavy(): void {
  HapticsManager.heavy();
}

/**
 * Selection haptic feedback
 */
export function hapticSelection(): void {
  HapticsManager.selection();
}

/**
 * Success notification haptic
 */
export function hapticSuccess(): void {
  HapticsManager.success();
}

/**
 * Warning notification haptic
 */
export function hapticWarning(): void {
  HapticsManager.warning();
}

/**
 * Error notification haptic
 */
export function hapticError(): void {
  HapticsManager.error();
}

/**
 * Chess move haptic based on move type
 */
export function hapticMove(options?: {
  isCapture?: boolean;
  isCheck?: boolean;
  isCastle?: boolean;
  isPromotion?: boolean;
}): void {
  if (options?.isCheck) {
    HapticsManager.check();
  } else if (options?.isCapture) {
    HapticsManager.capture();
  } else if (options?.isCastle) {
    HapticsManager.castle();
  } else if (options?.isPromotion) {
    HapticsManager.promote();
  } else {
    HapticsManager.move();
  }
}

// ============================================================================
// Default Export
// ============================================================================

export default HapticsManager;
