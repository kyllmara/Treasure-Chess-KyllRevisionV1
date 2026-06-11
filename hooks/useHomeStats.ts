/**
 * Home Stats Hook
 *
 * Elite-standard hook for home screen statistics synchronization with Supabase.
 * Combines profile and wallet data into a single, optimized data source.
 *
 * Features:
 * - Real-time ELO and balance subscriptions
 * - Animated value changes with spring physics
 * - Offline mode with cached data fallback
 * - Screen focus refresh with debounce
 * - Comprehensive error handling
 * - Type-safe throughout
 *
 * @example
 * const { stats, isLoading, isOnline, syncNow } = useHomeStats();
 *
 * // Access combined stats
 * console.log(stats?.eloRating, stats?.availableTct, stats?.gamesWon);
 *
 * // Animated values for smooth transitions
 * <AnimatedText value={animatedElo} />
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { AppState, type AppStateStatus, Animated } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useUserStore } from "@/stores/userStore";
import { useWalletStore } from "@/stores/walletStore";
import { useAuth } from "@/hooks/useAuth";
import { NetworkMonitor, type NetworkState } from "@/lib/networkMonitor";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Profile, Balance } from "@/types/supabase";

// ============================================================================
// Types
// ============================================================================

/**
 * Combined stats from profile and wallet for home screen display
 */
export interface HomeStats {
  // Profile stats
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  username: string;
  avatarIndex: number;

  // Wallet stats (in TCT)
  availableTct: number;
  lockedTct: number;
  totalWonTct: number;
  totalLostTct: number;

  // Computed values
  winRate: number;
  netEarningsTct: number;
}

/**
 * Value change event for animation triggers
 */
export interface ValueChangeEvent {
  field: "eloRating" | "availableTct" | "gamesWon" | "gamesLost";
  previousValue: number;
  newValue: number;
  change: number;
  timestamp: number;
}

/**
 * Sync status for UI indicators
 */
export interface SyncStatus {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  isOnline: boolean;
}

/**
 * Hook return type
 */
export interface UseHomeStatsResult {
  // Data
  stats: HomeStats | null;

  // Loading states
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Sync status
  syncStatus: SyncStatus;

  // Value change tracking for animations
  lastValueChange: ValueChangeEvent | null;
  clearValueChange: () => void;

  // Animated values (pre-configured for spring animations)
  animatedValues: {
    eloRating: Animated.Value;
    availableTct: Animated.Value;
    gamesWon: Animated.Value;
    gamesLost: Animated.Value;
  };

  // Actions
  syncNow: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const TCT_TO_USD_RATE = 0.04;
const REFRESH_DEBOUNCE_MS = 2000; // Minimum time between refreshes
const VALUE_CHANGE_DISPLAY_MS = 4000; // Duration to show value change indicator
const ANIMATION_DURATION_MS = 600; // Spring animation duration

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate win rate percentage
 */
function calculateWinRate(won: number, played: number): number {
  if (played === 0) return 0;
  return Math.round((won / played) * 100);
}

/**
 * Calculate net earnings
 */
function calculateNetEarnings(won: number, lost: number): number {
  return won - lost;
}

/**
 * Map server data to HomeStats
 * The `balances.available_tct` row is the source of truth for TCT (off-chain ledger)
 */
function mapToHomeStats(profile: Profile, balance: Balance | null): HomeStats {
  const gamesWon = profile.games_won;
  const gamesLost = profile.games_lost;
  const gamesPlayed = profile.games_played;
  const totalWonTct = balance?.total_won_tct ?? 0;
  const totalLostTct = balance?.total_lost_tct ?? 0;

  return {
    eloRating: profile.elo_rating,
    gamesPlayed,
    gamesWon,
    gamesLost,
    gamesDrawn: profile.games_drawn,
    currentStreak: profile.current_streak,
    longestStreak: profile.longest_streak,
    username: profile.username,
    avatarIndex: profile.avatar_index,
    availableTct: balance?.available_tct ?? 0,
    lockedTct: balance?.locked_tct ?? 0,
    totalWonTct,
    totalLostTct,
    winRate: calculateWinRate(gamesWon, gamesPlayed),
    netEarningsTct: calculateNetEarnings(totalWonTct, totalLostTct),
  };
}

/**
 * Create default stats for offline/fallback
 */
function createDefaultStats(): HomeStats {
  return {
    eloRating: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDrawn: 0,
    currentStreak: 0,
    longestStreak: 0,
    username: "Guest",
    avatarIndex: 0,
    availableTct: 0,
    lockedTct: 0,
    totalWonTct: 0,
    totalLostTct: 0,
    winRate: 0,
    netEarningsTct: 0,
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useHomeStats(): UseHomeStatsResult {
  // External hooks
  const { isAuthenticated, isGuest } = useAuth();
  const userStore = useUserStore();
  const walletStore = useWalletStore();

  // State
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastValueChange, setLastValueChange] = useState<ValueChangeEvent | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    syncError: null,
    isOnline: true,
  });

