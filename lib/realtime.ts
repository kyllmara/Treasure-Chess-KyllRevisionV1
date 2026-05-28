/**
 * Supabase Realtime Integration for Chess Games
 *
 * Elite-level implementation featuring:
 * - Type-safe channel management
 * - Automatic reconnection with exponential backoff
 * - Presence tracking for player online/offline status
 * - Move broadcasting with optimistic updates
 * - Draw offer/accept flow
 * - Resign handling
 * - Network interruption detection and recovery
 */

import { RealtimeChannel, RealtimePresenceState, REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Square } from "chess.js";

// ============================================================================
// Types
// ============================================================================

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export type GameEventType =
  | "move"
  | "resign"
  | "draw_offer"
  | "draw_accept"
  | "draw_decline"
  | "time_sync"
  | "game_start"
  | "game_end";

export interface MovePayload {
  type: "move";
  from: Square;
  to: Square;
  promotion?: string;
  san: string;
  fen: string;
  moveNumber: number;
  timeRemainingMs: number;
  timestamp: number;
}

export interface ResignPayload {
  type: "resign";
  playerId: string;
  timestamp: number;
}

export interface DrawOfferPayload {
  type: "draw_offer";
  playerId: string;
  timestamp: number;
}

export interface DrawResponsePayload {
  type: "draw_accept" | "draw_decline";
  playerId: string;
  timestamp: number;
}

export interface TimeSyncPayload {
  type: "time_sync";
  whiteTimeMs: number;
  blackTimeMs: number;
  activeColor: "w" | "b";
  timestamp: number;
}

export interface GameStartPayload {
  type: "game_start";
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  timeControlSeconds: number;
  incrementSeconds: number;
  timestamp: number;
}

export interface GameEndPayload {
  type: "game_end";
  result: "white_wins" | "black_wins" | "draw";
  reason: string;
  timestamp: number;
}

export type GameEventPayload =
  | MovePayload
  | ResignPayload
  | DrawOfferPayload
  | DrawResponsePayload
  | TimeSyncPayload
  | GameStartPayload
  | GameEndPayload;

export interface PresenceState {
  odId: string;
  odername: string;
  online_at: string;
  connection_id: string;
}

export interface GameChannelCallbacks {
  onMove?: (payload: MovePayload) => void;
  onResign?: (payload: ResignPayload) => void;
  onDrawOffer?: (payload: DrawOfferPayload) => void;
  onDrawResponse?: (payload: DrawResponsePayload) => void;
  onTimeSync?: (payload: TimeSyncPayload) => void;
  onGameStart?: (payload: GameStartPayload) => void;
  onGameEnd?: (payload: GameEndPayload) => void;
  onPresenceSync?: (state: RealtimePresenceState<PresenceState>) => void;
  onPresenceJoin?: (key: string, newPresence: PresenceState) => void;
  onPresenceLeave?: (key: string, leftPresence: PresenceState) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// GameChannel Class
// ============================================================================

export class GameChannel {
  private channel: RealtimeChannel | null = null;
  private gameId: string;
  private playerId: string;
  private playerName: string;
  private callbacks: GameChannelCallbacks;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private isManuallyDisconnected = false;
  private lastEventTimestamp = 0;
  private pendingEvents: GameEventPayload[] = [];

  constructor(
    gameId: string,
    playerId: string,
    playerName: string,
    callbacks: GameChannelCallbacks = {}
  ) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.callbacks = callbacks;
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.channel) {
      await this.disconnect();
    }

    this.isManuallyDisconnected = false;
    this.setConnectionState("connecting");

