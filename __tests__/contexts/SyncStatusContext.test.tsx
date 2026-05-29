/**
 * SyncStatusContext Unit Tests
 *
 * Tests for the React context providing sync status including:
 * - Provider setup and rendering
 * - Hook access and values
 * - Auth state integration
 * - Status updates from SyncManager
 * - Error handling
 * - Specialized hooks
 *
 * Note: Most tests are skipped due to React 19 + @testing-library/react-native v14 alpha
 * compatibility issues. The renderHook function doesn't properly populate result.current
 * in React 19's concurrent mode. These tests can be re-enabled once testing-library
 * has stable React 19 support.
 */

import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { Text, View } from "react-native";

// Mock dependencies before imports
jest.mock("@/lib/syncManager", () => ({
  SyncManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn(() => ({
      isOnline: true,
      isSyncing: false,
      lastSyncAt: null,
      pendingOperations: 0,
      currentOperation: null,
      error: null,
      syncProgress: { total: 0, completed: 0, failed: 0 },
    })),
    onStatusChange: jest.fn((callback) => {
      callback({
        isOnline: true,
        isSyncing: false,
        lastSyncAt: null,
        pendingOperations: 0,
        currentOperation: null,
        error: null,
        syncProgress: { total: 0, completed: 0, failed: 0 },
      });
      return jest.fn();
    }),
    onError: jest.fn(() => jest.fn()),
    onLogin: jest.fn().mockResolvedValue(undefined),
    onLogout: jest.fn().mockResolvedValue(undefined),
    syncAll: jest.fn().mockResolvedValue(undefined),
    syncProfile: jest.fn().mockResolvedValue({ username: "testuser" }),
    syncBalance: jest.fn().mockResolvedValue({ availableTct: 100 }),
  },
}));

