/**
 * useBiometricAuth Test Suite
 *
 * Tests for biometric authentication hook including:
 * - Availability detection
 * - Enable/disable functionality
 * - Authentication flow
 *
 * Note: Most tests are skipped due to React 19 + @testing-library/react-native v14 alpha
 * compatibility issues. The renderHook function doesn't properly populate result.current
 * in React 19's concurrent mode. These tests can be re-enabled once testing-library
 * has stable React 19 support.
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useBiometricAuth, getBiometricTypeName } from "@/hooks/useBiometricAuth";

// ============================================================================
// Mocks
// ============================================================================

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED: "WHEN_UNLOCKED",
}));

// ============================================================================
// Tests
// ============================================================================

// Skipped: React 19 + testing-library v14 alpha compatibility issues
// result.current is not populated by renderHook in React 19's concurrent mode
describe.skip("useBiometricAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Availability Detection", () => {
    it("should detect when biometric hardware is not available", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isBiometricAvailable).toBe(false);
      expect(result.current.biometricType).toBe("none");
    });

    it("should detect when biometrics are not enrolled", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isBiometricAvailable).toBe(false);
    });

    it("should detect Face ID when available", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isBiometricAvailable).toBe(true);
      expect(result.current.biometricType).toBe("face_id");
    });

    it("should detect Touch ID/Fingerprint when available", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      ]);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isBiometricAvailable).toBe(true);
      // On iOS it would be "touch_id", on Android "fingerprint"
      expect(["touch_id", "fingerprint"]).toContain(result.current.biometricType);
    });
  });

  describe("Enable Biometric", () => {
    beforeEach(() => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    });

    it("should enable biometric after successful authentication", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let enableResult: boolean;
      await act(async () => {
        enableResult = await result.current.enableBiometric("test-user-id");
      });

      expect(enableResult!).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "@treasure_chess_biometric_token",
        "test-user-id",
        expect.any(Object)
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "@treasure_chess_biometric_enabled",
        "true"
      );
      expect(result.current.isBiometricEnabled).toBe(true);
    });

    it("should not enable biometric if user cancels", async () => {
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "user_cancel",
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let enableResult: boolean;
      await act(async () => {
        enableResult = await result.current.enableBiometric("test-user-id");
      });

      expect(enableResult!).toBe(false);
      expect(result.current.isBiometricEnabled).toBe(false);
    });

    it("should return false when biometric not available", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let enableResult: boolean;
      await act(async () => {
        enableResult = await result.current.enableBiometric("test-user-id");
      });

      expect(enableResult!).toBe(false);
    });
  });

  describe("Disable Biometric", () => {
    it("should clear stored tokens when disabling", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("true");

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.disableBiometric();
      });

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "@treasure_chess_biometric_token"
      );
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "@treasure_chess_biometric_enabled"
      );
      expect(result.current.isBiometricEnabled).toBe(false);
    });
  });

  describe("Authenticate", () => {
    beforeEach(() => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);
    });

    it("should return success and userId on successful authentication", async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "@treasure_chess_biometric_enabled") return Promise.resolve("true");
        if (key === "@treasure_chess_biometric_token")
          return Promise.resolve("stored-user-id");
        return Promise.resolve(null);
      });
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: true,
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let authResult: { success: boolean; userId: string | null };
      await act(async () => {
        authResult = await result.current.authenticateWithBiometric();
      });

      expect(authResult!.success).toBe(true);
      expect(authResult!.userId).toBe("stored-user-id");
    });

    it("should return failure when authentication fails", async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key) => {
        if (key === "@treasure_chess_biometric_enabled") return Promise.resolve("true");
        if (key === "@treasure_chess_biometric_token")
          return Promise.resolve("stored-user-id");
        return Promise.resolve(null);
      });
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({
        success: false,
        error: "authentication_failed",
      });

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let authResult: { success: boolean; userId: string | null };
      await act(async () => {
        authResult = await result.current.authenticateWithBiometric();
      });

      expect(authResult!.success).toBe(false);
      expect(authResult!.userId).toBeNull();
    });

    it("should return failure when biometric not enabled", async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let authResult: { success: boolean; userId: string | null };
      await act(async () => {
        authResult = await result.current.authenticateWithBiometric();
      });

      expect(authResult!.success).toBe(false);
      expect(authResult!.userId).toBeNull();
    });
  });

  describe("Check Enrolled", () => {
    it("should return true when biometrics are enrolled", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock).mockResolvedValue(
        []
      );
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let isEnrolled: boolean;
      await act(async () => {
        isEnrolled = await result.current.checkBiometricEnrolled();
      });

      expect(isEnrolled!).toBe(true);
    });

    it("should return false when biometrics are not enrolled", async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);

      const { result } = renderHook(() => useBiometricAuth());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let isEnrolled: boolean;
      await act(async () => {
        isEnrolled = await result.current.checkBiometricEnrolled();
      });

      expect(isEnrolled!).toBe(false);
    });
  });
});

describe("getBiometricTypeName", () => {
  it("should return correct names for each type", () => {
    expect(getBiometricTypeName("face_id")).toBe("Face ID");
    expect(getBiometricTypeName("touch_id")).toBe("Touch ID");
    expect(getBiometricTypeName("fingerprint")).toBe("Fingerprint");
    expect(getBiometricTypeName("iris")).toBe("Iris");
    expect(getBiometricTypeName("none")).toBe("Biometric");
  });
});
