/**
 * Friend Challenge System
 *
 * Elite-level implementation featuring:
 * - Challenge friends by username
 * - Search for users by username
 * - Direct challenge invitations
 * - Real-time challenge notifications
 * - Challenge history tracking
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import {
  type FriendChallengeInput,
  type FriendChallenge,
  type FriendChallengeNotification,
  type TimeControl,
  TIME_CONTROLS,
  FRIEND_CHALLENGE_TIMEOUT_MINUTES,
} from "@/types/multiplayer";
import { generateRoomCode } from "./challenges";

// ============================================================================
// Types
// ============================================================================

export interface UserSearchResult {
  id: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
  isOnline?: boolean;
  lastSeenAt?: string;
}

export interface FriendChallengeCallbacks {
  onChallengeReceived?: (challenge: FriendChallenge) => void;
  onChallengeAccepted?: (challenge: FriendChallenge, gameId: string) => void;
  onChallengeDeclined?: (challengeId: string) => void;
  onChallengeCancelled?: (challengeId: string) => void;
  onChallengeExpired?: (challengeId: string) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// FriendChallengeService Class
// ============================================================================

export class FriendChallengeService {
  private userId: string;
  private username: string;
  private avatarIndex: number;
  private eloRating: number;
  private callbacks: FriendChallengeCallbacks;
  private channel: RealtimeChannel | null = null;
  private pendingChallenges: Map<string, FriendChallenge> = new Map();

  constructor(
    userId: string,
    username: string,
    avatarIndex: number,
    eloRating: number,
    callbacks: FriendChallengeCallbacks = {}
  ) {
    this.userId = userId;
    this.username = username;
    this.avatarIndex = avatarIndex;
    this.eloRating = eloRating;
    this.callbacks = callbacks;
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!isSupabaseConfigured) return;

    // Subscribe to incoming challenges
    this.channel = supabase
      .channel(`friend_challenges:${this.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "challenges",
          filter: `opponent_id=eq.${this.userId}`,
        },
        async (payload) => {
          await this.handleIncomingChallenge(payload.new.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `creator_id=eq.${this.userId}`,
        },
        (payload) => {
          this.handleChallengeUpdate(payload.new as any);
        }
      )
      .subscribe();

    // Load any pending challenges
    await this.loadPendingChallenges();
  }

  private async loadPendingChallenges(): Promise<void> {
    if (!isSupabaseConfigured) return;

    const { data } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("opponent_id", this.userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

    (data || []).forEach((challenge) => {
      const fc = this.mapToFriendChallenge(challenge);
      this.pendingChallenges.set(fc.id, fc);
    });
  }

  // --------------------------------------------------------------------------
  // User Search
  // --------------------------------------------------------------------------

  async searchUsers(query: string, limit: number = 10): Promise<UserSearchResult[]> {
    if (!query || query.length < 2) return [];

    if (!isSupabaseConfigured) {
      // Demo mode - return mock results
      return [
        {
          id: "demo_user_1",
          username: "ChessMaster",
          avatarIndex: 1,
          eloRating: 1450,
          isOnline: true,
        },
        {
          id: "demo_user_2",
          username: "KnightRider",
          avatarIndex: 3,
          eloRating: 1300,
          isOnline: false,
        },
      ].filter((u) =>
        u.username.toLowerCase().includes(query.toLowerCase())
      );
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_index, elo_rating, last_seen_at")
        .ilike("username", `%${query}%`)
        .neq("id", this.userId)
        .order("elo_rating", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((user) => ({
        id: user.id,
        username: user.username,
        avatarIndex: user.avatar_index,
        eloRating: user.elo_rating,
        isOnline: this.isRecentlyOnline(user.last_seen_at),
        lastSeenAt: user.last_seen_at,
      }));
    } catch (error) {
      console.error("[FriendChallenge] Search error:", error);
      return [];
    }
  }

  async findUserByUsername(username: string): Promise<UserSearchResult | null> {
    if (!username) return null;

    if (!isSupabaseConfigured) {
      // Demo mode
      return {
        id: "demo_user",
        username,
        avatarIndex: 0,
        eloRating: 1200,
        isOnline: true,
      };
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_index, elo_rating, last_seen_at")
        .eq("username", username)
        .neq("id", this.userId)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        username: data.username,
        avatarIndex: data.avatar_index,
        eloRating: data.elo_rating,
        isOnline: this.isRecentlyOnline(data.last_seen_at),
        lastSeenAt: data.last_seen_at,
      };
    } catch {
      return null;
    }
  }

  private isRecentlyOnline(lastSeenAt: string | null): boolean {
    if (!lastSeenAt) return false;
    const lastSeen = new Date(lastSeenAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return lastSeen > fiveMinutesAgo;
  }

  // --------------------------------------------------------------------------
  // Send Challenge
  // --------------------------------------------------------------------------

  async sendChallenge(input: FriendChallengeInput): Promise<FriendChallenge | null> {
    // First, find the target user
    const targetUser = await this.findUserByUsername(input.targetUsername);
    if (!targetUser) {
      this.callbacks.onError?.(new Error(`User "${input.targetUsername}" not found`));
      return null;
    }

    if (!isSupabaseConfigured) {
      // Demo mode
      const challenge: FriendChallenge = {
        id: `demo_challenge_${Date.now()}`,
        challengerId: this.userId,
        challengerUsername: this.username,
        challengerAvatarIndex: this.avatarIndex,
        challengerElo: this.eloRating,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        stakeTct: input.stakeTct,
        timeControlSeconds: input.timeControl.baseTimeSeconds,
        incrementSeconds: input.timeControl.incrementSeconds,
        colorPreference: input.colorPreference,
        isRated: input.isRated,
        message: input.message,
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + FRIEND_CHALLENGE_TIMEOUT_MINUTES * 60 * 1000
        ).toISOString(),
      };
      this.pendingChallenges.set(challenge.id, challenge);
      return challenge;
    }

    try {
      const roomCode = generateRoomCode();
      const expiresAt = new Date(
        Date.now() + FRIEND_CHALLENGE_TIMEOUT_MINUTES * 60 * 1000
      );

      // Create challenge in database
      const { data, error } = await supabase
        .from("challenges")
        .insert({
          room_code: roomCode,
          creator_id: this.userId,
          opponent_id: targetUser.id,
          wager_tct: input.stakeTct,
          time_control_seconds: input.timeControl.baseTimeSeconds,
          increment_seconds: input.timeControl.incrementSeconds,
          creator_color_preference: input.colorPreference,
          is_public: false, // Friend challenges are private
          is_rated: input.isRated,
          status: "pending",
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      const challenge: FriendChallenge = {
        id: data.id,
        challengerId: this.userId,
        challengerUsername: this.username,
        challengerAvatarIndex: this.avatarIndex,
        challengerElo: this.eloRating,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        stakeTct: input.stakeTct,
        timeControlSeconds: input.timeControl.baseTimeSeconds,
        incrementSeconds: input.timeControl.incrementSeconds,
        colorPreference: input.colorPreference,
        isRated: input.isRated,
        message: input.message,
        status: "pending",
        createdAt: data.created_at,
        expiresAt: data.expires_at,
      };

      this.pendingChallenges.set(challenge.id, challenge);
      return challenge;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error("Failed to send challenge")
      );
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Respond to Challenge
  // --------------------------------------------------------------------------

  async acceptChallenge(challengeId: string): Promise<string | null> {
    const challenge = this.pendingChallenges.get(challengeId);
    if (!challenge) {
      this.callbacks.onError?.(new Error("Challenge not found"));
      return null;
    }

    if (!isSupabaseConfigured) {
      // Demo mode
      const gameId = `game_${Date.now()}`;
      challenge.status = "accepted";
      challenge.gameId = gameId;
      this.pendingChallenges.delete(challengeId);
      return gameId;
    }

    try {
      // Determine colors
      let whitePlayerId: string;
      let blackPlayerId: string;

      switch (challenge.colorPreference) {
        case "white":
          whitePlayerId = challenge.challengerId;
          blackPlayerId = this.userId;
          break;
        case "black":
          whitePlayerId = this.userId;
          blackPlayerId = challenge.challengerId;
          break;
        default:
          // Random
          if (Math.random() < 0.5) {
            whitePlayerId = challenge.challengerId;
            blackPlayerId = this.userId;
          } else {
            whitePlayerId = this.userId;
            blackPlayerId = challenge.challengerId;
          }
      }

      // Get ELO ratings
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, elo_rating")
        .in("id", [whitePlayerId, blackPlayerId]);

      const whiteElo =
        profiles?.find((p) => p.id === whitePlayerId)?.elo_rating || 1200;
      const blackElo =
        profiles?.find((p) => p.id === blackPlayerId)?.elo_rating || 1200;

      // Create game
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          white_player_id: whitePlayerId,
          black_player_id: blackPlayerId,
          wager_tct: challenge.stakeTct,
          time_control_seconds: challenge.timeControlSeconds,
          increment_seconds: challenge.incrementSeconds,
          status: "pending",
          is_rated: challenge.isRated,
          initial_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          white_time_remaining: challenge.timeControlSeconds,
          black_time_remaining: challenge.timeControlSeconds,
          move_count: 0,
          current_turn: "w",
          white_elo_before: whiteElo,
          black_elo_before: blackElo,
        })
        .select("id")
        .single();

      if (gameError || !game) throw new Error("Failed to create game");

      // Update challenge status
      await supabase
        .from("challenges")
        .update({
          status: "accepted",
          game_id: game.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", challengeId);

      // Create escrow if wager
      if (challenge.stakeTct > 0) {
        await supabase.from("game_escrows").insert({
          game_id: game.id,
          player_white_id: whitePlayerId,
          player_white_locked_tct: challenge.stakeTct,
          player_black_id: blackPlayerId,
          player_black_locked_tct: challenge.stakeTct,
          total_pool_tct: challenge.stakeTct * 2,
          status: "active",
        });
      }

      challenge.status = "accepted";
      challenge.gameId = game.id;
      challenge.respondedAt = new Date().toISOString();
      this.pendingChallenges.delete(challengeId);

      return game.id;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error("Failed to accept challenge")
      );
      return null;
    }
  }

  async declineChallenge(challengeId: string): Promise<boolean> {
    const challenge = this.pendingChallenges.get(challengeId);
    if (!challenge) return false;

    if (!isSupabaseConfigured) {
      challenge.status = "declined";
      this.pendingChallenges.delete(challengeId);
      return true;
    }

    try {
      // Delete the challenge instead of just updating status
      await supabase
        .from("challenges")
        .delete()
        .eq("id", challengeId);

      challenge.status = "declined";
      challenge.respondedAt = new Date().toISOString();
      this.pendingChallenges.delete(challengeId);
      return true;
    } catch {
      return false;
    }
  }

  async cancelChallenge(challengeId: string): Promise<boolean> {
    const challenge = this.pendingChallenges.get(challengeId);
    if (!challenge) return false;

    // Only challenger can cancel
    if (challenge.challengerId !== this.userId) return false;

    if (!isSupabaseConfigured) {
      challenge.status = "cancelled";
      this.pendingChallenges.delete(challengeId);
      return true;
    }

    try {
      // Delete the challenge instead of just updating status
      await supabase
        .from("challenges")
        .delete()
        .eq("id", challengeId);

      challenge.status = "cancelled";
      this.pendingChallenges.delete(challengeId);
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Event Handlers
  // --------------------------------------------------------------------------

  private async handleIncomingChallenge(challengeId: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    const { data } = await supabase
      .from("challenges")
      .select(`
        *,
        creator:profiles!challenges_creator_id_fkey(id, username, avatar_index, elo_rating)
      `)
      .eq("id", challengeId)
      .single();

    if (!data) return;

    const challenge = this.mapToFriendChallenge(data);
    this.pendingChallenges.set(challenge.id, challenge);
    this.callbacks.onChallengeReceived?.(challenge);
  }

  private handleChallengeUpdate(data: any): void {
    const challengeId = data.id;

    switch (data.status) {
      case "accepted":
        if (data.game_id) {
          const challenge = this.pendingChallenges.get(challengeId);
          if (challenge) {
            challenge.status = "accepted";
            challenge.gameId = data.game_id;
            this.pendingChallenges.delete(challengeId);
            this.callbacks.onChallengeAccepted?.(challenge, data.game_id);
          }
        }
        break;
      case "declined":
        this.pendingChallenges.delete(challengeId);
        this.callbacks.onChallengeDeclined?.(challengeId);
        break;
      case "cancelled":
        this.pendingChallenges.delete(challengeId);
        this.callbacks.onChallengeCancelled?.(challengeId);
        break;
      case "expired":
        this.pendingChallenges.delete(challengeId);
        this.callbacks.onChallengeExpired?.(challengeId);
        break;
    }
  }

  private mapToFriendChallenge(data: any): FriendChallenge {
    return {
      id: data.id,
      challengerId: data.creator_id,
      challengerUsername: data.creator?.username || "Unknown",
      challengerAvatarIndex: data.creator?.avatar_index || 0,
      challengerElo: data.creator?.elo_rating || 1200,
      targetUserId: data.opponent_id,
      targetUsername: "",
      stakeTct: data.wager_tct,
      timeControlSeconds: data.time_control_seconds,
      incrementSeconds: data.increment_seconds,
      colorPreference: data.creator_color_preference,
      isRated: data.is_rated,
      status: data.status,
      gameId: data.game_id,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      respondedAt: data.accepted_at,
    };
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getReceivedChallenges(): FriendChallenge[] {
    return Array.from(this.pendingChallenges.values()).filter(
      (c) => c.targetUserId === this.userId && c.status === "pending"
    );
  }

  getSentChallenges(): FriendChallenge[] {
    return Array.from(this.pendingChallenges.values()).filter(
      (c) => c.challengerId === this.userId && c.status === "pending"
    );
  }

  getChallengeById(id: string): FriendChallenge | undefined {
    return this.pendingChallenges.get(id);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.pendingChallenges.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFriendChallengeService(
  userId: string,
  username: string,
  avatarIndex: number,
  eloRating: number,
  callbacks?: FriendChallengeCallbacks
): FriendChallengeService {
  return new FriendChallengeService(
    userId,
    username,
    avatarIndex,
    eloRating,
    callbacks
  );
}

// ============================================================================
// Utility
// ============================================================================

export function getTimeControlFromSeconds(
  baseSeconds: number,
  increment: number
): TimeControl | undefined {
  return TIME_CONTROLS.find(
    (tc) =>
      tc.baseTimeSeconds === baseSeconds && tc.incrementSeconds === increment
  );
}
