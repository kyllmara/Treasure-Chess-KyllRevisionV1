/**
 * useMultiplayer Hook
 *
 * Comprehensive hook for multiplayer chess functionality including:
 * - Enhanced matchmaking with stake/time selection
 * - Real-time game communication
 * - Move acknowledgment
 * - Rematch system
 * - Friend challenges
 * - Pre-game ready confirmation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  EnhancedMatchmakingService,
  createEnhancedMatchmakingService,
  type EnhancedMatchmakingConfig,
  type EnhancedMatchmakingStatus,
  type QueueStats,
} from "@/lib/matchmakingEnhanced";
import {
  EnhancedGameChannel,
  createEnhancedGameChannel,
  type EnhancedConnectionState,
} from "@/lib/realtimeEnhanced";
import {
  RematchService,
  createRematchService,
  type RematchConfig,
} from "@/lib/rematch";
import {
  FriendChallengeService,
  createFriendChallengeService,
  type UserSearchResult,
  type FriendChallengeInput,
} from "@/lib/friendChallenge";
import {
  updateRatingsAfterGame,
  type GameEndInput,
  type RatingUpdateResult,
} from "@/lib/eloService";
import {
  STAKE_TIERS,
  TIME_CONTROLS,
  type StakeTier,
  type TimeControl,
  type PreGameState,
  type MatchFoundResult,
  type FriendChallenge,
  type MoveWithAck,
} from "@/types/multiplayer";
import type { Square } from "chess.js";

// ============================================================================
// Types
// ============================================================================

export interface UseMultiplayerState {
  // Matchmaking
  matchmakingStatus: EnhancedMatchmakingStatus;
  queueStats: QueueStats | null;
  searchDuration: number;

  // Pre-game
  preGameState: PreGameState | null;
  isPlayerReady: boolean;
  countdown: number | null;

  // Match result
  matchResult: MatchFoundResult | null;

  // Connection
  connectionState: EnhancedConnectionState;
  isOpponentOnline: boolean;

  // Rematch
  hasRematchOffer: boolean;
  rematchTimeRemaining: number;
  isRematchOfferor: boolean;

  // Friend challenges
  receivedChallenges: FriendChallenge[];
  sentChallenges: FriendChallenge[];

  // Loading states
  isJoiningQueue: boolean;
  isSendingChallenge: boolean;
}

export interface UseMultiplayerActions {
  // Matchmaking
  joinQueue: (config: Omit<EnhancedMatchmakingConfig, "userId" | "userElo">) => Promise<boolean>;
  leaveQueue: () => Promise<boolean>;

  // Pre-game
  confirmReady: () => Promise<boolean>;

  // Game communication
  sendMove: (
    from: Square,
    to: Square,
    san: string,
    fen: string,
    moveNumber: number,
    timeRemainingMs: number,
    promotion?: string
  ) => Promise<{ success: boolean; moveId: string }>;
  sendResign: () => Promise<boolean>;
  sendDrawOffer: () => Promise<boolean>;
  sendDrawResponse: (accept: boolean) => Promise<boolean>;
  sendTimeSync: (whiteMs: number, blackMs: number) => Promise<boolean>;

  // Rematch
  offerRematch: (swapColors?: boolean) => Promise<void>;
  acceptRematch: () => Promise<string | null>;
  declineRematch: () => Promise<void>;

  // Friend challenges
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
  sendFriendChallenge: (input: Omit<FriendChallengeInput, "challengerUserId">) => Promise<FriendChallenge | null>;
  acceptChallenge: (challengeId: string) => Promise<string | null>;
  declineChallenge: (challengeId: string) => Promise<boolean>;
  cancelChallenge: (challengeId: string) => Promise<boolean>;

  // Game end
  endGame: (input: GameEndInput) => Promise<RatingUpdateResult>;

  // Connection
  connectToGame: (gameId: string, opponentId: string) => Promise<void>;
  disconnectFromGame: () => Promise<void>;
}

export interface UseMultiplayerCallbacks {
  onMatchFound?: (result: MatchFoundResult) => void;
  onGameStart?: (gameId: string) => void;
  onMove?: (move: MoveWithAck) => void;
  onMoveAcknowledged?: (moveId: string) => void;
  onMoveFailed?: (moveId: string, error: string) => void;
  onResign?: (playerId: string) => void;
  onDrawOffer?: (playerId: string) => void;
  onDrawResponse?: (accepted: boolean, playerId: string) => void;
  onTimeSync?: (whiteMs: number, blackMs: number) => void;
  onGameEnd?: (result: string, reason: string) => void;
  onRematchOffer?: (playerId: string) => void;
  onRematchAccepted?: (newGameId: string) => void;
  onRematchDeclined?: () => void;
  onChallengeReceived?: (challenge: FriendChallenge) => void;
  onChallengeAccepted?: (challenge: FriendChallenge, gameId: string) => void;
  onOpponentDisconnected?: (gracePeriodMs: number) => void;
  onReconnected?: (missedMoves: number) => void;
  onError?: (error: Error) => void;
}

export type UseMultiplayerReturn = UseMultiplayerState & UseMultiplayerActions;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useMultiplayer(
  callbacks: UseMultiplayerCallbacks = {}
): UseMultiplayerReturn {
  const { profile, isAuthenticated } = useAuth();

  // Service refs
  const matchmakingRef = useRef<EnhancedMatchmakingService | null>(null);
  const gameChannelRef = useRef<EnhancedGameChannel | null>(null);
  const rematchRef = useRef<RematchService | null>(null);
  const friendChallengeRef = useRef<FriendChallengeService | null>(null);

  // State
  const [matchmakingStatus, setMatchmakingStatus] = useState<EnhancedMatchmakingStatus>("idle");
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [searchDuration, setSearchDuration] = useState(0);
  const [preGameState, setPreGameState] = useState<PreGameState | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [matchResult, setMatchResult] = useState<MatchFoundResult | null>(null);
  const [connectionState, setConnectionState] = useState<EnhancedConnectionState>("disconnected");
  const [isOpponentOnline, setIsOpponentOnline] = useState(false);
  const [hasRematchOffer, setHasRematchOffer] = useState(false);
  const [rematchTimeRemaining, setRematchTimeRemaining] = useState(0);
  const [isRematchOfferor, setIsRematchOfferor] = useState(false);
  const [receivedChallenges, setReceivedChallenges] = useState<FriendChallenge[]>([]);
  const [sentChallenges, setSentChallenges] = useState<FriendChallenge[]>([]);
  const [isJoiningQueue, setIsJoiningQueue] = useState(false);
  const [isSendingChallenge, setIsSendingChallenge] = useState(false);

  // Timer refs
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rematchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // User data
  const userId = profile?.id || "guest";
  const username = profile?.username || "Guest";
  const avatarIndex = profile?.avatar_index || 0;
  const userElo = profile?.elo_rating || 1200;

  // --------------------------------------------------------------------------
  // Initialize Friend Challenge Service
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated || !profile) return;

    friendChallengeRef.current = createFriendChallengeService(
      userId,
      username,
      avatarIndex,
      userElo,
      {
        onChallengeReceived: (challenge) => {
          setReceivedChallenges((prev) => [...prev, challenge]);
          callbacks.onChallengeReceived?.(challenge);
        },
        onChallengeAccepted: (challenge, gameId) => {
          setSentChallenges((prev) => prev.filter((c) => c.id !== challenge.id));
          callbacks.onChallengeAccepted?.(challenge, gameId);
        },
        onChallengeDeclined: (challengeId) => {
          setSentChallenges((prev) => prev.filter((c) => c.id !== challengeId));
        },
        onChallengeExpired: (challengeId) => {
          setSentChallenges((prev) => prev.filter((c) => c.id !== challengeId));
          setReceivedChallenges((prev) => prev.filter((c) => c.id !== challengeId));
        },
        onError: callbacks.onError,
      }
    );

    friendChallengeRef.current.initialize();

    return () => {
      friendChallengeRef.current?.destroy();
    };
  }, [isAuthenticated, profile, userId, username, avatarIndex, userElo]);

  // --------------------------------------------------------------------------
  // Matchmaking Actions
  // --------------------------------------------------------------------------

  const joinQueue = useCallback(
    async (config: Omit<EnhancedMatchmakingConfig, "userId" | "userElo">): Promise<boolean> => {
      if (!isAuthenticated) {
        callbacks.onError?.(new Error("Must be authenticated to join matchmaking"));
        return false;
      }

      setIsJoiningQueue(true);

      // Create matchmaking service
      matchmakingRef.current = createEnhancedMatchmakingService(userId, {
        onStatusChange: setMatchmakingStatus,
        onMatchFound: (result) => {
          setMatchResult(result);
          setPreGameState(result.preGameState || null);
          callbacks.onMatchFound?.(result);
        },
        onQueueStatsUpdate: setQueueStats,
        onPreGameUpdate: (state) => {
          setPreGameState(state);
          setIsPlayerReady(
            state.whitePlayer.playerId === userId
              ? state.whitePlayer.isReady
              : state.blackPlayer.isReady
          );
        },
        onOpponentReady: () => {},
        onGameStart: (gameId) => {
          callbacks.onGameStart?.(gameId);
        },
        onCountdown: setCountdown,
        onError: callbacks.onError,
      });

      const success = await matchmakingRef.current.joinQueue({
        ...config,
        userId,
        userElo,
      });

      setIsJoiningQueue(false);

      if (success) {
        // Start search timer
        searchTimerRef.current = setInterval(() => {
          setSearchDuration((prev) => prev + 1);
        }, 1000);
      }

      return success;
    },
    [isAuthenticated, userId, userElo, callbacks]
  );

  const leaveQueue = useCallback(async (): Promise<boolean> => {
    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    setSearchDuration(0);

    if (!matchmakingRef.current) return true;

    const success = await matchmakingRef.current.leaveQueue();
    matchmakingRef.current.destroy();
    matchmakingRef.current = null;

    setMatchmakingStatus("idle");
    setQueueStats(null);
    setPreGameState(null);
    setMatchResult(null);

    return success;
  }, []);

  const confirmReady = useCallback(async (): Promise<boolean> => {
    if (!matchmakingRef.current) return false;

    const success = await matchmakingRef.current.confirmReady();
    if (success) {
      setIsPlayerReady(true);
    }
    return success;
  }, []);

  // --------------------------------------------------------------------------
  // Game Communication Actions
  // --------------------------------------------------------------------------

  const connectToGame = useCallback(
    async (gameId: string, opponentId: string): Promise<void> => {
      // Disconnect existing channel
      if (gameChannelRef.current) {
        await gameChannelRef.current.disconnect();
      }

      gameChannelRef.current = createEnhancedGameChannel(
        gameId,
        userId,
        username,
        opponentId,
        {
          onMove: callbacks.onMove,
          onMoveAcknowledged: callbacks.onMoveAcknowledged,
          onMoveFailed: callbacks.onMoveFailed,
          onResign: callbacks.onResign,
          onDrawOffer: callbacks.onDrawOffer,
          onDrawResponse: callbacks.onDrawResponse,
          onTimeSync: callbacks.onTimeSync,
          onGameEnd: callbacks.onGameEnd,
          onRematchOffer: (playerId) => {
            setHasRematchOffer(true);
            setIsRematchOfferor(false);
            callbacks.onRematchOffer?.(playerId);
          },
          onRematchAccepted: (newGameId) => {
            setHasRematchOffer(false);
            callbacks.onRematchAccepted?.(newGameId);
          },
          onRematchDeclined: () => {
            setHasRematchOffer(false);
            callbacks.onRematchDeclined?.();
          },
          onConnectionStateChange: setConnectionState,
          onOpponentOnline: setIsOpponentOnline,
          onOpponentDisconnected: callbacks.onOpponentDisconnected,
          onReconnected: callbacks.onReconnected,
          onError: callbacks.onError,
        }
      );

      await gameChannelRef.current.connect();
    },
    [userId, username, callbacks]
  );

  const disconnectFromGame = useCallback(async (): Promise<void> => {
    if (gameChannelRef.current) {
      await gameChannelRef.current.disconnect();
      gameChannelRef.current = null;
    }
    setConnectionState("disconnected");
    setIsOpponentOnline(false);
  }, []);

  const sendMove = useCallback(
    async (
      from: Square,
      to: Square,
      san: string,
      fen: string,
      moveNumber: number,
      timeRemainingMs: number,
      promotion?: string
    ): Promise<{ success: boolean; moveId: string }> => {
      if (!gameChannelRef.current) {
        return { success: false, moveId: "" };
      }

      return gameChannelRef.current.sendMoveWithAck(
        from,
        to,
        san,
        fen,
        moveNumber,
        timeRemainingMs,
        promotion
      );
    },
    []
  );

  const sendResign = useCallback(async (): Promise<boolean> => {
    return gameChannelRef.current?.sendResign() ?? false;
  }, []);

  const sendDrawOffer = useCallback(async (): Promise<boolean> => {
    return gameChannelRef.current?.sendDrawOffer() ?? false;
  }, []);

  const sendDrawResponse = useCallback(async (accept: boolean): Promise<boolean> => {
    return gameChannelRef.current?.sendDrawResponse(accept) ?? false;
  }, []);

  const sendTimeSync = useCallback(
    async (whiteMs: number, blackMs: number): Promise<boolean> => {
      return gameChannelRef.current?.sendTimeSync(whiteMs, blackMs) ?? false;
    },
    []
  );

  // --------------------------------------------------------------------------
  // Rematch Actions
  // --------------------------------------------------------------------------

  const offerRematch = useCallback(
    async (swapColors: boolean = true): Promise<void> => {
      if (!gameChannelRef.current) return;

      setIsRematchOfferor(true);
      await gameChannelRef.current.sendRematchOffer();

      // Start rematch timer
      let timeLeft = 30;
      setRematchTimeRemaining(timeLeft);
      setHasRematchOffer(true);

      rematchTimerRef.current = setInterval(() => {
        timeLeft--;
        setRematchTimeRemaining(timeLeft);
        if (timeLeft <= 0) {
          if (rematchTimerRef.current) {
            clearInterval(rematchTimerRef.current);
          }
          setHasRematchOffer(false);
        }
      }, 1000);
    },
    []
  );

  const acceptRematch = useCallback(async (): Promise<string | null> => {
    if (rematchTimerRef.current) {
      clearInterval(rematchTimerRef.current);
    }
    setHasRematchOffer(false);

    // Create new game via rematch service
    if (rematchRef.current) {
      return rematchRef.current.acceptRematch();
    }

    return null;
  }, []);

  const declineRematch = useCallback(async (): Promise<void> => {
    if (rematchTimerRef.current) {
      clearInterval(rematchTimerRef.current);
    }
    setHasRematchOffer(false);

    if (rematchRef.current) {
      await rematchRef.current.declineRematch();
    }
  }, []);

  // --------------------------------------------------------------------------
  // Friend Challenge Actions
  // --------------------------------------------------------------------------

  const searchUsers = useCallback(
    async (query: string): Promise<UserSearchResult[]> => {
      return friendChallengeRef.current?.searchUsers(query) ?? [];
    },
    []
  );

  const sendFriendChallenge = useCallback(
    async (
      input: Omit<FriendChallengeInput, "challengerUserId">
    ): Promise<FriendChallenge | null> => {
      if (!friendChallengeRef.current) return null;

      setIsSendingChallenge(true);
      const challenge = await friendChallengeRef.current.sendChallenge({
        ...input,
        challengerUserId: userId,
      });

      if (challenge) {
        setSentChallenges((prev) => [...prev, challenge]);
      }

      setIsSendingChallenge(false);
      return challenge;
    },
    [userId]
  );

  const acceptChallenge = useCallback(async (challengeId: string): Promise<string | null> => {
    if (!friendChallengeRef.current) return null;

    const gameId = await friendChallengeRef.current.acceptChallenge(challengeId);
    if (gameId) {
      setReceivedChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
    return gameId;
  }, []);

  const declineChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
    if (!friendChallengeRef.current) return false;

    const success = await friendChallengeRef.current.declineChallenge(challengeId);
    if (success) {
      setReceivedChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
    return success;
  }, []);

  const cancelChallenge = useCallback(async (challengeId: string): Promise<boolean> => {
    if (!friendChallengeRef.current) return false;

    const success = await friendChallengeRef.current.cancelChallenge(challengeId);
    if (success) {
      setSentChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
    return success;
  }, []);

  // --------------------------------------------------------------------------
  // Game End
  // --------------------------------------------------------------------------

  const endGame = useCallback(
    async (input: GameEndInput): Promise<RatingUpdateResult> => {
      return updateRatingsAfterGame(input);
    },
    []
  );

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
      }
      if (rematchTimerRef.current) {
        clearInterval(rematchTimerRef.current);
      }
      matchmakingRef.current?.destroy();
      gameChannelRef.current?.destroy();
      rematchRef.current?.destroy();
      friendChallengeRef.current?.destroy();
    };
  }, []);

  // --------------------------------------------------------------------------
  // Return
  // --------------------------------------------------------------------------

  return useMemo(
    () => ({
      // State
      matchmakingStatus,
      queueStats,
      searchDuration,
      preGameState,
      isPlayerReady,
      countdown,
      matchResult,
      connectionState,
      isOpponentOnline,
      hasRematchOffer,
      rematchTimeRemaining,
      isRematchOfferor,
      receivedChallenges,
      sentChallenges,
      isJoiningQueue,
      isSendingChallenge,

      // Actions
      joinQueue,
      leaveQueue,
      confirmReady,
      sendMove,
      sendResign,
      sendDrawOffer,
      sendDrawResponse,
      sendTimeSync,
      offerRematch,
      acceptRematch,
      declineRematch,
      searchUsers,
      sendFriendChallenge,
      acceptChallenge,
      declineChallenge,
      cancelChallenge,
      endGame,
      connectToGame,
      disconnectFromGame,
    }),
    [
      matchmakingStatus,
      queueStats,
      searchDuration,
      preGameState,
      isPlayerReady,
      countdown,
      matchResult,
      connectionState,
      isOpponentOnline,
      hasRematchOffer,
      rematchTimeRemaining,
      isRematchOfferor,
      receivedChallenges,
      sentChallenges,
      isJoiningQueue,
      isSendingChallenge,
      joinQueue,
      leaveQueue,
      confirmReady,
      sendMove,
      sendResign,
      sendDrawOffer,
      sendDrawResponse,
      sendTimeSync,
      offerRematch,
      acceptRematch,
      declineRematch,
      searchUsers,
      sendFriendChallenge,
      acceptChallenge,
      declineChallenge,
      cancelChallenge,
      endGame,
      connectToGame,
      disconnectFromGame,
    ]
  );
}

// ============================================================================
// Exports
// ============================================================================

export { STAKE_TIERS, TIME_CONTROLS };
export type { StakeTier, TimeControl };
