/**
 * Sync Manager
 *
 * Central coordinator for all data synchronization operations.
 *
 * Features:
 * - Unified sync status across profile, wallet, leaderboard, etc.
 * - Sync queue with priority-based execution
 * - Exponential backoff retry with configurable max attempts
 * - Network-aware sync triggering
 * - Auth state integration (sync on login, cleanup on logout)
 * - Conflict resolution strategies per data type
 * - Global error handling with toast notifications
 * - Comprehensive logging for debugging
 */

import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { profileSyncService, type SyncableProfile, type SyncableBalance } from "./profileSync";
import { NetworkMonitor } from "./networkMonitor";
import { SyncLogger, type SyncOperationType } from "./syncLogger";
import { clearLeaderboardCache } from "./leaderboard";
import { supabase, isSupabaseConfigured } from "./supabase";

// ============================================================================
// Types
// ============================================================================

export type SyncDataType =
  | "profile"
  | "balance"
  | "leaderboard"
  | "challenges"
  | "matchmaking"
  | "tournaments"
  | "settings";

export type ConflictStrategy = "server_wins" | "client_wins" | "last_write_wins" | "merge";

export interface SyncOperation {
  id: string;
  dataType: SyncDataType;
  priority: "critical" | "high" | "normal" | "low";
  payload?: unknown;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface SyncOperationProgress {
  dataType: SyncDataType;
  status: "pending" | "in_progress" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingOperations: number;
  currentOperation: SyncDataType | null;
  error: SyncError | null;
  syncProgress: {
    total: number;
    completed: number;
    failed: number;
  };
  operationProgress: Map<SyncDataType, SyncOperationProgress>;
}

export interface SyncError {
  code: string;
  message: string;
  dataType: SyncDataType;
  recoverable: boolean;
  retryable: boolean;
  timestamp: string;
}

export interface SyncConfig {
  autoSyncOnNetworkRestore: boolean;
  autoSyncOnAppForeground: boolean;
  backgroundSyncIntervalMs: number;
  maxRetries: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  conflictStrategies: Record<SyncDataType, ConflictStrategy>;
}

type SyncStatusCallback = (status: SyncStatus) => void;
type SyncErrorCallback = (error: SyncError) => void;

// ============================================================================
// Constants
// ============================================================================

const SYNC_QUEUE_STORAGE_KEY = "@treasure_chess_sync_queue";
const SYNC_STATUS_STORAGE_KEY = "@treasure_chess_sync_status";

const DEFAULT_CONFIG: SyncConfig = {
  autoSyncOnNetworkRestore: true,
  autoSyncOnAppForeground: true,
  backgroundSyncIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxRetries: 5,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 32000, // ~32 seconds max
  conflictStrategies: {
    profile: "merge",
    balance: "server_wins", // Financial data always server-authoritative
    leaderboard: "server_wins",
    challenges: "server_wins",
    matchmaking: "server_wins",
    tournaments: "server_wins",
    settings: "last_write_wins", // User preferences use last-write
  },
};

const PRIORITY_ORDER: Record<SyncOperation["priority"], number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ============================================================================
// SyncManager Class
// ============================================================================

class SyncManagerService {
  private config: SyncConfig = DEFAULT_CONFIG;
  private status: SyncStatus = {
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingOperations: 0,
    currentOperation: null,
    error: null,
    syncProgress: { total: 0, completed: 0, failed: 0 },
    operationProgress: new Map(),
  };

  private queue: SyncOperation[] = [];
  private isProcessingQueue = false;
  private isInitialized = false;
  private userId: string | null = null;

