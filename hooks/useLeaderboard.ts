/**
 * useLeaderboard Hook
 *
 * Elite-level hook for leaderboard data management with:
 * - Real-time Supabase integration
 * - Time period filtering (All-Time, Monthly, Weekly)
 * - Stale-while-revalidate caching pattern
 * - Current user rank highlighting
 * - Rank change tracking with persistence
 * - Optimistic updates and error recovery
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchLeaderboard,
  fetchUserRankContext,
  clearLeaderboardCache,
  TimePeriod,
  LeaderboardPlayer,
  LeaderboardResult,
} from "@/lib/leaderboard";
import { useAuth } from "@/contexts/AuthContext";

// ============================================================================
// Types
// ============================================================================

export type SortBy = "elo" | "earnings" | "wins";

export interface RankChange {
  playerId: string;
  previousRank: number;
  currentRank: number;
  direction: "up" | "down" | "same" | "new";
  change: number;
}

export interface UseLeaderboardOptions {
  /** Initial time period filter */
  initialPeriod?: TimePeriod;
  /** Number of players to fetch */
  limit?: number;
  /** Enable real-time updates */
  enableRealtime?: boolean;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
}

export interface UseLeaderboardReturn {
  // Data
  players: LeaderboardPlayer[];
  currentUserRank: number | null;
  currentUserPlayer: LeaderboardPlayer | null;
  totalPlayers: number;
  rankChanges: Map<string, RankChange>;

  // State
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  lastUpdated: Date | null;

  // Filters
  timePeriod: TimePeriod;
  sortBy: SortBy;

  // Actions
  setTimePeriod: (period: TimePeriod) => void;
  setSortBy: (sort: SortBy) => void;
  refresh: () => Promise<void>;
  forceRefresh: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const RANK_HISTORY_KEY = "@leaderboard_rank_history";
const STALE_TIME_MS = 60 * 1000; // 1 minute
const DEFAULT_LIMIT = 100;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useLeaderboard(
  options: UseLeaderboardOptions = {}
): UseLeaderboardReturn {
  const {
    initialPeriod = "all",
    limit = DEFAULT_LIMIT,
    enableRealtime = true,
    refreshInterval = 0,
  } = options;

  const { user } = useAuth();
  const currentUserId = user?.id;

  // State
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserPlayer, setCurrentUserPlayer] =
    useState<LeaderboardPlayer | null>(null);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [rankChanges, setRankChanges] = useState<Map<string, RankChange>>(
    new Map()
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [timePeriod, setTimePeriod] = useState<TimePeriod>(initialPeriod);
  const [sortBy, setSortBy] = useState<SortBy>("elo");

  // Refs
  const subscriptionRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // ============================================================================
  // Rank Change Tracking
  // ============================================================================

  /**
   * Load previous rank history from AsyncStorage
   */
  const loadRankHistory = useCallback(async (): Promise<
    Map<string, number>
  > => {
    try {
      const stored = await AsyncStorage.getItem(RANK_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Map(Object.entries(parsed));
      }
    } catch (err) {
      console.warn("Failed to load rank history:", err);
    }
    return new Map();
  }, []);

  /**
   * Save current ranks to AsyncStorage for future comparison
   */
  const saveRankHistory = useCallback(
    async (playerList: LeaderboardPlayer[]) => {
      try {
        const history: Record<string, number> = {};
        playerList.forEach((player) => {
          history[player.id] = player.rank;
        });
        await AsyncStorage.setItem(RANK_HISTORY_KEY, JSON.stringify(history));
      } catch (err) {
        console.warn("Failed to save rank history:", err);
      }
    },
    []
  );

  /**
   * Calculate rank changes by comparing current ranks to stored history
   */
  const calculateRankChanges = useCallback(
    async (
      currentPlayers: LeaderboardPlayer[]
    ): Promise<Map<string, RankChange>> => {
      const changes = new Map<string, RankChange>();
      const previousRanks = await loadRankHistory();

      currentPlayers.forEach((player) => {
        const previousRank = previousRanks.get(player.id);

        if (previousRank === undefined) {
          // New player on leaderboard
          changes.set(player.id, {
            playerId: player.id,
            previousRank: 0,
            currentRank: player.rank,
            direction: "new",
            change: 0,
          });
        } else if (previousRank !== player.rank) {
          const change = previousRank - player.rank;
          changes.set(player.id, {
            playerId: player.id,
            previousRank,
            currentRank: player.rank,
            direction: change > 0 ? "up" : "down",
            change: Math.abs(change),
          });
        } else {
          changes.set(player.id, {
            playerId: player.id,
            previousRank,
            currentRank: player.rank,
            direction: "same",
            change: 0,
          });
        }
      });

      // Save current ranks for next comparison
      await saveRankHistory(currentPlayers);

      return changes;
    },
    [loadRankHistory, saveRankHistory]
  );

  // ============================================================================
  // Data Fetching
  // ============================================================================

  /**
   * Fetch leaderboard data with error handling
   */
  const fetchData = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!isMountedRef.current) return;