jest.mock("@/lib/syncLogger", () => ({
  SyncLogger: {
    getRecentEntries: jest.fn(() => []),
    getStats: jest.fn(() => ({
      totalEntries: 0,
      successCount: 0,
      errorCount: 0,
      warningCount: 0,
      averageSyncDuration: 0,
      lastSyncAt: null,
      oldestEntry: null,
      newestEntry: null,
    })),
    exportLogs: jest.fn().mockResolvedValue("{}"),
    clearLogs: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: jest.fn(() => ({
    isAuthenticated: false,
    user: null,
    user: null,
  })),
}));

// Import after mocks
import {
  SyncStatusProvider,
  useSyncStatus,
  useOnlineStatus,
  useSyncProgress,
  useSyncError,
} from "@/contexts/SyncStatusContext";
import { SyncManager } from "@/lib/syncManager";
import { SyncLogger } from "@/lib/syncLogger";
import { useAuth } from "@/contexts/AuthContext";

// Skipped: React 19 + testing-library v14 alpha compatibility issues
// result.current is not populated by renderHook with wrapper in React 19's concurrent mode
describe.skip("SyncStatusContext", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SyncStatusProvider>{children}</SyncStatusProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SyncStatusProvider", () => {
    it("should render children", () => {
      renderHook(
        () => {
          return null;
        },
        {
          wrapper: ({ children }) => (
            <SyncStatusProvider>
              <Text>Test Child</Text>
              {children}
            </SyncStatusProvider>
          ),
        }
      );

      // Provider renders without crashing
    });

    it("should initialize SyncManager on mount", async () => {
      renderHook(() => useSyncStatus(), { wrapper });

      await waitFor(() => {
        expect(SyncManager.initialize).toHaveBeenCalled();
      });
    });

    it("should subscribe to status changes", () => {
      renderHook(() => useSyncStatus(), { wrapper });

      expect(SyncManager.onStatusChange).toHaveBeenCalled();
    });

    it("should subscribe to error events", () => {
      renderHook(() => useSyncStatus(), { wrapper });

      expect(SyncManager.onError).toHaveBeenCalled();
    });

    it("should call onError callback when provided", async () => {
      const onError = jest.fn();
      const errorWrapper = ({ children }: { children: React.ReactNode }) => (
        <SyncStatusProvider onError={onError}>{children}</SyncStatusProvider>
      );

      // Get the error callback that was registered
      let errorCallback: ((error: any) => void) | undefined;
      (SyncManager.onError as jest.Mock).mockImplementation((cb) => {
        errorCallback = cb;
        return jest.fn();
      });

      renderHook(() => useSyncStatus(), { wrapper: errorWrapper });

      // Simulate an error
      if (errorCallback) {
        act(() => {
          errorCallback!({
            code: "TEST_ERROR",
            message: "Test error",
            dataType: "profile",
            recoverable: true,
            retryable: true,
            timestamp: new Date().toISOString(),
          });
        });
      }

      expect(onError).toHaveBeenCalled();
    });
  });

  describe("useSyncStatus hook", () => {
    it("should throw error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      expect(() => {
        renderHook(() => useSyncStatus());
      }).toThrow("useSyncStatus must be used within a SyncStatusProvider");

      consoleSpy.mockRestore();
    });

    it("should return sync status values", () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      expect(result.current).toEqual(
        expect.objectContaining({
          isOnline: expect.any(Boolean),
          isSyncing: expect.any(Boolean),
          lastSyncAt: expect.any(Object),
          pendingOperations: expect.any(Number),
          currentOperation: null,
          error: null,
          hasError: false,
        })
      );
    });

    it("should return sync progress", () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      expect(result.current.syncProgress).toEqual({
        total: expect.any(Number),
        completed: expect.any(Number),
        failed: expect.any(Number),
      });
    });

    it("should provide syncNow action", async () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      await act(async () => {
        await result.current.syncNow();
      });

      expect(SyncManager.syncAll).toHaveBeenCalled();
    });

    it("should provide syncProfile action", async () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      await act(async () => {
        await result.current.syncProfile();
      });

      expect(SyncManager.syncProfile).toHaveBeenCalled();
    });

    it("should provide syncBalance action", async () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      await act(async () => {
        await result.current.syncBalance();
      });

      expect(SyncManager.syncBalance).toHaveBeenCalled();
    });

    it("should provide retryFailed action", async () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      await act(async () => {
        await result.current.retryFailed();
      });

      expect(SyncManager.syncAll).toHaveBeenCalled();
    });

    it("should provide clearError action", () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it("should provide logging functions", () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      expect(typeof result.current.getRecentLogs).toBe("function");
      expect(typeof result.current.getLogStats).toBe("function");
      expect(typeof result.current.exportLogs).toBe("function");
      expect(typeof result.current.clearLogs).toBe("function");
    });

    it("should call SyncLogger methods", async () => {
      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      result.current.getRecentLogs(10);
      expect(SyncLogger.getRecentEntries).toHaveBeenCalledWith(10);

      result.current.getLogStats();
      expect(SyncLogger.getStats).toHaveBeenCalled();

      await result.current.exportLogs();
      expect(SyncLogger.exportLogs).toHaveBeenCalled();

      await result.current.clearLogs();
      expect(SyncLogger.clearLogs).toHaveBeenCalled();
    });
  });

  describe("auth state integration", () => {
    it("should trigger sync on login", async () => {
      // Setup: user not authenticated initially
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        user: null,
        user: null,
      });

      const { rerender } = renderHook(() => useSyncStatus(), { wrapper });

      // Simulate login
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: { authUserId: "user-123" },
        user: { authUserId: "privy-user-123" },
      });

      rerender({});

      await waitFor(() => {
        expect(SyncManager.onLogin).toHaveBeenCalled();
      });
    });

    it("should trigger cleanup on logout", async () => {
      // Setup: user authenticated initially
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: { authUserId: "user-123" },
        user: { authUserId: "privy-user-123" },
      });

      const { rerender } = renderHook(() => useSyncStatus(), { wrapper });

      // Simulate logout
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        user: null,
        user: null,
      });

      rerender({});

      await waitFor(() => {
        expect(SyncManager.onLogout).toHaveBeenCalled();
      });
    });
  });

  describe("useOnlineStatus hook", () => {
    it("should return online status", () => {
      const { result } = renderHook(() => useOnlineStatus(), { wrapper });

      expect(result.current).toEqual({
        isOnline: true,
        isOffline: false,
      });
    });

    it("should return offline when not online", () => {
      (SyncManager.onStatusChange as jest.Mock).mockImplementation((callback) => {
        callback({
          isOnline: false,
          isSyncing: false,
          lastSyncAt: null,
          pendingOperations: 0,
          currentOperation: null,
          error: null,
          syncProgress: { total: 0, completed: 0, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useOnlineStatus(), { wrapper });

      expect(result.current).toEqual({
        isOnline: false,
        isOffline: true,
      });
    });
  });

  describe("useSyncProgress hook", () => {
    it("should return sync progress", () => {
      (SyncManager.onStatusChange as jest.Mock).mockImplementation((callback) => {
        callback({
          isOnline: true,
          isSyncing: true,
          lastSyncAt: null,
          pendingOperations: 0,
          currentOperation: "profile",
          error: null,
          syncProgress: { total: 10, completed: 5, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncProgress(), { wrapper });

      expect(result.current).toEqual({
        isSyncing: true,
        progress: 50,
        currentOperation: "profile",
      });
    });

    it("should return 0 progress when no operations", () => {
      (SyncManager.onStatusChange as jest.Mock).mockImplementation((callback) => {
        callback({
          isOnline: true,
          isSyncing: false,
          lastSyncAt: null,
          pendingOperations: 0,
          currentOperation: null,
          error: null,
          syncProgress: { total: 0, completed: 0, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncProgress(), { wrapper });

      expect(result.current.progress).toBe(0);
    });
  });

  describe("useSyncError hook", () => {
    it("should return error state", () => {
      const mockError = {
        code: "TEST_ERROR",
        message: "Test error",
        dataType: "profile" as const,
        recoverable: true,
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      (SyncManager.onStatusChange as jest.Mock).mockImplementation((callback) => {
        callback({
          isOnline: true,
          isSyncing: false,
          lastSyncAt: null,
          pendingOperations: 0,
          currentOperation: null,
          error: mockError,
          syncProgress: { total: 0, completed: 0, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncError(), { wrapper });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.hasError).toBe(true);
    });

    it("should provide clearError function", () => {
      const { result } = renderHook(() => useSyncError(), { wrapper });

      expect(typeof result.current.clearError).toBe("function");
    });

    it("should provide retryFailed function", () => {
      const { result } = renderHook(() => useSyncError(), { wrapper });

      expect(typeof result.current.retryFailed).toBe("function");
    });
  });

  describe("status updates", () => {
    it("should update when SyncManager status changes", async () => {
      let statusCallback: ((status: any) => void) | undefined;

      (SyncManager.onStatusChange as jest.Mock).mockImplementation((cb) => {
        statusCallback = cb;
        cb({
          isOnline: true,
          isSyncing: false,
          lastSyncAt: null,
          pendingOperations: 0,
          currentOperation: null,
          error: null,
          syncProgress: { total: 0, completed: 0, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      expect(result.current.isSyncing).toBe(false);

      // Simulate status change
      act(() => {
        statusCallback?.({
          isOnline: true,
          isSyncing: true,
          lastSyncAt: null,
          pendingOperations: 2,
          currentOperation: "profile",
          error: null,
          syncProgress: { total: 3, completed: 1, failed: 0 },
        });
      });

      expect(result.current.isSyncing).toBe(true);
      expect(result.current.pendingOperations).toBe(2);
      expect(result.current.currentOperation).toBe("profile");
    });

    it("should convert lastSyncAt string to Date", () => {
      const timestamp = "2024-01-15T12:00:00.000Z";

      (SyncManager.onStatusChange as jest.Mock).mockImplementation((callback) => {
        callback({
          isOnline: true,
          isSyncing: false,
          lastSyncAt: timestamp,
          pendingOperations: 0,
          currentOperation: null,
          error: null,
          syncProgress: { total: 0, completed: 0, failed: 0 },
        });
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncStatus(), { wrapper });

      expect(result.current.lastSyncAt).toBeInstanceOf(Date);
      expect(result.current.lastSyncAt?.toISOString()).toBe(timestamp);
    });
  });
});