  // Subscriptions
  private statusListeners: Set<SyncStatusCallback> = new Set();
  private errorListeners: Set<SyncErrorCallback> = new Set();
  private netInfoUnsubscribe: (() => void) | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private backgroundSyncInterval: ReturnType<typeof setInterval> | null = null;
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  // Retry tracking
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(userId?: string): Promise<void> {
    if (this.isInitialized) {
      SyncLogger.debug("system", "SyncManager already initialized");
      return;
    }

    SyncLogger.info("system", "Initializing SyncManager", { userId: userId?.substring(0, 8) });

    this.userId = userId || null;

    // Initialize logger first
    await SyncLogger.initialize();

    // Initialize network monitor
    await NetworkMonitor.initialize();

    // Load persisted queue
    await this.loadQueue();

    // Load last sync status
    await this.loadStatus();

    // Check initial network state
    const netState = await NetInfo.fetch();
    this.updateStatus({ isOnline: netState.isConnected ?? true });

    // Subscribe to network changes
    this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleNetworkChange);

    // Subscribe to app state changes
    this.appStateSubscription = AppState.addEventListener("change", this.handleAppStateChange);

    // Start background sync
    this.startBackgroundSync();

    this.isInitialized = true;

    SyncLogger.info("system", "SyncManager initialized", {
      isOnline: this.status.isOnline,
      pendingOperations: this.queue.length,
    });

    // Process any pending operations if online
    if (this.status.isOnline && this.queue.length > 0) {
      this.processQueue();
    }
  }

  async cleanup(): Promise<void> {
    SyncLogger.info("system", "Cleaning up SyncManager");

    // Unsubscribe from real-time updates
    this.unsubscribeFromRealtimeUpdates();

    // Unsubscribe from network changes
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }

    // Unsubscribe from app state
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // Stop background sync
    this.stopBackgroundSync();

    // Clear retry timers
    this.retryTimers.forEach((timer) => clearTimeout(timer));
    this.retryTimers.clear();

    // Save queue state
    await this.saveQueue();
    await this.saveStatus();

    // Clear listeners
    this.statusListeners.clear();
    this.errorListeners.clear();