      try {
        const result = await fetchLeaderboard(
          timePeriod,
          limit,
          currentUserId,
          forceRefresh
        );

        if (!isMountedRef.current) return;

        // Sort players based on sortBy
        let sortedPlayers = [...result.players];
        if (sortBy === "earnings") {
          sortedPlayers.sort((a, b) => b.totalWonTct - a.totalWonTct);
          // Recalculate ranks after sorting
          sortedPlayers = sortedPlayers.map((p, i) => ({ ...p, rank: i + 1 }));
        } else if (sortBy === "wins") {
          sortedPlayers.sort((a, b) => b.gamesWon - a.gamesWon);
          sortedPlayers = sortedPlayers.map((p, i) => ({ ...p, rank: i + 1 }));
        }

        setPlayers(sortedPlayers);
        setCurrentUserRank(result.currentUserRank);
        setTotalPlayers(result.totalPlayers);
        setLastUpdated(result.fetchedAt);
        setError(null);

        // Calculate rank changes
        const changes = await calculateRankChanges(sortedPlayers);
        setRankChanges(changes);

        // Find current user in the list
        if (currentUserId) {
          const userPlayer = sortedPlayers.find((p) => p.id === currentUserId);
          setCurrentUserPlayer(userPlayer || null);

          // If user not in top list, fetch their specific rank context
          if (!userPlayer && result.currentUserRank === null) {
            const userContext = await fetchUserRankContext(
              currentUserId,
              timePeriod
            );
            if (isMountedRef.current) {
              setCurrentUserRank(userContext.userRank);
              setCurrentUserPlayer(userContext.userPlayer);
            }
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("Leaderboard fetch error:", err);
        setError(
          err instanceof Error ? err : new Error("Failed to fetch leaderboard")
        );
      }
    },
    [timePeriod, limit, currentUserId, sortBy, calculateRankChanges]
  );

  /**
   * Initial load with loading state
   */
  const initialLoad = useCallback(async () => {
    setIsLoading(true);
    await fetchData(false);
    setIsLoading(false);
  }, [fetchData]);

  /**
   * Refresh with pull-to-refresh state (bypasses cache)
   */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    clearLeaderboardCache();
    await fetchData(true);
    setIsRefreshing(false);
  }, [fetchData]);

  /**
   * Force refresh, bypassing cache
   */
  const forceRefresh = useCallback(async () => {
    setIsRefreshing(true);
    clearLeaderboardCache();
    await fetchData(true);
    setIsRefreshing(false);
  }, [fetchData]);

  // ============================================================================
  // Real-time Subscription
  // ============================================================================

  /**
   * Set up real-time subscription to profile changes
   */
  const setupRealtimeSubscription = useCallback(() => {
    if (!isSupabaseConfigured || !enableRealtime) return;

    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    // Subscribe to profile ELO and username changes
    subscriptionRef.current = supabase
      .channel("leaderboard-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          // Throttle updates - refresh if ELO or username changes
          const newElo = payload.new?.elo_rating;
          const oldElo = payload.old?.elo_rating;
          const newUsername = payload.new?.username;
          const oldUsername = payload.old?.username;

          if (newElo !== oldElo || newUsername !== oldUsername) {
            // Debounce refresh to prevent too many updates
            if (refreshTimerRef.current) {
              clearTimeout(refreshTimerRef.current);
            }
            refreshTimerRef.current = setTimeout(() => {
              if (isMountedRef.current) {
                refresh();
              }
            }, 2000); // 2 second debounce
          }
        }
      )
      .subscribe();
  }, [enableRealtime, refresh]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    initialLoad();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reload when filters change
  useEffect(() => {
    if (!isLoading) {
      fetchData(false);
    }
  }, [timePeriod, sortBy]);

  // Set up real-time subscription
  useEffect(() => {
    setupRealtimeSubscription();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [setupRealtimeSubscription]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      if (isMountedRef.current) {
        fetchData(false);
      }
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval, fetchData]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Data
    players,
    currentUserRank,
    currentUserPlayer,
    totalPlayers,
    rankChanges,

    // State
    isLoading,
    isRefreshing,
    error,
    lastUpdated,

    // Filters
    timePeriod,
    sortBy,

    // Actions
    setTimePeriod,
    setSortBy,
    refresh,
    forceRefresh,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format rank with ordinal suffix (1st, 2nd, 3rd, etc.)
 */
export function formatRank(rank: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = rank % 100;
  return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Get color for rank badge based on position
 */
export function getRankColor(rank: number): string {
  switch (rank) {
    case 1:
      return "#FFD700"; // Gold
    case 2:
      return "#C0C0C0"; // Silver
    case 3:
      return "#CD7F32"; // Bronze
    default:
      return "#FFFFFF";
  }
}

/**
 * Get background color for rank badge
 */
export function getRankBackgroundColor(rank: number): string {
  switch (rank) {
    case 1:
      return "rgba(255, 215, 0, 0.15)";
    case 2:
      return "rgba(192, 192, 192, 0.15)";
    case 3:
      return "rgba(205, 127, 50, 0.15)";
    default:
      return "rgba(255, 255, 255, 0.05)";
  }
}
