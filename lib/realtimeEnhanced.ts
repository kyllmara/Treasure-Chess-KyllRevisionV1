/**
 * Enhanced Realtime System
 *
 * Elite-level implementation featuring:
 * - Move acknowledgment with retry mechanism
 * - Guaranteed delivery with timeout and retries
 * - Reconnection with full state recovery
 * - Server-side move validation
 * - Optimistic updates with rollback
 * - Network interruption detection
 */

import {
  RealtimeChannel,
  RealtimePresenceState,
  REALTIME_SUBSCRIBE_STATES,
} from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import type { Square } from "chess.js";
import {
  type MoveWithAck,
  type MoveAckPayload,
  type ReconnectionState,
  type GameStateSnapshot,
  type ServerMoveValidation,
  type ServerValidationResult,
  MOVE_ACK_TIMEOUT_MS,
  MOVE_ACK_MAX_RETRIES,
  RECONNECTION_GRACE_PERIOD_MS,
  RECONNECTION_ABANDON_THRESHOLD_MS,
} from "@/types/multiplayer";

// ============================================================================
// Types
// ============================================================================

export type EnhancedConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "recovering"
  | "error";

export interface PendingMove {
  moveId: string;
  payload: MoveWithAck;
  sentAt: number;
  retryCount: number;
  acknowledged: boolean;
  timeoutId: NodeJS.Timeout | null;
}

export interface EnhancedGameChannelCallbacks {
  // Move events
  onMove?: (payload: MoveWithAck) => void;
  onMoveAcknowledged?: (moveId: string) => void;
  onMoveFailed?: (moveId: string, error: string) => void;
  onMoveValidationFailed?: (result: ServerValidationResult) => void;

  // Game events
  onResign?: (playerId: string) => void;
  onDrawOffer?: (playerId: string) => void;
  onDrawResponse?: (accepted: boolean, playerId: string) => void;
  onTimeSync?: (whiteTimeMs: number, blackTimeMs: number) => void;
  onGameStart?: () => void;
  onGameEnd?: (result: string, reason: string) => void;

  // Rematch events
  onRematchOffer?: (playerId: string) => void;
  onRematchAccepted?: (newGameId: string) => void;
  onRematchDeclined?: () => void;

  // Connection events
  onConnectionStateChange?: (state: EnhancedConnectionState) => void;
  onReconnected?: (missedMoves: number) => void;
  onOpponentOnline?: (online: boolean) => void;
  onOpponentDisconnected?: (gracePeriodMs: number) => void;

  // Error events
  onError?: (error: Error) => void;
}

export interface PresenceData {
  odId: string;
  username: string;
  online_at: string;
  last_move_number: number;
}

// ============================================================================
// EnhancedGameChannel Class
// ============================================================================

export class EnhancedGameChannel {
  private channel: RealtimeChannel | null = null;
  private gameId: string;
  private playerId: string;
  private playerName: string;
  private callbacks: EnhancedGameChannelCallbacks;

  // Connection state
  private connectionState: EnhancedConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private isManuallyDisconnected = false;

  // Move acknowledgment tracking
  private pendingMoves: Map<string, PendingMove> = new Map();
  private lastAcknowledgedMoveNumber = 0;
  private moveSequence = 0;

  // Reconnection state
  private reconnectionState: ReconnectionState | null = null;
  private lastKnownFen: string =
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  private lastKnownMoveNumber = 0;

  // Opponent tracking
  private opponentId: string | null = null;
  private opponentOnline = false;
  private opponentDisconnectedAt: number | null = null;
  private opponentGraceTimeoutId: NodeJS.Timeout | null = null;

