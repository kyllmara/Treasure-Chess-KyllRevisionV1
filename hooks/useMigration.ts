/**
 * Migration Hook
 *
 * React hook for managing data migration from local storage to Supabase.
 * Automatically detects if migration is needed and provides UI control.
 *
 * @example
 * function App() {
 *   const { needsMigration, showMigrationScreen, ... } = useMigration();
 *
 *   if (needsMigration) {
 *     return <MigrationScreen visible={showMigrationScreen} ... />;
 *   }
 *
 *   return <MainApp />;
 * }
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MigrationService,
  type MigrationStatus,
  type MigrationProgress,
  type MigrationResult,
} from "@/lib/migration";
import { useUserStore } from "@/stores/userStore";

// ============================================================================
// Types
// ============================================================================

export interface UseMigrationReturn {
  // State
  isChecking: boolean;
  needsMigration: boolean;
  showMigrationScreen: boolean;
  migrationStatus: MigrationStatus | null;

  // Summary
  summary: {
    hasUser: boolean;
    transactionCount: number;
    localBalance: number;
    localBalanceTct: number;
    localElo: number;
    gamesPlayed: number;
  } | null;

  // Actions
  checkMigration: () => Promise<boolean>;
  openMigrationScreen: () => void;
  closeMigrationScreen: () => void;
  skipMigration: () => void;
  onMigrationComplete: (success: boolean) => void;

  // Rollback
  canRollback: boolean;
  rollback: () => Promise<{ success: boolean; error?: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const MIGRATION_CHECK_DELAY = 1000; // Wait 1 second after auth before checking

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMigration(): UseMigrationReturn {
  const userStore = useUserStore();
  const userId = userStore.profile?.id;

  // State
  const [isChecking, setIsChecking] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [showMigrationScreen, setShowMigrationScreen] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [canRollback, setCanRollback] = useState(false);
  const [summary, setSummary] = useState<UseMigrationReturn["summary"]>(null);
  const [skipped, setSkipped] = useState(false);

  // Refs
  const hasChecked = useRef(false);

  // --------------------------------------------------------------------------
  // Migration Check
  // --------------------------------------------------------------------------

  const checkMigration = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      setIsChecking(false);
      return false;
    }

    setIsChecking(true);

    try {
      await MigrationService.initialize();

      const needs = await MigrationService.needsMigration();
      setNeedsMigration(needs);

      if (needs) {
        const migrationSummary = await MigrationService.getMigrationSummary();
        setSummary(migrationSummary);
      }

      const status = MigrationService.getStatus();
      setMigrationStatus(status);

      const rollbackAvailable = await MigrationService.canRollback();
      setCanRollback(rollbackAvailable);

      // Auto-show migration screen if needed and not skipped
      if (needs && !skipped) {
        setShowMigrationScreen(true);
      }

      return needs;
    } catch (error) {
      console.error("[useMigration] Check failed:", error);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [userId, skipped]);

  // --------------------------------------------------------------------------
  // Auto-check on mount and user change
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!userId || hasChecked.current) return;

    // Delay check to ensure auth is fully settled
    const timer = setTimeout(() => {
      hasChecked.current = true;
      checkMigration();
    }, MIGRATION_CHECK_DELAY);

    return () => clearTimeout(timer);
  }, [userId, checkMigration]);

  // Reset when user changes
  useEffect(() => {
    if (!userId) {
      hasChecked.current = false;
      setNeedsMigration(false);
      setShowMigrationScreen(false);
      setSkipped(false);
    }
  }, [userId]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const openMigrationScreen = useCallback(() => {
    setShowMigrationScreen(true);
  }, []);

  const closeMigrationScreen = useCallback(() => {
    setShowMigrationScreen(false);
  }, []);

  const skipMigration = useCallback(() => {
    setSkipped(true);
    setShowMigrationScreen(false);
  }, []);

  const onMigrationComplete = useCallback(
    async (success: boolean) => {
      setShowMigrationScreen(false);

      if (success) {
        setNeedsMigration(false);

        // Refresh user data from server
        if (userId) {
          try {
            await userStore.syncWithServer();
          } catch (error) {
            console.error("[useMigration] Failed to sync after migration:", error);
          }
        }
      }

      // Update status
      const status = MigrationService.getStatus();
      setMigrationStatus(status);

      const rollbackAvailable = await MigrationService.canRollback();
      setCanRollback(rollbackAvailable);
    },
    [userId, userStore]
  );

  const rollback = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await MigrationService.rollback();

    if (result.success) {
      // Re-check migration status
      await checkMigration();
    }

    return result;
  }, [checkMigration]);

  // --------------------------------------------------------------------------
  // Return
  // --------------------------------------------------------------------------

  return {
    isChecking,
    needsMigration,
    showMigrationScreen,
    migrationStatus,
    summary,
    checkMigration,
    openMigrationScreen,
    closeMigrationScreen,
    skipMigration,
    onMigrationComplete,
    canRollback,
    rollback,
  };
}

/**
 * Simplified hook for settings screen rollback option
 */
export function useMigrationRollback(): {
  canRollback: boolean;
  isRollingBack: boolean;
  rollback: () => Promise<{ success: boolean; error?: string }>;
  expiresAt: string | null;
} {
  const [canRollback, setCanRollback] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const available = await MigrationService.canRollback();
      setCanRollback(available);

      if (available) {
        const status = MigrationService.getStatus();
        setExpiresAt(status.rollbackExpiresAt);
      }
    }
    check();
  }, []);

  const rollback = useCallback(async () => {
    setIsRollingBack(true);
    try {
      const result = await MigrationService.rollback();
      if (result.success) {
        setCanRollback(false);
      }
      return result;
    } finally {
      setIsRollingBack(false);
    }
  }, []);

  return {
    canRollback,
    isRollingBack,
    rollback,
    expiresAt,
  };
}

export default useMigration;
