/**
 * useSyncManager Hook
 *
 * Provides convenient access to sync operations with integrated
 * error handling, toast notifications, and progress tracking.
 *
 * Features:
 * - Unified sync operations with automatic error handling
 * - Toast notifications for sync failures
 * - Progress tracking for multi-step sync operations
 * - Retry functionality with exponential backoff
 * - Type-safe sync data access
 */

import { useCallback, useMemo, useRef } from "react";
import { SyncManager, type SyncDataType, type SyncError } from "@/lib/syncManager";
import { SyncLogger } from "@/lib/syncLogger";
import { useSyncStatus } from "@/contexts/SyncStatusContext";
import { useToast } from "@/components/ToastNotification";

// ============================================================================
// Types
// ============================================================================

export interface SyncOperation<T> {
  execute: () => Promise<T | null>;
  isLoading: boolean;
  error: SyncError | null;
}

export interface UseSyncManagerReturn {
  // Status
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingOperations: number;
  currentOperation: SyncDataType | null;

  // Progress
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };

  // Error state
  error: SyncError | null;
  hasError: boolean;
  clearError: () => void;

  // Sync actions
  syncAll: (options?: { silent?: boolean }) => Promise<void>;
  syncProfile: () => Promise<void>;
  syncBalance: () => Promise<void>;
  retryFailed: () => Promise<void>;

  // Queue management
  enqueue: (
    dataType: SyncDataType,
    payload?: Record<string, unknown>,
    options?: { priority?: "critical" | "high" | "normal" | "low"; maxRetries?: number }
  ) => Promise<string>;

  // Logging
  getRecentLogs: (count?: number) => ReturnType<typeof SyncLogger.getRecentEntries>;
  getLogStats: () => ReturnType<typeof SyncLogger.getStats>;
  exportLogs: () => Promise<string>;
  clearLogs: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSyncManager(): UseSyncManagerReturn {
  const syncStatus = useSyncStatus();
  const toast = useToast();
  const isSyncingRef = useRef(false);

  // Calculate progress percentage
  const progress = useMemo(() => {
    const { total, completed, failed } = syncStatus.syncProgress;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, failed, percentage };
  }, [syncStatus.syncProgress]);

  // Sync all with error handling and toast
  const syncAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      const startTime = Date.now();
      SyncLogger.debug("system", "Starting full sync from hook", { silent: options?.silent });

      try {
        await syncStatus.syncNow();

        if (!options?.silent) {
          // Only show success toast if there were pending operations
          if (syncStatus.pendingOperations > 0) {
            toast.showSuccess("Sync Complete", "All data synchronized successfully");
          }
        }

        SyncLogger.logSyncOperation("system", startTime, true, {
          source: "useSyncManager.syncAll",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to sync data";

        if (!options?.silent) {
          toast.showSyncError(message, async () => {
            await syncAll(options);
          });
        }

        SyncLogger.logSyncOperation("system", startTime, false, {
          source: "useSyncManager.syncAll",
        }, error instanceof Error ? error : String(error));
      } finally {
        isSyncingRef.current = false;
      }
    },
    [syncStatus, toast]
  );

  // Sync profile with error handling
  const syncProfile = useCallback(async () => {
    const startTime = Date.now();
    SyncLogger.debug("profile_sync", "Starting profile sync from hook");

    try {
      await syncStatus.syncProfile();
      SyncLogger.logSyncOperation("profile_sync", startTime, true, {
        source: "useSyncManager.syncProfile",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync profile";
      toast.showSyncError(message, syncProfile);

      SyncLogger.logSyncOperation("profile_sync", startTime, false, {
        source: "useSyncManager.syncProfile",
      }, error instanceof Error ? error : String(error));
    }
  }, [syncStatus, toast]);

  // Sync balance with error handling
  const syncBalance = useCallback(async () => {
    const startTime = Date.now();
    SyncLogger.debug("balance_sync", "Starting balance sync from hook");

    try {
      await syncStatus.syncBalance();
      SyncLogger.logSyncOperation("balance_sync", startTime, true, {
        source: "useSyncManager.syncBalance",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sync balance";
      toast.showSyncError(message, syncBalance);

      SyncLogger.logSyncOperation("balance_sync", startTime, false, {
        source: "useSyncManager.syncBalance",
      }, error instanceof Error ? error : String(error));
    }
  }, [syncStatus, toast]);

  // Retry failed operations
  const retryFailed = useCallback(async () => {
    SyncLogger.info("retry", "Retrying failed operations from hook");

    try {
      await syncStatus.retryFailed();
      toast.showSuccess("Retry Successful", "Failed operations completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed";
      toast.showSyncError(message, retryFailed);
    }
  }, [syncStatus, toast]);

  // Enqueue operation
  const enqueue = useCallback(
    async (
      dataType: SyncDataType,
      payload?: Record<string, unknown>,
      options?: { priority?: "critical" | "high" | "normal" | "low"; maxRetries?: number }
    ): Promise<string> => {
      return SyncManager.enqueue(dataType, payload, options);
    },
    []
  );

  // Logging functions
  const getRecentLogs = useCallback(
    (count?: number) => syncStatus.getRecentLogs(count),
    [syncStatus]
  );

  const getLogStats = useCallback(
    () => syncStatus.getLogStats(),
    [syncStatus]
  );

  const exportLogs = useCallback(
    () => syncStatus.exportLogs(),
    [syncStatus]
  );

  const clearLogs = useCallback(
    () => syncStatus.clearLogs(),
    [syncStatus]
  );

  return {
    // Status
    isOnline: syncStatus.isOnline,
    isSyncing: syncStatus.isSyncing,
    lastSyncAt: syncStatus.lastSyncAt,
    pendingOperations: syncStatus.pendingOperations,
    currentOperation: syncStatus.currentOperation,

    // Progress
    progress,

    // Error state
    error: syncStatus.error,
    hasError: syncStatus.hasError,
    clearError: syncStatus.clearError,

    // Sync actions
    syncAll,
    syncProfile,
    syncBalance,
    retryFailed,

    // Queue management
    enqueue,

    // Logging
    getRecentLogs,
    getLogStats,
    exportLogs,
    clearLogs,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for triggering sync operations on specific events
 */
export function useSyncTrigger() {
  const { syncAll, syncProfile, syncBalance, enqueue } = useSyncManager();

  const onPullToRefresh = useCallback(async () => {
    await syncAll({ silent: false });
  }, [syncAll]);

  const onAppForeground = useCallback(async () => {
    await syncAll({ silent: true });
  }, [syncAll]);

  const onProfileUpdate = useCallback(async () => {
    await syncProfile();
  }, [syncProfile]);

  const onTransactionComplete = useCallback(async () => {
    await syncBalance();
  }, [syncBalance]);

  const scheduleSync = useCallback(
    (dataType: SyncDataType, delay: number = 0) => {
      if (delay > 0) {
        setTimeout(() => {
          enqueue(dataType);
        }, delay);
      } else {
        enqueue(dataType);
      }
    },
    [enqueue]
  );

  return {
    onPullToRefresh,
    onAppForeground,
    onProfileUpdate,
    onTransactionComplete,
    scheduleSync,
  };
}

/**
 * Hook for displaying sync status in UI components
 */
export function useSyncDisplay() {
  const {
    isOnline,
    isSyncing,
    lastSyncAt,
    progress,
    currentOperation,
    error,
  } = useSyncManager();

  const statusText = useMemo(() => {
    if (!isOnline) return "Offline";
    if (isSyncing) {
      if (currentOperation) {
        return `Syncing ${currentOperation}...`;
      }
      return "Syncing...";
    }
    if (error) return "Sync failed";
    if (lastSyncAt) {
      const seconds = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
      if (seconds < 60) return "Just synced";
      if (seconds < 3600) return `Synced ${Math.floor(seconds / 60)}m ago`;
      return `Synced ${Math.floor(seconds / 3600)}h ago`;
    }
    return "Not synced";
  }, [isOnline, isSyncing, lastSyncAt, currentOperation, error]);

  const statusColor = useMemo(() => {
    if (!isOnline) return "#9CA3AF"; // Gray
    if (error) return "#EF4444"; // Red
    if (isSyncing) return "#3B82F6"; // Blue
    return "#10B981"; // Green
  }, [isOnline, isSyncing, error]);

  return {
    isOnline,
    isSyncing,
    lastSyncAt,
    progress,
    currentOperation,
    error,
    statusText,
    statusColor,
  };
}

/**
 * Hook for sync debugging and diagnostics
 */
export function useSyncDebug() {
  const { getRecentLogs, getLogStats, exportLogs, clearLogs } = useSyncManager();

  const getDebugInfo = useCallback(() => {
    const stats = getLogStats();
    const recentErrors = getRecentLogs(10).filter((log) => log.level === "error");

    return {
      stats,
      recentErrors,
      status: SyncManager.getStatus(),
    };
  }, [getRecentLogs, getLogStats]);

  const exportDebugReport = useCallback(async () => {
    const logs = await exportLogs();
    const debugInfo = getDebugInfo();

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        ...debugInfo,
        logs: JSON.parse(logs),
      },
      null,
      2
    );
  }, [exportLogs, getDebugInfo]);

  return {
    getDebugInfo,
    exportDebugReport,
    clearLogs,
    getRecentLogs,
    getLogStats,
  };
}
