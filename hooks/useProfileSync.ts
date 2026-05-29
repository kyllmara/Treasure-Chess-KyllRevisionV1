/**
 * Profile Sync Hook
 *
 * React hook that integrates ProfileSyncService with app state.
 *
 * Features:
 * - Automatic sync on mount/unmount
 * - AppState-aware background sync
 * - ELO change detection with animation triggers
 * - Sync status for UI indicators
 * - Integration with userStore
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  profileSyncService,
  type SyncableProfile,
  type SyncState,
} from "@/lib/profileSync";
import { useUserStore } from "@/stores/userStore";
import { useAuth } from "@/contexts/AuthContext";

// ============================================================================
// Types
// ============================================================================

export interface EloChangeInfo {
  previousElo: number;
  newElo: number;
  change: number;
  timestamp: number;
}

export interface ProfileSyncHookResult {
  // Profile data
  profile: SyncableProfile | null;

  // Sync state
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  pendingChanges: number;
  isOnline: boolean;

  // ELO change tracking
  eloChange: EloChangeInfo | null;
  clearEloChange: () => void;

  // Actions
  syncNow: () => Promise<void>;
  updateProfile: (updates: Partial<SyncableProfile>) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Username validation
  checkUsernameAvailable: (username: string) => Promise<boolean>;
}

// ============================================================================
// Constants
// ============================================================================

const ELO_CHANGE_DISPLAY_DURATION = 5000; // 5 seconds to show ELO change

// ============================================================================
// Hook Implementation
// ============================================================================

export function useProfileSync(): ProfileSyncHookResult {
  const { profile: authProfile, user, isAuthenticated } = useAuth();
  const userStore = useUserStore();

  // Local state
  const [profile, setProfile] = useState<SyncableProfile | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: null,
    syncError: null,
    pendingChanges: 0,
    isOnline: true,
  });
  const [eloChange, setEloChange] = useState<EloChangeInfo | null>(null);

  // Refs
  const isInitialized = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const eloChangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --------------------------------------------------------------------------
  // Initialize sync service
  // --------------------------------------------------------------------------

  useEffect(() => {
    async function initialize() {
      if (!isAuthenticated || !user?.authUserId || isInitialized.current) {
        return;
      }

      isInitialized.current = true;

      // Subscribe to profile changes
      const unsubProfile = profileSyncService.onProfileChange((newProfile) => {
        setProfile(newProfile);

        // Update userStore with synced data
        userStore.updateProfile({
          eloRating: newProfile.eloRating,
          gamesPlayed: newProfile.gamesPlayed,
          gamesWon: newProfile.gamesWon,
          gamesLost: newProfile.gamesLost,
          gamesDrawn: newProfile.gamesDrawn,
          currentStreak: newProfile.currentStreak,
          longestStreak: newProfile.longestStreak,
          username: newProfile.username,
          avatarIndex: newProfile.avatarIndex,
          soundEnabled: newProfile.soundEnabled,
          musicEnabled: newProfile.musicEnabled,
          hapticEnabled: newProfile.hapticEnabled,
          notificationsEnabled: newProfile.notificationsEnabled,
        });
      });

      // Subscribe to sync state changes
      const unsubSyncState = profileSyncService.onSyncStateChange((state) => {
        setSyncState(state);
      });

      // Subscribe to ELO changes
      const unsubElo = profileSyncService.onEloChange((oldElo, newElo, change) => {
        // Clear any existing timer
        if (eloChangeTimer.current) {
          clearTimeout(eloChangeTimer.current);
        }

        // Set new ELO change
        setEloChange({
          previousElo: oldElo,
          newElo: newElo,
          change: change,
          timestamp: Date.now(),
        });

        // Auto-clear after duration
        eloChangeTimer.current = setTimeout(() => {
          setEloChange(null);
        }, ELO_CHANGE_DISPLAY_DURATION);
      });

      // Initialize the service
      const initialProfile = await profileSyncService.initialize(user.authUserId);

      if (initialProfile) {
        setProfile(initialProfile);
      }

      // Cleanup function
      return () => {
        unsubProfile();
        unsubSyncState();
        unsubElo();
        if (eloChangeTimer.current) {
          clearTimeout(eloChangeTimer.current);
        }
      };
    }

    const cleanup = initialize();

    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [isAuthenticated, user?.authUserId]);

  // --------------------------------------------------------------------------
  // AppState handling for background sync
  // --------------------------------------------------------------------------

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        // Coming back to foreground
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          // Sync profile when app comes to foreground
          profileSyncService.forceSyncNow();
        }

        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // --------------------------------------------------------------------------
  // Cleanup on unmount
  // --------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      // Note: Don't cleanup the service here as it may be used by other components
      // The service will cleanup when the user logs out
      if (eloChangeTimer.current) {
        clearTimeout(eloChangeTimer.current);
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const syncNow = useCallback(async () => {
    await profileSyncService.forceSyncNow();
  }, []);

  const updateProfileAction = useCallback(
    async (updates: Partial<SyncableProfile>) => {
      const result = await profileSyncService.updateProfile(updates);

      if (result.success && result.profile) {
        // The profileChange callback will update the userStore
      }

      return {
        success: result.success,
        error: result.error,
      };
    },
    []
  );

  const clearEloChange = useCallback(() => {
    if (eloChangeTimer.current) {
      clearTimeout(eloChangeTimer.current);
      eloChangeTimer.current = null;
    }
    setEloChange(null);
  }, []);

  const checkUsernameAvailable = useCallback(
    async (username: string): Promise<boolean> => {
      // Skip check for own username
      if (profile && profile.username.toLowerCase() === username.toLowerCase()) {
        return true;
      }

      try {
        const { data, error } = await (await import("@/lib/supabase")).supabase
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .limit(1);

        if (error) throw error;

        return !data || data.length === 0;
      } catch (error) {
        console.error("[useProfileSync] Username check error:", error);
        return false;
      }
    },
    [profile]
  );

  // --------------------------------------------------------------------------
  // Return value
  // --------------------------------------------------------------------------

  return {
    profile,
    isSyncing: syncState.isSyncing,
    lastSyncedAt: syncState.lastSyncedAt,
    syncError: syncState.syncError,
    pendingChanges: syncState.pendingChanges,
    isOnline: syncState.isOnline,
    eloChange,
    clearEloChange,
    syncNow,
    updateProfile: updateProfileAction,
    checkUsernameAvailable,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for just ELO tracking with animation support
 */