  constructor(
    gameId: string,
    playerId: string,
    playerName: string,
    opponentId: string | null = null,
    callbacks: EnhancedGameChannelCallbacks = {}
  ) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.opponentId = opponentId;
    this.callbacks = callbacks;
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.channel) {
      await this.disconnect();
    }

    if (!isSupabaseConfigured) {
      // Demo mode - simulate connection
      this.setConnectionState("connected");
      return;
    }

    this.isManuallyDisconnected = false;
    this.setConnectionState("connecting");

    const channelName = `enhanced_game:${this.gameId}`;

    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: this.playerId },
      },
    });

    // Move broadcasts
    this.channel.on("broadcast", { event: "move" }, ({ payload }) => {
      this.handleMoveReceived(payload as MoveWithAck);
    });

    // Move acknowledgments
    this.channel.on("broadcast", { event: "move_ack" }, ({ payload }) => {
      this.handleMoveAck(payload as MoveAckPayload);
    });

    // Game events
    this.channel.on("broadcast", { event: "game_event" }, ({ payload }) => {
      this.handleGameEvent(payload);
    });

    // Presence tracking
    this.channel
      .on("presence", { event: "sync" }, () => {
        this.handlePresenceSync();
      })
      .on("presence", { event: "join" }, ({ key }) => {
        if (key === this.opponentId) {
          this.handleOpponentJoined();
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key === this.opponentId) {
          this.handleOpponentLeft();
        }
      });

    return new Promise((resolve, reject) => {
      this.channel!.subscribe(async (status, err) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          this.reconnectAttempts = 0;
          this.setConnectionState("connected");

          // Track presence with last move info
          await this.channel!.track({
            odId: this.playerId,
            username: this.playerName,
            online_at: new Date().toISOString(),
            last_move_number: this.lastKnownMoveNumber,
          });

          // Check if we need state recovery
          if (this.reconnectionState?.resyncRequired) {
            await this.recoverState();
          }

          resolve();
        } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
          this.setConnectionState("error");
          this.callbacks.onError?.(
            new Error(err?.message || "Channel error")
          );
          this.attemptReconnect();
          reject(err);
        } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
          this.setConnectionState("error");
          this.attemptReconnect();
          reject(new Error("Connection timed out"));
        } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
          if (!this.isManuallyDisconnected) {
            this.handleDisconnection();
          }
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.clearAllTimeouts();

    if (this.channel) {
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.setConnectionState("disconnected");
  }

  private setConnectionState(state: EnhancedConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.callbacks.onConnectionStateChange?.(state);
    }
  }

  getConnectionState(): EnhancedConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  // --------------------------------------------------------------------------
  // Move Sending with Acknowledgment
  // --------------------------------------------------------------------------

  async sendMoveWithAck(
    from: Square,
    to: Square,
    san: string,
    fen: string,
    moveNumber: number,
    timeRemainingMs: number,
    promotion?: string
  ): Promise<{ success: boolean; moveId: string }> {
    const moveId = this.generateMoveId();
    this.moveSequence++;

    const payload: MoveWithAck = {
      type: "move_with_ack",
      moveId,
      from,
      to,
      promotion,
      san,
      fen,
      moveNumber,
      timeRemainingMs,
      timestamp: Date.now(),
      requiresAck: true,
    };

    // Track pending move
    const pendingMove: PendingMove = {
      moveId,
      payload,
      sentAt: Date.now(),
      retryCount: 0,
      acknowledged: false,
      timeoutId: null,
    };

    this.pendingMoves.set(moveId, pendingMove);

    // Update local state
    this.lastKnownFen = fen;
    this.lastKnownMoveNumber = moveNumber;

    // Send move
    const sent = await this.broadcastMove(payload);

    if (sent) {
      // Set acknowledgment timeout
      pendingMove.timeoutId = setTimeout(() => {
        this.handleMoveTimeout(moveId);
      }, MOVE_ACK_TIMEOUT_MS);
    } else {
      // Queue for retry when reconnected
      pendingMove.retryCount++;
    }

    return { success: sent, moveId };
  }

  private async broadcastMove(payload: MoveWithAck): Promise<boolean> {
    if (!this.channel || !this.isConnected()) {
      return false;
    }

    try {
      const result = await this.channel.send({
        type: "broadcast",
        event: "move",
        payload,
      });
      return result === "ok";
    } catch (error) {
      console.error("[EnhancedGameChannel] Move broadcast error:", error);
      return false;
    }
  }

  private handleMoveReceived(payload: MoveWithAck): void {
    // Send acknowledgment
    if (payload.requiresAck) {
      this.sendMoveAck(payload);
    }

    // Update local state
    this.lastKnownFen = payload.fen;
    this.lastKnownMoveNumber = payload.moveNumber;

    // Notify callback
    this.callbacks.onMove?.(payload);
  }

  private async sendMoveAck(move: MoveWithAck): Promise<void> {
    if (!this.channel || !this.isConnected()) return;

    const ackPayload: MoveAckPayload = {
      type: "move_ack",
      moveId: move.moveId,
      gameId: this.gameId,
      moveNumber: move.moveNumber,
      playerId: this.playerId,
      timestamp: Date.now(),
    };

    await this.channel.send({
      type: "broadcast",
      event: "move_ack",
      payload: ackPayload,
    });
  }

  private handleMoveAck(ack: MoveAckPayload): void {
    const pending = this.pendingMoves.get(ack.moveId);
    if (!pending) return;

    // Clear timeout
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    pending.acknowledged = true;
    this.lastAcknowledgedMoveNumber = ack.moveNumber;

    // Remove from pending
    this.pendingMoves.delete(ack.moveId);

    // Notify callback
    this.callbacks.onMoveAcknowledged?.(ack.moveId);
  }

  private handleMoveTimeout(moveId: string): void {
    const pending = this.pendingMoves.get(moveId);
    if (!pending || pending.acknowledged) return;

    pending.retryCount++;

    if (pending.retryCount >= MOVE_ACK_MAX_RETRIES) {
      // Max retries reached - move failed
      this.pendingMoves.delete(moveId);
      this.callbacks.onMoveFailed?.(
        moveId,
        "Move acknowledgment timeout after max retries"
      );
      return;
    }

    // Retry sending
    this.broadcastMove(pending.payload).then((sent) => {
      if (sent) {
        pending.sentAt = Date.now();
        pending.timeoutId = setTimeout(() => {
          this.handleMoveTimeout(moveId);
        }, MOVE_ACK_TIMEOUT_MS);
      }
    });
  }

  private generateMoveId(): string {
    return `${this.gameId}_${this.playerId}_${Date.now()}_${this.moveSequence}`;
  }

  // --------------------------------------------------------------------------
  // Reconnection with State Recovery
  // --------------------------------------------------------------------------

  private handleDisconnection(): void {
    this.reconnectionState = {
      gameId: this.gameId,
      playerId: this.playerId,
      lastKnownMoveNumber: this.lastKnownMoveNumber,
      lastKnownFen: this.lastKnownFen,
      disconnectedAt: Date.now(),
      missedMoves: [],
      resyncRequired: true,
    };

    this.setConnectionState("disconnected");
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (
      this.isManuallyDisconnected ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.callbacks.onError?.(
          new Error("Max reconnection attempts reached")
        );
      }
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState("reconnecting");

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    this.reconnectTimeoutId = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Will retry via error handler
      }
    }, delay);
  }

  private async recoverState(): Promise<void> {
    if (!this.reconnectionState) return;

    this.setConnectionState("recovering");

    try {
      // Fetch current game state from server
      const snapshot = await this.fetchGameSnapshot();
      if (!snapshot) {
        throw new Error("Failed to fetch game state");
      }

      // Calculate missed moves
      const missedMoveCount =
        snapshot.moveCount - this.reconnectionState.lastKnownMoveNumber;

      if (missedMoveCount > 0) {
        // Fetch missed moves
        const missedMoves = await this.fetchMovesSince(
          this.reconnectionState.lastKnownMoveNumber
        );

        // Update local state
        this.lastKnownFen = snapshot.fen;
        this.lastKnownMoveNumber = snapshot.moveCount;

        // Replay missed moves to callbacks
        for (const move of missedMoves) {
          this.callbacks.onMove?.({
            type: "move_with_ack",
            moveId: `recovery_${move.moveNumber}`,
            from: move.from,
            to: move.to,
            san: move.san,
            fen: move.fen,
            moveNumber: move.moveNumber,
            timeRemainingMs: 0, // Will be synced separately
            timestamp: Date.now(),
            requiresAck: false,
          });
        }

        this.callbacks.onReconnected?.(missedMoveCount);
      } else {
        this.callbacks.onReconnected?.(0);
      }

      // Resync time
      this.callbacks.onTimeSync?.(
        snapshot.whiteTimeRemainingMs,
        snapshot.blackTimeRemainingMs
      );

      // Clear reconnection state
      this.reconnectionState = null;

      // Re-send any pending moves
      await this.resendPendingMoves();

      this.setConnectionState("connected");
    } catch (error) {
      console.error("[EnhancedGameChannel] State recovery failed:", error);
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error("State recovery failed")
      );
    }
  }

  private async fetchGameSnapshot(): Promise<GameStateSnapshot | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from("games")
        .select(
          "id, current_fen, move_count, white_time_remaining, black_time_remaining, current_turn, status, result, last_move_at"
        )
        .eq("id", this.gameId)
        .single();

      if (error || !data) return null;

      return {
        gameId: data.id,
        fen: data.current_fen || this.lastKnownFen,
        moveCount: data.move_count || 0,
        whiteTimeRemainingMs: (data.white_time_remaining || 0) * 1000,
        blackTimeRemainingMs: (data.black_time_remaining || 0) * 1000,
        currentTurn: data.current_turn as "w" | "b",
        moves: [],
        status: data.status as "active" | "completed" | "abandoned",
        result: data.result,
        lastMoveAt: data.last_move_at
          ? new Date(data.last_move_at).getTime()
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private async fetchMovesSince(
    lastMoveNumber: number
  ): Promise<
    Array<{
      moveNumber: number;
      san: string;
      from: Square;
      to: Square;
      fen: string;
    }>
  > {
    if (!isSupabaseConfigured) return [];

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

  private async resendPendingMoves(): Promise<void> {
    const pendingList = Array.from(this.pendingMoves.values());

    for (const pending of pendingList) {
      if (!pending.acknowledged) {
        const sent = await this.broadcastMove(pending.payload);
        if (sent) {
          pending.sentAt = Date.now();
          pending.timeoutId = setTimeout(() => {
            this.handleMoveTimeout(pending.moveId);
          }, MOVE_ACK_TIMEOUT_MS);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Opponent Presence Tracking
  // --------------------------------------------------------------------------

  private handlePresenceSync(): void {
    const state = this.channel?.presenceState<PresenceData>();
    if (!state || !this.opponentId) return;

    const wasOnline = this.opponentOnline;
    this.opponentOnline = Object.keys(state).includes(this.opponentId);

    if (this.opponentOnline !== wasOnline) {
      this.callbacks.onOpponentOnline?.(this.opponentOnline);
    }
  }

  private handleOpponentJoined(): void {
    this.opponentOnline = true;
    this.opponentDisconnectedAt = null;

    // Clear grace period timeout
    if (this.opponentGraceTimeoutId) {
      clearTimeout(this.opponentGraceTimeoutId);
      this.opponentGraceTimeoutId = null;
    }

    this.callbacks.onOpponentOnline?.(true);
  }

  private handleOpponentLeft(): void {
    this.opponentOnline = false;
    this.opponentDisconnectedAt = Date.now();

    this.callbacks.onOpponentOnline?.(false);
    this.callbacks.onOpponentDisconnected?.(RECONNECTION_GRACE_PERIOD_MS);

    // Start grace period timeout
    this.opponentGraceTimeoutId = setTimeout(() => {
      if (!this.opponentOnline) {
        // Opponent exceeded grace period - can claim abandonment
        this.callbacks.onOpponentDisconnected?.(0);
      }
    }, RECONNECTION_GRACE_PERIOD_MS);
  }

  isOpponentOnline(): boolean {
    return this.opponentOnline;
  }

  getOpponentDisconnectedDuration(): number {
    if (!this.opponentDisconnectedAt || this.opponentOnline) return 0;
    return Date.now() - this.opponentDisconnectedAt;
  }

  canClaimAbandonment(): boolean {
    return (
      this.getOpponentDisconnectedDuration() >= RECONNECTION_ABANDON_THRESHOLD_MS
    );
  }

  // --------------------------------------------------------------------------
  // Game Events
  // --------------------------------------------------------------------------

  private handleGameEvent(payload: any): void {
    switch (payload.type) {
      case "resign":
        this.callbacks.onResign?.(payload.playerId);
        break;
      case "draw_offer":
        this.callbacks.onDrawOffer?.(payload.playerId);
        break;
      case "draw_accept":
        this.callbacks.onDrawResponse?.(true, payload.playerId);
        break;
      case "draw_decline":
        this.callbacks.onDrawResponse?.(false, payload.playerId);
        break;
      case "time_sync":
        this.callbacks.onTimeSync?.(payload.whiteTimeMs, payload.blackTimeMs);
        break;
      case "game_start":
        this.callbacks.onGameStart?.();
        break;
      case "game_end":
        this.callbacks.onGameEnd?.(payload.result, payload.reason);
        break;
      case "rematch_offer":
        this.callbacks.onRematchOffer?.(payload.playerId);
        break;
      case "rematch_accept":
        this.callbacks.onRematchAccepted?.(payload.newGameId);
        break;
      case "rematch_decline":
        this.callbacks.onRematchDeclined?.();
        break;
    }
  }

  async sendResign(): Promise<boolean> {
    return this.broadcastGameEvent({
      type: "resign",
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  async sendDrawOffer(): Promise<boolean> {
    return this.broadcastGameEvent({
      type: "draw_offer",
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  async sendDrawResponse(accept: boolean): Promise<boolean> {
    return this.broadcastGameEvent({
      type: accept ? "draw_accept" : "draw_decline",
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  async sendTimeSync(
    whiteTimeMs: number,
    blackTimeMs: number
  ): Promise<boolean> {
    return this.broadcastGameEvent({
      type: "time_sync",
      whiteTimeMs,
      blackTimeMs,
      timestamp: Date.now(),
    });
  }

  async sendRematchOffer(): Promise<boolean> {
    return this.broadcastGameEvent({
      type: "rematch_offer",
      playerId: this.playerId,
      timestamp: Date.now(),
    });
  }

  async sendRematchResponse(
    accept: boolean,
    newGameId?: string
  ): Promise<boolean> {
    if (accept && newGameId) {
      return this.broadcastGameEvent({
        type: "rematch_accept",
        playerId: this.playerId,
        newGameId,
        timestamp: Date.now(),
      });
    } else {
      return this.broadcastGameEvent({
        type: "rematch_decline",
        playerId: this.playerId,
        timestamp: Date.now(),
      });
    }
  }

  private async broadcastGameEvent(payload: any): Promise<boolean> {
    if (!this.channel || !this.isConnected()) {
      return false;
    }

    try {
      const result = await this.channel.send({
        type: "broadcast",
        event: "game_event",
        payload,
      });
      return result === "ok";
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Server-Side Move Validation
  // --------------------------------------------------------------------------

  async validateMoveOnServer(
    validation: ServerMoveValidation
  ): Promise<ServerValidationResult> {
    if (!isSupabaseConfigured) {
      // Demo mode - always valid
      return { valid: true };
    }

    try {
      const { data, error } = await supabase.rpc("validate_move", {
        p_game_id: validation.gameId,
        p_player_id: validation.playerId,
        p_move_number: validation.moveNumber,
        p_from_square: validation.from,
        p_to_square: validation.to,
        p_promotion: validation.promotion || null,
        p_fen_before: validation.fenBefore,
        p_time_remaining_ms: validation.timeRemainingMs,
      });

      if (error) {
        return {
          valid: false,
          error: error.message,
          errorCode: "INTERNAL_ERROR",
        };
      }

      return data as ServerValidationResult;
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : "Validation failed",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private clearAllTimeouts(): void {
    // Clear reconnect timeout
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Clear opponent grace timeout
    if (this.opponentGraceTimeoutId) {
      clearTimeout(this.opponentGraceTimeoutId);
      this.opponentGraceTimeoutId = null;
    }

    // Clear all pending move timeouts
    for (const pending of this.pendingMoves.values()) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
    }
  }

  getLastKnownState(): {
    fen: string;
    moveNumber: number;
    acknowledgedMoveNumber: number;
  } {
    return {
      fen: this.lastKnownFen,
      moveNumber: this.lastKnownMoveNumber,
      acknowledgedMoveNumber: this.lastAcknowledgedMoveNumber,
    };
  }

  getPendingMoveCount(): number {
    return this.pendingMoves.size;
  }

  hasPendingMoves(): boolean {
    return this.pendingMoves.size > 0;
  }

  destroy(): void {
    this.disconnect();
    this.pendingMoves.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEnhancedGameChannel(
  gameId: string,
  playerId: string,
  playerName: string,
  opponentId: string | null = null,
  callbacks?: EnhancedGameChannelCallbacks
): EnhancedGameChannel {
  return new EnhancedGameChannel(
    gameId,
    playerId,
    playerName,
    opponentId,
    callbacks
  );
}
