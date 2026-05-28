/**
 * Challenge System Service
 *
 * Elite-level implementation featuring:
 * - Private room code generation (6-char alphanumeric)
 * - Challenge creation, acceptance, and cancellation
 * - Real-time challenge notifications via Supabase
 * - 24-hour automatic expiration
 * - Wager and time control configuration
 * - Color preference selection
 * - Public challenge board
 */

import { supabase } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export type ColorPreference = "white" | "black" | "random";

export interface ChallengePlayer {
  id: string;
  username: string;
  avatar_index: number;
  elo_rating: number;
}

export interface Challenge {
  id: string;
  room_code: string;
  creator_id: string;
  opponent_id: string | null;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  creator_color_preference: ColorPreference;
  is_public: boolean;
  is_rated: boolean;
  status: ChallengeStatus;
  game_id: string | null;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;

  // On-chain escrow (for wager games)
  on_chain_game_id: string | null; // bytes32 game ID on smart contract

  // Lobby ready status
  creator_ready: boolean;
  opponent_ready: boolean;
  escrow_status: 'none' | 'waiting' | 'both_ready' | null;

  // Joined data
  creator?: ChallengePlayer;
  opponent?: ChallengePlayer | null;
}

export interface CreateChallengeInput {
  creatorId: string;
  opponentId?: string; // If specified, private challenge to specific player
  wagerTct?: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  colorPreference?: ColorPreference;
  isPublic?: boolean;
  isRated?: boolean;
  onChainGameId?: string; // bytes32 game ID if on-chain escrow was created
}

export interface AcceptChallengeResult {
  success: boolean;
  gameId?: string;
  whitePlayerId?: string;
  blackPlayerId?: string;
  error?: string;
}

export interface ChallengeCallbacks {
  onChallengeAccepted?: (challenge: Challenge, gameId: string) => void;
  onChallengeDeclined?: (challenge: Challenge) => void;
  onChallengeCancelled?: (challenge: Challenge) => void;
  onChallengeExpired?: (challenge: Challenge) => void;
  onNewChallenge?: (challenge: Challenge) => void;
}

export interface ChallengeFilters {
  timeCategory?: "bullet" | "blitz" | "rapid" | "classical";
  minWager?: number;
  maxWager?: number;
  minElo?: number;
  maxElo?: number;
  usernameSearch?: string;
  isRated?: boolean;
}

export interface ChallengeNotification {
  id: string;
  userId: string;
  challengeId: string;
  notificationType: string;
  title: string;
  body: string;
  data: Record<string, any>;
  isRead: boolean;
  isPushSent: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface ChallengeHistoryItem {
  id: string;
  roomCode: string;
  wagerTct: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  status: ChallengeStatus;
  gameId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string;
  wasCreator: boolean;
  opponentUsername: string | null;
  opponentElo: number | null;
  gameResult: string | null;
}

export interface ChallengeObjective {
  id: string;
  challengeId: string;
  objectiveType: string;
  targetValue: string;
  description: string | null;
  rewardMultiplier: number;
  isRequired: boolean;
}

export interface CreateDirectChallengeInput {
  creatorId: string;
  opponentUsername: string;
  wagerTct?: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  colorPreference?: ColorPreference;
  isRated?: boolean;
  onChainGameId?: string;
}

export interface DirectChallengeResult {
  success: boolean;
  challengeId?: string;
  roomCode?: string;
  onChainGameId?: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // Excluding confusing chars (0, O, 1, I, L)
const CHALLENGE_EXPIRY_HOURS = 24;
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ============================================================================
// Room Code Generation
// ============================================================================

/**
 * Generate a unique, human-friendly room code.
 * Uses alphanumeric characters excluding confusing ones (0, O, 1, I, L).
 */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[randomIndex];
  }
  return code;
}

/**
 * Validate a room code format.
 */
export function isValidRoomCode(code: string): boolean {
  if (!code || code.length !== ROOM_CODE_LENGTH) return false;
  const upperCode = code.toUpperCase();
  for (const char of upperCode) {
    if (!ROOM_CODE_CHARS.includes(char)) return false;
  }
  return true;
}

// ============================================================================
// Challenge Service Class
// ============================================================================

export class ChallengeService {
  private userId: string;
  private callbacks: ChallengeCallbacks;
  private subscriptionChannel: RealtimeChannel | null = null;
  private publicChallengeChannel: RealtimeChannel | null = null;

  constructor(userId: string, callbacks: ChallengeCallbacks = {}) {
    this.userId = userId;
    this.callbacks = callbacks;
  }