  // Animated values with initial defaults
  const animatedValues = useMemo(() => ({
    eloRating: new Animated.Value(stats?.eloRating ?? 0),
    availableTct: new Animated.Value(stats?.availableTct ?? 0),
    gamesWon: new Animated.Value(stats?.gamesWon ?? 0),
    gamesLost: new Animated.Value(stats?.gamesLost ?? 0),
  }), []); // Only create once

  // Refs
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const lastRefreshRef = useRef<number>(0);
  const valueChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStatsRef = useRef<HomeStats | null>(null);
  const isInitializedRef = useRef(false);

  // --------------------------------------------------------------------------
  // Animated Value Updates
  // --------------------------------------------------------------------------

  const animateValue = useCallback((
    animatedValue: Animated.Value,
    toValue: number,
    field: ValueChangeEvent["field"],
    previousValue: number
  ) => {
    // Trigger value change event for UI indicators
    const change = toValue - previousValue;
    if (change !== 0) {
      // Clear existing timeout
      if (valueChangeTimeoutRef.current) {
        clearTimeout(valueChangeTimeoutRef.current);
      }

      setLastValueChange({
        field,
        previousValue,
        newValue: toValue,
        change,
        timestamp: Date.now(),
      });

      // Auto-clear after duration
      valueChangeTimeoutRef.current = setTimeout(() => {
        setLastValueChange(null);
      }, VALUE_CHANGE_DISPLAY_MS);
    }

    // Animate to new value with spring physics
    Animated.spring(animatedValue, {
      toValue,
      friction: 8,
      tension: 40,
      useNativeDriver: false, // Required for text value interpolation
    }).start();
  }, []);

  const updateAnimatedValues = useCallback((newStats: HomeStats, prevStats: HomeStats | null) => {
    if (__DEV__) {
      console.log("[useHomeStats] updateAnimatedValues called", {
        newAvailableTct: newStats.availableTct,
        prevAvailableTct: prevStats?.availableTct,
        hasPrevStats: !!prevStats,
      });
    }

    if (!prevStats) {
      // First load - set values immediately without animation
      if (__DEV__) console.log("[useHomeStats] First load, setting values immediately:", newStats.availableTct);
      animatedValues.eloRating.setValue(newStats.eloRating);
      animatedValues.availableTct.setValue(newStats.availableTct);
      animatedValues.gamesWon.setValue(newStats.gamesWon);
      animatedValues.gamesLost.setValue(newStats.gamesLost);
      return;
    }

    // Always update animated values, even if the same (for initial render issues)
    // Use setValue for instant update when values match, or animate when they differ
    if (newStats.eloRating !== prevStats.eloRating) {
      animateValue(
        animatedValues.eloRating,
        newStats.eloRating,
        "eloRating",
        prevStats.eloRating
      );
    } else {
      // Force set to ensure UI is in sync
      animatedValues.eloRating.setValue(newStats.eloRating);
    }

    if (newStats.availableTct !== prevStats.availableTct) {
      if (__DEV__) console.log("[useHomeStats] Balance changed, animating:", prevStats.availableTct, "->", newStats.availableTct);
      animateValue(
        animatedValues.availableTct,
        newStats.availableTct,
        "availableTct",
        prevStats.availableTct
      );
    } else {
      // Force set to ensure UI is in sync
      animatedValues.availableTct.setValue(newStats.availableTct);
    }

    if (newStats.gamesWon !== prevStats.gamesWon) {
      animateValue(
        animatedValues.gamesWon,
        newStats.gamesWon,
        "gamesWon",
        prevStats.gamesWon
      );
    } else {
      animatedValues.gamesWon.setValue(newStats.gamesWon);
    }

    if (newStats.gamesLost !== prevStats.gamesLost) {
      animateValue(
        animatedValues.gamesLost,
        newStats.gamesLost,
        "gamesLost",
        prevStats.gamesLost
      );
    } else {
      animatedValues.gamesLost.setValue(newStats.gamesLost);
    }
  }, [animatedValues, animateValue]);

