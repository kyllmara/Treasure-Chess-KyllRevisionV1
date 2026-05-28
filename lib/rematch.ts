/**
 * Rematch System
 *
 * Elite-level implementation featuring:
 * - Post-game rematch offers
 * - 30-second timeout for responses
 * - Automatic color swap option
 * - Same stakes and time controls
 * - Real-time offer/accept/decline events
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import {
  type RematchOffer,
  type RematchPayload,
  REMATCH_OFFER_TIMEOUT_SECONDS,
} from "@/types/multiplayer";

// ============================================================================
// Types
// ============================================================================

export interface RematchCallbacks {
  onRematchOffered?: (offer: RematchOffer) => void;
  onRematchAccepted?: (newGameId: string) => void;
  onRematchDeclined?: () => void;
  onRematchExpired?: () => void;
  onError?: (error: Error) => void;
}

export interface RematchConfig {
  gameId: string;
  playerId: string;
  opponentId: string;
  stakeTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  currentPlayerColor: "w" | "b";
}

// ============================================================================
// RematchService Class
// ============================================================================

export class RematchService {
  private config: RematchConfig;
  private callbacks: RematchCallbacks;
  private channel: RealtimeChannel | null = null;
  private currentOffer: RematchOffer | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private isOfferingPlayer = false;

  constructor(config: RematchConfig, callbacks: RematchCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!isSupabaseConfigured) return;

    // Subscribe to rematch channel for this game
    this.channel = supabase
      .channel(`rematch:${this.config.gameId}`)
      .on("broadcast", { event: "rematch" }, ({ payload }) => {
        this.handleRematchEvent(payload as RematchPayload);
      })
      .subscribe();
  }

  // --------------------------------------------------------------------------
  // Offer Rematch
  // --------------------------------------------------------------------------

  async offerRematch(swapColors: boolean = true): Promise<RematchOffer | null> {
    this.isOfferingPlayer = true;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REMATCH_OFFER_TIMEOUT_SECONDS * 1000);

    const offer: RematchOffer = {
      gameId: this.config.gameId,
      offeringPlayerId: this.config.playerId,
      receivingPlayerId: this.config.opponentId,
      stakeTct: this.config.stakeTct,
      timeControlSeconds: this.config.timeControlSeconds,
      incrementSeconds: this.config.incrementSeconds,
      swapColors,
      status: "offered",
      offeredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.currentOffer = offer;

    // Broadcast offer
    if (this.channel) {
      await this.channel.send({
        type: "broadcast",
        event: "rematch",
        payload: {
          type: "rematch_offer",
          gameId: this.config.gameId,
          playerId: this.config.playerId,
          swapColors,
          timestamp: Date.now(),
        },
      });
    }

    // Set timeout for expiration
    this.timeoutId = setTimeout(() => {
      this.handleOfferExpired();
    }, REMATCH_OFFER_TIMEOUT_SECONDS * 1000);

    return offer;
  }

  // --------------------------------------------------------------------------
  // Accept Rematch
  // --------------------------------------------------------------------------

  async acceptRematch(): Promise<string | null> {
    if (!this.currentOffer || this.isOfferingPlayer) {
      return null;
    }

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    try {
      // Create new game
      const newGameId = await this.createRematchGame();

      if (!newGameId) {
        throw new Error("Failed to create rematch game");
      }

      // Update offer status
      this.currentOffer.status = "accepted";
      this.currentOffer.newGameId = newGameId;

      // Broadcast acceptance
      if (this.channel) {
        await this.channel.send({
          type: "broadcast",
          event: "rematch",
          payload: {
            type: "rematch_accept",
            gameId: this.config.gameId,
            playerId: this.config.playerId,
            newGameId,
            timestamp: Date.now(),
          },
        });
      }

      return newGameId;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error("Failed to accept rematch")
      );
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Decline Rematch
  // --------------------------------------------------------------------------

  async declineRematch(): Promise<void> {
    if (!this.currentOffer) return;

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.currentOffer.status = "declined";

    // Broadcast decline
    if (this.channel) {
      await this.channel.send({
        type: "broadcast",
        event: "rematch",
        payload: {
          type: "rematch_decline",
          gameId: this.config.gameId,
          playerId: this.config.playerId,
          timestamp: Date.now(),
        },
      });
    }

    this.currentOffer = null;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private handleRematchEvent(payload: RematchPayload): void {
    // Ignore own events
    if (payload.playerId === this.config.playerId) return;

    switch (payload.type) {
      case "rematch_offer":
        this.handleRematchOfferReceived(payload);
        break;
      case "rematch_accept":
        this.handleRematchAccepted(payload);
        break;
      case "rematch_decline":
        this.handleRematchDeclined();
        break;
      case "rematch_expire":
        this.handleRematchExpiredEvent();
        break;
    }
  }

  private handleRematchOfferReceived(payload: RematchPayload): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REMATCH_OFFER_TIMEOUT_SECONDS * 1000);

    this.currentOffer = {
      gameId: this.config.gameId,
      offeringPlayerId: payload.playerId,
      receivingPlayerId: this.config.playerId,
      stakeTct: this.config.stakeTct,
      timeControlSeconds: this.config.timeControlSeconds,
      incrementSeconds: this.config.incrementSeconds,
      swapColors: true,
      status: "pending",
      offeredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.isOfferingPlayer = false;

    // Set expiration timeout
    this.timeoutId = setTimeout(() => {
      this.handleOfferExpired();
    }, REMATCH_OFFER_TIMEOUT_SECONDS * 1000);

    this.callbacks.onRematchOffered?.(this.currentOffer);
  }

  private handleRematchAccepted(payload: RematchPayload): void {
    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.currentOffer) {
      this.currentOffer.status = "accepted";
      this.currentOffer.newGameId = payload.newGameId;
    }

    this.callbacks.onRematchAccepted?.(payload.newGameId || "");
  }

  private handleRematchDeclined(): void {
    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.currentOffer) {
      this.currentOffer.status = "declined";
    }

    this.callbacks.onRematchDeclined?.();
    this.currentOffer = null;
  }

  private handleOfferExpired(): void {
    if (this.currentOffer) {
      this.currentOffer.status = "expired";
    }

    // Broadcast expiration
    if (this.channel) {
      this.channel.send({
        type: "broadcast",
        event: "rematch",
        payload: {
          type: "rematch_expire",
          gameId: this.config.gameId,
          playerId: this.config.playerId,
          timestamp: Date.now(),
        },
      });
    }

    this.callbacks.onRematchExpired?.();
    this.currentOffer = null;
  }

  private handleRematchExpiredEvent(): void {
    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.currentOffer) {
      this.currentOffer.status = "expired";
    }

    this.callbacks.onRematchExpired?.();
    this.currentOffer = null;
  }

  private async createRematchGame(): Promise<string | null> {
    if (!isSupabaseConfigured) {
      // Demo mode
      return `rematch_${Date.now()}`;
    }

    try {
      // Determine colors (swap if specified)
      let whitePlayerId: string;
      let blackPlayerId: string;

      if (this.currentOffer?.swapColors) {
        // Swap colors from previous game
        whitePlayerId =
          this.config.currentPlayerColor === "w"
            ? this.config.opponentId
            : this.config.playerId;
        blackPlayerId =
          this.config.currentPlayerColor === "w"
            ? this.config.playerId
            : this.config.opponentId;
      } else {
        // Keep same colors
        whitePlayerId =
          this.config.currentPlayerColor === "w"
            ? this.config.playerId
            : this.config.opponentId;
        blackPlayerId =
          this.config.currentPlayerColor === "b"
            ? this.config.playerId
            : this.config.opponentId;
      }

      // Get player ELOs
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, elo_rating")
        .in("id", [whitePlayerId, blackPlayerId]);

      const whiteElo =
        profiles?.find((p) => p.id === whitePlayerId)?.elo_rating || 1200;
      const blackElo =
        profiles?.find((p) => p.id === blackPlayerId)?.elo_rating || 1200;

      // Create new game
      const { data: game, error } = await supabase
        .from("games")
        .insert({
          white_player_id: whitePlayerId,
          black_player_id: blackPlayerId,
          wager_tct: this.config.stakeTct,
          time_control_seconds: this.config.timeControlSeconds,
          increment_seconds: this.config.incrementSeconds,
          status: "pending",
          is_rated: true,
          initial_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          white_time_remaining: this.config.timeControlSeconds,
          black_time_remaining: this.config.timeControlSeconds,
          move_count: 0,
          current_turn: "w",
          white_elo_before: whiteElo,
          black_elo_before: blackElo,
        })
        .select("id")
        .single();

      if (error || !game) {
        throw new Error("Failed to create game");
      }

      // Create escrow if stakes
      if (this.config.stakeTct > 0) {
        await supabase.from("game_escrows").insert({
          game_id: game.id,
          player_white_id: whitePlayerId,
          player_white_locked_tct: this.config.stakeTct,
          player_black_id: blackPlayerId,
          player_black_locked_tct: this.config.stakeTct,
          total_pool_tct: this.config.stakeTct * 2,
          status: "active",
        });
      }

      return game.id;
    } catch (error) {
      console.error("[RematchService] Error creating game:", error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getCurrentOffer(): RematchOffer | null {
    return this.currentOffer;
  }

  hasActiveOffer(): boolean {
    return (
      this.currentOffer !== null &&
      (this.currentOffer.status === "offered" ||
        this.currentOffer.status === "pending")
    );
  }

  isOfferor(): boolean {
    return this.isOfferingPlayer;
  }

  getRemainingTime(): number {
    if (!this.currentOffer) return 0;
    const expiresAt = new Date(this.currentOffer.expiresAt).getTime();
    const remaining = expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.currentOffer = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createRematchService(
  config: RematchConfig,
  callbacks?: RematchCallbacks
): RematchService {
  return new RematchService(config, callbacks);
}