export function useEloTracking() {
  const [eloState, setEloState] = useState<{
    currentElo: number;
    previousElo: number | null;
    change: number | null;
    animating: boolean;
  }>({
    currentElo: 1200,
    previousElo: null,
    change: null,
    animating: false,
  });

  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = profileSyncService.onEloChange((oldElo, newElo, change) => {
      // Clear existing timer
      if (animationTimer.current) {
        clearTimeout(animationTimer.current);
      }

      // Start animation
      setEloState({
        currentElo: newElo,
        previousElo: oldElo,
        change: change,
        animating: true,
      });

      // End animation after delay
      animationTimer.current = setTimeout(() => {
        setEloState((prev) => ({
          ...prev,
          previousElo: null,
          change: null,
          animating: false,
        }));
      }, 3000);
    });

    // Get initial ELO
    const profile = profileSyncService.getCurrentProfile();
    if (profile) {
      setEloState((prev) => ({
        ...prev,
        currentElo: profile.eloRating,
      }));
    }

    return () => {
      unsubscribe();
      if (animationTimer.current) {
        clearTimeout(animationTimer.current);
      }
    };
  }, []);

  return eloState;
}

/**
 * Hook for sync status indicator
 */
export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    isOnline: boolean;
    lastSyncedAt: string | null;
    pendingChanges: number;
    hasError: boolean;
    errorMessage: string | null;
  }>({
    isSyncing: false,
    isOnline: true,
    lastSyncedAt: null,
    pendingChanges: 0,
    hasError: false,
    errorMessage: null,
  });

  useEffect(() => {
    const unsubscribe = profileSyncService.onSyncStateChange((state) => {
      setSyncStatus({
        isSyncing: state.isSyncing,
        isOnline: state.isOnline,
        lastSyncedAt: state.lastSyncedAt,
        pendingChanges: state.pendingChanges,
        hasError: !!state.syncError,
        errorMessage: state.syncError,
      });
    });

    // Get initial state
    const initialState = profileSyncService.getSyncState();
    setSyncStatus({
      isSyncing: initialState.isSyncing,
      isOnline: initialState.isOnline,
      lastSyncedAt: initialState.lastSyncedAt,
      pendingChanges: initialState.pendingChanges,
      hasError: !!initialState.syncError,
      errorMessage: initialState.syncError,
    });

    return unsubscribe;
  }, []);

  const retry = useCallback(async () => {
    await profileSyncService.forceSyncNow();
  }, []);

  return { ...syncStatus, retry };
}

/**
 * Hook for profile updates with optimistic UI
 */
export function useProfileUpdate() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (
      updates: Partial<SyncableProfile>
    ): Promise<{ success: boolean; error?: string }> => {
      setIsUpdating(true);
      setError(null);

      try {
        const result = await profileSyncService.updateProfile(updates);

        if (!result.success) {
          setError(result.error || "Update failed");
        }

        return result;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    update,
    isUpdating,
    error,
    clearError,
  };
}

export default useProfileSync;
