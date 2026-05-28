/**
 * Migration Context
 *
 * Provides migration state and controls throughout the app.
 * Automatically checks for and shows migration screen when needed.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useMigration, type UseMigrationReturn } from "@/hooks/useMigration";
import { MigrationScreen } from "@/components/MigrationScreen";
import { useUserStore } from "@/stores/userStore";
import { useAuth } from "@/hooks/useAuth";

// ============================================================================
// Context
// ============================================================================

interface MigrationContextValue extends Omit<UseMigrationReturn, "showMigrationScreen"> {
  // Expose all migration controls except internal screen state
}

const MigrationContext = createContext<MigrationContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface MigrationProviderProps {
  children: ReactNode;
}

export function MigrationProvider({ children }: MigrationProviderProps) {
  const { isAuthenticated, isGuest } = useAuth();
  const userStore = useUserStore();
  const userId = userStore.profile?.id;

  const {
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
  } = useMigration();

  // Only show migration for authenticated non-guest users
  const shouldShowMigration = isAuthenticated && !isGuest && showMigrationScreen && userId;

  const contextValue: MigrationContextValue = {
    isChecking,
    needsMigration,
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

  return (
    <MigrationContext.Provider value={contextValue}>
      {children}
      {shouldShowMigration && userId && (
        <MigrationScreen
          visible={true}
          userId={userId}
          onComplete={onMigrationComplete}
          onSkip={skipMigration}
        />
      )}
    </MigrationContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useMigrationContext(): MigrationContextValue {
  const context = useContext(MigrationContext);
  if (!context) {
    throw new Error("useMigrationContext must be used within a MigrationProvider");
  }
  return context;
}

export default MigrationProvider;