    const channelName = `game:${this.gameId}`;

    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: this.playerId },
      },
    });

    // Set up broadcast listener
    this.channel.on("broadcast", { event: "game_event" }, ({ payload }) => {
      this.handleGameEvent(payload as GameEventPayload);
    });

    // Set up presence
    this.channel
      .on("presence", { event: "sync" }, () => {
        const state = this.channel?.presenceState<PresenceState>();
        if (state) {
          this.callbacks.onPresenceSync?.(state);
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (newPresences?.[0]) {
          this.callbacks.onPresenceJoin?.(key, newPresences[0] as PresenceState);
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        if (leftPresences?.[0]) {
          this.callbacks.onPresenceLeave?.(key, leftPresences[0] as PresenceState);
        }
      });

    // Subscribe with status handling
    return new Promise((resolve, reject) => {
      this.channel!.subscribe(async (status, err) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          this.reconnectAttempts = 0;
          this.setConnectionState("connected");

          // Track presence
          await this.channel!.track({
            odId: this.playerId,
            username: this.playerName,
            online_at: new Date().toISOString(),
            connection_id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
          });

          // Flush any pending events
          await this.flushPendingEvents();

          resolve();
        } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
          this.setConnectionState("error");
          this.callbacks.onError?.(new Error(err?.message || "Channel subscription error"));
          this.attemptReconnect();
          reject(err);
        } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
          this.setConnectionState("error");
          this.callbacks.onError?.(new Error("Channel subscription timed out"));
          this.attemptReconnect();
          reject(new Error("Subscription timed out"));
        } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
          if (!this.isManuallyDisconnected) {
            this.setConnectionState("disconnected");
            this.attemptReconnect();
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.clearReconnectTimeout();

    if (this.channel) {
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.setConnectionState("disconnected");
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.callbacks.onConnectionStateChange?.(state);
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  // --------------------------------------------------------------------------
  // Reconnection Logic with Exponential Backoff
  // --------------------------------------------------------------------------

  private attemptReconnect(): void {
    if (this.isManuallyDisconnected || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.callbacks.onError?.(new Error("Max reconnection attempts reached"));
      }
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState("reconnecting");

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (capped at 30s)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    this.reconnectTimeoutId = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Reconnection will be attempted again by the error handler
      }
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  private handleGameEvent(payload: GameEventPayload): void {
    // Deduplicate events based on timestamp
    if (payload.timestamp <= this.lastEventTimestamp) {
      return;
    }
    this.lastEventTimestamp = payload.timestamp;

    switch (payload.type) {
      case "move":
        this.callbacks.onMove?.(payload);
        break;
      case "resign":
        this.callbacks.onResign?.(payload);
        break;
      case "draw_offer":
        this.callbacks.onDrawOffer?.(payload);
        break;
      case "draw_accept":
      case "draw_decline":
        this.callbacks.onDrawResponse?.(payload);
        break;
      case "time_sync":
        this.callbacks.onTimeSync?.(payload);
        break;
      case "game_start":
        this.callbacks.onGameStart?.(payload);
        break;
      case "game_end":
        this.callbacks.onGameEnd?.(payload);
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Broadcasting Methods
  // --------------------------------------------------------------------------

  private async broadcast(payload: GameEventPayload): Promise<boolean> {
    if (!this.channel || !this.isConnected()) {
      // Queue event for later if disconnected
      this.pendingEvents.push(payload);
      return false;
    }

    try {
      const result = await this.channel.send({
        type: "broadcast",
        event: "game_event",
        payload,
      });

      return result === "ok";
    } catch (error) {
      this.pendingEvents.push(payload);
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  private async flushPendingEvents(): Promise<void> {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];

    for (const event of events) {
      await this.broadcast(event);
    }
  }

  async sendMove(
    from: Square,
    to: Square,
    san: string,
    fen: string,
    moveNumber: number,
    timeRemainingMs: number,
    promotion?: string
  ): Promise<boolean> {
    const payload: MovePayload = {
      type: "move",
      from,
      to,
      promotion,
      san,
      fen,
      moveNumber,
      timeRemainingMs,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendResign(): Promise<boolean> {
    const payload: ResignPayload = {
      type: "resign",
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendDrawOffer(): Promise<boolean> {
    const payload: DrawOfferPayload = {
      type: "draw_offer",
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendDrawAccept(): Promise<boolean> {
    const payload: DrawResponsePayload = {
      type: "draw_accept",
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendDrawDecline(): Promise<boolean> {
    const payload: DrawResponsePayload = {
      type: "draw_decline",
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendTimeSync(
    whiteTimeMs: number,
    blackTimeMs: number,
    activeColor: "w" | "b"
  ): Promise<boolean> {
    const payload: TimeSyncPayload = {
      type: "time_sync",
      whiteTimeMs,
      blackTimeMs,
      activeColor,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendGameStart(
    whitePlayerId: string,
    blackPlayerId: string,
    timeControlSeconds: number,
    incrementSeconds: number
  ): Promise<boolean> {
    const payload: GameStartPayload = {
      type: "game_start",
      gameId: this.gameId,
      whitePlayerId,
      blackPlayerId,
      timeControlSeconds,
      incrementSeconds,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  async sendGameEnd(
    result: "white_wins" | "black_wins" | "draw",
    reason: string
  ): Promise<boolean> {
    const payload: GameEndPayload = {
      type: "game_end",
      result,
      reason,
      timestamp: Date.now(),
    };

    return this.broadcast(payload);
  }

  // --------------------------------------------------------------------------
  // Presence Utilities
  // --------------------------------------------------------------------------

  getPresenceState(): RealtimePresenceState<PresenceState> | undefined {
    return this.channel?.presenceState<PresenceState>();
  }

  isOpponentOnline(opponentId: string): boolean {
    const state = this.getPresenceState();
    if (!state) return false;

    return Object.keys(state).includes(opponentId);
  }

  // --------------------------------------------------------------------------
  // State Recovery
  // --------------------------------------------------------------------------

  async fetchLatestGameState(): Promise<{
    fen: string;
    whiteTimeMs: number;
    blackTimeMs: number;
    moveCount: number;
  } | null> {
    try {
      const { data, error } = await supabase
        .from("games")
        .select("current_fen, white_time_remaining, black_time_remaining, move_count")
        .eq("id", this.gameId)
        .single();

      if (error || !data) return null;

      return {
        fen: data.current_fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        whiteTimeMs: (data.white_time_remaining || 0) * 1000,
        blackTimeMs: (data.black_time_remaining || 0) * 1000,
        moveCount: data.move_count || 0,
      };
    } catch {
      return null;
    }
  }

  async fetchMovesSince(lastMoveNumber: number): Promise<Array<{
    moveNumber: number;
    san: string;
    from: Square;
    to: Square;
    fen: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from("game_moves")
        .select("move_number, san, uci, fen_after")
        .eq("game_id", this.gameId)
        .gt("move_number", lastMoveNumber)
        .order("move_number", { ascending: true });

      if (error || !data) return [];

      return data.map((move) => ({
        moveNumber: move.move_number,
        san: move.san,
        from: move.uci.substring(0, 2) as Square,
        to: move.uci.substring(2, 4) as Square,
        fen: move.fen_after,
      }));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGameChannel(
  gameId: string,
  playerId: string,
  playerName: string,
  callbacks?: GameChannelCallbacks
): GameChannel {
  return new GameChannel(gameId, playerId, playerName, callbacks);
}

// ============================================================================
// React Hook for Game Channel
// ============================================================================

export { useGameChannel } from "@/hooks/useGameChannel";
