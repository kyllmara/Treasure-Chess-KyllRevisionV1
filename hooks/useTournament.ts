/**
 * React Hook for Tournament Management
 *
 * Provides a clean React interface for the tournament service
 * with automatic lifecycle management, realtime updates, and state management.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import type {
  Tournament,
  TournamentWithDetails,
  TournamentRegistration,
  TournamentMatch,
  TournamentPrize,
  TournamentListFilters,
  TournamentStatus,
  TournamentType,
  SwissStanding,
  BracketNode,
  TournamentSubscriptionCallbacks,
} from "@/lib/tournament.types";
import {
  fetchTournaments,
  fetchActiveTournaments,
  fetchTournamentById,
  fetchTournamentWithDetails,
  registerForTournament,
  unregisterFromTournament,
  isUserRegistered,
  getUserRegistration,
  fetchTournamentBracket,
  getUserCurrentMatch,
  getUserMatches,
  fetchTournamentStandings,
  fetchTournamentPrizes,
  subscribeToTournament,
  unsubscribeFromTournament,
  isRegistrationOpen,
  getTimeUntilStart,
  formatTimeRemaining,
} from "@/lib/tournament";
import {
  calculateSwissStandings,
  buildBracketTree,
  organizeMatchesByRound,
} from "@/lib/tournamentBracket";

// ============================================================================
// Types
// ============================================================================

export interface UseTournamentsOptions {
  filters?: TournamentListFilters;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseTournamentsReturn {
  tournaments: Tournament[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface UseTournamentOptions {
  tournamentId: string;
  userId?: string;
  autoSubscribe?: boolean;
  onMatchReady?: (match: TournamentMatch) => void;
  onTournamentCompleted?: (tournament: Tournament) => void;
  onError?: (error: Error) => void;
}

export interface UseTournamentReturn {
  // Tournament data
  tournament: TournamentWithDetails | null;
  isLoading: boolean;
  error: Error | null;

  // User's registration
  userRegistration: TournamentRegistration | null;
  isRegistered: boolean;

  // Bracket data
  bracket: TournamentMatch[];
  bracketTree: BracketNode | null;
  matchesByRound: Map<number, TournamentMatch[]>;

  // Standings (for Swiss)
  standings: SwissStanding[];

  // User's matches
  userMatches: TournamentMatch[];
  currentMatch: TournamentMatch | null;

  // Prizes
  prizes: TournamentPrize[];

  // Time info
  timeUntilStart: number;
  formattedTimeUntilStart: string;
  canRegister: boolean;

  // Actions
  register: () => Promise<{ success: boolean; error?: string }>;
  unregister: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

export interface UseTournamentRegistrationOptions {
  tournamentId: string;
  userId: string;
  onRegistered?: () => void;
  onUnregistered?: () => void;
  onError?: (error: Error) => void;
}

export interface UseTournamentRegistrationReturn {
  isRegistered: boolean;
  registration: TournamentRegistration | null;
  isRegistering: boolean;
  isUnregistering: boolean;
  error: Error | null;
  register: () => Promise<boolean>;
  unregister: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

// ============================================================================
// useTournaments - List of tournaments
// ============================================================================

export function useTournaments({
  filters,
  autoRefresh = false,
  refreshInterval = 30000,
}: UseTournamentsOptions = {}): UseTournamentsReturn {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadTournaments = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTournaments(filters);
      setTournaments(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load tournaments"));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTournaments();

    if (autoRefresh) {
      refreshTimerRef.current = setInterval(loadTournaments, refreshInterval);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [loadTournaments, autoRefresh, refreshInterval]);

  return {
    tournaments,
    isLoading,
    error,
    refresh: loadTournaments,
  };
}

// ============================================================================
// useActiveTournaments - Active/upcoming tournaments
// ============================================================================

export function useActiveTournaments(): UseTournamentsReturn {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTournaments = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);
      const data = await fetchActiveTournaments();
      setTournaments(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load tournaments"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  return {
    tournaments,
    isLoading,
    error,
    refresh: loadTournaments,
  };
}

// ============================================================================
// useTournament - Single tournament with details
// ============================================================================

export function useTournament({
  tournamentId,
  userId,
  autoSubscribe = true,
  onMatchReady,
  onTournamentCompleted,
  onError,
}: UseTournamentOptions): UseTournamentReturn {
  // State
  const [tournament, setTournament] = useState<TournamentWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bracket, setBracket] = useState<TournamentMatch[]>([]);
  const [userMatches, setUserMatches] = useState<TournamentMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState<TournamentMatch | null>(null);
  const [standings, setStandings] = useState<SwissStanding[]>([]);
  const [prizes, setPrizes] = useState<TournamentPrize[]>([]);
  const [timeUntilStart, setTimeUntilStart] = useState(0);

  // Refs
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const timeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load tournament data
  const loadTournament = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTournamentWithDetails(tournamentId, userId);
      setTournament(data);

      // Load bracket
      if (data.matches) {
        setBracket(data.matches);
      } else {
        const bracketData = await fetchTournamentBracket(tournamentId);
        setBracket(bracketData);
      }

      // Calculate standings for Swiss
      if (data.type === "swiss" && data.registrations) {
        const swissStandings = calculateSwissStandings(data.registrations);
        setStandings(swissStandings);
      }

      // Load prizes
      if (data.prizes) {
        setPrizes(data.prizes);
      } else {
        const prizeData = await fetchTournamentPrizes(tournamentId);
        setPrizes(prizeData);
      }

      // Load user matches
      if (userId) {
        const userMatchData = await getUserMatches(tournamentId, userId);
        setUserMatches(userMatchData);

        const current = await getUserCurrentMatch(tournamentId, userId);
        setCurrentMatch(current);
      }

      // Calculate time until start
      setTimeUntilStart(getTimeUntilStart(data));
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to load tournament");
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [tournamentId, userId, onError]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!autoSubscribe) return;

    const callbacks: TournamentSubscriptionCallbacks = {
      onTournamentUpdated: (updated) => {
        setTournament((prev) => (prev ? { ...prev, ...updated } : null));
        setTimeUntilStart(getTimeUntilStart(updated));
      },
      onRegistrationAdded: (registration) => {
        setTournament((prev) => {
          if (!prev) return null;
          const registrations = prev.registrations || [];
          return {
            ...prev,
            registrations: [...registrations, registration],
            current_players: prev.current_players + 1,
          };
        });
      },
      onRegistrationRemoved: (removedUserId) => {
        setTournament((prev) => {
          if (!prev) return null;
          const registrations = prev.registrations?.filter(
            (r) => r.user_id !== removedUserId
          );
          return {
            ...prev,
            registrations,
            current_players: Math.max(0, prev.current_players - 1),
          };
        });
      },
      onMatchUpdated: (match) => {
        setBracket((prev) =>
          prev.map((m) => (m.id === match.id ? match : m))
        );
        if (userId && (match.player1_id === userId || match.player2_id === userId)) {
          setUserMatches((prev) =>
            prev.map((m) => (m.id === match.id ? match : m))
          );
          if (match.status === "pending" && match.player1_id && match.player2_id) {
            setCurrentMatch(match);
            onMatchReady?.(match);
          } else if (match.status === "completed") {
            setCurrentMatch(null);
          }
        }
      },
      onTournamentCompleted: (completed) => {
        setTournament((prev) => (prev ? { ...prev, ...completed } : null));
        onTournamentCompleted?.(completed);
      },
      onError: (err) => {
        setError(err);
        onError?.(err);
      },
    };

    subscriptionRef.current = subscribeToTournament(tournamentId, callbacks);

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [tournamentId, userId, autoSubscribe, onMatchReady, onTournamentCompleted, onError]);

  // Update time until start
  useEffect(() => {
    if (!tournament) return;

    const updateTime = () => {
      setTimeUntilStart(getTimeUntilStart(tournament));
    };

    timeIntervalRef.current = setInterval(updateTime, 1000);

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
    };
  }, [tournament]);

  // Initial load
  useEffect(() => {
    loadTournament();
  }, [loadTournament]);

  // Computed values
  const userRegistration = useMemo(() => {
    if (!tournament || !userId) return null;
    return tournament.user_registration || null;
  }, [tournament, userId]);

  const isRegistered = !!userRegistration;

  const bracketTree = useMemo(() => {
    if (bracket.length === 0) return null;
    return buildBracketTree(bracket);
  }, [bracket]);

  const matchesByRound = useMemo(() => {
    return organizeMatchesByRound(bracket);
  }, [bracket]);

  const canRegister = useMemo(() => {
    if (!tournament) return false;
    return (
      isRegistrationOpen(tournament) &&
      tournament.current_players < tournament.max_players
    );
  }, [tournament]);

  const formattedTimeUntilStart = useMemo(() => {
    return formatTimeRemaining(timeUntilStart);
  }, [timeUntilStart]);

  // Actions
  const register = useCallback(async () => {
    if (!userId) return { success: false, error: "Not logged in" };
    const result = await registerForTournament(tournamentId, userId);
    if (result.success) {
      await loadTournament();
    }
    return result;
  }, [tournamentId, userId, loadTournament]);

  const unregister = useCallback(async () => {
    if (!userId) return { success: false, error: "Not logged in" };
    const result = await unregisterFromTournament(tournamentId, userId);
    if (result.success) {
      await loadTournament();
    }
    return result;
  }, [tournamentId, userId, loadTournament]);

  return {
    tournament,
    isLoading,
    error,
    userRegistration,
    isRegistered,
    bracket,
    bracketTree,
    matchesByRound,
    standings,
    userMatches,
    currentMatch,
    prizes,
    timeUntilStart,
    formattedTimeUntilStart,
    canRegister,
    register,
    unregister,
    refresh: loadTournament,
  };
}

// ============================================================================
// useTournamentRegistration - Registration-only hook
// ============================================================================

export function useTournamentRegistration({
  tournamentId,
  userId,
  onRegistered,
  onUnregistered,
  onError,
}: UseTournamentRegistrationOptions): UseTournamentRegistrationReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [registration, setRegistration] = useState<TournamentRegistration | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkRegistration = useCallback(async () => {
    try {
      const registered = await isUserRegistered(tournamentId, userId);
      setIsRegistered(registered);

      if (registered) {
        const reg = await getUserRegistration(tournamentId, userId);
        setRegistration(reg);
      } else {
        setRegistration(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to check registration");
      setError(error);
      onError?.(error);
    }
  }, [tournamentId, userId, onError]);

  useEffect(() => {
    checkRegistration();
  }, [checkRegistration]);

  const register = useCallback(async () => {
    setIsRegistering(true);
    setError(null);

    try {
      const result = await registerForTournament(tournamentId, userId);
      if (result.success) {
        setIsRegistered(true);
        await checkRegistration();
        onRegistered?.();
        return true;
      } else {
        setError(new Error(result.error || "Registration failed"));
        return false;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Registration failed");
      setError(error);
      onError?.(error);
      return false;
    } finally {
      setIsRegistering(false);
    }
  }, [tournamentId, userId, checkRegistration, onRegistered, onError]);

  const unregister = useCallback(async () => {
    setIsUnregistering(true);
    setError(null);

    try {
      const result = await unregisterFromTournament(tournamentId, userId);
      if (result.success) {
        setIsRegistered(false);
        setRegistration(null);
        onUnregistered?.();
        return true;
      } else {
        setError(new Error(result.error || "Unregistration failed"));
        return false;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unregistration failed");
      setError(error);
      onError?.(error);
      return false;
    } finally {
      setIsUnregistering(false);
    }
  }, [tournamentId, userId, onUnregistered, onError]);

  return {
    isRegistered,
    registration,
    isRegistering,
    isUnregistering,
    error,
    register,
    unregister,
    refresh: checkRegistration,
  };
}

// ============================================================================
// useTournamentCountdown - Countdown timer hook
// ============================================================================

export interface UseTournamentCountdownReturn {
  timeRemaining: number;
  formatted: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export function useTournamentCountdown(
  targetDate: string | Date | null
): UseTournamentCountdownReturn {
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    if (!targetDate) {
      setTimeRemaining(0);
      return;
    }

    const target = new Date(targetDate).getTime();

    const updateTime = () => {
      const now = Date.now();
      const remaining = Math.max(0, target - now);
      setTimeRemaining(remaining);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  const seconds = Math.floor((timeRemaining / 1000) % 60);
  const minutes = Math.floor((timeRemaining / (1000 * 60)) % 60);
  const hours = Math.floor((timeRemaining / (1000 * 60 * 60)) % 24);
  const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));

  const formatted = useMemo(() => {
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }, [days, hours, minutes, seconds]);

  return {
    timeRemaining,
    formatted,
    days,
    hours,
    minutes,
    seconds,
    isExpired: timeRemaining === 0,
  };
}

export default useTournament;