  // --------------------------------------------------------------------------
  // Data Fetching
  // --------------------------------------------------------------------------

  const fetchStats = useCallback(async (showLoadingState = true): Promise<HomeStats | null> => {
    const userId = userStore.profile?.id;

    if (!isSupabaseConfigured || !userId) {
      return null;
    }

    if (showLoadingState) {
      setSyncStatus(prev => ({ ...prev, isSyncing: true, syncError: null }));
    }

    try {
      // Fetch profile and balance in parallel
      const [profileResult, balanceResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single(),
        supabase
          .from("balances")
          .select("*")
          .eq("user_id", userId)
          .single(),
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      const profile = profileResult.data as Profile;
      const balance = balanceResult.error ? null : (balanceResult.data as Balance);

      const homeStats = mapToHomeStats(profile, balance);

      // Update animated values
      updateAnimatedValues(homeStats, previousStatsRef.current);
      previousStatsRef.current = homeStats;

      setStats(homeStats);
      setError(null);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncedAt: new Date(),
        syncError: null,
      }));

      return homeStats;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch stats";
      console.error("[useHomeStats] Fetch error:", err);
      setError(errorMessage);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncError: errorMessage,
      }));
      return null;
    }
  }, [userStore.profile?.id, updateAnimatedValues]);

  // --------------------------------------------------------------------------
  // Refresh with Debounce
  // --------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshRef.current;

    // Debounce rapid refresh calls
    if (timeSinceLastRefresh < REFRESH_DEBOUNCE_MS) {
      console.log("[useHomeStats] Refresh debounced");
      return;
    }

    lastRefreshRef.current = now;
    setIsRefreshing(true);

    try {
      await fetchStats(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchStats]);

  const syncNow = useCallback(async () => {
    // Force refresh, bypassing debounce
    lastRefreshRef.current = 0;
    await refresh();
  }, [refresh]);

  // --------------------------------------------------------------------------
  // Real-time Subscriptions
  // --------------------------------------------------------------------------

  const setupRealtimeSubscription = useCallback(() => {
    const userId = userStore.profile?.id;

    if (!isSupabaseConfigured || !userId || realtimeChannelRef.current) {
      return;
    }

    try {
      const channel = supabase
        .channel(`home_stats_${userId}`)
      // Subscribe to profile changes (ELO, game stats)
      // Note: Removed filter due to Supabase Replica Identity requirements - filtering in callback instead
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          // Filter to only handle updates for this user
          if (payload.eventType === "UPDATE" && payload.new && payload.new.id === userId) {
            const serverProfile = payload.new as Profile;
            console.log("[useHomeStats] Profile update received via realtime");

            setStats(prev => {
              if (!prev) return prev;

              const newStats: HomeStats = {
                ...prev,
                eloRating: serverProfile.elo_rating,
                gamesPlayed: serverProfile.games_played,
                gamesWon: serverProfile.games_won,
                gamesLost: serverProfile.games_lost,
                gamesDrawn: serverProfile.games_drawn,
                currentStreak: serverProfile.current_streak,
                longestStreak: serverProfile.longest_streak,
                username: serverProfile.username, // Also update username
                avatarIndex: serverProfile.avatar_index, // Also update avatar
                winRate: calculateWinRate(serverProfile.games_won, serverProfile.games_played),
              };

              // Trigger animations
              updateAnimatedValues(newStats, previousStatsRef.current);
              previousStatsRef.current = newStats;

              return newStats;
            });

            // Also update userStore for other components
            userStore.updateProfile({
              eloRating: serverProfile.elo_rating,
              gamesPlayed: serverProfile.games_played,
              gamesWon: serverProfile.games_won,
              gamesLost: serverProfile.games_lost,
              gamesDrawn: serverProfile.games_drawn,
              currentStreak: serverProfile.current_streak,
              longestStreak: serverProfile.longest_streak,
              username: serverProfile.username, // Also update username in userStore
              avatarIndex: serverProfile.avatar_index, // Also update avatar in userStore
            });

            setSyncStatus(prev => ({ ...prev, lastSyncedAt: new Date() }));
          }
        }
      )
      // Subscribe to balance changes
      // Note: Removed filter due to Supabase Replica Identity requirements - filtering in callback instead
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "balances",
        },
        (payload) => {
          // Filter to only handle updates for this user
          if (payload.eventType === "UPDATE" && payload.new && payload.new.user_id === userId) {
            const serverBalance = payload.new as Balance;
            console.log("[useHomeStats] Balance update received via realtime");

            setStats(prev => {
              if (!prev) return prev;

              const newStats: HomeStats = {
                ...prev,
                availableTct: serverBalance.available_tct,
                lockedTct: serverBalance.locked_tct,
                totalWonTct: serverBalance.total_won_tct,
                totalLostTct: serverBalance.total_lost_tct,
                netEarningsTct: calculateNetEarnings(
                  serverBalance.total_won_tct,
                  serverBalance.total_lost_tct
                ),
              };

              // Trigger animations
              updateAnimatedValues(newStats, previousStatsRef.current);
              previousStatsRef.current = newStats;

              return newStats;
            });

            setSyncStatus(prev => ({ ...prev, lastSyncedAt: new Date() }));
          }
        }
      )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            console.log("[useHomeStats] Real-time subscription active");
          } else if (status === "CHANNEL_ERROR") {
            // Log error but don't spam console - this often happens with auth issues
            console.log("[useHomeStats] Real-time channel error, will retry on next mount", err?.message || "");
            // Clean up failed channel so it can be recreated
            if (realtimeChannelRef.current) {
              supabase.removeChannel(realtimeChannelRef.current);
              realtimeChannelRef.current = null;
            }
          } else if (status === "TIMED_OUT") {
            console.log("[useHomeStats] Real-time subscription timed out");
          } else if (status === "CLOSED") {
            console.log("[useHomeStats] Real-time subscription closed");
            realtimeChannelRef.current = null;
          }
        });

      realtimeChannelRef.current = channel;
    } catch (e) {
      // Silently fail - real-time is not critical, polling will still work
      console.log("[useHomeStats] Failed to setup real-time subscription:", e instanceof Error ? e.message : String(e));
    }
  }, [userStore.profile?.id, userStore.updateProfile, updateAnimatedValues]);

  const cleanupRealtimeSubscription = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
      console.log("[useHomeStats] Real-time subscription cleaned up");
    }
  }, []);

  // --------------------------------------------------------------------------
  // Network Status
  // --------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = NetworkMonitor.subscribe((state: NetworkState) => {
      setSyncStatus(prev => ({ ...prev, isOnline: state.isConnected }));

      // Refresh when coming back online
      if (state.isConnected && !syncStatus.isOnline) {
        console.log("[useHomeStats] Back online, refreshing");
        refresh();
      }
    });

    // Set initial network state
    const initialState = NetworkMonitor.getState();
    setSyncStatus(prev => ({ ...prev, isOnline: initialState.isConnected }));

    return unsubscribe;
  }, [syncStatus.isOnline, refresh]);

  // --------------------------------------------------------------------------
  // Initialize from Cached Data
  // --------------------------------------------------------------------------

  const initializeFromCache = useCallback(() => {
    const profile = userStore.profile;

    if (profile) {
      const cachedStats: HomeStats = {
        eloRating: profile.eloRating,
        gamesPlayed: profile.gamesPlayed,
        gamesWon: profile.gamesWon,
        gamesLost: profile.gamesLost,
        gamesDrawn: profile.gamesDrawn,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        username: profile.username,
        avatarIndex: profile.avatarIndex,
        availableTct: profile.availableTct,
        lockedTct: profile.lockedTct,
        totalWonTct: profile.totalWonTct,
        totalLostTct: profile.totalLostTct,
        winRate: calculateWinRate(profile.gamesWon, profile.gamesPlayed),
        netEarningsTct: calculateNetEarnings(profile.totalWonTct, profile.totalLostTct),
      };

      setStats(cachedStats);
      previousStatsRef.current = cachedStats;

      // Set initial animated values
      animatedValues.eloRating.setValue(cachedStats.eloRating);
      animatedValues.availableTct.setValue(cachedStats.availableTct);
      animatedValues.gamesWon.setValue(cachedStats.gamesWon);
      animatedValues.gamesLost.setValue(cachedStats.gamesLost);

      return cachedStats;
    }

    return null;
  }, [userStore.profile, animatedValues]);

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated || isGuest || isInitializedRef.current) {
      if (!isAuthenticated || isGuest) {
        // Reset for unauthenticated users
        setStats(null);
        setIsLoading(false);
        setError(null);
      }
      return;
    }

    async function initialize() {
      isInitializedRef.current = true;

      // First, try to display cached data immediately
      const cached = initializeFromCache();
      if (cached) {
        setIsLoading(false); // Show cached data while fetching fresh
      }

      // Then fetch fresh data from server
      await fetchStats(true);
      setIsLoading(false);

      // Setup real-time subscription
      setupRealtimeSubscription();
    }

    initialize();

    return () => {
      cleanupRealtimeSubscription();
      if (valueChangeTimeoutRef.current) {
        clearTimeout(valueChangeTimeoutRef.current);
      }
    };
  }, [
    isAuthenticated,
    isGuest,
    initializeFromCache,
    fetchStats,
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
  ]);

  // --------------------------------------------------------------------------
  // Screen Focus Effect
  // --------------------------------------------------------------------------

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && !isGuest && isInitializedRef.current) {
        console.log("[useHomeStats] Screen focused, refreshing");
        refresh();
      }
    }, [isAuthenticated, isGuest, refresh])
  );

  // --------------------------------------------------------------------------
  // AppState Handling (Background/Foreground)
  // --------------------------------------------------------------------------

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active" && isAuthenticated && !isGuest) {
          console.log("[useHomeStats] App foregrounded, refreshing");
          refresh();
        }
      }
    );

    return () => subscription.remove();
  }, [isAuthenticated, isGuest, refresh]);

  // --------------------------------------------------------------------------
  // Clear Value Change
  // --------------------------------------------------------------------------

  const clearValueChange = useCallback(() => {
    if (valueChangeTimeoutRef.current) {
      clearTimeout(valueChangeTimeoutRef.current);
      valueChangeTimeoutRef.current = null;
    }
    setLastValueChange(null);
  }, []);

  // --------------------------------------------------------------------------
  // Return Value
  // --------------------------------------------------------------------------

  return {
    stats,
    isLoading,
    isRefreshing,
    error,
    syncStatus,
    lastValueChange,
    clearValueChange,
    animatedValues,
    syncNow,
    refresh,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for just the animated ELO value
 * Use for simple ELO display with animation
 */
export function useAnimatedElo(): {
  value: Animated.Value;
  currentElo: number;
  change: number | null;
  isAnimating: boolean;
} {
  const { stats, animatedValues, lastValueChange } = useHomeStats();

  return {
    value: animatedValues.eloRating,
    currentElo: stats?.eloRating ?? 0,
    change: lastValueChange?.field === "eloRating" ? lastValueChange.change : null,
    isAnimating: lastValueChange?.field === "eloRating",
  };
}

/**
 * Hook for just the animated balance value
 * Use for simple balance display with animation
 */
export function useAnimatedBalance(): {
  value: Animated.Value;
  currentTct: number;
  currentUsd: number;
  change: number | null;
  isAnimating: boolean;
} {
  const { stats, animatedValues, lastValueChange } = useHomeStats();

  return {
    value: animatedValues.availableTct,
    currentTct: stats?.availableTct ?? 0,
    currentUsd: (stats?.availableTct ?? 0) * TCT_TO_USD_RATE,
    change: lastValueChange?.field === "availableTct" ? lastValueChange.change : null,
    isAnimating: lastValueChange?.field === "availableTct",
  };
}

/**
 * Hook for sync status indicator
 */
export function useHomeStatsSyncStatus(): SyncStatus & { retry: () => Promise<void> } {
  const { syncStatus, syncNow } = useHomeStats();

  return {
    ...syncStatus,
    retry: syncNow,
  };
}

export default useHomeStats;
