/**
 * useBiometricAuth - Biometric Authentication Hook
 *
 * Provides Face ID / Touch ID authentication support for returning users.
 *
 * Features:
 * - Check biometric availability (Face ID, Touch ID, Fingerprint)
 * - Secure token storage with expo-secure-store
 * - Enable/disable biometric login preference
 * - Authenticate using biometrics on app launch
 *
 * Usage:
 * ```tsx
 * const {
 *   isBiometricAvailable,
 *   biometricType,
 *   isBiometricEnabled,
 *   enableBiometric,
 *   disableBiometric,
 *   authenticateWithBiometric,
 * } = useBiometricAuth();
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ============================================================================
// Constants
// ============================================================================

const BIOMETRIC_ENABLED_KEY = "@treasure_chess_biometric_enabled";
const BIOMETRIC_TOKEN_KEY = "@treasure_chess_biometric_token";

// ============================================================================
// Types
// ============================================================================

export type BiometricType =
  | "face_id"
  | "touch_id"
  | "fingerprint"
  | "iris"
  | "none";

export interface BiometricAuthState {
  /** Whether device supports biometrics */
  isBiometricAvailable: boolean;
  /** Type of biometric available (Face ID, Touch ID, etc.) */
  biometricType: BiometricType;
  /** Whether user has enabled biometric login */
  isBiometricEnabled: boolean;
  /** Whether we're checking biometric availability */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

export interface BiometricAuthActions {
  /** Enable biometric authentication for this user */
  enableBiometric: (userId: string) => Promise<boolean>;
  /** Disable biometric authentication */
  disableBiometric: () => Promise<void>;
  /** Authenticate using biometrics */
  authenticateWithBiometric: () => Promise<{ success: boolean; userId: string | null }>;
  /** Check if biometric is enrolled */
  checkBiometricEnrolled: () => Promise<boolean>;
}

export type UseBiometricAuthReturn = BiometricAuthState & BiometricAuthActions;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map expo-local-authentication type to our BiometricType
 */
function mapBiometricType(
  types: LocalAuthentication.AuthenticationType[]
): BiometricType {
  if (types.length === 0) return "none";

  // Check for facial recognition
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === "ios" ? "face_id" : "face_id";
  }

  // Check for fingerprint
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === "ios" ? "touch_id" : "fingerprint";
  }

  // Check for iris (Android only)
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "iris";
  }

  return "none";
}

/**
 * Get user-friendly biometric type name
 */
export function getBiometricTypeName(type: BiometricType): string {
  switch (type) {
    case "face_id":
      return "Face ID";
    case "touch_id":
      return "Touch ID";
    case "fingerprint":
      return "Fingerprint";
    case "iris":
      return "Iris";
    default:
      return "Biometric";
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useBiometricAuth(): UseBiometricAuthReturn {
  const [state, setState] = useState<BiometricAuthState>({
    isBiometricAvailable: false,
    biometricType: "none",
    isBiometricEnabled: false,
    isLoading: true,
    error: null,
  });

  // -------------------------------------------------------------------------
  // Initialize - Check biometric availability
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      try {
        // Check if hardware supports biometrics
        const hasHardware = await LocalAuthentication.hasHardwareAsync();

        if (!hasHardware) {
          setState((s) => ({
            ...s,
            isBiometricAvailable: false,
            biometricType: "none",
            isLoading: false,
          }));
          return;
        }

        // Check if biometrics are enrolled
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!isEnrolled) {
          setState((s) => ({
            ...s,
            isBiometricAvailable: false,
            biometricType: "none",
            isLoading: false,
          }));
          return;
        }

        // Get available biometric types
        const supportedTypes =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        const biometricType = mapBiometricType(supportedTypes);

        // Check if user has enabled biometric auth
        const enabledValue = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        const isBiometricEnabled = enabledValue === "true";

        setState({
          isBiometricAvailable: true,
          biometricType,
          isBiometricEnabled,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        console.error("[useBiometricAuth] Init error:", error);
        setState((s) => ({
          ...s,
          isBiometricAvailable: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to check biometrics",
        }));
      }
    }

    init();
  }, []);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Enable biometric authentication for a user
   * Stores their user ID securely for biometric login
   */
  const enableBiometric = useCallback(async (userId: string): Promise<boolean> => {
    if (!state.isBiometricAvailable) {
      setState((s) => ({
        ...s,
        error: "Biometric authentication is not available on this device",
      }));
      return false;
    }

    try {
      // Verify user can authenticate with biometrics
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${getBiometricTypeName(state.biometricType)}`,
        fallbackLabel: "Use Passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setState((s) => ({
          ...s,
          error: result.error === "user_cancel" ? null : "Authentication failed",
        }));
        return false;
      }

      // Store user ID securely
      await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, userId, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      // Mark biometric as enabled
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");

      setState((s) => ({
        ...s,
        isBiometricEnabled: true,
        error: null,
      }));

      return true;
    } catch (error) {
      console.error("[useBiometricAuth] Enable error:", error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : "Failed to enable biometric",
      }));
      return false;
    }
  }, [state.isBiometricAvailable, state.biometricType]);

  /**
   * Disable biometric authentication
   */
  const disableBiometric = useCallback(async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
      await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);

      setState((s) => ({
        ...s,
        isBiometricEnabled: false,
        error: null,
      }));
    } catch (error) {
      console.error("[useBiometricAuth] Disable error:", error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : "Failed to disable biometric",
      }));
    }
  }, []);

  /**
   * Authenticate using biometrics
   * Returns user ID if successful
   */
  const authenticateWithBiometric = useCallback(async (): Promise<{
    success: boolean;
    userId: string | null;
  }> => {
    if (!state.isBiometricAvailable || !state.isBiometricEnabled) {
      return { success: false, userId: null };
    }

    try {
      // Check if we have a stored token
      const storedUserId = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);

      if (!storedUserId) {
        setState((s) => ({
          ...s,
          isBiometricEnabled: false,
        }));
        return { success: false, userId: null };
      }

      // Authenticate with biometrics
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in with ${getBiometricTypeName(state.biometricType)}`,
        fallbackLabel: "Use Passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        if (result.error !== "user_cancel") {
          setState((s) => ({
            ...s,
            error: "Authentication failed",
          }));
        }
        return { success: false, userId: null };
      }

      setState((s) => ({ ...s, error: null }));
      return { success: true, userId: storedUserId };
    } catch (error) {
      console.error("[useBiometricAuth] Auth error:", error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : "Authentication failed",
      }));
      return { success: false, userId: null };
    }
  }, [state.isBiometricAvailable, state.isBiometricEnabled, state.biometricType]);

  /**
   * Check if biometrics are enrolled on the device
   */
  const checkBiometricEnrolled = useCallback(async (): Promise<boolean> => {
    try {
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      return isEnrolled;
    } catch (error) {
      console.error("[useBiometricAuth] Check enrolled error:", error);
      return false;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    ...state,
    enableBiometric,
    disableBiometric,
    authenticateWithBiometric,
    checkBiometricEnrolled,
  };
}

export default useBiometricAuth;