    this.isInitialized = false;
    this.userId = null;
  }

  // --------------------------------------------------------------------------
  // Auth Integration
  // --------------------------------------------------------------------------

  async onLogin(userId: string): Promise<void> {
    SyncLogger.logAuthChange("login", userId);

    this.userId = userId;

    // Initialize profile sync
    await profileSyncService.initialize(userId);

    // Subscribe to real-time updates
    this.subscribeToRealtimeUpdates(userId);

    // Trigger full sync
    await this.syncAll();
  }

  async onLogout(): Promise<void> {
    SyncLogger.logAuthChange("logout", this.userId || undefined);

    // Unsubscribe from real-time updates
    this.unsubscribeFromRealtimeUpdates();

    // Cleanup profile sync
    await profileSyncService.cleanup();

    // Clear all queued operations
    this.queue = [];
    await this.saveQueue();

    // Clear leaderboard cache
    clearLeaderboardCache();

    // Reset status
    this.updateStatus({
      lastSyncAt: null,
      pendingOperations: 0,
      currentOperation: null,
      error: null,
      syncProgress: { total: 0, completed: 0, failed: 0 },
    });

    this.userId = null;
  }

  // --------------------------------------------------------------------------
  // Real-time Subscriptions
  // --------------------------------------------------------------------------

  private subscribeToRealtimeUpdates(userId: string): void {
    if (!isSupabaseConfigured) {
      SyncLogger.warn("system", "Supabase not configured, skipping real-time subscriptions");
      return;
    }

    // Unsubscribe from any existing channel
    this.unsubscribeFromRealtimeUpdates();

    SyncLogger.info("system", "Subscribing to real-time updates", { userId: userId.substring(0, 8) });

    this.realtimeChannel = supabase
      .channel(`user-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `privy_user_id=eq.${userId}`,
        },
        (payload) => {
          SyncLogger.debug("profile_sync", "Real-time profile update received", {
            eventType: payload.eventType,
          });
          // Trigger profile sync on remote changes
          this.syncProfile().catch((error) => {
            SyncLogger.error("profile_sync", "Failed to sync after real-time update", error);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_balances",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          SyncLogger.debug("balance_sync", "Real-time balance update received", {
            eventType: payload.eventType,
          });
          // Trigger balance sync on remote changes
          this.syncBalance().catch((error) => {
            SyncLogger.error("balance_sync", "Failed to sync after real-time update", error);
          });
        }
      )
      .subscribe((status) => {
        SyncLogger.info("system", `Real-time subscription status: ${status}`);
      });
  }

  private unsubscribeFromRealtimeUpdates(): void {
    if (this.realtimeChannel) {
      SyncLogger.debug("system", "Unsubscribing from real-time updates");
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // --------------------------------------------------------------------------
  // Network Handling
  // --------------------------------------------------------------------------

  private handleNetworkChange = (state: NetInfoState): void => {
    const wasOnline = this.status.isOnline;
    const isNowOnline = state.isConnected ?? false;

    if (wasOnline !== isNowOnline) {
      SyncLogger.logNetworkChange(isNowOnline, wasOnline, {
        type: state.type,
        isInternetReachable: state.isInternetReachable,
      });

      this.updateStatus({ isOnline: isNowOnline });

      // Trigger sync when coming back online
      if (!wasOnline && isNowOnline && this.config.autoSyncOnNetworkRestore) {
        SyncLogger.info("system", "Network restored, triggering sync");
        this.processQueue();
      }
    }
  };

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === "active" && this.config.autoSyncOnAppForeground) {
      SyncLogger.debug("system", "App became active, checking for sync");
      if (this.status.isOnline) {
        this.syncAll({ silent: true });
      }
    }
  };

  // --------------------------------------------------------------------------
  // Background Sync
  // --------------------------------------------------------------------------

  private startBackgroundSync(): void {
    if (this.backgroundSyncInterval) return;

    this.backgroundSyncInterval = setInterval(() => {
      if (this.status.isOnline && !this.status.isSyncing) {
        SyncLogger.debug("system", "Background sync triggered");
        this.syncAll({ silent: true });
      }
    }, this.config.backgroundSyncIntervalMs);
  }

  private stopBackgroundSync(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }
  }

  // --------------------------------------------------------------------------
  // Sync Operations
  // --------------------------------------------------------------------------

  async syncAll(options?: { silent?: boolean }): Promise<void> {
    if (!this.userId || !this.status.isOnline) {
      SyncLogger.debug("system", "Skipping syncAll", {
        hasUser: !!this.userId,
        isOnline: this.status.isOnline,
      });
      return;
    }

    const startTime = Date.now();

    // Initialize operation progress tracking
    const operations: SyncDataType[] = ["profile", "balance"];
    const operationProgress = new Map<SyncDataType, SyncOperationProgress>();
    operations.forEach((op) => {
      operationProgress.set(op, { dataType: op, status: "pending" });
    });

    if (!options?.silent) {
      this.updateStatus({
        isSyncing: true,
        syncProgress: { total: operations.length + 1, completed: 0, failed: 0 },
        operationProgress,
      });
    }

    let failedCount = 0;

    try {
      // 1. Sync profile
      this.updateOperationProgress("profile", "in_progress");
      try {
        await this.syncProfile();
        this.updateOperationProgress("profile", "completed");
        this.updateStatus({
          syncProgress: { ...this.status.syncProgress, completed: 1 },
        });
      } catch (profileError) {
        this.updateOperationProgress("profile", "failed", profileError instanceof Error ? profileError.message : "Failed");
        failedCount++;
      }

      // 2. Sync balance
      this.updateOperationProgress("balance", "in_progress");
      try {
        await this.syncBalance();
        this.updateOperationProgress("balance", "completed");
        this.updateStatus({
          syncProgress: { ...this.status.syncProgress, completed: 2 },
        });
      } catch (balanceError) {
        this.updateOperationProgress("balance", "failed", balanceError instanceof Error ? balanceError.message : "Failed");
        failedCount++;
      }

      // 3. Process any queued operations
      await this.processQueue();
      this.updateStatus({
        syncProgress: { ...this.status.syncProgress, completed: operations.length + 1, failed: failedCount },
      });

      const now = new Date().toISOString();
      this.updateStatus({
        isSyncing: false,
        lastSyncAt: now,
        error: failedCount > 0 ? this.status.error : null,
      });

      await this.saveStatus();

      SyncLogger.logSyncOperation("profile_sync", startTime, failedCount === 0, {
        duration: Date.now() - startTime,
        failedOperations: failedCount,
      });
    } catch (error) {
      const syncError = this.createSyncError(
        "SYNC_ALL_FAILED",
        error instanceof Error ? error.message : "Sync failed",
        "profile",
        true
      );

      this.updateStatus({
        isSyncing: false,
        error: syncError,
      });

      this.notifyError(syncError);

      SyncLogger.logSyncOperation(
        "profile_sync",
        startTime,
        false,
        undefined,
        error instanceof Error ? error : String(error)
      );
    }
  }

  async syncProfile(): Promise<SyncableProfile | null> {
    if (!this.userId) return null;

    const startTime = Date.now();
    this.updateStatus({ currentOperation: "profile" });

    try {
      const profile = await profileSyncService.forceSyncNow();
      SyncLogger.logSyncOperation("profile_sync", startTime, true);
      return profile;
    } catch (error) {
      SyncLogger.logSyncOperation(
        "profile_sync",
        startTime,
        false,
        undefined,
        error instanceof Error ? error : String(error)
      );
      throw error;
    } finally {
      this.updateStatus({ currentOperation: null });
    }
  }

  async syncBalance(): Promise<SyncableBalance | null> {
    if (!this.userId) return null;

    const startTime = Date.now();
    this.updateStatus({ currentOperation: "balance" });

    try {
      const balance = await profileSyncService.fetchBalance();
      SyncLogger.logSyncOperation("balance_sync", startTime, true);
      return balance;
    } catch (error) {
      SyncLogger.logSyncOperation(
        "balance_sync",
        startTime,
        false,
        undefined,
        error instanceof Error ? error : String(error)
      );
      throw error;
    } finally {
      this.updateStatus({ currentOperation: null });
    }
  }

  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------

  async enqueue(
    dataType: SyncDataType,
    payload?: unknown,
    options?: {
      priority?: SyncOperation["priority"];
      maxRetries?: number;
    }
  ): Promise<string> {
    const operation: SyncOperation = {
      id: this.generateId(),
      dataType,
      priority: options?.priority ?? "normal",
      payload,
      retryCount: 0,
      maxRetries: options?.maxRetries ?? this.config.maxRetries,
      createdAt: Date.now(),
    };

    this.queue.push(operation);
    this.sortQueue();

    SyncLogger.info("queue_operation", `Enqueued ${dataType} operation`, {
      id: operation.id,
      priority: operation.priority,
      queueSize: this.queue.length,
    });

    this.updateStatus({ pendingOperations: this.queue.length });
    await this.saveQueue();

    // Process immediately if online
    if (this.status.isOnline && !this.isProcessingQueue) {
      this.processQueue();
    }

    return operation.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || !this.status.isOnline || this.queue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    SyncLogger.debug("queue_operation", `Processing ${this.queue.length} queued operations`);

    const processed: string[] = [];
    const failed: SyncOperation[] = [];

    for (const operation of [...this.queue]) {
      if (!this.status.isOnline) {
        SyncLogger.warn("queue_operation", "Network lost during queue processing");
        break;
      }

      try {
        await this.executeOperation(operation);
        processed.push(operation.id);
      } catch (error) {
        operation.retryCount++;
        operation.lastAttemptAt = Date.now();
        operation.error = error instanceof Error ? error.message : String(error);

        if (operation.retryCount < operation.maxRetries) {
          // Schedule retry with exponential backoff
          this.scheduleRetry(operation);
          failed.push(operation);
        } else {
          // Max retries exceeded
          processed.push(operation.id); // Remove from queue
          SyncLogger.error(
            "queue_operation",
            `Operation ${operation.dataType} failed after ${operation.maxRetries} retries`,
            error instanceof Error ? error : String(error)
          );

          const syncError = this.createSyncError(
            "MAX_RETRIES_EXCEEDED",
            `${operation.dataType} sync failed after ${operation.maxRetries} attempts`,
            operation.dataType,
            false
          );
          this.notifyError(syncError);
        }
      }
    }

    // Remove processed operations
    this.queue = this.queue.filter((op) => !processed.includes(op.id));
    this.updateStatus({ pendingOperations: this.queue.length });
    await this.saveQueue();

    this.isProcessingQueue = false;
  }

  private async executeOperation(operation: SyncOperation): Promise<void> {
    const startTime = Date.now();

    switch (operation.dataType) {
      case "profile":
        await profileSyncService.forceSyncNow();
        break;
      case "balance":
        await profileSyncService.fetchBalance();
        break;
      case "leaderboard":
        clearLeaderboardCache();
        break;
      // Add more operation handlers as needed
      default:
        SyncLogger.warn("queue_operation", `Unknown operation type: ${operation.dataType}`);
    }

    SyncLogger.logSyncOperation(
      `${operation.dataType}_sync` as SyncOperationType,
      startTime,
      true
    );
  }

  private scheduleRetry(operation: SyncOperation): void {
    const delay = this.calculateRetryDelay(operation.retryCount);

    SyncLogger.logRetry(
      `${operation.dataType}_sync` as SyncOperationType,
      operation.retryCount,
      operation.maxRetries,
      delay
    );

    const timer = setTimeout(() => {
      this.retryTimers.delete(operation.id);
      if (this.status.isOnline) {
        this.processQueue();
      }
    }, delay);

    this.retryTimers.set(operation.id, timer);
  }

  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    const delay = Math.min(
      this.config.baseRetryDelayMs * Math.pow(2, retryCount),
      this.config.maxRetryDelayMs
    );
    // Add jitter (10% variance)
    return delay + Math.random() * delay * 0.1;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority (higher first)
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Then by creation time (older first)
      return a.createdAt - b.createdAt;
    });
  }

  // --------------------------------------------------------------------------
  // Conflict Resolution
  // --------------------------------------------------------------------------

  resolveConflict<T extends Record<string, unknown>>(
    dataType: SyncDataType,
    serverData: T,
    clientData: T,
    serverTimestamp: Date,
    clientTimestamp: Date
  ): T {
    const strategy = this.config.conflictStrategies[dataType];

    let resolved: T;
    const conflicts: Array<{ field: string; resolved: unknown }> = [];

    switch (strategy) {
      case "server_wins":
        resolved = serverData;
        break;

      case "client_wins":
        resolved = clientData;
        break;

      case "last_write_wins":
        resolved = serverTimestamp > clientTimestamp ? serverData : clientData;
        break;

      case "merge":
      default:
        // Merge: server-authoritative for specific fields, client for others
        resolved = { ...clientData };
        for (const key of Object.keys(serverData)) {
          if (serverData[key] !== clientData[key]) {
            // Server wins for these field patterns
            if (this.isServerAuthoritativeField(key)) {
              (resolved as Record<string, unknown>)[key] = serverData[key];
            } else {
              // Last-write wins for other fields
              (resolved as Record<string, unknown>)[key] =
                serverTimestamp > clientTimestamp ? serverData[key] : clientData[key];
            }
            conflicts.push({ field: key, resolved: (resolved as Record<string, unknown>)[key] });
          }
        }
        break;
    }

    if (conflicts.length > 0) {
      SyncLogger.logConflictResolution(dataType, strategy, conflicts);
    }

    return resolved;
  }

  private isServerAuthoritativeField(field: string): boolean {
    const serverFields = [
      "elo_rating",
      "eloRating",
      "games_played",
      "gamesPlayed",
      "games_won",
      "gamesWon",
      "games_lost",
      "gamesLost",
      "games_drawn",
      "gamesDrawn",
      "current_streak",
      "currentStreak",
      "longest_streak",
      "longestStreak",
      "balance",
      "available_tct",
      "availableTct",
      "locked_tct",
      "lockedTct",
    ];
    return serverFields.includes(field);
  }

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  private createSyncError(
    code: string,
    message: string,
    dataType: SyncDataType,
    retryable: boolean
  ): SyncError {
    return {
      code,
      message,
      dataType,
      recoverable: true,
      retryable,
      timestamp: new Date().toISOString(),
    };
  }

  private notifyError(error: SyncError): void {
    this.errorListeners.forEach((callback) => {
      try {
        callback(error);
      } catch (e) {
        console.warn("[SyncManager] Error callback failed:", e);
      }
    });
  }

  // --------------------------------------------------------------------------
  // Status Management
  // --------------------------------------------------------------------------

  private updateStatus(updates: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...updates };
    this.statusListeners.forEach((callback) => {
      try {
        callback(this.status);
      } catch (e) {
        console.warn("[SyncManager] Status callback failed:", e);
      }
    });
  }

  private updateOperationProgress(
    dataType: SyncDataType,
    status: SyncOperationProgress["status"],
    error?: string
  ): void {
    const existing = this.status.operationProgress.get(dataType);
    const now = Date.now();

    const progress: SyncOperationProgress = {
      dataType,
      status,
      startedAt: status === "in_progress" ? now : existing?.startedAt,
      completedAt: status === "completed" || status === "failed" ? now : undefined,
      duration: (status === "completed" || status === "failed") && existing?.startedAt
        ? now - existing.startedAt
        : undefined,
      error,
    };

    this.status.operationProgress.set(dataType, progress);
    this.updateStatus({ operationProgress: new Map(this.status.operationProgress) });
  }

  getStatus(): SyncStatus {
    return {
      ...this.status,
      operationProgress: new Map(this.status.operationProgress),
    };
  }

  getOperationProgress(dataType: SyncDataType): SyncOperationProgress | undefined {
    return this.status.operationProgress.get(dataType);
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  onStatusChange(callback: SyncStatusCallback): () => void {
    this.statusListeners.add(callback);
    // Immediately call with current status
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  onError(callback: SyncErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  private async loadQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.updateStatus({ pendingOperations: this.queue.length });
      }
    } catch (error) {
      SyncLogger.error("system", "Failed to load sync queue", error instanceof Error ? error : String(error));
      this.queue = [];
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      SyncLogger.error("system", "Failed to save sync queue", error instanceof Error ? error : String(error));
    }
  }

  private async loadStatus(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(SYNC_STATUS_STORAGE_KEY);
      if (stored) {
        const saved = JSON.parse(stored);
        this.status.lastSyncAt = saved.lastSyncAt || null;
      }
    } catch (error) {
      // Non-critical
    }
  }

  private async saveStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        SYNC_STATUS_STORAGE_KEY,
        JSON.stringify({ lastSyncAt: this.status.lastSyncAt })
      );
    } catch (error) {
      // Non-critical
    }
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  configure(updates: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...updates };
    SyncLogger.info("system", "SyncManager configuration updated", updates);
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  isOnline(): boolean {
    return this.status.isOnline;
  }

  isSyncing(): boolean {
    return this.status.isSyncing;
  }

  getPendingCount(): number {
    return this.queue.length;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const SyncManager = new SyncManagerService();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function initializeSyncManager(userId?: string): Promise<void> {
  return SyncManager.initialize(userId);
}

export async function cleanupSyncManager(): Promise<void> {
  return SyncManager.cleanup();
}

export async function syncAllData(): Promise<void> {
  return SyncManager.syncAll();
}

export function getSyncStatus(): SyncStatus {
  return SyncManager.getStatus();
}