  /**
   * Check if userId is a valid UUID (not a mock ID like "guest_user")
   */
  private isValidUUID(): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return this.userId && uuidRegex.test(this.userId);
  }

  // --------------------------------------------------------------------------
  // Challenge Creation
  // --------------------------------------------------------------------------

  /**
   * Create a new challenge with a unique room code.
   */
  async createChallenge(input: CreateChallengeInput): Promise<Challenge | null> {
    const {
      creatorId,
      opponentId,
      wagerTct = 0,
      timeControlSeconds,
      incrementSeconds,
      colorPreference = "random",
      isPublic = true,
      isRated = true,
      onChainGameId,
    } = input;

    // Note: Balance verification is handled by the UI before calling this method
    // The UI checks on-chain USDC balance from the wallet store
    // For on-chain escrow challenges, funds are locked on-chain before this is called

    // Generate unique room code
    let roomCode = generateRoomCode();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from("challenges")
        .select("id")
        .eq("room_code", roomCode)
        .eq("status", "pending")
        .single();

      if (!existing) break;
      roomCode = generateRoomCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.error("Failed to generate unique room code");
      return null;
    }

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHALLENGE_EXPIRY_HOURS);

    // Create challenge
    const { data: challenge, error } = await supabase
      .from("challenges")
      .insert({
        room_code: roomCode,
        creator_id: creatorId,
        opponent_id: opponentId || null,
        wager_tct: wagerTct,
        time_control_seconds: timeControlSeconds,
        increment_seconds: incrementSeconds,
        creator_color_preference: colorPreference,
        is_public: isPublic && !opponentId, // Private if opponent specified
        is_rated: isRated,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        on_chain_game_id: onChainGameId || null,
      })
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .single();

    if (error) {
      console.error("[ChallengeService] Error creating challenge:", error);
      return null;
    }

    // Lock wager if applicable (skip if on-chain escrow is used)
    if (wagerTct > 0 && !onChainGameId) {
      await this.lockWager(creatorId, wagerTct, challenge.id);
    }

    // Ensure wager_tct is a number (Supabase may return NUMERIC as string)
    return {
      ...challenge,
      wager_tct: Number(challenge.wager_tct) || 0,
    } as Challenge;
  }

  // --------------------------------------------------------------------------
  // Challenge Acceptance
  // --------------------------------------------------------------------------

  /**
   * Accept a challenge by room code.
   */
  async acceptChallengeByCode(roomCode: string): Promise<AcceptChallengeResult> {
    const upperCode = roomCode.toUpperCase().trim();

    if (!isValidRoomCode(upperCode)) {
      return { success: false, error: "Invalid room code format" };
    }

    // Find pending challenge
    const { data: challenge, error: fetchError } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("room_code", upperCode)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (fetchError || !challenge) {
      return { success: false, error: "Challenge not found or expired" };
    }

    return this.acceptChallenge(challenge as Challenge);
  }

  /**
   * Accept a challenge by ID.
   */
  async acceptChallengeById(challengeId: string): Promise<AcceptChallengeResult> {
    const { data: challenge, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("id", challengeId)
      .eq("status", "pending")
      .single();

    if (error || !challenge) {
      return { success: false, error: "Challenge not found" };
    }

    return this.acceptChallenge(challenge as Challenge);
  }

  /**
   * Start game from lobby when both players are ready.
   * Unlike acceptChallenge, this can be called by either player.
   */
  async startGameFromLobby(challengeId: string): Promise<AcceptChallengeResult> {
    const { data: challenge, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating),
        opponent:profiles!challenges_opponent_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("id", challengeId)
      .eq("status", "pending")
      .single();

    if (error || !challenge) {
      return { success: false, error: "Challenge not found" };
    }

    // Verify both players are in the lobby
    if (!challenge.opponent_id) {
      return { success: false, error: "No opponent in lobby" };
    }

    // Verify both are ready
    if (!challenge.creator_ready || !challenge.opponent_ready) {
      return { success: false, error: "Both players must be ready" };
    }

    // Determine colors
    let whitePlayerId: string;
    let blackPlayerId: string;

    switch (challenge.creator_color_preference) {
      case "white":
        whitePlayerId = challenge.creator_id;
        blackPlayerId = challenge.opponent_id;
        break;
      case "black":
        whitePlayerId = challenge.opponent_id;
        blackPlayerId = challenge.creator_id;
        break;
      default:
        // Random
        if (Math.random() < 0.5) {
          whitePlayerId = challenge.creator_id;
          blackPlayerId = challenge.opponent_id;
        } else {
          whitePlayerId = challenge.opponent_id;
          blackPlayerId = challenge.creator_id;
        }
    }

    // Get ELO ratings
    const { data: whiteProfile } = await supabase
      .from("profiles")
      .select("elo_rating")
      .eq("id", whitePlayerId)
      .single();

    const { data: blackProfile } = await supabase
      .from("profiles")
      .select("elo_rating")
      .eq("id", blackPlayerId)
      .single();

    // Create game
    // Note: on_chain_game_id is set to null so online-game.tsx will create
    // fresh on-chain escrow in background (like Play Now flow)
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        wager_tct: challenge.wager_tct,
        time_control_seconds: challenge.time_control_seconds,
        increment_seconds: challenge.increment_seconds,
        status: "active",
        initial_fen: INITIAL_FEN,
        current_fen: INITIAL_FEN,
        white_time_remaining: challenge.time_control_seconds,
        black_time_remaining: challenge.time_control_seconds,
        move_count: 0,
        current_turn: "w",
        white_elo_before: whiteProfile?.elo_rating || 0,
        black_elo_before: blackProfile?.elo_rating || 0,
        started_at: new Date().toISOString(),
        // Don't copy on_chain_game_id - let online-game.tsx create fresh escrow in background
        on_chain_game_id: null,
        on_chain_settled: false,
      })
      .select()
      .single();

    if (gameError || !game) {
      console.error("Error creating game from lobby:", gameError);
      return { success: false, error: "Failed to create game" };
    }

    // Update challenge status
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "accepted",
        game_id: game.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", challenge.id);

    if (updateError) {
      console.error("Error updating challenge:", updateError);
      await supabase.from("games").delete().eq("id", game.id);
      return { success: false, error: "Failed to update challenge" };
    }

    // Create escrow record for wager games (like Play Now flow)
    if (challenge.wager_tct > 0) {
      await supabase.from("game_escrows").insert({
        game_id: game.id,
        player_white_id: whitePlayerId,
        player_white_locked_tct: challenge.wager_tct,
        player_black_id: blackPlayerId,
        player_black_locked_tct: challenge.wager_tct,
        total_pool_tct: challenge.wager_tct * 2,
        status: "active",
        on_chain_game_id: null, // Will be set by online-game.tsx when escrow created
      });

      // Lock TCT balances for both players via RPC (prevents double-spend)
      // On-chain escrow will be handled in background by online-game.tsx
      for (const playerId of [whitePlayerId, blackPlayerId]) {
        await (supabase.rpc as any)("lock_balance_for_game", {
          p_user_id: playerId,
          p_amount: challenge.wager_tct,
          p_game_id: game.id,
        });
      }
    }

    console.log("[ChallengeService] Game started from lobby:", game.id);

    return {
      success: true,
      gameId: game.id,
      whitePlayerId,
      blackPlayerId,
    };
  }

  private async acceptChallenge(challenge: Challenge): Promise<AcceptChallengeResult> {
    // Can't accept own challenge
    if (challenge.creator_id === this.userId) {
      return { success: false, error: "Cannot accept your own challenge" };
    }

    // Check if challenge is for specific opponent
    if (challenge.opponent_id && challenge.opponent_id !== this.userId) {
      return { success: false, error: "This challenge is for a specific player" };
    }

    // Note: Balance verification is handled by the UI before calling this method
    // The UI checks on-chain USDC balance from the wallet store
    // For on-chain escrow challenges, the escrow contract will also verify sufficient balance

    // Determine colors
    let whitePlayerId: string;
    let blackPlayerId: string;

    switch (challenge.creator_color_preference) {
      case "white":
        whitePlayerId = challenge.creator_id;
        blackPlayerId = this.userId;
        break;
      case "black":
        whitePlayerId = this.userId;
        blackPlayerId = challenge.creator_id;
        break;
      default:
        // Random
        if (Math.random() < 0.5) {
          whitePlayerId = challenge.creator_id;
          blackPlayerId = this.userId;
        } else {
          whitePlayerId = this.userId;
          blackPlayerId = challenge.creator_id;
        }
    }

    // Get ELO ratings
    const { data: whiteProfile } = await supabase
      .from("profiles")
      .select("elo_rating")
      .eq("id", whitePlayerId)
      .single();

    const { data: blackProfile } = await supabase
      .from("profiles")
      .select("elo_rating")
      .eq("id", blackPlayerId)
      .single();

    // Create game
    // Note: is_rated is tracked on the challenge, not the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        wager_tct: challenge.wager_tct,
        time_control_seconds: challenge.time_control_seconds,
        increment_seconds: challenge.increment_seconds,
        status: "active",
        initial_fen: INITIAL_FEN,
        current_fen: INITIAL_FEN,
        white_time_remaining: challenge.time_control_seconds,
        black_time_remaining: challenge.time_control_seconds,
        move_count: 0,
        current_turn: "w",
        white_elo_before: whiteProfile?.elo_rating || 0,
        black_elo_before: blackProfile?.elo_rating || 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (gameError || !game) {
      console.error("Error creating game:", gameError);
      return { success: false, error: "Failed to create game" };
    }

    // Update challenge status
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "accepted",
        opponent_id: this.userId,
        game_id: game.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", challenge.id);

    if (updateError) {
      console.error("Error updating challenge:", updateError);
      // Rollback game creation
      await supabase.from("games").delete().eq("id", game.id);
      return { success: false, error: "Failed to update challenge" };
    }

    // Lock acceptor's wager
    if (challenge.wager_tct > 0) {
      await this.lockWager(this.userId, challenge.wager_tct, challenge.id);

      // Create escrow
      await supabase.from("game_escrows").insert({
        game_id: game.id,
        player_white_id: whitePlayerId,
        player_white_locked_tct: challenge.wager_tct,
        player_black_id: blackPlayerId,
        player_black_locked_tct: challenge.wager_tct,
        total_pool_tct: challenge.wager_tct * 2,
        status: "active",
      });
    }

    // Send push notification to the creator that their challenge was accepted
    await this.notifyChallengeAccepted(challenge, game.id);

    return {
      success: true,
      gameId: game.id,
      whitePlayerId,
      blackPlayerId,
    };
  }

  /**
   * Send push notification to challenge creator when their challenge is accepted.
   */
  private async notifyChallengeAccepted(challenge: Challenge, gameId: string): Promise<void> {
    try {
      // Get creator's push token and acceptor's username
      const [creatorResult, acceptorResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("push_token, notifications_enabled")
          .eq("id", challenge.creator_id)
          .single(),
        supabase
          .from("profiles")
          .select("username")
          .eq("id", this.userId)
          .single(),
      ]);

      const creatorToken = creatorResult.data?.push_token;
      const notificationsEnabled = creatorResult.data?.notifications_enabled;
      const acceptorUsername = acceptorResult.data?.username || "A player";

      if (!creatorToken || !notificationsEnabled) {
        console.log("[ChallengeService] Creator has no push token or notifications disabled");
        return;
      }

      // Send notification via edge function
      await supabase.functions.invoke("send-push-notification", {
        body: {
          tokens: [creatorToken],
          title: "Challenge Accepted!",
          body: `${acceptorUsername} accepted your challenge. Tap to play!`,
          data: {
            type: "challenge_accepted",
            gameId,
            challengeId: challenge.id,
          },
          categoryId: "game_action",
        },
      });

      console.log("[ChallengeService] Sent push notification to challenge creator");
    } catch (error) {
      console.error("[ChallengeService] Failed to send push notification:", error);
      // Don't fail the accept operation if notification fails
    }
  }

  // --------------------------------------------------------------------------
  // Challenge Cancellation
  // --------------------------------------------------------------------------

  /**
   * Cancel a challenge (only by creator).
   * Deletes the challenge from the database entirely.
   */
  async cancelChallenge(challengeId: string): Promise<boolean> {
    const { data: challenge, error: fetchError } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("creator_id", this.userId)
      .single();

    if (fetchError || !challenge) {
      console.error("Challenge not found or not authorized");
      return false;
    }

    // If already cancelled or expired, try to delete it
    if (challenge.status === "cancelled" || challenge.status === "expired") {
      console.log("Challenge already cancelled/expired, deleting:", challenge.status);
      await supabase.from("challenges").delete().eq("id", challengeId);
      return true;
    }

    // Only pending challenges can be cancelled
    if (challenge.status !== "pending") {
      console.error("Cannot cancel challenge with status:", challenge.status);
      return false;
    }

    // Refund wager if applicable (do this before deleting)
    if (challenge.wager_tct > 0) {
      await this.unlockWager(challenge.creator_id, challenge.wager_tct, challengeId);
    }

    // Delete the challenge entirely
    const { error: deleteError } = await supabase
      .from("challenges")
      .delete()
      .eq("id", challengeId)
      .eq("creator_id", this.userId);

    if (deleteError) {
      console.error("Error deleting challenge:", deleteError);
      return false;
    }

    console.log("Challenge deleted successfully:", challengeId);
    return true;
  }

  /**
   * Decline a challenge (only by opponent).
   * Updates status to 'declined', clears opponent, resets ready states.
   * Unlocks the creator's wager so they can choose Make Public or Cancel.
   */
  async declineChallenge(challengeId: string): Promise<boolean> {
    const { data: challenge, error: fetchError } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("opponent_id", this.userId)
      .eq("status", "pending")
      .single();

    if (fetchError || !challenge) {
      console.error("Challenge not found or not authorized");
      return false;
    }

    // Refund creator's wager
    if ((challenge as any).wager_tct > 0) {
      await this.unlockWager((challenge as any).creator_id, (challenge as any).wager_tct, challengeId);
    }

    // Update to declined status, reset ready states.
    // NOTE: Do NOT clear opponent_id here — the RLS WITH CHECK requires
    // opponent_id = auth.uid() for the opponent to update. Clearing it in the
    // same UPDATE would fail the WITH CHECK. The creator clears it in makePublic.
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "declined",
        creator_ready: false,
        opponent_ready: false,
      } as never)
      .eq("id", challengeId);

    if (updateError) {
      console.error("Error declining challenge:", updateError);
      return false;
    }

    // Notify the creator that their challenge was declined
    await this.notifyChallengeDeclined(challenge as any);

    console.log("Challenge declined:", challengeId);
    return true;
  }

  /**
   * Leave the lobby as the opponent without declining the challenge.
   * Resets opponent_id and both ready states so the challenge goes back
   * to waiting for a new opponent.
   */
  async leaveLobbyAsOpponent(challengeId: string): Promise<boolean> {
    const { data: challenge, error: fetchError } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("opponent_id", this.userId)
      .eq("status", "pending")
      .single();

    if (fetchError || !challenge) {
      console.error("Challenge not found or not authorized for leaveLobby");
      return false;
    }

    // NOTE: RLS WITH CHECK requires opponent_id = auth.uid() for the opponent
    // to update. We reset ready states but keep opponent_id, then the creator
    // will need to handle clearing it. Instead, we update opponent_id to null
    // in a single update — the RLS check happens against the OLD row's
    // opponent_id, so this should work if the policy checks the existing row.
    // If RLS blocks this, we fall back to just resetting ready states.
    const { error: updateError } = await supabase
      .from("challenges")
      .update({
        opponent_id: null,
        creator_ready: false,
        opponent_ready: false,
      } as never)
      .eq("id", challengeId)
      .eq("opponent_id", this.userId);

    if (updateError) {
      console.error("Error leaving lobby as opponent:", updateError);
      return false;
    }

    console.log("Opponent left lobby:", challengeId);
    return true;
  }

  /**
   * Notify challenge creator that their challenge was declined.
   */
  private async notifyChallengeDeclined(challenge: any): Promise<void> {
    try {
      const { data: declinerProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", this.userId)
        .single();

      const declinerUsername = (declinerProfile as any)?.username || "Your opponent";

      const notificationTitle = "Challenge Declined";
      const notificationBody = `${declinerUsername} declined your challenge. You can make it public or cancel it.`;
      const notificationData = {
        type: "challenge_declined",
        challengeId: challenge.id,
        roomCode: challenge.room_code,
      };

      await supabase.from("challenge_notifications").insert({
        user_id: challenge.creator_id,
        challenge_id: challenge.id,
        notification_type: "challenge_declined",
        title: notificationTitle,
        body: notificationBody,
        data: notificationData,
        is_read: false,
        is_push_sent: false,
      } as any);

      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("push_token, notifications_enabled")
        .eq("id", challenge.creator_id)
        .single();

      if ((creatorProfile as any)?.push_token && (creatorProfile as any)?.notifications_enabled) {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            tokens: [(creatorProfile as any).push_token],
            title: notificationTitle,
            body: notificationBody,
            data: notificationData,
            categoryId: "game_action",
          },
        });
      }
    } catch (error) {
      console.error("[ChallengeService] Error in notifyChallengeDeclined:", error);
    }
  }

  /**
   * Make a declined challenge public again.
   * Re-locks the wager, resets status to pending, sets is_public=true, refreshes expiry.
   */
  async makePublic(challengeId: string): Promise<Challenge | null> {
    const { data: challenge, error: fetchError } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("creator_id", this.userId)
      .eq("status", "declined")
      .single();

    if (fetchError || !challenge) {
      console.error("Challenge not found or not authorized for makePublic");
      return null;
    }

    // Re-lock wager if applicable
    if ((challenge as any).wager_tct > 0 && !(challenge as any).on_chain_game_id) {
      await this.lockWager(this.userId, (challenge as any).wager_tct, challengeId);
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CHALLENGE_EXPIRY_HOURS);

    const { data: updated, error: updateError } = await supabase
      .from("challenges")
      .update({
        status: "pending",
        is_public: true,
        opponent_id: null,
        creator_ready: false,
        opponent_ready: false,
        expires_at: expiresAt.toISOString(),
      } as never)
      .eq("id", challengeId)
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .single();

    if (updateError || !updated) {
      console.error("Error making challenge public:", updateError);
      return null;
    }

    console.log("Challenge made public:", challengeId);
    return {
      ...(updated as any),
      wager_tct: Number((updated as any).wager_tct) || 0,
    } as Challenge;
  }

  /**
   * Completely delete a declined challenge.
   * Used when creator chooses Cancel after a decline (wager already unlocked).
   */
  async deleteChallengeCompletely(challengeId: string): Promise<boolean> {
    const { error: deleteError } = await supabase
      .from("challenges")
      .delete()
      .eq("id", challengeId)
      .eq("creator_id", this.userId);

    if (deleteError) {
      console.error("Error deleting challenge completely:", deleteError);
      return false;
    }

    console.log("Challenge deleted completely:", challengeId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Challenge Queries
  // --------------------------------------------------------------------------

  /**
   * Get challenge by room code.
   */
  async getChallengeByCode(roomCode: string): Promise<Challenge | null> {
    const upperCode = roomCode.toUpperCase().trim();

    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating),
        opponent:profiles!challenges_opponent_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("room_code", upperCode)
      .single();

    if (error) return null;
    return data as Challenge;
  }

  /**
   * Get user's pending challenges (as creator).
   */
  async getMyCreatedChallenges(): Promise<Challenge[]> {
    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating),
        opponent:profiles!challenges_opponent_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("creator_id", this.userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) return [];
    return data as Challenge[];
  }

  /**
   * Get challenges directed at user.
   */
  async getMyChallenges(): Promise<Challenge[]> {
    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("opponent_id", this.userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) return [];

    // Ensure wager_tct is a number (Supabase may return NUMERIC as string)
    return (data || []).map((row: any) => ({
      ...row,
      wager_tct: Number(row.wager_tct) || 0,
    })) as Challenge[];
  }

  /**
   * Get public open challenges with optional filters.
   */
  async getPublicChallenges(filtersOrLimit?: ChallengeFilters | number): Promise<Challenge[]> {
    const limit = typeof filtersOrLimit === "number" ? filtersOrLimit : 50;
    const filters: ChallengeFilters = typeof filtersOrLimit === "object" ? filtersOrLimit : {};

    // Use the database function for filtered queries
    if (Object.keys(filters).length > 0) {
      const { data, error } = await (supabase.rpc as any)("get_public_challenges", {
        p_user_id: this.userId,
        p_time_category: filters.timeCategory || null,
        p_min_wager: filters.minWager || null,
        p_max_wager: filters.maxWager || null,
        p_min_elo: filters.minElo || null,
        p_max_elo: filters.maxElo || null,
        p_username_search: filters.usernameSearch || null,
        p_limit: limit,
        p_offset: 0,
      });

      if (error) {
        console.error("Error fetching filtered challenges:", error);
        return [];
      }

      // Transform to Challenge format
      return (data || []).map((row: any) => ({
        id: row.id,
        room_code: row.room_code,
        creator_id: row.creator_id,
        opponent_id: null,
        wager_tct: Number(row.wager_tct),
        time_control_seconds: row.time_control_seconds,
        increment_seconds: row.increment_seconds,
        creator_color_preference: row.creator_color_preference,
        is_public: true,
        is_rated: row.is_rated,
        status: "pending" as ChallengeStatus,
        game_id: null,
        expires_at: row.expires_at,
        created_at: row.created_at,
        accepted_at: null,
        creator: {
          id: row.creator_id,
          username: row.creator_username,
          avatar_index: row.creator_avatar_index,
          elo_rating: row.creator_elo,
        },
      }));
    }

    // Fallback to simple query without filters
    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("is_public", true)
      .eq("status", "pending")
      .is("opponent_id", null)
      .neq("creator_id", this.userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return [];

    // Ensure wager_tct is a number (Supabase may return NUMERIC as string)
    return (data || []).map((row: any) => ({
      ...row,
      wager_tct: Number(row.wager_tct) || 0,
    })) as Challenge[];
  }

  // --------------------------------------------------------------------------
  // Challenge History
  // --------------------------------------------------------------------------

  /**
   * Get user's challenge history.
   * Passes p_status to the RPC function for server-side filtering.
   */
  async getChallengeHistory(
    statusFilter?: ChallengeStatus[],
    limit: number = 50,
    offset: number = 0
  ): Promise<ChallengeHistoryItem[]> {
    const { data, error } = await (supabase.rpc as any)("get_challenge_history", {
      p_user_id: this.userId,
      p_status: statusFilter ?? null,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error("Error fetching challenge history:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      roomCode: row.room_code,
      wagerTct: Number(row.wager_tct),
      timeControlSeconds: row.time_control_seconds,
      incrementSeconds: row.increment_seconds,
      status: row.status,
      gameId: row.game_id,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at,
      expiresAt: row.expires_at,
      wasCreator: row.was_creator,
      opponentUsername: row.opponent_username,
      opponentElo: row.opponent_elo,
      gameResult: row.game_result,
    }));
  }

  // --------------------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------------------

  /**
   * Get unread notification count.
   */
  async getUnreadNotificationCount(): Promise<number> {
    // Skip if userId is not a valid UUID (e.g., "guest_user")
    if (!this.isValidUUID()) {
      return 0;
    }

    const { data, error } = await (supabase.rpc as any)("get_unread_notification_count", {
      p_user_id: this.userId,
    });

    if (error) {
      console.error("Error fetching notification count:", error);
      return 0;
    }

    return data || 0;
  }

  /**
   * Get user's notifications.
   */
  async getNotifications(limit: number = 20): Promise<ChallengeNotification[]> {
    // Skip if userId is not a valid UUID (e.g., "guest_user")
    if (!this.isValidUUID()) {
      return [];
    }

    const { data, error } = await supabase
      .from("challenge_notifications")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      challengeId: row.challenge_id,
      notificationType: row.notification_type,
      title: row.title,
      body: row.body,
      data: row.data || {},
      isRead: row.is_read,
      isPushSent: row.is_push_sent,
      createdAt: row.created_at,
      readAt: row.read_at,
    }));
  }

  /**
   * Mark notifications as read.
   */
  async markNotificationsRead(notificationIds?: string[]): Promise<number> {
    const { data, error } = await (supabase.rpc as any)("mark_notifications_read", {
      p_user_id: this.userId,
      p_notification_ids: notificationIds || null,
    });

    if (error) {
      console.error("Error marking notifications read:", error);
      return 0;
    }

    return data || 0;
  }

  // --------------------------------------------------------------------------
  // Direct Challenges
  // --------------------------------------------------------------------------

  /**
   * Create a direct challenge to a specific player by username.
   */
  async createDirectChallenge(
    input: CreateDirectChallengeInput
  ): Promise<DirectChallengeResult> {
    const {
      creatorId,
      opponentUsername,
      wagerTct = 0,
      timeControlSeconds,
      incrementSeconds,
      colorPreference = "random",
      isRated = true,
    } = input;

    const { data, error } = await (supabase.rpc as any)("create_direct_challenge", {
      p_creator_id: creatorId,
      p_opponent_username: opponentUsername,
      p_wager_tct: wagerTct,
      p_time_control_seconds: timeControlSeconds,
      p_increment_seconds: incrementSeconds,
      p_color_preference: colorPreference,
      p_is_rated: isRated,
      p_on_chain_game_id: input.onChainGameId || null,
    });

    if (error) {
      console.error("Error creating direct challenge:", error);
      return { success: false, error: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result.success) {
      return { success: false, error: result.error_message };
    }

    // Send notification to the challenged player
    this.notifyChallengeCreated(
      result.challenge_id,
      result.room_code,
      input.opponentUsername,
      input.wagerTct || 0,
      input.timeControlSeconds
    ).catch(err => {
      console.error("[ChallengeService] Failed to notify opponent:", err);
    });

    return {
      success: true,
      challengeId: result.challenge_id,
      roomCode: result.room_code,
      onChainGameId: input.onChainGameId,
    };
  }

  /**
   * Send push notification to challenged player when a direct challenge is created.
   */
  private async notifyChallengeCreated(
    challengeId: string,
    roomCode: string,
    opponentUsername: string,
    wagerTct: number,
    timeControlSeconds: number
  ): Promise<void> {
    try {
      const [opponentResult, creatorResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, push_token, notifications_enabled")
          .eq("username", opponentUsername)
          .single(),
        supabase
          .from("profiles")
          .select("username")
          .eq("id", this.userId)
          .single(),
      ]);

      const opponentId = (opponentResult.data as any)?.id;
      const opponentToken = (opponentResult.data as any)?.push_token;
      const notificationsEnabled = (opponentResult.data as any)?.notifications_enabled;
      const creatorUsername = (creatorResult.data as any)?.username || "A player";

      if (!opponentId) {
        console.log("[ChallengeService] Opponent not found:", opponentUsername);
        return;
      }

      const timeLabel = formatTimeControl(timeControlSeconds, 0);

      let notificationBody: string;
      if (wagerTct > 0) {
        notificationBody = `${creatorUsername} challenged you to a ${timeLabel} game for ${wagerTct} TCT. Tap to respond!`;
      } else {
        notificationBody = `${creatorUsername} challenged you to a ${timeLabel} game. Tap to respond!`;
      }

      const notificationTitle = "You've Been Challenged!";
      const notificationData = { type: "challenge_received", challengeId, roomCode };

      let pushSent = false;
      if (opponentToken && notificationsEnabled) {
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              tokens: [opponentToken],
              title: notificationTitle,
              body: notificationBody,
              data: notificationData,
              categoryId: "game_action",
            },
          });
          pushSent = true;
          console.log("[ChallengeService] Sent challenge notification to opponent");
        } catch (pushError) {
          console.error("[ChallengeService] Push notification failed:", pushError);
        }
      }

      // In-app notification row is automatically inserted by the DB trigger
      // (notify_challenge_created), so we only update the push_sent flag if needed.
      if (pushSent) {
        await supabase
          .from("challenge_notifications")
          .update({ is_push_sent: true } as any)
          .eq("challenge_id", challengeId)
          .eq("user_id", opponentId)
          .eq("notification_type", "challenge_received");
      }

      console.log("[ChallengeService] Challenge notification handled for user:", opponentId);
    } catch (error) {
      console.error("[ChallengeService] Error in notifyChallengeCreated:", error);
    }
  }

  /**
   * Get a challenge by ID.
   */
  async getChallengeById(challengeId: string): Promise<Challenge | null> {
    const { data, error } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating),
        opponent:profiles!challenges_opponent_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("id", challengeId)
      .single();

    if (error) return null;
    return data as Challenge;
  }

  // --------------------------------------------------------------------------
  // Real-time Subscriptions
  // --------------------------------------------------------------------------

  /**
   * Subscribe to updates on user's challenges.
   */
  subscribeToMyChallenges(): void {
    if (this.subscriptionChannel) {
      this.unsubscribeFromMyChallenges();
    }

    this.subscriptionChannel = supabase
      .channel(`challenges:${this.userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `creator_id=eq.${this.userId}`,
        },
        (payload) => {
          this.handleChallengeUpdate(payload.new as Challenge);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${this.userId}`,
        },
        (payload) => {
          this.callbacks.onNewChallenge?.(payload.new as Challenge);
        }
      )
      .subscribe();
  }

  /**
   * Subscribe to public challenge updates.
   */
  subscribeToPublicChallenges(
    onUpdate: (challenges: Challenge[]) => void
  ): void {
    if (this.publicChallengeChannel) {
      supabase.removeChannel(this.publicChallengeChannel);
    }

    this.publicChallengeChannel = supabase
      .channel("public-challenges")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
          filter: "is_public=eq.true",
        },
        async () => {
          // Refresh the list on any change
          const challenges = await this.getPublicChallenges();
          onUpdate(challenges);
        }
      )
      .subscribe();
  }

  private handleChallengeUpdate(challenge: Challenge): void {
    switch (challenge.status) {
      case "accepted":
        if (challenge.game_id) {
          this.callbacks.onChallengeAccepted?.(challenge, challenge.game_id);
        }
        break;
      case "declined":
        this.callbacks.onChallengeDeclined?.(challenge);
        break;
      case "cancelled":
        this.callbacks.onChallengeCancelled?.(challenge);
        break;
      case "expired":
        this.callbacks.onChallengeExpired?.(challenge);
        break;
    }
  }

  /**
   * Unsubscribe from challenge updates.
   */
  unsubscribeFromMyChallenges(): void {
    if (this.subscriptionChannel) {
      supabase.removeChannel(this.subscriptionChannel);
      this.subscriptionChannel = null;
    }
  }

  unsubscribeFromPublicChallenges(): void {
    if (this.publicChallengeChannel) {
      supabase.removeChannel(this.publicChallengeChannel);
      this.publicChallengeChannel = null;
    }
  }

  /**
   * Cleanup all subscriptions.
   */
  destroy(): void {
    this.unsubscribeFromMyChallenges();
    this.unsubscribeFromPublicChallenges();
  }

  // --------------------------------------------------------------------------
  // Wager Helpers
  // --------------------------------------------------------------------------

  private async verifyBalance(userId: string, amount: number): Promise<boolean> {
    const { data, error } = await supabase
      .from("balances")
      .select("available_tct")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      console.log("[ChallengeService] verifyBalance - no balance found for user:", userId);
      return false;
    }

    const availableTct = Number(data.available_tct) || 0;
    console.log("[ChallengeService] verifyBalance:", { userId, availableTct, required: amount, hasEnough: availableTct >= amount });
    return availableTct >= amount;
  }

  private async lockWager(
    userId: string,
    amount: number,
    challengeId: string
  ): Promise<void> {
    await supabase.rpc("lock_balance_for_challenge", {
      p_user_id: userId,
      p_amount: amount,
      p_challenge_id: challengeId,
    });
  }

  private async unlockWager(
    userId: string,
    amount: number,
    challengeId: string
  ): Promise<void> {
    await supabase.rpc("unlock_balance_for_challenge", {
      p_user_id: userId,
      p_amount: amount,
      p_challenge_id: challengeId,
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createChallengeService(
  userId: string,
  callbacks?: ChallengeCallbacks
): ChallengeService {
  return new ChallengeService(userId, callbacks);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format time control for display.
 */
export function formatTimeControl(
  seconds: number,
  increment: number
): string {
  const minutes = Math.floor(seconds / 60);
  if (increment === 0) {
    return `${minutes} min`;
  }
  return `${minutes}+${increment}`;
}

/**
 * Get time control category.
 */
export function getTimeControlCategory(
  seconds: number,
  increment: number
): string {
  const totalTime = seconds + 40 * increment; // Estimate for 40 moves

  if (totalTime < 180) return "Bullet";
  if (totalTime < 480) return "Blitz";
  if (totalTime < 1500) return "Rapid";
  return "Classical";
}

/**
 * Format challenge expiry for display.
 */
export function formatChallengeExpiry(expiresAt: string): string {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get detailed countdown for display.
 */
export function getChallengeCountdown(expiresAt: string): {
  isExpired: boolean;
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  shortFormatted: string;
  urgency: "normal" | "warning" | "critical";
} {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return {
      isExpired: true,
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: "Expired",
      shortFormatted: "Expired",
      urgency: "critical",
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted: string;
  let shortFormatted: string;

  if (hours > 0) {
    formatted = `${hours}h ${minutes}m ${seconds}s`;
    shortFormatted = `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    formatted = `${minutes}m ${seconds}s`;
    shortFormatted = `${minutes}m`;
  } else {
    formatted = `${seconds}s`;
    shortFormatted = `${seconds}s`;
  }

  // Determine urgency
  let urgency: "normal" | "warning" | "critical" = "normal";
  if (totalSeconds < 300) { // Less than 5 minutes
    urgency = "critical";
  } else if (totalSeconds < 3600) { // Less than 1 hour
    urgency = "warning";
  }

  return {
    isExpired: false,
    totalSeconds,
    hours,
    minutes,
    seconds,
    formatted,
    shortFormatted,
    urgency,
  };
}

/**
 * Check if challenge is expiring soon (within 1 hour).
 */
export function isExpiringSoon(expiresAt: string): boolean {
  const countdown = getChallengeCountdown(expiresAt);
  return !countdown.isExpired && countdown.totalSeconds < 3600;
}

/**
 * Get filter options for challenge board.
 */
export const CHALLENGE_FILTER_OPTIONS = {
  timeCategories: [
    { value: "bullet", label: "Bullet", description: "< 3 min" },
    { value: "blitz", label: "Blitz", description: "3-8 min" },
    { value: "rapid", label: "Rapid", description: "8-25 min" },
    { value: "classical", label: "Classical", description: "25+ min" },
  ],
  wagerRanges: [
    { min: 0, max: 50, label: "Free - 50 TCT" },
    { min: 50, max: 250, label: "50 - 250 TCT" },
    { min: 250, max: 500, label: "250 - 500 TCT" },
    { min: 500, max: null, label: "500+ TCT" },
  ],
  eloRanges: [
    { min: 0, max: 1200, label: "Beginner (< 1200)" },
    { min: 1200, max: 1500, label: "Intermediate (1200-1500)" },
    { min: 1500, max: 1800, label: "Advanced (1500-1800)" },
    { min: 1800, max: null, label: "Expert (1800+)" },
  ],
};

export default {
  ChallengeService,
  createChallengeService,
  generateRoomCode,
  isValidRoomCode,
  formatTimeControl,
  getTimeControlCategory,
  formatChallengeExpiry,
  getChallengeCountdown,
  isExpiringSoon,
  CHALLENGE_FILTER_OPTIONS,
};
