/**
 * useChallenges Hook
 *
 * React hook for managing challenge lifecycle with real-time updates.
 * Provides a clean interface for:
 * - Creating challenges with room codes
 * - Joining challenges by code
 * - Browsing public challenge board
 * - Real-time challenge status updates
 * - Challenge lifecycle management
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChallengeService,
  Challenge,
  ChallengePlayer,
  ChallengeFilters,
  ChallengeStatus,
  CreateChallengeParams,
  generateRoomCode,
} from "@/lib/challenges";
import { useAuthStore } from "@/stores/authStore";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface UseChallengesState {
  // My challenges
  myCreatedChallenges: Challenge[];
  myReceivedChallenges: Challenge[];

  // Public board
  publicChallenges: Challenge[];

  // Current challenge being viewed/managed
  currentChallenge: Challenge | null;

  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isJoining: boolean;
  isCancelling: boolean;

  // Error states
  error: string | null;

  // Joined challenge (after acceptance)
  joinedGameId: string | null;
}

export interface UseChallengesActions {
  // Challenge creation
  createChallenge: (params: Omit<CreateChallengeParams, "creatorId">) => Promise<Challenge | null>;
  createPrivateChallenge: (
    params: Omit<CreateChallengeParams, "creatorId" | "isPublic">
  ) => Promise<{ challenge: Challenge; roomCode: string } | null>;

  // Challenge joining
  joinByRoomCode: (roomCode: string) => Promise<Challenge | null>;
  joinChallenge: (challengeId: string) => Promise<boolean>;

  // Challenge management
  cancelChallenge: (challengeId: string) => Promise<boolean>;
  declineChallenge: (challengeId: string) => Promise<boolean>;

  // Fetch operations
  refreshMyChallenges: () => Promise<void>;
  refreshPublicBoard: (filters?: ChallengeFilters) => Promise<void>;
  loadChallenge: (challengeId: string) => Promise<Challenge | null>;
  searchByRoomCode: (roomCode: string) => Promise<Challenge | null>;

  // Cleanup
  clearError: () => void;
  clearJoinedGame: () => void;
  reset: () => void;
}

export type UseChallengesReturn = UseChallengesState & UseChallengesActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: UseChallengesState = {
  myCreatedChallenges: [],
  myReceivedChallenges: [],
  publicChallenges: [],
  currentChallenge: null,
  isLoading: false,
  isCreating: false,
  isJoining: false,
  isCancelling: false,
  error: null,
  joinedGameId: null,
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useChallenges(): UseChallengesReturn {
  const [state, setState] = useState<UseChallengesState>(initialState);
  const { user } = useAuthStore();

  // Service and subscription refs
  const serviceRef = useRef<ChallengeService | null>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);
  const publicSubscriptionRef = useRef<RealtimeChannel | null>(null);

  // --------------------------------------------------------------------------
  // State Helpers
  // --------------------------------------------------------------------------

  const updateState = useCallback((updates: Partial<UseChallengesState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setError = useCallback((error: string | null) => {
    updateState({ error });
  }, [updateState]);

  // --------------------------------------------------------------------------
  // Service Initialization
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (user?.id && !serviceRef.current) {
      serviceRef.current = new ChallengeService(user.id);
    }

    return () => {
      // Cleanup subscriptions
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      if (publicSubscriptionRef.current) {
        publicSubscriptionRef.current.unsubscribe();
        publicSubscriptionRef.current = null;
      }
    };
  }, [user?.id]);

  // --------------------------------------------------------------------------
  // Real-time Subscriptions
  // --------------------------------------------------------------------------

  const setupMyChallengesSubscription = useCallback(() => {
    if (!serviceRef.current || !user?.id) return;

    // Cleanup existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    subscriptionRef.current = serviceRef.current.subscribeToChallenges(
      (challenge: Challenge) => {
        setState((prev) => {
          const isCreator = challenge.creator_id === user.id;

          // Handle challenge status changes
          if (challenge.status === "accepted" && challenge.game_id) {
            // Challenge was accepted - store game ID
            if (isCreator || challenge.opponent_id === user.id) {
              return {
                ...prev,
                joinedGameId: challenge.game_id,
                currentChallenge: challenge,
                myCreatedChallenges: isCreator
                  ? prev.myCreatedChallenges.map((c) =>
                      c.id === challenge.id ? challenge : c
                    )
                  : prev.myCreatedChallenges,
                myReceivedChallenges: !isCreator
                  ? prev.myReceivedChallenges.map((c) =>
                      c.id === challenge.id ? challenge : c
                    )
                  : prev.myReceivedChallenges,
              };
            }
          }

          // Update appropriate list
          if (isCreator) {
            const exists = prev.myCreatedChallenges.some(
              (c) => c.id === challenge.id
            );
            return {
              ...prev,
              currentChallenge:
                prev.currentChallenge?.id === challenge.id
                  ? challenge
                  : prev.currentChallenge,
              myCreatedChallenges: exists
                ? prev.myCreatedChallenges.map((c) =>
                    c.id === challenge.id ? challenge : c
                  )
                : [challenge, ...prev.myCreatedChallenges],
            };
          } else if (challenge.opponent_id === user.id) {
            const exists = prev.myReceivedChallenges.some(
              (c) => c.id === challenge.id
            );
            return {
              ...prev,
              currentChallenge:
                prev.currentChallenge?.id === challenge.id
                  ? challenge
                  : prev.currentChallenge,
              myReceivedChallenges: exists
                ? prev.myReceivedChallenges.map((c) =>
                    c.id === challenge.id ? challenge : c
                  )
                : [challenge, ...prev.myReceivedChallenges],
            };
          }

          return prev;
        });
      }
    );
  }, [user?.id]);

  const setupPublicBoardSubscription = useCallback(() => {
    if (!serviceRef.current) return;

    // Cleanup existing subscription
    if (publicSubscriptionRef.current) {
      publicSubscriptionRef.current.unsubscribe();
    }

    publicSubscriptionRef.current =
      serviceRef.current.subscribeToPublicChallenges(
        (challenge: Challenge) => {
          setState((prev) => {
            // Don't show my own challenges in public board
            if (challenge.creator_id === user?.id) {
              return prev;
            }

            // Handle different statuses
            if (
              challenge.status === "pending" &&
              challenge.is_public
            ) {
              // Add or update challenge
              const exists = prev.publicChallenges.some(
                (c) => c.id === challenge.id
              );
              return {
                ...prev,
                publicChallenges: exists
                  ? prev.publicChallenges.map((c) =>
                      c.id === challenge.id ? challenge : c
                    )
                  : [challenge, ...prev.publicChallenges],
              };
            } else {
              // Remove from public board
              return {
                ...prev,
                publicChallenges: prev.publicChallenges.filter(
                  (c) => c.id !== challenge.id
                ),
              };
            }
          });
        }
      );
  }, [user?.id]);

  // Setup subscriptions when user is available
  useEffect(() => {
    if (user?.id && serviceRef.current) {
      setupMyChallengesSubscription();
    }
  }, [user?.id, setupMyChallengesSubscription]);

  // --------------------------------------------------------------------------
  // Challenge Creation
  // --------------------------------------------------------------------------

  const createChallenge = useCallback(
    async (
      params: Omit<CreateChallengeParams, "creatorId">
    ): Promise<Challenge | null> => {
      if (!serviceRef.current || !user?.id) {
        setError("Not authenticated");
        return null;
      }

      updateState({ isCreating: true, error: null });

      try {
        const challenge = await serviceRef.current.createChallenge({
          ...params,
          creatorId: user.id,
        });

        if (challenge) {
          setState((prev) => ({
            ...prev,
            isCreating: false,
            currentChallenge: challenge,
            myCreatedChallenges: [challenge, ...prev.myCreatedChallenges],
          }));
          return challenge;
        } else {
          updateState({
            isCreating: false,
            error: "Failed to create challenge",
          });
          return null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create challenge";
        updateState({ isCreating: false, error: message });
        return null;
      }
    },
    [user?.id, updateState, setError]
  );

  const createPrivateChallenge = useCallback(
    async (
      params: Omit<CreateChallengeParams, "creatorId" | "isPublic">
    ): Promise<{ challenge: Challenge; roomCode: string } | null> => {
      const roomCode = generateRoomCode();

      const challenge = await createChallenge({
        ...params,
        isPublic: false,
        roomCode,
      });

      if (challenge) {
        return { challenge, roomCode };
      }

      return null;
    },
    [createChallenge]
  );

  // --------------------------------------------------------------------------
  // Challenge Joining
  // --------------------------------------------------------------------------

  const joinByRoomCode = useCallback(
    async (roomCode: string): Promise<Challenge | null> => {
      if (!serviceRef.current || !user?.id) {
        setError("Not authenticated");
        return null;
      }

      updateState({ isJoining: true, error: null });

      try {
        const result = await serviceRef.current.acceptChallengeByCode(roomCode);

        if (result.success && result.challenge) {
          updateState({
            isJoining: false,
            currentChallenge: result.challenge,
            joinedGameId: result.gameId || null,
          });
          return result.challenge;
        } else {
          updateState({
            isJoining: false,
            error: result.error || "Failed to join challenge",
          });
          return null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join challenge";
        updateState({ isJoining: false, error: message });
        return null;
      }
    },
    [user?.id, updateState, setError]
  );

  const joinChallenge = useCallback(
    async (challengeId: string): Promise<boolean> => {
      if (!serviceRef.current || !user?.id) {
        setError("Not authenticated");
        return false;
      }

      updateState({ isJoining: true, error: null });

      try {
        const result = await serviceRef.current.acceptChallenge(challengeId);

        if (result.success) {
          updateState({
            isJoining: false,
            joinedGameId: result.gameId || null,
          });

          // Remove from public challenges if present
          setState((prev) => ({
            ...prev,
            publicChallenges: prev.publicChallenges.filter(
              (c) => c.id !== challengeId
            ),
          }));

          return true;
        } else {
          updateState({
            isJoining: false,
            error: result.error || "Failed to join challenge",
          });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join challenge";
        updateState({ isJoining: false, error: message });
        return false;
      }
    },
    [user?.id, updateState, setError]
  );

  // --------------------------------------------------------------------------
  // Challenge Management
  // --------------------------------------------------------------------------

  const cancelChallenge = useCallback(
    async (challengeId: string): Promise<boolean> => {
      if (!serviceRef.current) {
        setError("Not authenticated");
        return false;
      }

      updateState({ isCancelling: true, error: null });

      try {
        const success = await serviceRef.current.cancelChallenge(challengeId);

        if (success) {
          setState((prev) => ({
            ...prev,
            isCancelling: false,
            myCreatedChallenges: prev.myCreatedChallenges.filter(
              (c) => c.id !== challengeId
            ),
            currentChallenge:
              prev.currentChallenge?.id === challengeId
                ? null
                : prev.currentChallenge,
          }));
          return true;
        } else {
          updateState({
            isCancelling: false,
            error: "Failed to cancel challenge",
          });
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to cancel challenge";
        updateState({ isCancelling: false, error: message });
        return false;
      }
    },
    [updateState, setError]
  );

  const declineChallenge = useCallback(
    async (challengeId: string): Promise<boolean> => {
      if (!serviceRef.current) {
        setError("Not authenticated");
        return false;
      }

      try {
        const success = await serviceRef.current.declineChallenge(challengeId);

        if (success) {
          setState((prev) => ({
            ...prev,
            myReceivedChallenges: prev.myReceivedChallenges.filter(
              (c) => c.id !== challengeId
            ),
            currentChallenge:
              prev.currentChallenge?.id === challengeId
                ? null
                : prev.currentChallenge,
          }));
          return true;
        } else {
          setError("Failed to decline challenge");
          return false;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to decline challenge";
        setError(message);
        return false;
      }
    },
    [setError]
  );

  // --------------------------------------------------------------------------
  // Fetch Operations
  // --------------------------------------------------------------------------

  const refreshMyChallenges = useCallback(async () => {
    if (!serviceRef.current || !user?.id) return;

    updateState({ isLoading: true, error: null });

    try {
      const challenges = await serviceRef.current.getMyChallenges();

      const created = challenges.filter((c) => c.creator_id === user.id);
      const received = challenges.filter(
        (c) => c.opponent_id === user.id && c.creator_id !== user.id
      );

      updateState({
        isLoading: false,
        myCreatedChallenges: created,
        myReceivedChallenges: received,
      });
    } catch (error) {
      updateState({
        isLoading: false,
        error: "Failed to fetch challenges",
      });
    }
  }, [user?.id, updateState]);

  const refreshPublicBoard = useCallback(
    async (filters?: ChallengeFilters) => {
      if (!serviceRef.current) return;

      updateState({ isLoading: true, error: null });

      try {
        const challenges = await serviceRef.current.getPublicChallenges(filters);

        updateState({
          isLoading: false,
          publicChallenges: challenges,
        });

        // Setup subscription for real-time updates
        setupPublicBoardSubscription();
      } catch (error) {
        updateState({
          isLoading: false,
          error: "Failed to fetch public challenges",
        });
      }
    },
    [updateState, setupPublicBoardSubscription]
  );

  const loadChallenge = useCallback(
    async (challengeId: string): Promise<Challenge | null> => {
      if (!serviceRef.current) return null;

      updateState({ isLoading: true, error: null });

      try {
        const challenge = await serviceRef.current.getChallenge(challengeId);

        if (challenge) {
          updateState({
            isLoading: false,
            currentChallenge: challenge,
          });
          return challenge;
        } else {
          updateState({
            isLoading: false,
            error: "Challenge not found",
          });
          return null;
        }
      } catch (error) {
        updateState({
          isLoading: false,
          error: "Failed to load challenge",
        });
        return null;
      }
    },
    [updateState]
  );

  const searchByRoomCode = useCallback(
    async (roomCode: string): Promise<Challenge | null> => {
      if (!serviceRef.current) return null;

      updateState({ isLoading: true, error: null });

      try {
        const challenge = await serviceRef.current.findChallengeByCode(roomCode);

        if (challenge) {
          updateState({
            isLoading: false,
            currentChallenge: challenge,
          });
          return challenge;
        } else {
          updateState({
            isLoading: false,
            error: "No challenge found with that code",
          });
          return null;
        }
      } catch (error) {
        updateState({
          isLoading: false,
          error: "Failed to search for challenge",
        });
        return null;
      }
    },
    [updateState]
  );

  // --------------------------------------------------------------------------
  // Cleanup Operations
  // --------------------------------------------------------------------------

  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  const clearJoinedGame = useCallback(() => {
    updateState({ joinedGameId: null });
  }, [updateState]);

  const reset = useCallback(() => {
    // Cleanup subscriptions
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    if (publicSubscriptionRef.current) {
      publicSubscriptionRef.current.unsubscribe();
      publicSubscriptionRef.current = null;
    }

    setState(initialState);
  }, []);

  // --------------------------------------------------------------------------
  // Return Hook Interface
  // --------------------------------------------------------------------------

  return {
    // State
    ...state,

    // Actions
    createChallenge,
    createPrivateChallenge,
    joinByRoomCode,
    joinChallenge,
    cancelChallenge,
    declineChallenge,
    refreshMyChallenges,
    refreshPublicBoard,
    loadChallenge,
    searchByRoomCode,
    clearError,
    clearJoinedGame,
    reset,
  };
}

// ============================================================================
// Specialized Hooks
// ============================================================================

/**
 * Hook for managing a single challenge (waiting room scenario)
 */
