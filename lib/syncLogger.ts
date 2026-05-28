/**
 * Sync Logger
 *
 * Comprehensive logging system for sync operations with:
 * - Timestamped entries with millisecond precision
 * - Log levels (debug, info, warn, error)
 * - Operation type categorization
 * - Persistent storage for debugging
 * - Circular buffer to prevent memory issues
 * - Export capability for bug reports
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Types
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export type SyncOperationType =
  | "profile_sync"
  | "balance_sync"
  | "leaderboard_sync"
  | "challenge_sync"
  | "matchmaking_sync"
  | "tournament_sync"
  | "queue_operation"
  | "network_change"
  | "auth_change"
  | "conflict_resolution"
  | "retry"
  | "system";

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  operation: SyncOperationType;
  message: string;
  details?: Record<string, unknown>;
  duration?: number;
  success?: boolean;
  error?: string;
}

export interface SyncLogStats {
  totalEntries: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  averageSyncDuration: number;
  lastSyncAt: string | null;
  oldestEntry: string | null;
  newestEntry: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const SYNC_LOG_STORAGE_KEY = "@treasure_chess_sync_log";
const MAX_LOG_ENTRIES = 500;
const LOG_PERSIST_DEBOUNCE_MS = 2000;

// ============================================================================
// SyncLogger Class
// ============================================================================

class SyncLoggerService {
  private entries: SyncLogEntry[] = [];
  private isInitialized = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(entry: SyncLogEntry) => void> = new Set();
  private enableConsoleOutput = __DEV__;

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const stored = await AsyncStorage.getItem(SYNC_LOG_STORAGE_KEY);
      if (stored) {
        this.entries = JSON.parse(stored);
        // Ensure we don't exceed max entries
        if (this.entries.length > MAX_LOG_ENTRIES) {
          this.entries = this.entries.slice(-MAX_LOG_ENTRIES);
        }
      }
      this.isInitialized = true;
      this.log("info", "system", "Sync logger initialized", {
        existingEntries: this.entries.length,
      });
    } catch (error) {
      console.warn("[SyncLogger] Failed to load log history:", error);
      this.entries = [];
      this.isInitialized = true;
    }
  }

  // --------------------------------------------------------------------------
  // Logging Methods
  // --------------------------------------------------------------------------

  log(
    level: LogLevel,
    operation: SyncOperationType,
    message: string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    const entry: SyncLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level,
      operation,
      message,
      details,
    };

    this.addEntry(entry);
    return entry;
  }

  debug(
    operation: SyncOperationType,
    message: string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    return this.log("debug", operation, message, details);
  }

  info(
    operation: SyncOperationType,
    message: string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    return this.log("info", operation, message, details);
  }

  warn(
    operation: SyncOperationType,
    message: string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    return this.log("warn", operation, message, details);
  }

  error(
    operation: SyncOperationType,
    message: string,
    error?: Error | string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    const entry: SyncLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level: "error",
      operation,
      message,
      error: error instanceof Error ? error.message : error,
      details: {
        ...details,
        stack: error instanceof Error ? error.stack : undefined,
      },
      success: false,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * Log a sync operation with timing
   */
  logSyncOperation(
    operation: SyncOperationType,
    startTime: number,
    success: boolean,
    details?: Record<string, unknown>,
    error?: Error | string
  ): SyncLogEntry {
    const duration = Date.now() - startTime;
    const entry: SyncLogEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      level: success ? "info" : "error",
      operation,
      message: success
        ? `${operation} completed in ${duration}ms`
        : `${operation} failed after ${duration}ms`,
      duration,
      success,
      error: error instanceof Error ? error.message : error,
      details,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * Log a retry attempt
   */
  logRetry(
    operation: SyncOperationType,
    attempt: number,
    maxAttempts: number,
    delay: number,
    reason?: string
  ): SyncLogEntry {
    return this.log("warn", "retry", `Retry ${attempt}/${maxAttempts} for ${operation}`, {
      operation,
      attempt,
      maxAttempts,
      delayMs: delay,
      reason,
    });
  }

  /**
   * Log network state change
   */
  logNetworkChange(
    isOnline: boolean,
    previousState: boolean,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    return this.log(
      "info",
      "network_change",
      isOnline ? "Network connection restored" : "Network connection lost",
      {
        isOnline,
        previousState,
        ...details,
      }
    );
  }

  /**
   * Log auth state change
   */
  logAuthChange(
    event: "login" | "logout" | "refresh",
    userId?: string,
    details?: Record<string, unknown>
  ): SyncLogEntry {
    return this.log("info", "auth_change", `Auth event: ${event}`, {
      event,
      userId: userId ? userId.substring(0, 8) + "..." : undefined,
      ...details,
    });
  }

  /**
   * Log conflict resolution
   */
  logConflictResolution(
    dataType: string,
    strategy: "server_wins" | "client_wins" | "last_write_wins" | "merge",
    conflicts: Array<{ field: string; resolved: unknown }>
  ): SyncLogEntry {
    return this.log("info", "conflict_resolution", `Resolved ${conflicts.length} conflicts in ${dataType}`, {
      dataType,
      strategy,
      conflictCount: conflicts.length,
      fields: conflicts.map((c) => c.field),
    });
  }

  // --------------------------------------------------------------------------
  // Entry Management
  // --------------------------------------------------------------------------

  private addEntry(entry: SyncLogEntry): void {
    this.entries.push(entry);

    // Trim if exceeding max
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries = this.entries.slice(-MAX_LOG_ENTRIES);
    }

    // Console output in development
    if (this.enableConsoleOutput) {
      this.consoleOutput(entry);
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (e) {
        console.warn("[SyncLogger] Listener error:", e);
      }
    });

    // Debounced persist
    this.schedulePersist();
  }

  private consoleOutput(entry: SyncLogEntry): void {
    const prefix = `[Sync:${entry.operation}]`;
    const time = entry.timestamp.split("T")[1].split(".")[0];

    switch (entry.level) {
      case "debug":
        console.debug(`${time} ${prefix}`, entry.message, entry.details || "");
        break;
      case "info":
        console.info(`${time} ${prefix}`, entry.message, entry.details || "");
        break;
      case "warn":
        console.warn(`${time} ${prefix}`, entry.message, entry.details || "");
        break;
      case "error":
        console.error(`${time} ${prefix}`, entry.message, entry.error || "", entry.details || "");
        break;
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persist();
    }, LOG_PERSIST_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_LOG_STORAGE_KEY, JSON.stringify(this.entries));
    } catch (error) {
      console.warn("[SyncLogger] Failed to persist logs:", error);
    }
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  getEntries(options?: {
    level?: LogLevel;
    operation?: SyncOperationType;
    since?: Date;
    limit?: number;
  }): SyncLogEntry[] {
    let filtered = [...this.entries];

    if (options?.level) {
      filtered = filtered.filter((e) => e.level === options.level);
    }

    if (options?.operation) {
      filtered = filtered.filter((e) => e.operation === options.operation);
    }

    if (options?.since) {
      const sinceTime = options.since.getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  getRecentEntries(count: number = 50): SyncLogEntry[] {
    return this.entries.slice(-count);
  }

  getErrors(since?: Date): SyncLogEntry[] {
    return this.getEntries({ level: "error", since });
  }

  getStats(): SyncLogStats {
    const errors = this.entries.filter((e) => e.level === "error");
    const warnings = this.entries.filter((e) => e.level === "warn");
    const successful = this.entries.filter((e) => e.success === true);
    const withDuration = this.entries.filter((e) => e.duration !== undefined);

    const avgDuration =
      withDuration.length > 0
        ? withDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / withDuration.length
        : 0;

    const syncEntries = this.entries.filter(
      (e) => e.operation.endsWith("_sync") && e.success
    );
    const lastSync = syncEntries.length > 0 ? syncEntries[syncEntries.length - 1] : null;

    return {
      totalEntries: this.entries.length,
      successCount: successful.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      averageSyncDuration: Math.round(avgDuration),
      lastSyncAt: lastSync?.timestamp || null,
      oldestEntry: this.entries[0]?.timestamp || null,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp || null,
    };
  }

  // --------------------------------------------------------------------------
  // Subscription
  // --------------------------------------------------------------------------

  subscribe(callback: (entry: SyncLogEntry) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // --------------------------------------------------------------------------
  // Export & Clear
  // --------------------------------------------------------------------------

  async exportLogs(): Promise<string> {
    const stats = this.getStats();
    const exportData = {
      exportedAt: new Date().toISOString(),
      stats,
      entries: this.entries,
    };

    return JSON.stringify(exportData, null, 2);
  }

  async clearLogs(): Promise<void> {
    this.entries = [];
    await AsyncStorage.removeItem(SYNC_LOG_STORAGE_KEY);
    this.log("info", "system", "Sync logs cleared");
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  setConsoleOutput(enabled: boolean): void {
    this.enableConsoleOutput = enabled;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const SyncLogger = new SyncLoggerService();

// ============================================================================
// Convenience Functions
// ============================================================================

export function logSync(
  operation: SyncOperationType,
  message: string,
  details?: Record<string, unknown>
): SyncLogEntry {
  return SyncLogger.info(operation, message, details);
}

export function logSyncError(
  operation: SyncOperationType,
  message: string,
  error?: Error | string,
  details?: Record<string, unknown>
): SyncLogEntry {
  return SyncLogger.error(operation, message, error, details);
}

export function logSyncTiming(
  operation: SyncOperationType,
  startTime: number,
  success: boolean,
  details?: Record<string, unknown>,
  error?: Error | string
): SyncLogEntry {
  return SyncLogger.logSyncOperation(operation, startTime, success, details, error);
}
