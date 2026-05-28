/**
 * House Challenge Store
 *
 * Zustand store for house challenge state management.
 * Handles:
 * - Loading active challenges from database
 * - Managing current attempt state
 * - User's attempt history
 * - Challenge completion flow
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  HouseChallengeService,
  createHouseChallengeService,
} from "@/lib/houseChallenges";
import type {
  HouseChallenge,
  HouseChallengeAttempt,
  StartHouseChallengeResult,
  CompleteHouseChallengeResult,
} from "@/types/houseChallenge";

// ============================================================================
// Types
// ============================================================================

export interface HouseChallengeStoreState {
  // Challenge data
  challenges: HouseChallenge[];
  currentChallenge: HouseChallenge | null;

  // Attempt data
  currentAttempt: HouseChallengeAttempt | null;
  myAttempts: HouseChallengeAttempt[];

  // UI states
  isLoading: boolean;
  isStarting: boolean;
  isCompleting: boolean;
  error: string | null;

  // Internal
  _userId: string | null;
  _service: HouseChallengeService | null;
}

export interface EntryPaymentStatus {
  needsPayment: boolean;
  remainingAttempts: number;
  currentSessionId: string | null;
  attemptsPerEntry: number;
  canAttempt: boolean;
  errorMessage: string | null;
}

export interface HouseChallengeStoreActions {
  // Initialization
  initialize: (userId: string) => void;
  cleanup: () => void;

  // Challenge loading
  loadChallenges: () => Promise<void>;
  loadChallenge: (challengeId: string) => Promise<HouseChallenge | null>;
  refreshChallenges: () => Promise<void>;

  // Entry payment check
  checkNeedsEntryPayment: (challengeId: string) => Promise<EntryPaymentStatus>;

  // Attempt management
  startChallenge: (challengeId: string, entrySessionId?: string) => Promise<StartHouseChallengeResult>;
  completeChallenge: (
    attemptId: string,
    objectiveMet: boolean,
    movesMade: number,
    finalFen?: string,
    pgn?: string,
    checkmatingPiece?: string,
    queenSacrificed?: boolean
  ) => Promise<CompleteHouseChallengeResult>;
  processWinPayout: (attemptId: string) => Promise<{ success: boolean; txHash?: string; error?: string }>;
  forfeitChallenge: (attemptId: string) => Promise<boolean>;

  // Attempt history
  loadMyAttempts: () => Promise<void>;
  getCurrentAttempt: (challengeId: string) => Promise<HouseChallengeAttempt | null>;

  // State management
  setCurrentChallenge: (challenge: HouseChallenge | null) => void;
  setCurrentAttempt: (attempt: HouseChallengeAttempt | null) => void;
  clearError: () => void;
  resetState: () => void;
}

export type HouseChallengeStore = HouseChallengeStoreState & HouseChallengeStoreActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: Omit<HouseChallengeStoreState, "_userId" | "_service"> = {
  challenges: [],
  currentChallenge: null,
  currentAttempt: null,
  myAttempts: [],
  isLoading: false,
  isStarting: false,
  isCompleting: false,
  error: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useHouseChallengeStore = create<HouseChallengeStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    ...initialState,
    _userId: null,
    _service: null,

    // --------------------------------------------------------------------------
    // Initialization
    // --------------------------------------------------------------------------

    initialize: (userId: string) => {
      const state = get();

      // Avoid re-initialization with same user
      if (state._userId === userId && state._service) {
        return;
      }

      // Create service
      const service = createHouseChallengeService(userId);

      set({
        _userId: userId,
        _service: service,
      });

      // Load initial data
      get().loadChallenges();
      get().loadMyAttempts();
    },

    cleanup: () => {
      set({
        ...initialState,
        _userId: null,
        _service: null,
      });
    },

    // --------------------------------------------------------------------------
    // Challenge Loading
    // --------------------------------------------------------------------------

    loadChallenges: async () => {
      const state = get();
      const service = state._service || createHouseChallengeService(state._userId || undefined);

      set({ isLoading: true, error: null });

      try {
        const challenges = await service.getActiveChallenges();
        set({ challenges, isLoading: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load challenges";
        console.error("[HouseChallengeStore] loadChallenges error:", error);
        set({ isLoading: false, error: message });
      }
    },

    loadChallenge: async (challengeId: string) => {
      const state = get();
      const service = state._service || createHouseChallengeService(state._userId || undefined);

      set({ isLoading: true, error: null });

      try {
        const challenge = await service.getChallengeById(challengeId);
        if (challenge) {
          set({ currentChallenge: challenge, isLoading: false });
        } else {
          set({ isLoading: false, error: "Challenge not found" });
        }
        return challenge;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load challenge";
        console.error("[HouseChallengeStore] loadChallenge error:", error);
        set({ isLoading: false, error: message });
        return null;
      }
    },

    refreshChallenges: async () => {
      await get().loadChallenges();
    },

    // --------------------------------------------------------------------------
    // Entry Payment Check
    // --------------------------------------------------------------------------

    checkNeedsEntryPayment: async (challengeId: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        return { needsPayment: true, remainingAttempts: 0, currentSessionId: null, attemptsPerEntry: 1, canAttempt: false, errorMessage: "Not authenticated" };
      }

      try {
        return await state._service.checkNeedsEntryPayment(challengeId);
      } catch (error) {
        console.error("[HouseChallengeStore] checkNeedsEntryPayment error:", error);
        return { needsPayment: true, remainingAttempts: 0, currentSessionId: null, attemptsPerEntry: 1, canAttempt: false, errorMessage: "Failed to check eligibility" };
      }
    },

    // --------------------------------------------------------------------------
    // Attempt Management
    // --------------------------------------------------------------------------

    startChallenge: async (challengeId: string, entrySessionId?: string) => {
      const state = get();
      if (!state._service || !state._userId) {
        return { success: false, attempt_id: null, player_color: null, error_message: "Not authenticated" };
      }

      set({ isStarting: true, error: null });

      try {
        const result = await state._service.startChallenge(challengeId, entrySessionId);

        if (result.success && result.attempt_id) {
          // Load the challenge and attempt details
          const challenge = state.challenges.find(c => c.id === challengeId) ||
            await state._service.getChallengeById(challengeId);
          const attempt = await state._service.getAttemptById(result.attempt_id);

          set({
            isStarting: false,
            currentChallenge: challenge,
            currentAttempt: attempt,
          });
        } else {
          set({
            isStarting: false,
            error: result.error_message || "Failed to start challenge",
          });
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to start challenge";
        console.error("[HouseChallengeStore] startChallenge error:", error);
        set({ isStarting: false, error: message });
        return { success: false, attempt_id: null, player_color: null, error_message: message };
      }
    },

    completeChallenge: async (
      attemptId: string,
      objectiveMet: boolean,
      movesMade: number,
      finalFen?: string,
      pgn?: string,
      checkmatingPiece?: string,
      queenSacrificed?: boolean
    ) => {
      const state = get();
      if (!state._service) {
        return { success: false, won: false, payout_amount: null, error_message: "Not authenticated" };
      }

      // Defer state update to avoid setState during render
      queueMicrotask(() => set({ isCompleting: true, error: null }));

      try {
        const result = await state._service.completeChallenge(
          attemptId,
          objectiveMet,
          movesMade,
          finalFen,
          pgn,
          checkmatingPiece,
          queenSacrificed
        );

        if (result.success) {
          // Refresh attempt to get updated status
          const attempt = await state._service.getAttemptById(attemptId);
          set({
            isCompleting: false,
            currentAttempt: attempt,
          });

          // Refresh challenges to update attempt counts (deferred to avoid setState during render)
          setTimeout(() => {
            get().loadChallenges();
            get().loadMyAttempts();
          }, 0);
        } else {
          set({
            isCompleting: false,
            error: result.error_message || "Failed to complete challenge",
          });
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to complete challenge";
        console.error("[HouseChallengeStore] completeChallenge error:", error);
        set({ isCompleting: false, error: message });
        return { success: false, won: false, payout_amount: null, error_message: message };
      }
    },

    processWinPayout: async (attemptId: string) => {
      const state = get();
      if (!state._service) {
        return { success: false, error: "Not initialized" };
      }

      try {
        return await state._service.processWinPayout(attemptId);
      } catch (error) {
        console.error("[HouseChallengeStore] processWinPayout error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    forfeitChallenge: async (attemptId: string) => {
      const state = get();
      if (!state._service) {
        return false;
      }

      try {
        const result = await state._service.forfeitChallenge(attemptId);

        if (result.success) {
          set({ currentAttempt: null });
          // Deferred to avoid setState during render
          setTimeout(() => {
            get().loadChallenges();
            get().loadMyAttempts();
          }, 0);
        }

        return result.success;
      } catch (error) {
        console.error("[HouseChallengeStore] forfeitChallenge error:", error);
        return false;
      }
    },

    // --------------------------------------------------------------------------
    // Attempt History
    // --------------------------------------------------------------------------

    loadMyAttempts: async () => {
      const state = get();
      if (!state._service || !state._userId) return;

      try {
        const attempts = await state._service.getMyAttempts();
        set({ myAttempts: attempts });
      } catch (error) {
        console.error("[HouseChallengeStore] loadMyAttempts error:", error);
      }
    },

    getCurrentAttempt: async (challengeId: string) => {
      const state = get();
      if (!state._service || !state._userId) return null;

      try {
        const attempt = await state._service.getCurrentAttempt(challengeId);
        if (attempt) {
          set({ currentAttempt: attempt });
        }
        return attempt;
      } catch (error) {
        console.error("[HouseChallengeStore] getCurrentAttempt error:", error);
        return null;
      }
    },

    // --------------------------------------------------------------------------
    // State Management
    // --------------------------------------------------------------------------

    setCurrentChallenge: (challenge: HouseChallenge | null) => {
      set({ currentChallenge: challenge });
    },

    setCurrentAttempt: (attempt: HouseChallengeAttempt | null) => {
      set({ currentAttempt: attempt });
    },

    clearError: () => {
      set({ error: null });
    },

    resetState: () => {
      set({
        currentChallenge: null,
        currentAttempt: null,
        isLoading: false,
        isStarting: false,
        isCompleting: false,
        error: null,
      });
    },
  }))
);

// ============================================================================
// Selector Hooks
// ============================================================================

export const useHouseChallenges = () =>
  useHouseChallengeStore((state) => state.challenges);

export const useCurrentHouseChallenge = () =>
  useHouseChallengeStore((state) => state.currentChallenge);

export const useCurrentAttempt = () =>
  useHouseChallengeStore((state) => state.currentAttempt);

export const useMyHouseAttempts = () =>
  useHouseChallengeStore((state) => state.myAttempts);

export const useHouseChallengeLoading = () =>
  useHouseChallengeStore((state) => ({
    isLoading: state.isLoading,
    isStarting: state.isStarting,
    isCompleting: state.isCompleting,
  }));

export const useHouseChallengeError = () =>
  useHouseChallengeStore((state) => state.error);

export default useHouseChallengeStore;
