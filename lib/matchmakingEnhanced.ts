/**
 * Enhanced Matchmaking Service
 *
 * Elite-level implementation featuring:
 * - Stake-based queue separation (Free, $5, $10, $25, $50, $100)
 * - Time control selection (Bullet, Blitz, Rapid, Classical)
 * - Pre-game ready confirmation
 * - ELO-based matching with dynamic range expansion
 * - Real-time queue position updates
 * - Automatic timeout handling
 * - Balance verification before matching
 * - Fair color assignment
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import type { MatchmakingQueue } from "@/types/supabase";
import {
  STAKE_TIERS,
  STAKE_TIER_NAMES,
  TIME_CONTROLS,
  getQueueKey,
  type StakeTier,
  type TimeControl,
  type QueueConfig,
  type PreGameState,
  type PlayerReadyState,
  type MatchFoundResult,
  READY_CONFIRMATION_TIMEOUT_SECONDS,
  GAME_START_COUNTDOWN_SECONDS,
} from "@/types/multiplayer";

// ============================================================================
// Types
// ============================================================================

export interface EnhancedMatchmakingConfig {
  userId: string;
  userElo: number;
  stakeTier: StakeTier;
  timeControl: TimeControl;
  isRated?: boolean;
  eloRangeMin?: number;
  eloRangeMax?: number;
}

export interface QueueStats {
  totalInQueue: number;
  compatiblePlayers: number;
  estimatedWaitSeconds: number;
  queuePosition: number;
  playersPerStakeTier: Record<StakeTier, number>;
  playersPerTimeCategory: Record<string, number>;
}

export type EnhancedMatchmakingStatus =
  | "idle"
  | "joining"
  | "searching"
  | "match_found"
  | "waiting_ready"
  | "ready"
  | "starting"
  | "in_game"
  | "cancelled"
  | "expired"
  | "error";

export interface EnhancedMatchmakingCallbacks {
  onStatusChange?: (status: EnhancedMatchmakingStatus) => void;
  onMatchFound?: (result: MatchFoundResult) => void;
  onQueueStatsUpdate?: (stats: QueueStats) => void;
  onPreGameUpdate?: (state: PreGameState) => void;
  onOpponentReady?: (opponentId: string) => void;
  onGameStart?: (gameId: string) => void;
  onCountdown?: (seconds: number) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Constants
// ============================================================================

const QUEUE_TIMEOUT_SECONDS = 90; // Increased for stake-based queues
const INITIAL_ELO_RANGE = 100;
const MAX_ELO_RANGE = 400;
const ELO_RANGE_EXPANSION_PER_SECOND = 5;
const POLL_INTERVAL_MS = 2000;
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ============================================================================
// Queue Manager - Manages all stake-based queues
// ============================================================================

export class QueueManager {
  private static instance: QueueManager;
  private queues: Map<string, Set<string>> = new Map();
  private channel: RealtimeChannel | null = null;

  private constructor() {
    this.initializeQueues();
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  private initializeQueues(): void {
    // Create queues for all stake/time combinations
    for (const stakeTier of Object.values(STAKE_TIERS)) {
      for (const timeControl of TIME_CONTROLS) {
        const key = getQueueKey({
          stakeTier,
          timeControl,
          isRated: true,
        });
        this.queues.set(key, new Set());
      }
    }
  }

  async getQueueCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (!isSupabaseConfigured) {
      this.queues.forEach((_, key) => counts.set(key, 0));
      return counts;
    }

    try {
      const { data, error } = await supabase
        .from("matchmaking_queue")
        .select("wager_tct, time_control_seconds, increment_seconds")
        .eq("status", "waiting");

      if (error) throw error;

      // Reset counts
      this.queues.forEach((_, key) => counts.set(key, 0));

      // Count players per queue
      (data || []).forEach((entry) => {
        const key = `${entry.wager_tct}_${entry.time_control_seconds}_${entry.increment_seconds}`;
        const current = counts.get(key) || 0;
        counts.set(key, current + 1);
      });
    } catch (error) {
      console.error("[QueueManager] Error getting queue counts:", error);
    }

    return counts;
  }

  async getQueuesByStakeTier(): Promise<Record<StakeTier, number>> {
    const result: Record<StakeTier, number> = {
      [STAKE_TIERS.FREE]: 0,
      [STAKE_TIERS.MICRO]: 0,
      [STAKE_TIERS.LOW]: 0,
      [STAKE_TIERS.MEDIUM]: 0,
      [STAKE_TIERS.HIGH]: 0,
      [STAKE_TIERS.WHALE]: 0,
    };

    if (!isSupabaseConfigured) return result;

    try {
      const { data, error } = await supabase
        .from("matchmaking_queue")
        .select("wager_tct")
        .eq("status", "waiting");

      if (error) throw error;

      (data || []).forEach((entry) => {
        if (entry.wager_tct in result) {
          result[entry.wager_tct as StakeTier]++;
        }
      });
    } catch (error) {
      console.error("[QueueManager] Error getting stake tier counts:", error);
    }

    return result;
  }

  async getQueuesByTimeCategory(): Promise<Record<string, number>> {
    const result: Record<string, number> = {
      bullet: 0,
      blitz: 0,
      rapid: 0,
      classical: 0,
    };

    if (!isSupabaseConfigured) return result;

    try {
      const { data, error } = await supabase
        .from("matchmaking_queue")
        .select("time_control_seconds, increment_seconds")
        .eq("status", "waiting");

      if (error) throw error;

      (data || []).forEach((entry) => {
        const tc = TIME_CONTROLS.find(
          (t) =>
            t.baseTimeSeconds === entry.time_control_seconds &&
            t.incrementSeconds === entry.increment_seconds
        );
        if (tc) {
          result[tc.category]++;
        }
      });
    } catch (error) {
      console.error("[QueueManager] Error getting time category counts:", error);
    }

    return result;
  }

  subscribeToQueueUpdates(onUpdate: () => void): void {
    if (!isSupabaseConfigured) return;

    this.channel = supabase
      .channel("global-queue-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matchmaking_queue",
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();
  }

  unsubscribeFromQueueUpdates(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

// ============================================================================
// EnhancedMatchmakingService Class
// ============================================================================

export class EnhancedMatchmakingService {
  private userId: string;
  private config: EnhancedMatchmakingConfig | null = null;
  private queueEntryId: string | null = null;
  private status: EnhancedMatchmakingStatus = "idle";
  private callbacks: EnhancedMatchmakingCallbacks = {};
  private pollIntervalId: NodeJS.Timeout | null = null;
  private channel: RealtimeChannel | null = null;
  private preGameChannel: RealtimeChannel | null = null;
  private searchStartTime: number = 0;
  private preGameState: PreGameState | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;
  private currentGameId: string | null = null;

  constructor(userId: string, callbacks?: EnhancedMatchmakingCallbacks) {
    this.userId = userId;
    this.callbacks = callbacks || {};
  }

  // --------------------------------------------------------------------------
  // Public Methods
  // --------------------------------------------------------------------------

  /**
   * Join a specific stake/time queue
   */
  async joinQueue(config: EnhancedMatchmakingConfig): Promise<boolean> {
    if (this.status === "searching" || this.status === "waiting_ready") {
      throw new Error("Already in matchmaking queue");
    }

    this.config = config;
    this.setStatus("joining");
    this.searchStartTime = Date.now();

    if (!isSupabaseConfigured) {
      // Simulate queue for demo mode
      this.setStatus("searching");
      this.startDemoPolling();
      return true;
    }

    try {
      // Cancel any existing queue entries
      await this.cancelExistingEntries();

      // Verify balance for stake
      if (config.stakeTier > 0) {
        const hasBalance = await this.verifyBalance(config.stakeTier);
        if (!hasBalance) {
          throw new Error(`Insufficient balance for ${STAKE_TIER_NAMES[config.stakeTier]} stake`);
        }
      }

      // Calculate ELO range
      const eloRangeMin = config.eloRangeMin ?? config.userElo - INITIAL_ELO_RANGE;
      const eloRangeMax = config.eloRangeMax ?? config.userElo + INITIAL_ELO_RANGE;

      // Calculate expiration
      const expiresAt = new Date(Date.now() + QUEUE_TIMEOUT_SECONDS * 1000);

      // Insert queue entry with specific stake and time control
      const { data, error } = await supabase
        .from("matchmaking_queue")
        .insert({
          user_id: this.userId,
          wager_tct: config.stakeTier,
          time_control_seconds: config.timeControl.baseTimeSeconds,
          increment_seconds: config.timeControl.incrementSeconds,
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

      // Try to find an immediate match
      const matchResult = await this.findMatch();
      if (matchResult.matched) {
        return true;
      }

      // Start searching
      this.setStatus("searching");
      this.startPolling();
      this.subscribeToMatches();

      return true;
    } catch (error) {
      this.setStatus("error");
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  /**
   * Leave the current queue
   */
  async leaveQueue(): Promise<boolean> {
    if (!this.queueEntryId && !isSupabaseConfigured) {
      this.cleanup();
      this.setStatus("cancelled");
      return true;
    }

    try {
      this.cleanup();

      if (this.queueEntryId && isSupabaseConfigured) {
        await supabase
          .from("matchmaking_queue")
          .update({ status: "cancelled" })
          .eq("id", this.queueEntryId);
      }

      this.queueEntryId = null;
      this.setStatus("cancelled");
      return true;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  /**
   * Mark player as ready in pre-game
   */
  async confirmReady(): Promise<boolean> {
    if (!this.preGameState || !this.currentGameId) {
      return false;
    }

    if (!isSupabaseConfigured) {
      // Demo mode - simulate ready
      this.setStatus("ready");
      setTimeout(() => this.startGameCountdown(), 1000);
      return true;
    }

    try {
      // Broadcast ready status
      await supabase.channel(`pregame:${this.currentGameId}`).send({
        type: "broadcast",
        event: "player_ready",
        payload: {
          playerId: this.userId,
          timestamp: Date.now(),
        },
      });

      this.setStatus("ready");

      // Update local state
      if (this.preGameState) {
        const isWhite = this.preGameState.whitePlayer.playerId === this.userId;
        if (isWhite) {
          this.preGameState.whitePlayer.isReady = true;
          this.preGameState.whitePlayer.readyAt = Date.now();
        } else {
          this.preGameState.blackPlayer.isReady = true;
          this.preGameState.blackPlayer.readyAt = Date.now();
        }
        this.callbacks.onPreGameUpdate?.(this.preGameState);

        // Check if both ready
        if (
          this.preGameState.whitePlayer.isReady &&
          this.preGameState.blackPlayer.isReady
        ) {
          this.startGameCountdown();
        }
      }

      return true;
    } catch (error) {
      console.error("[Matchmaking] Error confirming ready:", error);
      return false;
    }
  }

  /**
   * Get comprehensive queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    const defaultStats: QueueStats = {
      totalInQueue: 0,
      compatiblePlayers: 0,
      estimatedWaitSeconds: 0,
      queuePosition: 0,
      playersPerStakeTier: {
        [STAKE_TIERS.FREE]: 0,
        [STAKE_TIERS.MICRO]: 0,
        [STAKE_TIERS.LOW]: 0,
        [STAKE_TIERS.MEDIUM]: 0,
        [STAKE_TIERS.HIGH]: 0,
        [STAKE_TIERS.WHALE]: 0,
      },
      playersPerTimeCategory: {
        bullet: 0,
        blitz: 0,
        rapid: 0,
        classical: 0,
      },
    };

    if (!this.config) return defaultStats;

    if (!isSupabaseConfigured) {
      // Demo stats
      return {
        ...defaultStats,
        totalInQueue: Math.floor(Math.random() * 20) + 5,
        compatiblePlayers: Math.floor(Math.random() * 5) + 1,
        estimatedWaitSeconds: Math.floor(Math.random() * 30) + 5,
        queuePosition: 1,
        playersPerStakeTier: {
          [STAKE_TIERS.FREE]: Math.floor(Math.random() * 10),
          [STAKE_TIERS.MICRO]: Math.floor(Math.random() * 8),
          [STAKE_TIERS.LOW]: Math.floor(Math.random() * 5),
          [STAKE_TIERS.MEDIUM]: Math.floor(Math.random() * 3),
          [STAKE_TIERS.HIGH]: Math.floor(Math.random() * 2),
          [STAKE_TIERS.WHALE]: Math.floor(Math.random() * 1),
        },
        playersPerTimeCategory: {
          bullet: Math.floor(Math.random() * 8),
          blitz: Math.floor(Math.random() * 10),
          rapid: Math.floor(Math.random() * 6),
          classical: Math.floor(Math.random() * 2),
        },
      };
    }

    try {
      const queueManager = QueueManager.getInstance();
      const [stakeStats, timeStats] = await Promise.all([
        queueManager.getQueuesByStakeTier(),
        queueManager.getQueuesByTimeCategory(),
      ]);

      // Get players in same queue
      const { data: queueData, error: queueError } = await supabase
        .from("matchmaking_queue")
        .select("id, created_at, user_elo")
        .eq("status", "waiting")
        .eq("wager_tct", this.config.stakeTier)
        .eq("time_control_seconds", this.config.timeControl.baseTimeSeconds)
        .eq("increment_seconds", this.config.timeControl.incrementSeconds)
        .neq("user_id", this.userId);

      if (queueError) throw queueError;

      const totalInQueue = queueData?.length || 0;

      // Calculate compatible players
      const eloRange = this.getCurrentEloRange();
      const compatiblePlayers = (queueData || []).filter(
        (p) => p.user_elo >= eloRange.min && p.user_elo <= eloRange.max
      ).length;

      // Estimate wait time
      let estimatedWaitSeconds = POLL_INTERVAL_MS / 1000;
      if (compatiblePlayers === 0 && totalInQueue > 0) {
        const nearestPlayer = (queueData || []).reduce((nearest, p) => {
          const diff = Math.min(
            Math.abs(p.user_elo - eloRange.max),
            Math.abs(p.user_elo - eloRange.min)
          );
          return diff < nearest ? diff : nearest;
        }, Infinity);
        estimatedWaitSeconds =
          nearestPlayer === Infinity
            ? QUEUE_TIMEOUT_SECONDS
            : Math.ceil(nearestPlayer / ELO_RANGE_EXPANSION_PER_SECOND);
      }

      // Get queue position
      let queuePosition = 1;
      if (this.queueEntryId) {
        const { data: positionData } = await supabase
          .from("matchmaking_queue")
          .select("id")
          .eq("status", "waiting")
          .eq("wager_tct", this.config.stakeTier)
          .eq("time_control_seconds", this.config.timeControl.baseTimeSeconds)
          .order("created_at", { ascending: true });

        queuePosition =
          (positionData || []).findIndex((p) => p.id === this.queueEntryId) + 1;
      }

      const stats: QueueStats = {
        totalInQueue,
        compatiblePlayers,
        estimatedWaitSeconds,
        queuePosition,
        playersPerStakeTier: stakeStats,
        playersPerTimeCategory: timeStats,
      };

      this.callbacks.onQueueStatsUpdate?.(stats);
      return stats;
    } catch (error) {
      console.error("[Matchmaking] Error getting queue stats:", error);
      return defaultStats;
    }
  }

  getStatus(): EnhancedMatchmakingStatus {
    return this.status;
  }

  getSearchDuration(): number {
    if (this.searchStartTime === 0) return 0;
    return Math.floor((Date.now() - this.searchStartTime) / 1000);
  }

  getPreGameState(): PreGameState | null {
    return this.preGameState;
  }

  getCurrentConfig(): EnhancedMatchmakingConfig | null {
    return this.config;
  }

  destroy(): void {
    this.cleanup();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private setStatus(status: EnhancedMatchmakingStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private cleanup(): void {
    this.stopPolling();
    this.unsubscribe();
    this.stopCountdown();
  }

  private async cancelExistingEntries(): Promise<void> {
    if (!isSupabaseConfigured) return;

    await supabase
      .from("matchmaking_queue")
      .update({ status: "cancelled" })
      .eq("user_id", this.userId)
      .eq("status", "waiting");
  }

  private async verifyBalance(wagerTct: number): Promise<boolean> {
    if (wagerTct === 0) return true;

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

  private async findMatch(): Promise<MatchFoundResult> {
    if (!this.config || !this.queueEntryId) {
      return { matched: false };
    }

    const eloRange = this.getCurrentEloRange();

    try {
      // Find compatible opponent in SAME stake/time queue
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
        .eq("wager_tct", this.config.stakeTier) // Same stake tier
        .eq("time_control_seconds", this.config.timeControl.baseTimeSeconds) // Same time control
        .eq("increment_seconds", this.config.timeControl.incrementSeconds)
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

      // Attempt atomic claim
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
        return this.checkIfMatched();
      }

      // Update opponent
      await supabase
        .from("matchmaking_queue")
        .update({
          status: "matched",
          matched_with_id: this.userId,
          matched_at: new Date().toISOString(),
        })
        .eq("id", validOpponent.id)
        .eq("status", "waiting");

      // Create game and pre-game state
      const matchResult = await this.createGameWithPreGame(validOpponent.user_id);

      if (matchResult.matched) {
        await supabase
          .from("matchmaking_queue")
          .update({ game_id: matchResult.gameId })
          .in("id", [this.queueEntryId, validOpponent.id]);

        this.setStatus("match_found");
        this.stopPolling();
        this.callbacks.onMatchFound?.(matchResult);

        // Setup pre-game
        await this.setupPreGame(matchResult);
      }

      return matchResult;
    } catch (error) {
      console.error("[Matchmaking] Error finding match:", error);
      return { matched: false };
    }
  }

  private async checkIfMatched(): Promise<MatchFoundResult> {
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
        this.setStatus("match_found");
        this.stopPolling();
        this.callbacks.onMatchFound?.(matchResult);
        await this.setupPreGame(matchResult);
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

  private async createGameWithPreGame(
    opponentId: string
  ): Promise<MatchFoundResult> {
    if (!this.config) return { matched: false };

    try {
      // Random color assignment
      const playerIsWhite = Math.random() < 0.5;
      const whitePlayerId = playerIsWhite ? this.userId : opponentId;
      const blackPlayerId = playerIsWhite ? opponentId : this.userId;

      // Get profiles
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

      // Create game in 'pending' status (will become 'active' after both ready)
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          white_player_id: whitePlayerId,
          black_player_id: blackPlayerId,
          wager_tct: this.config.stakeTier,
          time_control_seconds: this.config.timeControl.baseTimeSeconds,
          increment_seconds: this.config.timeControl.incrementSeconds,
          status: "pending", // Pending until both ready
          is_rated: this.config.isRated ?? true,
          initial_fen: INITIAL_FEN,
          current_fen: INITIAL_FEN,
          white_time_remaining: this.config.timeControl.baseTimeSeconds,
          black_time_remaining: this.config.timeControl.baseTimeSeconds,
          move_count: 0,
          current_turn: "w",
          white_elo_before: playerIsWhite
            ? myProfile.elo_rating
            : opponentProfile.elo_rating,
          black_elo_before: playerIsWhite
            ? opponentProfile.elo_rating
            : myProfile.elo_rating,
        })
        .select()
        .single();

      if (gameError || !game) {
        throw new Error("Failed to create game");
      }

      this.currentGameId = game.id;

      // Create escrow if wager
      if (this.config.stakeTier > 0) {
        await this.createEscrow(game.id, whitePlayerId, blackPlayerId);
      }

      // Build pre-game state
      const whiteProfile = playerIsWhite ? myProfile : opponentProfile;
      const blackProfile = playerIsWhite ? opponentProfile : myProfile;

      const preGameState: PreGameState = {
        gameId: game.id,
        whitePlayer: {
          playerId: whitePlayerId,
          username: whiteProfile.username,
          avatarIndex: whiteProfile.avatar_index,
          eloRating: whiteProfile.elo_rating,
          isReady: false,
          color: "w",
        },
        blackPlayer: {
          playerId: blackPlayerId,
          username: blackProfile.username,
          avatarIndex: blackProfile.avatar_index,
          eloRating: blackProfile.elo_rating,
          isReady: false,
          color: "b",
        },
        status: "waiting",
        createdAt: Date.now(),
        expiresAt: Date.now() + READY_CONFIRMATION_TIMEOUT_SECONDS * 1000,
      };

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
        preGameState,
        stakeTct: this.config.stakeTier,
        timeControl: this.config.timeControl,
      };
    } catch (error) {
      console.error("[Matchmaking] Error creating game:", error);
      return { matched: false };
    }
  }

  private async createEscrow(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string
  ): Promise<void> {
    if (!this.config) return;

    const wagerTct = this.config.stakeTier;

    await supabase.from("game_escrows").insert({
      game_id: gameId,
      player_white_id: whitePlayerId,
      player_white_locked_tct: wagerTct,
      player_black_id: blackPlayerId,
      player_black_locked_tct: wagerTct,
      total_pool_tct: wagerTct * 2,
      status: "active",
    });

    // Lock funds
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
  ): Promise<MatchFoundResult> {
    if (!opponentId) return { matched: false };

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
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

  private async setupPreGame(matchResult: MatchFoundResult): Promise<void> {
    if (!matchResult.preGameState) return;

    this.preGameState = matchResult.preGameState;
    this.setStatus("waiting_ready");
    this.callbacks.onPreGameUpdate?.(this.preGameState);

    // Subscribe to pre-game channel
    this.subscribeToPreGame(matchResult.gameId!);

    // Set timeout for ready confirmation
    setTimeout(async () => {
      if (this.status === "waiting_ready" || this.status === "ready") {
        await this.handleReadyTimeout();
      }
    }, READY_CONFIRMATION_TIMEOUT_SECONDS * 1000);
  }

  private subscribeToPreGame(gameId: string): void {
    if (!isSupabaseConfigured) return;

    this.preGameChannel = supabase
      .channel(`pregame:${gameId}`)
      .on("broadcast", { event: "player_ready" }, (payload) => {
        if (!this.preGameState) return;

        const { playerId } = payload.payload;
        if (playerId === this.preGameState.whitePlayer.playerId) {
          this.preGameState.whitePlayer.isReady = true;
          this.preGameState.whitePlayer.readyAt = Date.now();
        } else if (playerId === this.preGameState.blackPlayer.playerId) {
          this.preGameState.blackPlayer.isReady = true;
          this.preGameState.blackPlayer.readyAt = Date.now();
        }

        if (playerId !== this.userId) {
          this.callbacks.onOpponentReady?.(playerId);
        }

        this.callbacks.onPreGameUpdate?.(this.preGameState);

        // Check if both ready
        if (
          this.preGameState.whitePlayer.isReady &&
          this.preGameState.blackPlayer.isReady
        ) {
          this.startGameCountdown();
        }
      })
      .subscribe();
  }

  private startGameCountdown(): void {
    if (this.countdownInterval) return;

    this.preGameState!.status = "both_ready";
    this.setStatus("starting");

    let countdown = GAME_START_COUNTDOWN_SECONDS;
    this.preGameState!.startCountdown = countdown;
    this.callbacks.onCountdown?.(countdown);

    this.countdownInterval = setInterval(async () => {
      countdown--;
      this.preGameState!.startCountdown = countdown;
      this.callbacks.onCountdown?.(countdown);

      if (countdown <= 0) {
        this.stopCountdown();
        await this.startGame();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private async startGame(): Promise<void> {
    if (!this.currentGameId) return;

    if (isSupabaseConfigured) {
      // Update game status to active
      await supabase
        .from("games")
        .update({
          status: "active",
          started_at: new Date().toISOString(),
        })
        .eq("id", this.currentGameId);
    }

    this.setStatus("in_game");
    this.callbacks.onGameStart?.(this.currentGameId);
  }

  private async handleReadyTimeout(): Promise<void> {
    if (!this.preGameState || !this.currentGameId) return;

    this.preGameState.status = "timed_out";

    // Cancel game and refund wagers
    if (isSupabaseConfigured) {
      await supabase
        .from("games")
        .update({ status: "abandoned", end_reason: "ready_timeout" })
        .eq("id", this.currentGameId);

      // Refund escrow if exists
      if (this.config?.stakeTier && this.config.stakeTier > 0) {
        // Trigger refund logic
        await supabase
          .from("game_escrows")
          .update({ status: "refunded" })
          .eq("game_id", this.currentGameId);
      }
    }

    this.cleanup();
    this.setStatus("expired");
  }

  private startPolling(): void {
    this.stopPolling();

    this.pollIntervalId = setInterval(async () => {
      // Try to find match
      const result = await this.findMatch();
      if (result.matched) return;

      // Check if matched by someone else
      const checkResult = await this.checkIfMatched();
      if (checkResult.matched) return;

      // Update stats
      await this.getQueueStats();

      // Check expiration
      if (this.getSearchDuration() >= QUEUE_TIMEOUT_SECONDS) {
        await this.handleExpiration();
      }

      // Expand ELO range
      await this.expandEloRange();
    }, POLL_INTERVAL_MS);
  }

  private startDemoPolling(): void {
    // Demo mode - simulate finding match after random time
    const matchDelay = Math.random() * 8000 + 2000; // 2-10 seconds

    this.pollIntervalId = setTimeout(async () => {
      // Simulate match found
      const demoResult: MatchFoundResult = {
        matched: true,
        gameId: `demo_${Date.now()}`,
        opponentId: `demo_opponent_${Date.now()}`,
        playerColor: Math.random() < 0.5 ? "w" : "b",
        opponent: {
          id: `demo_opponent_${Date.now()}`,
          username: "ChessMaster42",
          avatarIndex: Math.floor(Math.random() * 10),
          eloRating: (this.config?.userElo || 1200) + (Math.random() * 200 - 100),
        },
        stakeTct: this.config?.stakeTier,
        timeControl: this.config?.timeControl,
      };

      this.currentGameId = demoResult.gameId!;
      this.setStatus("match_found");
      this.callbacks.onMatchFound?.(demoResult);

      // Setup demo pre-game
      this.preGameState = {
        gameId: demoResult.gameId!,
        whitePlayer: {
          playerId: demoResult.playerColor === "w" ? this.userId : demoResult.opponentId!,
          username: demoResult.playerColor === "w" ? "You" : demoResult.opponent!.username,
          avatarIndex: demoResult.playerColor === "w" ? 0 : demoResult.opponent!.avatarIndex,
          eloRating: demoResult.playerColor === "w" ? (this.config?.userElo || 1200) : demoResult.opponent!.eloRating,
          isReady: false,
          color: "w",
        },
        blackPlayer: {
          playerId: demoResult.playerColor === "b" ? this.userId : demoResult.opponentId!,
          username: demoResult.playerColor === "b" ? "You" : demoResult.opponent!.username,
          avatarIndex: demoResult.playerColor === "b" ? 0 : demoResult.opponent!.avatarIndex,
          eloRating: demoResult.playerColor === "b" ? (this.config?.userElo || 1200) : demoResult.opponent!.eloRating,
          isReady: false,
          color: "b",
        },
        status: "waiting",
        createdAt: Date.now(),
        expiresAt: Date.now() + READY_CONFIRMATION_TIMEOUT_SECONDS * 1000,
      };

      this.setStatus("waiting_ready");
      this.callbacks.onPreGameUpdate?.(this.preGameState);

      // Simulate opponent becoming ready after 1-3 seconds
      setTimeout(() => {
        if (this.preGameState) {
          const opponentColor = demoResult.playerColor === "w" ? "blackPlayer" : "whitePlayer";
          this.preGameState[opponentColor].isReady = true;
          this.preGameState[opponentColor].readyAt = Date.now();
          this.callbacks.onOpponentReady?.(this.preGameState[opponentColor].playerId);
          this.callbacks.onPreGameUpdate?.(this.preGameState);
        }
      }, Math.random() * 2000 + 1000);
    }, matchDelay) as unknown as NodeJS.Timeout;
  }

  private stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      clearTimeout(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private async expandEloRange(): Promise<void> {
    if (!this.queueEntryId || !this.config || !isSupabaseConfigured) return;

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

    if (isSupabaseConfigured) {
      await supabase
        .from("matchmaking_queue")
        .update({ status: "expired" })
        .eq("id", this.queueEntryId);
    }

    this.stopPolling();
    this.setStatus("expired");
  }

  private subscribeToMatches(): void {
    if (!this.queueEntryId || !isSupabaseConfigured) return;

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
              this.setStatus("match_found");
              this.stopPolling();
              this.callbacks.onMatchFound?.(result);
              await this.setupPreGame(result);
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
    if (this.preGameChannel) {
      supabase.removeChannel(this.preGameChannel);
      this.preGameChannel = null;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEnhancedMatchmakingService(
  userId: string,
  callbacks?: EnhancedMatchmakingCallbacks
): EnhancedMatchmakingService {
  return new EnhancedMatchmakingService(userId, callbacks);
}

export function getQueueManager(): QueueManager {
  return QueueManager.getInstance();
}

// ============================================================================
// Utility Exports
// ============================================================================

export { STAKE_TIERS, STAKE_TIER_NAMES, TIME_CONTROLS };
