/**
 * React Hook for Supabase Realtime Game Channel
 *
 * Provides a clean React interface for real-time game synchronization
 * with automatic lifecycle management and state updates.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import { RealtimePresenceState } from "@supabase/supabase-js";
import { Square } from "chess.js";
import {
  GameChannel,
  createGameChannel,
  ConnectionState,
  MovePayload,
  ResignPayload,
  DrawOfferPayload,
  DrawResponsePayload,
  TimeSyncPayload,
  GameStartPayload,
  GameEndPayload,
  PresenceState,
} from "@/lib/realtime";

// ============================================================================
// Types
// ============================================================================

export interface UseGameChannelOptions {
  gameId: string;
  playerId: string;
  playerName: string;
  onMove?: (payload: MovePayload) => void;
  onResign?: (payload: ResignPayload) => void;
  onDrawOffer?: (payload: DrawOfferPayload) => void;
  onDrawResponse?: (payload: DrawResponsePayload) => void;
  onTimeSync?: (payload: TimeSyncPayload) => void;
  onGameStart?: (payload: GameStartPayload) => void;
  onGameEnd?: (payload: GameEndPayload) => void;
  onError?: (error: Error) => void;
  autoConnect?: boolean;
  autoReconnectOnForeground?: boolean;
}

export interface UseGameChannelReturn {
  // Connection state
  connectionState: ConnectionState;
  isConnected: boolean;
  isReconnecting: boolean;
  error: Error | null;

  // Presence
  presenceState: RealtimePresenceState<PresenceState> | null;
  isOpponentOnline: boolean;
  opponentPresence: PresenceState | null;

  // Draw offer state
  hasIncomingDrawOffer: boolean;
  hasSentDrawOffer: boolean;

  // Connection actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // Game actions
  sendMove: (
    from: Square,
    to: Square,
    san: string,
    fen: string,
    moveNumber: number,
    timeRemainingMs: number,
    promotion?: string
  ) => Promise<boolean>;
  sendResign: () => Promise<boolean>;
  sendDrawOffer: () => Promise<boolean>;
  sendDrawAccept: () => Promise<boolean>;
  sendDrawDecline: () => Promise<boolean>;
  sendTimeSync: (whiteTimeMs: number, blackTimeMs: number, activeColor: "w" | "b") => Promise<boolean>;
  sendGameStart: (
    whitePlayerId: string,
    blackPlayerId: string,
    timeControlSeconds: number,
    incrementSeconds: number
  ) => Promise<boolean>;
  sendGameEnd: (result: "white_wins" | "black_wins" | "draw", reason: string) => Promise<boolean>;

  // State recovery
  fetchLatestGameState: () => Promise<{
    fen: string;
    whiteTimeMs: number;
    blackTimeMs: number;
    moveCount: number;
  } | null>;
  fetchMovesSince: (lastMoveNumber: number) => Promise<Array<{
    moveNumber: number;
    san: string;
    from: Square;
    to: Square;
    fen: string;
  }>>;

  // Utility
  clearDrawOffers: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGameChannel({
  gameId,
  playerId,
  playerName,
  onMove,
  onResign,
  onDrawOffer,
  onDrawResponse,
  onTimeSync,
  onGameStart,
  onGameEnd,
  onError,
  autoConnect = true,
  autoReconnectOnForeground = true,
}: UseGameChannelOptions): UseGameChannelReturn {
  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [presenceState, setPresenceState] = useState<RealtimePresenceState<PresenceState> | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [hasIncomingDrawOffer, setHasIncomingDrawOffer] = useState(false);
  const [hasSentDrawOffer, setHasSentDrawOffer] = useState(false);

  // Refs
  const channelRef = useRef<GameChannel | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wasConnectedRef = useRef(false);

  // Memoized callbacks to avoid recreating channel
  const callbacks = useMemo(
    () => ({
      onMove: (payload: MovePayload) => {
        setHasIncomingDrawOffer(false); // Clear draw offer on move
        onMove?.(payload);
      },
      onResign: (payload: ResignPayload) => {
        setHasIncomingDrawOffer(false);
        setHasSentDrawOffer(false);
        onResign?.(payload);
      },
      onDrawOffer: (payload: DrawOfferPayload) => {
        if (payload.playerId !== playerId) {
          setHasIncomingDrawOffer(true);
        }
        onDrawOffer?.(payload);
      },
      onDrawResponse: (payload: DrawResponsePayload) => {
        setHasIncomingDrawOffer(false);
        setHasSentDrawOffer(false);
        onDrawResponse?.(payload);
      },
      onTimeSync,
      onGameStart: (payload: GameStartPayload) => {
        // Determine opponent ID
        const oppId = payload.whitePlayerId === playerId
          ? payload.blackPlayerId
          : payload.whitePlayerId;
        setOpponentId(oppId);
        onGameStart?.(payload);
      },
      onGameEnd: (payload: GameEndPayload) => {
        setHasIncomingDrawOffer(false);
        setHasSentDrawOffer(false);
        onGameEnd?.(payload);
      },
      onPresenceSync: (state: RealtimePresenceState<PresenceState>) => {
        setPresenceState(state);
      },
      onPresenceJoin: () => {
        setPresenceState(channelRef.current?.getPresenceState() || null);
      },
      onPresenceLeave: () => {
        setPresenceState(channelRef.current?.getPresenceState() || null);
      },
      onConnectionStateChange: (state: ConnectionState) => {
        setConnectionState(state);
        if (state === "connected") {
          wasConnectedRef.current = true;
          setError(null);
        }
      },
      onError: (err: Error) => {
        setError(err);
        onError?.(err);
      },
    }),
    [playerId, onMove, onResign, onDrawOffer, onDrawResponse, onTimeSync, onGameStart, onGameEnd, onError]
  );

  // Create channel
  useEffect(() => {
    channelRef.current = createGameChannel(gameId, playerId, playerName, callbacks);

    if (autoConnect) {
      channelRef.current.connect().catch(() => {
        // Error handled by callback
      });
    }

    return () => {
      channelRef.current?.disconnect();
      channelRef.current = null;
    };
  }, [gameId, playerId, playerName, callbacks, autoConnect]);

  // Handle app state changes for auto-reconnection
  useEffect(() => {
    if (!autoReconnectOnForeground) return;

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App coming to foreground
        if (wasConnectedRef.current && channelRef.current) {
          const state = channelRef.current.getConnectionState();
          if (state !== "connected" && state !== "connecting") {
            try {
              await channelRef.current.connect();
            } catch {
              // Error handled by callback
            }
          }
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [autoReconnectOnForeground]);

  // Connection actions
  const connect = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.connect();
    }
  }, []);

  const disconnect = useCallback(async () => {
    wasConnectedRef.current = false;
    if (channelRef.current) {
      await channelRef.current.disconnect();
    }
  }, []);

  // Game actions
  const sendMove = useCallback(
    async (
      from: Square,
      to: Square,
      san: string,
      fen: string,
      moveNumber: number,
      timeRemainingMs: number,
      promotion?: string
    ) => {
      setHasIncomingDrawOffer(false);
      setHasSentDrawOffer(false);
      return channelRef.current?.sendMove(from, to, san, fen, moveNumber, timeRemainingMs, promotion) ?? false;
    },
    []
  );

  const sendResign = useCallback(async () => {
    return channelRef.current?.sendResign() ?? false;
  }, []);

  const sendDrawOffer = useCallback(async () => {
    const result = await (channelRef.current?.sendDrawOffer() ?? false);
    if (result) {
      setHasSentDrawOffer(true);
    }
    return result;
  }, []);

  const sendDrawAccept = useCallback(async () => {
    setHasIncomingDrawOffer(false);
    return channelRef.current?.sendDrawAccept() ?? false;
  }, []);

  const sendDrawDecline = useCallback(async () => {
    setHasIncomingDrawOffer(false);
    return channelRef.current?.sendDrawDecline() ?? false;
  }, []);

  const sendTimeSync = useCallback(
    async (whiteTimeMs: number, blackTimeMs: number, activeColor: "w" | "b") => {
      return channelRef.current?.sendTimeSync(whiteTimeMs, blackTimeMs, activeColor) ?? false;
    },
    []
  );

  const sendGameStart = useCallback(
    async (
      whitePlayerId: string,
      blackPlayerId: string,
      timeControlSeconds: number,
      incrementSeconds: number
    ) => {
      const oppId = whitePlayerId === playerId ? blackPlayerId : whitePlayerId;
      setOpponentId(oppId);
      return channelRef.current?.sendGameStart(
        whitePlayerId,
        blackPlayerId,
        timeControlSeconds,
        incrementSeconds
      ) ?? false;
    },
    [playerId]
  );

  const sendGameEnd = useCallback(
    async (result: "white_wins" | "black_wins" | "draw", reason: string) => {
      return channelRef.current?.sendGameEnd(result, reason) ?? false;
    },
    []
  );

  // State recovery
  const fetchLatestGameState = useCallback(async () => {
    return channelRef.current?.fetchLatestGameState() ?? null;
  }, []);

  const fetchMovesSince = useCallback(async (lastMoveNumber: number) => {
    return channelRef.current?.fetchMovesSince(lastMoveNumber) ?? [];
  }, []);

  // Utility
  const clearDrawOffers = useCallback(() => {
    setHasIncomingDrawOffer(false);
    setHasSentDrawOffer(false);
  }, []);

  // Computed values
  const isConnected = connectionState === "connected";
  const isReconnecting = connectionState === "reconnecting";

  const opponentPresence = useMemo(() => {
    if (!presenceState || !opponentId) return null;
    const presences = presenceState[opponentId];
    return presences?.[0] || null;
  }, [presenceState, opponentId]);

  const isOpponentOnline = useMemo(() => {
    return opponentPresence !== null;
  }, [opponentPresence]);

  return {
    // Connection state
    connectionState,
    isConnected,
    isReconnecting,
    error,

    // Presence
    presenceState,
    isOpponentOnline,
    opponentPresence,

    // Draw offer state
    hasIncomingDrawOffer,
    hasSentDrawOffer,

    // Connection actions
    connect,
    disconnect,

    // Game actions
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawDecline,
    sendTimeSync,
    sendGameStart,
    sendGameEnd,

    // State recovery
    fetchLatestGameState,
    fetchMovesSince,

    // Utility
    clearDrawOffers,
  };
}

export default useGameChannel;
