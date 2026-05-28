/**
 * React Hook for Matchmaking
 *
 * Provides a clean React interface for the matchmaking service
 * with automatic lifecycle management and state updates.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  MatchmakingService,
  createMatchmakingService,
  MatchmakingConfig,
  MatchmakingStatus,
  MatchResult,
  QueueStats,
  QueueEntry,
} from "@/lib/matchmaking";

// ============================================================================
// Types
// ============================================================================

export interface UseMatchmakingOptions {
  userId: string;
  onMatchFound?: (result: MatchResult) => void;
  onError?: (error: Error) => void;
}

export interface UseMatchmakingReturn {
  // Status
  status: MatchmakingStatus;
  isSearching: boolean;
  isMatched: boolean;
  error: Error | null;

  // Queue info
  queueEntry: QueueEntry | null;
  queueStats: QueueStats | null;
  searchDuration: number;

  // Match result
  matchResult: MatchResult | null;

  // Actions
  joinQueue: (config: Omit<MatchmakingConfig, "userId">) => Promise<boolean>;
  leaveQueue: () => Promise<boolean>;
  refreshStats: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMatchmaking({
  userId,
  onMatchFound,
  onError,
}: UseMatchmakingOptions): UseMatchmakingReturn {
  // State
  const [status, setStatus] = useState<MatchmakingStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [searchDuration, setSearchDuration] = useState(0);

  // Refs
  const serviceRef = useRef<MatchmakingService | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Create service with callbacks
  useEffect(() => {
    serviceRef.current = createMatchmakingService(userId, {
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === "idle" || newStatus === "cancelled" || newStatus === "expired") {
          stopDurationTimer();
        }
      },
      onMatchFound: (result) => {
        setMatchResult(result);
        stopDurationTimer();
        onMatchFound?.(result);
      },
      onQueueStatsUpdate: (stats) => {
        setQueueStats(stats);
      },
      onError: (err) => {
        setError(err);
        onError?.(err);
      },
    });

    return () => {
      serviceRef.current?.destroy();
      stopDurationTimer();
    };
  }, [userId, onMatchFound, onError]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current === "active" &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - keep searching but stop duration timer
        stopDurationTimer();
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App coming back - resume duration timer if searching
        if (serviceRef.current?.getStatus() === "searching") {
          startDurationTimer();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // Duration timer helpers
  const startDurationTimer = useCallback(() => {
    stopDurationTimer();
    durationIntervalRef.current = setInterval(() => {
      if (serviceRef.current) {
        setSearchDuration(serviceRef.current.getSearchDuration());
      }
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Actions
  const joinQueue = useCallback(
    async (config: Omit<MatchmakingConfig, "userId">): Promise<boolean> => {
      if (!serviceRef.current) return false;

      setError(null);
      setMatchResult(null);
      setSearchDuration(0);

      const entry = await serviceRef.current.joinQueue({
        ...config,
        userId,
      });

      if (entry) {
        setQueueEntry(entry);
        startDurationTimer();
        return true;
      }

      return false;
    },
    [userId, startDurationTimer]
  );

  const leaveQueue = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current) return false;

    stopDurationTimer();
    const success = await serviceRef.current.leaveQueue();

    if (success) {
      setQueueEntry(null);
      setQueueStats(null);
      setSearchDuration(0);
    }

    return success;
  }, [stopDurationTimer]);

  const refreshStats = useCallback(async (): Promise<void> => {
    if (!serviceRef.current) return;
    await serviceRef.current.getQueueStats();
  }, []);

  // Computed values
  const isSearching = status === "searching" || status === "joining";
  const isMatched = status === "matched";

  return {
    status,
    isSearching,
    isMatched,
    error,
    queueEntry,
    queueStats,
    searchDuration,
    matchResult,
    joinQueue,
    leaveQueue,
    refreshStats,
  };
}

export default useMatchmaking;