export function useChallenge(challengeId: string | null) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();
  const serviceRef = useRef<ChallengeService | null>(null);
  const subscriptionRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (user?.id) {
      serviceRef.current = new ChallengeService(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!challengeId || !serviceRef.current) return;

    setIsLoading(true);

    // Fetch initial state
    serviceRef.current
      .getChallenge(challengeId)
      .then((c) => {
        setChallenge(c);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Failed to load challenge");
        setIsLoading(false);
      });

    // Subscribe to updates
    subscriptionRef.current = serviceRef.current.subscribeToChallenge(
      challengeId,
      (updatedChallenge) => {
        setChallenge(updatedChallenge);
      }
    );

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [challengeId]);

  const cancel = useCallback(async () => {
    if (!challengeId || !serviceRef.current) return false;
    return serviceRef.current.cancelChallenge(challengeId);
  }, [challengeId]);

  return {
    challenge,
    isLoading,
    error,
    cancel,
    isCreator: challenge?.creator_id === user?.id,
    isOpponent: challenge?.opponent_id === user?.id,
    isAccepted: challenge?.status === "accepted",
    isCancelled: challenge?.status === "cancelled",
    isExpired: challenge?.status === "expired",
    gameId: challenge?.game_id,
  };
}

/**
 * Hook for the challenge waiting room (creator waiting for opponent)
 */
export function useChallengeWaitingRoom(challengeId: string | null) {
  const hookData = useChallenge(challengeId);

  // Calculate time remaining until expiration
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!hookData.challenge?.expires_at) {
      setTimeRemaining(null);
      return;
    }

    const updateTime = () => {
      const expiresAt = new Date(hookData.challenge!.expires_at).getTime();
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setTimeRemaining(0);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [hookData.challenge?.expires_at]);

  return {
    ...hookData,
    timeRemaining,
    timeRemainingFormatted: timeRemaining
      ? formatTimeRemaining(timeRemaining)
      : null,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export default useChallenges;
