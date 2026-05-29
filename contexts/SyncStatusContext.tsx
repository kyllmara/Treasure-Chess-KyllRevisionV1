/**
 * Sync Status Context
 *
 * Provides global sync status to all components throughout the app.
 *
 * Features:
 * - Global sync state (isSyncing, isOnline, lastSyncAt, etc.)
 * - Error state with automatic toast notifications
 * - Sync actions (syncNow, retryFailed, clearError)
 * - Integration with SyncManager
 * - Auth state integration for automatic sync on login/logout
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  SyncManager,
  type SyncStatus,
  type SyncError,
  type SyncDataType,
} from "@/lib/syncManager";
import { SyncLogger, type SyncLogEntry, type SyncLogStats } from "@/lib/syncLogger";
import { useAuth } from "@/contexts/AuthContext";

// ============================================================================
// Types
// ============================================================================

export interface SyncStatusContextType {
  // Status
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingOperations: number;
  currentOperation: SyncDataType | null;

  // Progress
  syncProgress: {
    total: number;
    completed: number;
    failed: number;
  };

  // Errors
  error: SyncError | null;
  hasError: boolean;

  // Actions
  syncNow: () => Promise<void>;
  syncProfile: () => Promise<void>;
  syncBalance: () => Promise<void>;
  retryFailed: () => Promise<void>;
  clearError: () => void;

  // Logging
  getRecentLogs: (count?: number) => SyncLogEntry[];
  getLogStats: () => SyncLogStats;
  exportLogs: () => Promise<string>;
  clearLogs: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const SyncStatusContext = createContext<SyncStatusContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SyncStatusProviderProps {
  children: React.ReactNode;
  onError?: (error: SyncError) => void;
}

export function SyncStatusProvider({
  children,
  onError,
}: SyncStatusProviderProps) {
  const { isAuthenticated, user } = useAuth();
  const previousAuthState = useRef<boolean>(false);

  // State
  const [status, setStatus] = useState<SyncStatus>(() => SyncManager.getStatus());
  const [error, setError] = useState<SyncError | null>(null);

  // --------------------------------------------------------------------------
  // Initialize SyncManager
  // --------------------------------------------------------------------------

  useEffect(() => {
    const userId = user?.authUserId;

    async function init() {
      await SyncManager.initialize(userId);
    }

    init();

    return () => {
      // Don't cleanup on unmount - the manager should persist
    };
  }, []);

  // --------------------------------------------------------------------------
  // Auth State Integration
  // --------------------------------------------------------------------------

  useEffect(() => {
    const wasAuthenticated = previousAuthState.current;
    previousAuthState.current = isAuthenticated;

    const userId = user?.authUserId;

    if (!wasAuthenticated && isAuthenticated && userId) {
      // User logged in - trigger sync
      SyncManager.onLogin(userId);
    } else if (wasAuthenticated && !isAuthenticated) {
      // User logged out - cleanup
      SyncManager.onLogout();
    }
  }, [isAuthenticated, user?.authUserId]);

  // --------------------------------------------------------------------------
  // Subscribe to SyncManager
  // --------------------------------------------------------------------------

  useEffect(() => {
    const unsubStatus = SyncManager.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    const unsubError = SyncManager.onError((syncError) => {
      setError(syncError);
      onError?.(syncError);
    });

    return () => {
      unsubStatus();
      unsubError();
    };
  }, [onError]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const syncNow = useCallback(async () => {
    setError(null);
    await SyncManager.syncAll();
  }, []);

  const syncProfile = useCallback(async () => {
    setError(null);
    await SyncManager.syncProfile();
  }, []);

  const syncBalance = useCallback(async () => {
    setError(null);
    await SyncManager.syncBalance();
  }, []);

  const retryFailed = useCallback(async () => {
    setError(null);
    await SyncManager.syncAll();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // --------------------------------------------------------------------------
  // Logging
  // --------------------------------------------------------------------------

  const getRecentLogs = useCallback((count: number = 50) => {
    return SyncLogger.getRecentEntries(count);
  }, []);

  const getLogStats = useCallback(() => {
    return SyncLogger.getStats();
  }, []);

  const exportLogs = useCallback(async () => {
    return SyncLogger.exportLogs();
  }, []);

  const clearLogs = useCallback(async () => {
    return SyncLogger.clearLogs();
  }, []);

  // --------------------------------------------------------------------------
  // Context Value
  // --------------------------------------------------------------------------

  const value = useMemo<SyncStatusContextType>(
    () => ({
      // Status
      isOnline: status.isOnline,
      isSyncing: status.isSyncing,
      lastSyncAt: status.lastSyncAt ? new Date(status.lastSyncAt) : null,
      pendingOperations: status.pendingOperations,
      currentOperation: status.currentOperation,

      // Progress
      syncProgress: status.syncProgress,

      // Errors
      error,
      hasError: !!error,

      // Actions
      syncNow,
      syncProfile,
      syncBalance,
      retryFailed,
      clearError,

      // Logging
      getRecentLogs,
      getLogStats,
      exportLogs,
      clearLogs,
    }),
    [
      status,
      error,
      syncNow,
      syncProfile,
      syncBalance,
      retryFailed,
      clearError,
      getRecentLogs,
      getLogStats,
      exportLogs,
      clearLogs,
    ]
  );

  return (
    <SyncStatusContext.Provider value={value}>
      {children}
    </SyncStatusContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access sync status throughout the app
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isSyncing, isOnline, syncNow, error } = useSyncStatus();
 *
 *   return (
 *     <View>
 *       {!isOnline && <Text>You're offline</Text>}
 *       {isSyncing && <ActivityIndicator />}
 *       {error && <Text>Error: {error.message}</Text>}
 *       <Button onPress={syncNow} title="Sync Now" />
 *     </View>
 *   );
 * }
 * ```
 */
export function useSyncStatus(): SyncStatusContextType {
  const context = useContext(SyncStatusContext);

  if (!context) {
    throw new Error(
      "useSyncStatus must be used within a SyncStatusProvider. " +
      "Make sure your component is wrapped with <SyncStatusProvider>."
    );
  }

  return context;
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for just online/offline status
 */
export function useOnlineStatus(): {
  isOnline: boolean;
  isOffline: boolean;
} {
  const { isOnline } = useSyncStatus();
  return { isOnline, isOffline: !isOnline };
}

/**
 * Hook for sync progress tracking
 */
export function useSyncProgress(): {
  isSyncing: boolean;
  progress: number;
  currentOperation: SyncDataType | null;
} {
  const { isSyncing, syncProgress, currentOperation } = useSyncStatus();

  const progress =
    syncProgress.total > 0
      ? Math.round((syncProgress.completed / syncProgress.total) * 100)
      : 0;

  return { isSyncing, progress, currentOperation };
}

/**
 * Hook for sync error handling
 */
export function useSyncError(): {
  error: SyncError | null;
  hasError: boolean;
  clearError: () => void;
  retryFailed: () => Promise<void>;
} {
  const { error, hasError, clearError, retryFailed } = useSyncStatus();
  return { error, hasError, clearError, retryFailed };
}

// ============================================================================
// Re-exports
// ============================================================================

export type { SyncStatus, SyncError, SyncDataType };
