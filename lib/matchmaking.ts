/**
 * Matchmaking Service
 *
 * Elite-level implementation featuring:
 * - Supabase-backed queue persistence
 * - ELO-based matching with dynamic range expansion
 * - Real-time queue position updates
 * - Automatic timeout handling
 * - Balance verification before matching
 * - Fair color assignment
 */

import { supabase } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { MatchmakingQueue } from "@/types/supabase";

// ============================================================================
// Types
// ============================================================================

export interface MatchmakingConfig {
  userId: string;
  userElo: number;
  wagerTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  eloRangeMin?: number;
  eloRangeMax?: number;
}

export interface QueueEntry {
  id: string;
  userId: string;
  wagerTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  eloRangeMin: number;
  eloRangeMax: number;
  userElo: number;
  status: "waiting" | "matched" | "cancelled" | "expired";
  matchedWithId: string | null;
  gameId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface MatchResult {
  matched: boolean;
  gameId?: string;
  opponentId?: string;
  playerColor?: "w" | "b";
  opponent?: {
    id: string;
    username: string;
    avatarIndex: number;
    eloRating: number;
  };
}

export interface QueueStats {
  totalInQueue: number;
  compatiblePlayers: number;
  estimatedWaitSeconds: number;
  queuePosition: number;
}

export type MatchmakingStatus =
  | "idle"
  | "joining"
  | "searching"
  | "matched"
  | "cancelled"
  | "expired"
  | "error";

export interface MatchmakingCallbacks {
  onStatusChange?: (status: MatchmakingStatus) => void;
  onMatchFound?: (result: MatchResult) => void;
  onQueueStatsUpdate?: (stats: QueueStats) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_TIMEOUT_SECONDS = 60;
const INITIAL_ELO_RANGE = 100;
const MAX_ELO_RANGE = 400;
const ELO_RANGE_EXPANSION_PER_SECOND = 5;
const POLL_INTERVAL_MS = 2000;

// ============================================================================
// MatchmakingService Class
// ============================================================================

export class MatchmakingService {
  private userId: string;
  private config: MatchmakingConfig | null = null;
  private queueEntryId: string | null = null;
  private status: MatchmakingStatus = "idle";
  private callbacks: MatchmakingCallbacks = {};
  private pollIntervalId: NodeJS.Timeout | null = null;
  private channel: RealtimeChannel | null = null;
  private searchStartTime: number = 0;

  constructor(userId: string, callbacks?: MatchmakingCallbacks) {
    this.userId = userId;
    this.callbacks = callbacks || {};
  }

  // --------------------------------------------------------------------------
  // Public Methods
  // --------------------------------------------------------------------------

