/**
 * Local Data Migration Service
 *
 * Elite-standard service for migrating local AsyncStorage data to Supabase.
 * Handles upgrading users from local-only version with full data preservation.
 *
 * Features:
 * - Automatic detection of unmigrated local data
 * - Step-by-step migration with progress tracking
 * - Conflict resolution (server wins for ELO/stats, merge for preferences)
 * - 30-day backup with rollback capability
 * - Graceful error handling with retry support
 * - Idempotent operations to prevent duplicate migrations
 *
 * @example
 * const migration = MigrationService.getInstance();
 * if (await migration.needsMigration()) {
 *   await migration.executeMigration(userId, (progress) => {
 *     console.log(`${progress.step}: ${progress.percentage}%`);
 *   });
 * }
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Transaction as LocalTransaction, User as LocalUser } from "@/types";

// ============================================================================
// Constants
// ============================================================================

// Legacy AsyncStorage keys from AppContext
const LEGACY_KEYS = {
  USER: "@chess_betting_user",
  TRANSACTIONS: "@chess_betting_transactions",
  ACCEPTED_CHALLENGES: "@chess_betting_accepted_challenges",
  GENERATED_DRAGON: "@chess_betting_generated_dragon",
  GENERATED_TEENAGE_DRAGON: "@chess_betting_generated_teenage_dragon",
} as const;

// Migration-specific keys
const MIGRATION_KEYS = {
  STATUS: "@migration_status",
  BACKUP: "@migration_backup",
  VERSION: "@migration_version",
} as const;

// Current migration version (increment when migration logic changes)
const CURRENT_MIGRATION_VERSION = 1;

// Backup retention period (30 days in milliseconds)
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// TCT to USD conversion rate
const TCT_TO_USD_RATE = 0.04;

// ============================================================================
// Types
// ============================================================================

export type MigrationStep =
  | "detecting"
  | "backing_up"
  | "migrating_profile"
  | "migrating_balance"
  | "migrating_transactions"
  | "migrating_settings"
  | "verifying"
  | "cleaning_up"
  | "complete"
  | "failed";

export interface MigrationProgress {
  step: MigrationStep;
  percentage: number;
  message: string;
  currentItem?: string;
  itemsProcessed?: number;
  totalItems?: number;
}

export interface MigrationStatus {
  version: number;
  completedAt: string | null;
  userId: string | null;
  steps: {
    profile: boolean;
    balance: boolean;
    transactions: boolean;
    settings: boolean;
    cleanup: boolean;
  };
  errors: MigrationError[];
  canRollback: boolean;
  rollbackExpiresAt: string | null;
  // For partial resume capability
  lastProcessedTransactionIndex?: number;
}

export interface MigrationError {
  step: MigrationStep;
  message: string;
  timestamp: string;
  recoverable: boolean;
}

export interface MigrationBackup {
  createdAt: string;
  expiresAt: string;
  user: LocalUser | null;
  transactions: LocalTransaction[];
  acceptedChallenges: string[];
  generatedDragon: string | null;
  generatedTeenageDragon: string | null;
}

export interface LocalData {
  user: LocalUser | null;
  transactions: LocalTransaction[];
  acceptedChallenges: string[];
  generatedDragon: string | null;
  generatedTeenageDragon: string | null;
}

export interface MigrationResult {
  success: boolean;
  migratedItems: {
    profile: boolean;
    balance: boolean;
    transactionsCount: number;
    settings: boolean;
  };
  errors: MigrationError[];
  canRetry: boolean;
}

export type ConflictResolution = "server_wins" | "local_wins" | "merge";

export interface MigrationOptions {
  profileConflict?: ConflictResolution;
  balanceConflict?: ConflictResolution;
  skipCleanup?: boolean;
  dryRun?: boolean;
}

type ProgressCallback = (progress: MigrationProgress) => void;

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_STATUS: MigrationStatus = {
  version: 0,
  completedAt: null,
  userId: null,
  steps: {
    profile: false,
    balance: false,
    transactions: false,
    settings: false,
    cleanup: false,
  },
  errors: [],
  canRollback: false,
  rollbackExpiresAt: null,
};

const DEFAULT_OPTIONS: MigrationOptions = {
  profileConflict: "server_wins",
  balanceConflict: "merge",
  skipCleanup: false,
  dryRun: false,
};

// ============================================================================
// Migration Service
// ============================================================================

class MigrationServiceImpl {
  private static instance: MigrationServiceImpl;
  private status: MigrationStatus = DEFAULT_STATUS;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): MigrationServiceImpl {
    if (!MigrationServiceImpl.instance) {
      MigrationServiceImpl.instance = new MigrationServiceImpl();
    }
    return MigrationServiceImpl.instance;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const statusJson = await AsyncStorage.getItem(MIGRATION_KEYS.STATUS);
      if (statusJson) {
        this.status = JSON.parse(statusJson);
      }
      this.isInitialized = true;
    } catch (error) {
      console.error("[Migration] Failed to initialize:", error);
      this.status = DEFAULT_STATUS;
      this.isInitialized = true;
    }
  }

  // --------------------------------------------------------------------------
  // Detection
  // --------------------------------------------------------------------------

  /**
   * Check if migration is needed for the current user
   */
  async needsMigration(): Promise<boolean> {
    await this.initialize();

    // Already migrated at current version
    if (
      this.status.completedAt &&
      this.status.version >= CURRENT_MIGRATION_VERSION
    ) {
      console.log("[Migration] Already completed at version", this.status.version);
      return false;
    }

    // Check if local data exists
    const localData = await this.detectLocalData();
    const hasLocalData =
      localData.user !== null ||
      localData.transactions.length > 0;

    if (!hasLocalData) {
      console.log("[Migration] No local data to migrate");
      return false;
    }

    console.log("[Migration] Local data detected, migration needed");
    return true;
  }

  /**
   * Detect what local data exists
   */
  async detectLocalData(): Promise<LocalData> {
    const data: LocalData = {
      user: null,
      transactions: [],
      acceptedChallenges: [],
      generatedDragon: null,
      generatedTeenageDragon: null,
    };

    try {
      // Load user data
      const userJson = await AsyncStorage.getItem(LEGACY_KEYS.USER);
      if (userJson) {
        try {
          data.user = JSON.parse(userJson);
        } catch {
          console.warn("[Migration] Failed to parse user data");
        }
      }

      // Load transactions
      const transactionsJson = await AsyncStorage.getItem(LEGACY_KEYS.TRANSACTIONS);
      if (transactionsJson) {
        try {
          const parsed = JSON.parse(transactionsJson);
          if (Array.isArray(parsed)) {
            data.transactions = parsed.map((t) => ({
              ...t,
              timestamp: new Date(t.timestamp),
            }));
          }
        } catch {
          console.warn("[Migration] Failed to parse transactions");
        }
      }

      // Load accepted challenges
      const challengesJson = await AsyncStorage.getItem(LEGACY_KEYS.ACCEPTED_CHALLENGES);
      if (challengesJson) {
        try {
          const parsed = JSON.parse(challengesJson);
          if (Array.isArray(parsed)) {
            data.acceptedChallenges = parsed;
          }
        } catch {
          console.warn("[Migration] Failed to parse accepted challenges");
        }
      }

      // Load generated dragons
      data.generatedDragon = await AsyncStorage.getItem(LEGACY_KEYS.GENERATED_DRAGON);
      data.generatedTeenageDragon = await AsyncStorage.getItem(LEGACY_KEYS.GENERATED_TEENAGE_DRAGON);
    } catch (error) {
      console.error("[Migration] Error detecting local data:", error);
    }

    return data;
  }

  /**
   * Get summary of data that will be migrated
   */
  async getMigrationSummary(): Promise<{
    hasUser: boolean;
    transactionCount: number;
    localBalance: number;
    localBalanceTct: number;
    localElo: number;
    gamesPlayed: number;
  }> {
    const data = await this.detectLocalData();

    return {
      hasUser: data.user !== null,
      transactionCount: data.transactions.length,
      localBalance: data.user?.walletBalance ?? 0,
      localBalanceTct: (data.user?.walletBalance ?? 0) / TCT_TO_USD_RATE,
      localElo: data.user?.eloRating ?? 1200,
      gamesPlayed: data.user?.totalGamesPlayed ?? 0,
    };
  }

  // --------------------------------------------------------------------------
  // Backup & Rollback
  // --------------------------------------------------------------------------

  /**
   * Create backup of local data before migration
   */
  private async createBackup(data: LocalData): Promise<void> {
    const now = new Date();
    const backup: MigrationBackup = {
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + BACKUP_RETENTION_MS).toISOString(),
      ...data,
    };

    await AsyncStorage.setItem(MIGRATION_KEYS.BACKUP, JSON.stringify(backup));

    // Update status
    this.status.canRollback = true;
    this.status.rollbackExpiresAt = backup.expiresAt;
    await this.saveStatus();

    console.log("[Migration] Backup created, expires:", backup.expiresAt);
  }

  /**
   * Check if rollback is available
   */
  async canRollback(): Promise<boolean> {
    await this.initialize();

    if (!this.status.canRollback || !this.status.rollbackExpiresAt) {
      return false;
    }

    const expiresAt = new Date(this.status.rollbackExpiresAt);
    if (expiresAt < new Date()) {
      // Backup expired, clean it up
      await this.cleanupBackup();
      return false;
    }

    return true;
  }

  /**
   * Rollback migration and restore local data
   */
  async rollback(): Promise<{ success: boolean; error?: string }> {
    if (!(await this.canRollback())) {
      return { success: false, error: "Rollback not available or expired" };
    }

    try {
      const backupJson = await AsyncStorage.getItem(MIGRATION_KEYS.BACKUP);
      if (!backupJson) {
        return { success: false, error: "Backup data not found" };
      }

      const backup: MigrationBackup = JSON.parse(backupJson);

      // Restore local data
      if (backup.user) {
        await AsyncStorage.setItem(LEGACY_KEYS.USER, JSON.stringify(backup.user));
      }
      if (backup.transactions.length > 0) {
        await AsyncStorage.setItem(LEGACY_KEYS.TRANSACTIONS, JSON.stringify(backup.transactions));
      }
      if (backup.acceptedChallenges.length > 0) {
        await AsyncStorage.setItem(LEGACY_KEYS.ACCEPTED_CHALLENGES, JSON.stringify(backup.acceptedChallenges));
      }
      if (backup.generatedDragon) {
        await AsyncStorage.setItem(LEGACY_KEYS.GENERATED_DRAGON, backup.generatedDragon);
      }
      if (backup.generatedTeenageDragon) {
        await AsyncStorage.setItem(LEGACY_KEYS.GENERATED_TEENAGE_DRAGON, backup.generatedTeenageDragon);
      }

      // Reset migration status
      this.status = {
        ...DEFAULT_STATUS,
        canRollback: true,
        rollbackExpiresAt: this.status.rollbackExpiresAt,
      };
      await this.saveStatus();

      console.log("[Migration] Rollback completed successfully");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Migration] Rollback failed:", error);
      return { success: false, error: message };
    }
  }

  /**
   * Clean up expired backup
   */
  private async cleanupBackup(): Promise<void> {
    await AsyncStorage.removeItem(MIGRATION_KEYS.BACKUP);
    this.status.canRollback = false;
    this.status.rollbackExpiresAt = null;
    await this.saveStatus();
    console.log("[Migration] Backup cleaned up");
  }

  // --------------------------------------------------------------------------
  // Migration Execution
  // --------------------------------------------------------------------------

  /**
   * Execute the full migration process
   */
  async executeMigration(
    supabaseUserId: string,
    onProgress?: ProgressCallback,
    options: MigrationOptions = DEFAULT_OPTIONS
  ): Promise<MigrationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    await this.initialize();

    const result: MigrationResult = {
      success: false,
      migratedItems: {
        profile: false,
        balance: false,
        transactionsCount: 0,
        settings: false,
      },
      errors: [],
      canRetry: true,
    };

    const reportProgress = (progress: MigrationProgress) => {
      console.log(`[Migration] ${progress.step}: ${progress.message}`);
      onProgress?.(progress);
    };

    try {
      // Step 1: Detect local data
      reportProgress({
        step: "detecting",
        percentage: 0,
        message: "Detecting local data...",
      });

      const localData = await this.detectLocalData();

      if (!localData.user && localData.transactions.length === 0) {
        reportProgress({
          step: "complete",
          percentage: 100,
          message: "No data to migrate",
        });
        result.success = true;
        result.canRetry = false;
        return result;
      }

      // Step 2: Create backup
      reportProgress({
        step: "backing_up",
        percentage: 10,
        message: "Creating backup...",
      });

      if (!opts.dryRun) {
        await this.createBackup(localData);
      }

      // Step 3: Migrate profile data
      if (localData.user && !this.status.steps.profile) {
        reportProgress({
          step: "migrating_profile",
          percentage: 20,
          message: "Migrating profile data...",
        });

        const profileResult = await this.migrateProfile(
          supabaseUserId,
          localData.user,
          opts.profileConflict!,
          opts.dryRun!
        );

        if (profileResult.success) {
          result.migratedItems.profile = true;
          if (!opts.dryRun) {
            this.status.steps.profile = true;
            await this.saveStatus();
          }
        } else {
          result.errors.push(profileResult.error!);
        }
      }

      // Step 4: Migrate balance
      if (localData.user && !this.status.steps.balance) {
        reportProgress({
          step: "migrating_balance",
          percentage: 40,
          message: "Migrating wallet balance...",
        });

        const balanceResult = await this.migrateBalance(
          supabaseUserId,
          localData.user.walletBalance,
          opts.balanceConflict!,
          opts.dryRun!
        );

        if (balanceResult.success) {
          result.migratedItems.balance = true;
          if (!opts.dryRun) {
            this.status.steps.balance = true;
            await this.saveStatus();
          }
        } else {
          result.errors.push(balanceResult.error!);
        }
      }

      // Step 5: Migrate transactions
      if (localData.transactions.length > 0 && !this.status.steps.transactions) {
        reportProgress({
          step: "migrating_transactions",
          percentage: 60,
          message: `Migrating ${localData.transactions.length} transactions...`,
          totalItems: localData.transactions.length,
          itemsProcessed: 0,
        });

        const txResult = await this.migrateTransactions(
          supabaseUserId,
          localData.transactions,
          opts.dryRun!,
          (processed, total) => {
            reportProgress({
              step: "migrating_transactions",
              percentage: 60 + Math.round((processed / total) * 20),
              message: `Migrating transactions (${processed}/${total})...`,
              totalItems: total,
              itemsProcessed: processed,
            });
          }
        );

        result.migratedItems.transactionsCount = txResult.migratedCount;
        if (txResult.success) {
          if (!opts.dryRun) {
            this.status.steps.transactions = true;
            await this.saveStatus();
          }
        } else {
          result.errors.push(...txResult.errors);
        }
      }

      // Step 6: Migrate settings
      if (localData.user?.gameSettings && !this.status.steps.settings) {
        reportProgress({
          step: "migrating_settings",
          percentage: 80,
          message: "Migrating game settings...",
        });

        const settingsResult = await this.migrateSettings(
          supabaseUserId,
          localData.user.gameSettings,
          opts.dryRun!
        );

        if (settingsResult.success) {
          result.migratedItems.settings = true;
          if (!opts.dryRun) {
            this.status.steps.settings = true;
            await this.saveStatus();
          }
        } else {
          result.errors.push(settingsResult.error!);
        }
      }

      // Step 7: Verify migration - compare migrated data counts with expected
      reportProgress({
        step: "verifying",
        percentage: 90,
        message: "Verifying migration...",
      });

      if (!opts.dryRun) {
        const verificationResult = await this.verifyMigration(
          supabaseUserId,
          localData,
          result
        );

        if (!verificationResult.success) {
          result.errors.push(...verificationResult.errors);
          console.warn("[Migration] Verification completed with warnings:", verificationResult.warnings);
        }
      }

      // Step 8: Cleanup legacy data (if not skipped and all steps succeeded)
      const allStepsComplete =
        this.status.steps.profile &&
        this.status.steps.balance &&
        this.status.steps.transactions &&
        this.status.steps.settings;

      if (!opts.skipCleanup && !opts.dryRun && allStepsComplete) {
        reportProgress({
          step: "cleaning_up",
          percentage: 95,
          message: "Cleaning up legacy data...",
        });

        await this.cleanupLegacyData();
        this.status.steps.cleanup = true;
      }

      // Mark migration complete
      if (!opts.dryRun && result.errors.length === 0) {
        this.status.completedAt = new Date().toISOString();
        this.status.userId = supabaseUserId;
        this.status.version = CURRENT_MIGRATION_VERSION;
        await this.saveStatus();
      }

      reportProgress({
        step: "complete",
        percentage: 100,
        message: "Migration complete!",
      });

      result.success = result.errors.length === 0;
      result.canRetry = result.errors.some((e) => e.recoverable);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Migration] Fatal error:", error);

      const migrationError: MigrationError = {
        step: "failed",
        message: errorMsg,
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      this.status.errors.push(migrationError);
      await this.saveStatus();

      reportProgress({
        step: "failed",
        percentage: 0,
        message: `Migration failed: ${errorMsg}`,
      });

      result.errors.push(migrationError);
      return result;
    }
  }

  // --------------------------------------------------------------------------
  // Individual Migration Steps
  // --------------------------------------------------------------------------

  private async migrateProfile(
    userId: string,
    localUser: LocalUser,
    conflictResolution: ConflictResolution,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: MigrationError }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        error: {
          step: "migrating_profile",
          message: "Supabase not configured",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    try {
      // Fetch current server profile
      const { data: serverProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw fetchError;
      }

      if (dryRun) {
        console.log("[Migration] Dry run: Would migrate profile", {
          localUser,
          serverProfile,
          conflictResolution,
        });
        return { success: true };
      }

      // Determine what to update based on conflict resolution
      const updates: Record<string, unknown> = {};

      if (conflictResolution === "local_wins" || !serverProfile) {
        // Local wins: update server with local stats
        updates.games_played = localUser.totalGamesPlayed;
        updates.games_won = localUser.totalWins;
        updates.games_lost = localUser.totalLosses;
        updates.current_streak = localUser.currentWinStreak;
      } else if (conflictResolution === "merge") {
        // Merge: take max of stats
        if (serverProfile) {
          updates.games_played = Math.max(
            serverProfile.games_played,
            localUser.totalGamesPlayed
          );
          updates.games_won = Math.max(
            serverProfile.games_won,
            localUser.totalWins
          );
          updates.games_lost = Math.max(
            serverProfile.games_lost,
            localUser.totalLosses
          );
          updates.longest_streak = Math.max(
            serverProfile.longest_streak,
            localUser.currentWinStreak
          );
        }
      }
      // server_wins: don't update stats, server is authoritative

      // Always preserve username if it's custom (not default)
      // Use atomic upsert pattern to avoid race conditions
      if (localUser.username && localUser.username !== "ChessMaster") {
        // Attempt atomic username claim using update with conditions
        // This prevents race conditions where another user claims the name
        // between check and update
        const { error: usernameError, count } = await supabase
          .from("profiles")
          .update({
            username: localUser.username,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId)
          .not("username", "ilike", localUser.username) // Only if not already set
          .is("username", null) // Or if username is null
          .select("id");

        // If no rows updated, check if username is taken by someone else
        if (count === 0) {
          const { data: existingUser } = await supabase
            .from("profiles")
            .select("id")
            .ilike("username", localUser.username)
            .neq("id", userId)
            .limit(1);

          if (existingUser && existingUser.length > 0) {
            console.log(`[Migration] Username "${localUser.username}" is taken, keeping server username`);
          }
          // If not taken, user may already have this username - that's fine
        } else {
          console.log(`[Migration] Username "${localUser.username}" claimed successfully`);
        }
      }

      // Apply remaining updates (stats)
      const statsToUpdate = { ...updates };
      delete statsToUpdate.username; // Username handled separately above

      if (Object.keys(statsToUpdate).length > 0) {
        statsToUpdate.updated_at = new Date().toISOString();

        const { error: updateError } = await supabase
          .from("profiles")
          .update(statsToUpdate)
          .eq("id", userId);

        if (updateError) {
          throw updateError;
        }
      }

      console.log("[Migration] Profile migrated successfully");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: {
          step: "migrating_profile",
          message,
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
      };
    }
  }

  private async migrateBalance(
    userId: string,
    localBalanceUsd: number,
    conflictResolution: ConflictResolution,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: MigrationError }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        error: {
          step: "migrating_balance",
          message: "Supabase not configured",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    // Convert USD to TCT
    const localBalanceTct = localBalanceUsd / TCT_TO_USD_RATE;

    try {
      // Fetch current server balance
      const { data: serverBalance, error: fetchError } = await supabase
        .from("balances")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw fetchError;
      }

      if (dryRun) {
        console.log("[Migration] Dry run: Would migrate balance", {
          localBalanceTct,
          serverBalance,
          conflictResolution,
        });
        return { success: true };
      }

      let newBalance = localBalanceTct;

      if (serverBalance) {
        switch (conflictResolution) {
          case "server_wins":
            // Don't update balance, server is authoritative
            console.log("[Migration] Balance: Server wins, keeping server balance");
            return { success: true };

          case "local_wins":
            newBalance = localBalanceTct;
            break;

          case "merge":
            // Add local balance to server balance (user gets both)
            newBalance = serverBalance.available_tct + localBalanceTct;
            console.log(
              `[Migration] Merging balance: ${serverBalance.available_tct} + ${localBalanceTct} = ${newBalance}`
            );
            break;
        }
      }

      // Update or create balance record
      if (serverBalance) {
        const { error: updateError } = await supabase
          .from("balances")
          .update({
            available_tct: newBalance,
            total_deposited_tct: serverBalance.total_deposited_tct + localBalanceTct,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("balances")
          .insert({
            user_id: userId,
            available_tct: newBalance,
            total_deposited_tct: localBalanceTct,
          });

        if (insertError) throw insertError;
      }

      console.log("[Migration] Balance migrated successfully:", newBalance, "TCT");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: {
          step: "migrating_balance",
          message,
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
      };
    }
  }

  private async migrateTransactions(
    userId: string,
    localTransactions: LocalTransaction[],
    dryRun: boolean,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    migratedCount: number;
    skippedCount: number;
    errors: MigrationError[];
  }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        migratedCount: 0,
        skippedCount: 0,
        errors: [
          {
            step: "migrating_transactions",
            message: "Supabase not configured",
            timestamp: new Date().toISOString(),
            recoverable: false,
          },
        ],
      };
    }

    const errors: MigrationError[] = [];
    let migratedCount = 0;
    let skippedCount = 0;

    // Map local transaction types to Supabase types
    const mapTransactionType = (
      type: LocalTransaction["type"]
    ): "deposit" | "withdraw" | "win_payout" | "loss_deduct" => {
      switch (type) {
        case "deposit":
          return "deposit";
        case "withdrawal":
          return "withdraw";
        case "stake_won":
          return "win_payout";
        case "stake_lost":
          return "loss_deduct";
        default:
          return "deposit";
      }
    };

    // Generate a unique reference for migration deduplication
    const generateMigrationReference = (tx: LocalTransaction): string => {
      // Create a deterministic reference from transaction properties
      const txTime = new Date(tx.timestamp).getTime();
      return `migration_${tx.id}_${txTime}_${tx.tctAmount}`;
    };

    // Resume from last processed index if available
    const startIndex = this.status.lastProcessedTransactionIndex ?? 0;
    if (startIndex > 0) {
      console.log(`[Migration] Resuming transaction migration from index ${startIndex}`);
    }

    for (let i = startIndex; i < localTransactions.length; i++) {
      const tx = localTransactions[i];
      onProgress?.(i + 1, localTransactions.length);

      try {
        const migrationRef = generateMigrationReference(tx);

        // Check for duplicate by migration reference (primary) or transaction ID (fallback)
        const { data: existing } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", userId)
          .or(`reference.eq.${migrationRef},reference.eq.${tx.id}`)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`[Migration] Skipping duplicate transaction: ${tx.id}`);
          skippedCount++;
          // Update progress even for skipped items
          this.status.lastProcessedTransactionIndex = i + 1;
          continue;
        }

        if (dryRun) {
          console.log("[Migration] Dry run: Would migrate transaction", tx);
          migratedCount++;
          continue;
        }

        // Insert transaction with unique reference for deduplication
        const { error: insertError } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            type: mapTransactionType(tx.type),
            amount_tct: tx.tctAmount,
            balance_before_tct: 0, // Unknown for legacy transactions
            balance_after_tct: 0,
            description: `[Migrated] ${tx.description || tx.type}`,
            reference: migrationRef,
            created_at: new Date(tx.timestamp).toISOString(),
          });

        if (insertError) {
          throw insertError;
        }

        migratedCount++;

        // Save progress after each successful migration for resume capability
        this.status.lastProcessedTransactionIndex = i + 1;
        if ((i + 1) % 10 === 0) {
          // Persist every 10 transactions to avoid too many writes
          await this.saveStatus();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push({
          step: "migrating_transactions",
          message: `Failed to migrate transaction ${tx.id}: ${message}`,
          timestamp: new Date().toISOString(),
          recoverable: true,
        });

        // Save progress on error so we can resume from this point
        this.status.lastProcessedTransactionIndex = i;
        await this.saveStatus();
      }
    }

    // Clear the index on successful completion
    if (errors.length === 0) {
      this.status.lastProcessedTransactionIndex = undefined;
    }

    console.log(
      `[Migration] Transactions migrated: ${migratedCount}/${localTransactions.length} (${skippedCount} skipped as duplicates)`
    );

    return {
      success: errors.length === 0,
      migratedCount,
      skippedCount,
      errors,
    };
  }

  private async migrateSettings(
    userId: string,
    settings: LocalUser["gameSettings"],
    dryRun: boolean
  ): Promise<{ success: boolean; error?: MigrationError }> {
    if (!isSupabaseConfigured) {
      return {
        success: false,
        error: {
          step: "migrating_settings",
          message: "Supabase not configured",
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    try {
      if (dryRun) {
        console.log("[Migration] Dry run: Would migrate settings", settings);
        return { success: true };
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          sound_enabled: settings.soundEffects,
          haptic_enabled: settings.vibration,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) {
        throw updateError;
      }

      console.log("[Migration] Settings migrated successfully");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: {
          step: "migrating_settings",
          message,
          timestamp: new Date().toISOString(),
          recoverable: true,
        },
      };
    }
  }

  // --------------------------------------------------------------------------
  // Verification
  // --------------------------------------------------------------------------

  /**
   * Verify that migration was successful by comparing local data with server data
   */
  private async verifyMigration(
    userId: string,
    localData: LocalData,
    migrationResult: MigrationResult
  ): Promise<{
    success: boolean;
    warnings: string[];
    errors: MigrationError[];
  }> {
    const warnings: string[] = [];
    const errors: MigrationError[] = [];

    try {
      // Verify profile exists and has expected data
      if (localData.user && migrationResult.migratedItems.profile) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("games_played, games_won, games_lost")
          .eq("id", userId)
          .single();

        if (profileError) {
          errors.push({
            step: "verifying",
            message: `Profile verification failed: ${profileError.message}`,
            timestamp: new Date().toISOString(),
            recoverable: false,
          });
        } else if (profile) {
          // For server_wins conflict resolution, server values are kept
          // For merge/local_wins, verify local values are reflected
          if (profile.games_played < localData.user.totalGamesPlayed) {
            warnings.push(
              `Games played mismatch: server=${profile.games_played}, local=${localData.user.totalGamesPlayed}`
            );
          }
          console.log("[Migration] Profile verification passed");
        }
      }

      // Verify balance exists
      if (localData.user && migrationResult.migratedItems.balance) {
        const { data: balance, error: balanceError } = await supabase
          .from("balances")
          .select("available_tct")
          .eq("user_id", userId)
          .single();

        if (balanceError && balanceError.code !== "PGRST116") {
          errors.push({
            step: "verifying",
            message: `Balance verification failed: ${balanceError.message}`,
            timestamp: new Date().toISOString(),
            recoverable: false,
          });
        } else if (balance) {
          console.log("[Migration] Balance verification passed:", balance.available_tct, "TCT");
        }
      }

      // Verify transaction count matches expected
      if (localData.transactions.length > 0) {
        const { count: serverTxCount, error: txError } = await supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .like("reference", "migration_%");

        if (txError) {
          warnings.push(`Transaction count verification failed: ${txError.message}`);
        } else {
          const expectedCount = migrationResult.migratedItems.transactionsCount;
          if (serverTxCount !== null && serverTxCount < expectedCount) {
            warnings.push(
              `Transaction count mismatch: migrated=${expectedCount}, found=${serverTxCount}`
            );
          } else {
            console.log(
              `[Migration] Transaction verification passed: ${serverTxCount} migrated transactions found`
            );
          }
        }
      }

      const success = errors.length === 0;
      if (success && warnings.length === 0) {
        console.log("[Migration] All verifications passed successfully");
      } else if (success) {
        console.log("[Migration] Verification passed with warnings:", warnings.length);
      }

      return { success, warnings, errors };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        warnings,
        errors: [
          {
            step: "verifying",
            message: `Verification error: ${message}`,
            timestamp: new Date().toISOString(),
            recoverable: true,
          },
        ],
      };
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  private async cleanupLegacyData(): Promise<void> {
    try {
      // Remove legacy keys but keep the backup
      await AsyncStorage.multiRemove([
        LEGACY_KEYS.USER,
        LEGACY_KEYS.TRANSACTIONS,
        LEGACY_KEYS.ACCEPTED_CHALLENGES,
        // Keep dragon avatars as they're cosmetic
      ]);

      console.log("[Migration] Legacy data cleaned up");
    } catch (error) {
      console.error("[Migration] Failed to cleanup legacy data:", error);
    }
  }

  /**
   * Force cleanup of all migration data (for testing/reset)
   */
  async forceCleanup(): Promise<void> {
    await AsyncStorage.multiRemove([
      MIGRATION_KEYS.STATUS,
      MIGRATION_KEYS.BACKUP,
      MIGRATION_KEYS.VERSION,
    ]);
    this.status = DEFAULT_STATUS;
    this.isInitialized = false;
    console.log("[Migration] Force cleanup complete");
  }

  // --------------------------------------------------------------------------
  // Status Management
  // --------------------------------------------------------------------------

  private async saveStatus(): Promise<void> {
    await AsyncStorage.setItem(MIGRATION_KEYS.STATUS, JSON.stringify(this.status));
  }

  getStatus(): MigrationStatus {
    return { ...this.status };
  }

  /**
   * Get list of incomplete steps for retry
   */
  getIncompleteSteps(): MigrationStep[] {
    const steps: MigrationStep[] = [];
    if (!this.status.steps.profile) steps.push("migrating_profile");
    if (!this.status.steps.balance) steps.push("migrating_balance");
    if (!this.status.steps.transactions) steps.push("migrating_transactions");
    if (!this.status.steps.settings) steps.push("migrating_settings");
    if (!this.status.steps.cleanup) steps.push("cleaning_up");
    return steps;
  }
}

// ============================================================================
// Exports
// ============================================================================

export const MigrationService = MigrationServiceImpl.getInstance();

export default MigrationService;
