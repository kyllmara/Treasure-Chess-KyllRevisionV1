/**
 * React Hook for Tournament Admin Management
 *
 * Provides admin-specific tournament operations:
 * create, start, cancel tournaments with loading/error state.
 */

import { useState, useCallback } from "react";
import type {
  Tournament,
  StartTournamentResult,
} from "@/lib/tournament.types";
import {
  fetchAllTournaments,
  adminCreateTournament,
  adminStartTournament,
  adminCancelTournament,
  adminUpdateTournament,
  type CreateTournamentParams,
  type UpdateTournamentParams,
} from "@/lib/tournament";

// ============================================================================
// Types
// ============================================================================

export interface UseTournamentAdminReturn {
  // Data
  tournaments: Tournament[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTournaments: () => Promise<void>;
  createTournament: (
    params: CreateTournamentParams,
    adminId: string
  ) => Promise<{ success: boolean; error?: string; tournament_id?: string }>;
  startTournament: (
    tournamentId: string,
    adminId: string
  ) => Promise<StartTournamentResult>;
  cancelTournament: (
    tournamentId: string,
    adminId: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateTournament: (
    tournamentId: string,
    params: UpdateTournamentParams
  ) => Promise<{ success: boolean; error?: string }>;

  // Action states
  isCreating: boolean;
  isStarting: boolean;
  isCancelling: boolean;
  isUpdating: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useTournamentAdmin(): UseTournamentAdminReturn {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllTournaments();
      setTournaments(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load tournaments";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createTournament = useCallback(
    async (params: CreateTournamentParams, adminId: string) => {
      setIsCreating(true);
      setError(null);
      try {
        const result = await adminCreateTournament(params, adminId);
        if (result.success) {
          await loadTournaments();
        } else {
          setError(result.error || "Failed to create tournament");
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create tournament";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsCreating(false);
      }
    },
    [loadTournaments]
  );

  const startTournament = useCallback(
    async (tournamentId: string, adminId: string) => {
      setIsStarting(true);
      setError(null);
      try {
        const result = await adminStartTournament(tournamentId, adminId);
        if (result.success) {
          await loadTournaments();
        } else {
          setError(result.error || "Failed to start tournament");
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to start tournament";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsStarting(false);
      }
    },
    [loadTournaments]
  );

  const cancelTournament = useCallback(
    async (tournamentId: string, adminId: string) => {
      setIsCancelling(true);
      setError(null);
      try {
        const result = await adminCancelTournament(tournamentId, adminId);
        if (result.success) {
          await loadTournaments();
        } else {
          setError(result.error || "Failed to cancel tournament");
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to cancel tournament";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsCancelling(false);
      }
    },
    [loadTournaments]
  );

  const updateTournament = useCallback(
    async (tournamentId: string, params: UpdateTournamentParams) => {
      setIsUpdating(true);
      setError(null);
      try {
        const result = await adminUpdateTournament(tournamentId, params);
        if (result.success) {
          await loadTournaments();
        } else {
          setError(result.error || "Failed to update tournament");
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update tournament";
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsUpdating(false);
      }
    },
    [loadTournaments]
  );

  return {
    tournaments,
    isLoading,
    error,
    loadTournaments,
    createTournament,
    startTournament,
    cancelTournament,
    updateTournament,
    isCreating,
    isStarting,
    isCancelling,
    isUpdating,
  };
}

export default useTournamentAdmin;