  async joinQueue(config: MatchmakingConfig): Promise<QueueEntry | null> {
    if (this.status === "searching") {
      throw new Error("Already in matchmaking queue");
    }

    this.config = config;
    this.setStatus("joining");
    this.searchStartTime = Date.now();

    try {
      // First, cancel any existing queue entries for this user
      await this.cancelExistingEntries();

      // Verify user has sufficient balance
      const hasBalance = await this.verifyBalance(config.wagerTct);
      if (!hasBalance) {
        throw new Error("Insufficient balance for wager");
      }

      // Calculate ELO range (default or custom)
      const eloRangeMin = config.eloRangeMin ?? config.userElo - INITIAL_ELO_RANGE;
      const eloRangeMax = config.eloRangeMax ?? config.userElo + INITIAL_ELO_RANGE;

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + QUEUE_TIMEOUT_SECONDS * 1000);

      // Insert queue entry
      const { data, error } = await supabase
        .from("matchmaking_queue")
        .insert({
          user_id: this.userId,
          wager_tct: config.wagerTct,
          time_control_seconds: config.timeControlSeconds,
          increment_seconds: config.incrementSeconds,
          elo_range_min: eloRangeMin,
          elo_range_max: eloRangeMax,
          user_elo: config.userElo,
          status: "waiting",
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      this.queueEntryId = data.id;

      // Check for immediate match
      const matchResult = await this.findMatch();
      if (matchResult.matched) {
        return this.convertToQueueEntry(data);
      }

      // Start polling and listening for matches
      this.setStatus("searching");
      this.startPolling();
      this.subscribeToMatches();

      return this.convertToQueueEntry(data);
    } catch (error) {
      this.setStatus("error");
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  async leaveQueue(): Promise<boolean> {
    if (!this.queueEntryId) return true;

    try {
      this.stopPolling();
      this.unsubscribe();

      const { error } = await supabase
        .from("matchmaking_queue")
        .update({ status: "cancelled" })
        .eq("id", this.queueEntryId);

      if (error) throw error;

      this.queueEntryId = null;
      this.setStatus("cancelled");
      return true;
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  async getQueueStats(): Promise<QueueStats> {
    if (!this.config) {
      return {
        totalInQueue: 0,
        compatiblePlayers: 0,
        estimatedWaitSeconds: 0,
        queuePosition: 0,
      };
    }

    try {
      // Get total players in queue with same wager and time control
      const { data: totalData, error: totalError } = await supabase
        .from("matchmaking_queue")
        .select("id, created_at, user_elo")
        .eq("status", "waiting")
        .eq("wager_tct", this.config.wagerTct)
        .eq("time_control_seconds", this.config.timeControlSeconds)
        .neq("user_id", this.userId);

      if (totalError) throw totalError;

      const totalInQueue = totalData?.length || 0;

      // Calculate compatible players (within ELO range)
      const currentEloRange = this.getCurrentEloRange();
      const compatiblePlayers = (totalData || []).filter(
        (p) =>
          p.user_elo >= currentEloRange.min &&
          p.user_elo <= currentEloRange.max
      ).length;

      // Estimate wait time based on queue depth
      let estimatedWaitSeconds = 0;
      if (compatiblePlayers === 0) {
        // Time until ELO range expands enough to find someone
        const nearestPlayer = (totalData || []).reduce(
          (nearest, p) => {
            const diff = Math.min(
              Math.abs(p.user_elo - currentEloRange.max),
              Math.abs(p.user_elo - currentEloRange.min)
            );
            return diff < nearest ? diff : nearest;
          },
          Infinity
        );
        estimatedWaitSeconds = nearestPlayer === Infinity
          ? QUEUE_TIMEOUT_SECONDS
          : Math.ceil(nearestPlayer / ELO_RANGE_EXPANSION_PER_SECOND);
      } else {
        // Expect match soon
        estimatedWaitSeconds = Math.ceil(POLL_INTERVAL_MS / 1000);
      }

      // Get queue position
      let queuePosition = 1;
      if (this.queueEntryId) {
        const { data: positionData } = await supabase
          .from("matchmaking_queue")
          .select("id")
          .eq("status", "waiting")
          .eq("wager_tct", this.config.wagerTct)
          .eq("time_control_seconds", this.config.timeControlSeconds)
          .order("created_at", { ascending: true });

        queuePosition = (positionData || []).findIndex(
          (p) => p.id === this.queueEntryId
        ) + 1;
      }

      const stats = {
        totalInQueue,
        compatiblePlayers,
        estimatedWaitSeconds,
        queuePosition,
      };

      this.callbacks.onQueueStatsUpdate?.(stats);
      return stats;
    } catch (error) {
      console.error("Error getting queue stats:", error);
      return {
        totalInQueue: 0,
        compatiblePlayers: 0,
        estimatedWaitSeconds: 0,
        queuePosition: 0,
      };
    }
  }

  getStatus(): MatchmakingStatus {
    return this.status;
  }

  getSearchDuration(): number {
    if (this.searchStartTime === 0) return 0;
    return Math.floor((Date.now() - this.searchStartTime) / 1000);
  }

  destroy(): void {
    this.stopPolling();
    this.unsubscribe();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private setStatus(status: MatchmakingStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private async cancelExistingEntries(): Promise<void> {
    await supabase
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .eq("user_id", this.userId)
      .eq("status", "waiting");
  }

  private async verifyBalance(wagerTct: number): Promise<boolean> {
    const { data, error } = await supabase
      .from("balances")
      .select("available_tct")
      .eq("user_id", this.userId)
      .single();

    if (error || !data) return false;
    return data.available_tct >= wagerTct;
  }

  private getCurrentEloRange(): { min: number; max: number } {
    if (!this.config) return { min: 0, max: 3000 };

    const elapsedSeconds = this.getSearchDuration();
    const expansion = Math.min(
      elapsedSeconds * ELO_RANGE_EXPANSION_PER_SECOND,
      MAX_ELO_RANGE - INITIAL_ELO_RANGE
    );

    return {
      min: this.config.userElo - INITIAL_ELO_RANGE - expansion,
      max: this.config.userElo + INITIAL_ELO_RANGE + expansion,
    };
  }

  private async findMatch(): Promise<MatchResult> {
    if (!this.config || !this.queueEntryId) {
      return { matched: false };
    }

    const eloRange = this.getCurrentEloRange();

    try {
      // Find compatible opponent
      const { data: opponents, error: opponentError } = await supabase
        .from("matchmaking_queue")
        .select(`
          id,
          user_id,
          user_elo,
          elo_range_min,
          elo_range_max,
          created_at
        `)
        .eq("status", "waiting")
        .eq("wager_tct", this.config.wagerTct)
        .eq("time_control_seconds", this.config.timeControlSeconds)
        .eq("increment_seconds", this.config.incrementSeconds)
        .neq("user_id", this.userId)
        .gte("user_elo", eloRange.min)
        .lte("user_elo", eloRange.max)
        .order("created_at", { ascending: true })
        .limit(10);

      if (opponentError) throw opponentError;

      if (!opponents || opponents.length === 0) {
        return { matched: false };
      }

      // Find first opponent whose range also includes us
      const validOpponent = opponents.find(
        (opp) =>
          this.config!.userElo >= opp.elo_range_min &&
          this.config!.userElo <= opp.elo_range_max
      );

      if (!validOpponent) {
        return { matched: false };
      }

      // Attempt to claim the match (atomic update)
      const { data: claimData, error: claimError } = await supabase
        .from("matchmaking_queue")
        .update({
          status: "matched",
          matched_with_id: validOpponent.user_id,
          matched_at: new Date().toISOString(),
        })
        .eq("id", this.queueEntryId)
        .eq("status", "waiting")
        .select()
        .single();

      if (claimError || !claimData) {
        // Someone else may have matched us
        return this.checkIfMatched();
      }

      // Update opponent's queue entry
      await supabase
        .from("matchmaking_queue")
        .update({
          status: "matched",
          matched_with_id: this.userId,
          matched_at: new Date().toISOString(),
        })
        .eq("id", validOpponent.id)
        .eq("status", "waiting");

      // Create the game
      const matchResult = await this.createGame(validOpponent.user_id);

      if (matchResult.matched) {
        // Update queue entries with game ID
        await supabase
          .from("matchmaking_queue")
          .update({ game_id: matchResult.gameId })
          .in("id", [this.queueEntryId, validOpponent.id]);

        this.setStatus("matched");
        this.stopPolling();
        this.callbacks.onMatchFound?.(matchResult);
      }

      return matchResult;
    } catch (error) {
      console.error("Error finding match:", error);
      return { matched: false };
    }
  }

  private async checkIfMatched(): Promise<MatchResult> {
    if (!this.queueEntryId) return { matched: false };

    const { data, error } = await supabase
      .from("matchmaking_queue")
      .select("status, matched_with_id, game_id")
      .eq("id", this.queueEntryId)
      .single();

    if (error || !data) return { matched: false };

    if (data.status === "matched" && data.game_id) {
      const matchResult = await this.getMatchResult(
        data.game_id,
        data.matched_with_id
      );
      if (matchResult.matched) {
        this.setStatus("matched");
        this.stopPolling();
        this.callbacks.onMatchFound?.(matchResult);
      }
      return matchResult;
    }

    if (data.status === "expired") {
      this.setStatus("expired");
      this.stopPolling();
      return { matched: false };
    }

    return { matched: false };
  }

  private async createGame(opponentId: string): Promise<MatchResult> {
    if (!this.config) return { matched: false };

    try {
      // Randomly assign colors (fair coin flip)
      const playerIsWhite = Math.random() < 0.5;

      const whitePlayerId = playerIsWhite ? this.userId : opponentId;
      const blackPlayerId = playerIsWhite ? opponentId : this.userId;

      // Get player profiles
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_index, elo_rating")
        .in("id", [this.userId, opponentId]);

      if (profileError || !profiles || profiles.length !== 2) {
        throw new Error("Failed to get player profiles");
      }

      const myProfile = profiles.find((p) => p.id === this.userId);
      const opponentProfile = profiles.find((p) => p.id === opponentId);

      if (!myProfile || !opponentProfile) {
        throw new Error("Profile not found");
      }

      // Create game record
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          white_player_id: whitePlayerId,
          black_player_id: blackPlayerId,
          wager_tct: this.config.wagerTct,
          time_control_seconds: this.config.timeControlSeconds,
          increment_seconds: this.config.incrementSeconds,
          status: "active",
          initial_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          white_time_remaining: this.config.timeControlSeconds,
          black_time_remaining: this.config.timeControlSeconds,
          move_count: 0,
          current_turn: "w",
          white_elo_before: playerIsWhite ? myProfile.elo_rating : opponentProfile.elo_rating,
          black_elo_before: playerIsWhite ? opponentProfile.elo_rating : myProfile.elo_rating,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (gameError || !game) {
        throw new Error("Failed to create game");
      }

      // Lock wagers in escrow
      await this.createEscrow(game.id, whitePlayerId, blackPlayerId);

      return {
        matched: true,
        gameId: game.id,
        opponentId,
        playerColor: playerIsWhite ? "w" : "b",
        opponent: {
          id: opponentProfile.id,
          username: opponentProfile.username,
          avatarIndex: opponentProfile.avatar_index,
          eloRating: opponentProfile.elo_rating,
        },
      };
    } catch (error) {
      console.error("Error creating game:", error);
      return { matched: false };
    }
  }

  private async createEscrow(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string
  ): Promise<void> {
    if (!this.config) return;

    const wagerTct = this.config.wagerTct;

    await supabase.from("game_escrows").insert({
      game_id: gameId,
      player_white_id: whitePlayerId,
      player_white_locked_tct: wagerTct,
      player_black_id: blackPlayerId,
      player_black_locked_tct: wagerTct,
      total_pool_tct: wagerTct * 2,
      status: "active",
    });

    // Lock funds for both players
    for (const playerId of [whitePlayerId, blackPlayerId]) {
      await supabase.rpc("lock_balance", {
        p_user_id: playerId,
        p_amount: wagerTct,
        p_game_id: gameId,
      });
    }
  }

  private async getMatchResult(
    gameId: string,
    opponentId: string | null
  ): Promise<MatchResult> {
    if (!opponentId) return { matched: false };

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("white_player_id, black_player_id")
      .eq("id", gameId)
      .single();

    if (gameError || !game) return { matched: false };

    const { data: opponent, error: oppError } = await supabase
      .from("profiles")
      .select("id, username, avatar_index, elo_rating")
      .eq("id", opponentId)
      .single();

    if (oppError || !opponent) return { matched: false };

    return {
      matched: true,
      gameId,
      opponentId,
      playerColor: game.white_player_id === this.userId ? "w" : "b",
      opponent: {
        id: opponent.id,
        username: opponent.username,
        avatarIndex: opponent.avatar_index,
        eloRating: opponent.elo_rating,
      },
    };
  }

  private startPolling(): void {
    this.stopPolling();

    this.pollIntervalId = setInterval(async () => {
      // Check for match
      const result = await this.findMatch();
      if (result.matched) return;

      // Check if matched by someone else
      const checkResult = await this.checkIfMatched();
      if (checkResult.matched) return;

      // Update queue stats
      await this.getQueueStats();

      // Check for expiration
      if (this.getSearchDuration() >= QUEUE_TIMEOUT_SECONDS) {
        await this.handleExpiration();
      }

      // Expand ELO range
      await this.expandEloRange();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private async expandEloRange(): Promise<void> {
    if (!this.queueEntryId || !this.config) return;

    const eloRange = this.getCurrentEloRange();

    await supabase
      .from("matchmaking_queue")
      .update({
        elo_range_min: eloRange.min,
        elo_range_max: eloRange.max,
      })
      .eq("id", this.queueEntryId);
  }

  private async handleExpiration(): Promise<void> {
    if (!this.queueEntryId) return;

    await supabase
      .from("matchmaking_queue")
      .update({ status: "expired" })
      .eq("id", this.queueEntryId);

    this.stopPolling();
    this.setStatus("expired");
  }

  private subscribeToMatches(): void {
    if (!this.queueEntryId) return;

    this.channel = supabase
      .channel(`matchmaking:${this.queueEntryId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matchmaking_queue",
          filter: `id=eq.${this.queueEntryId}`,
        },
        async (payload) => {
          const newData = payload.new as MatchmakingQueue;
          if (newData.status === "matched" && newData.game_id) {
            const result = await this.getMatchResult(
              newData.game_id,
              newData.matched_with_id
            );
            if (result.matched) {
              this.setStatus("matched");
              this.stopPolling();
              this.callbacks.onMatchFound?.(result);
            }
          }
        }
      )
      .subscribe();
  }

  private unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private convertToQueueEntry(data: any): QueueEntry {
    return {
      id: data.id,
      userId: data.user_id,
      wagerTct: data.wager_tct,
      timeControlSeconds: data.time_control_seconds,
      incrementSeconds: data.increment_seconds,
      eloRangeMin: data.elo_range_min,
      eloRangeMax: data.elo_range_max,
      userElo: data.user_elo,
      status: data.status,
      matchedWithId: data.matched_with_id,
      gameId: data.game_id,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMatchmakingService(
  userId: string,
  callbacks?: MatchmakingCallbacks
): MatchmakingService {
  return new MatchmakingService(userId, callbacks);
}
