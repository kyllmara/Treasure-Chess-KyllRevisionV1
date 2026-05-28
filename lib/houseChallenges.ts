/**
 * House Challenges Service
 *
 * Service for managing house challenges where users play against AI
 * with specific objectives to win prize multipliers.
 */

import { supabase } from "./supabase";
import type {
  HouseChallenge,
  HouseChallengeDB,
  HouseChallengeAttempt,
  HouseChallengeAttemptDB,
  CreateHouseChallengeInput,
  UpdateHouseChallengeInput,
  StartHouseChallengeResult,
  CompleteHouseChallengeResult,
  ForfeitHouseChallengeResult,
  HouseChallengeFilters,
  HouseChallengeStats,
} from "@/types/houseChallenge";

// ============================================================================
// Service Class
// ============================================================================

export class HouseChallengeService {
  private userId: string | null;

  constructor(userId?: string) {
    this.userId = userId || null;
  }

  /**
   * Get all active house challenges
   */
  async getActiveChallenges(): Promise<HouseChallenge[]> {
    try {
      // Use the database function for optimized query with user attempt count
      const { data, error } = await supabase.rpc("get_active_house_challenges", {
        p_user_id: this.userId,
      });

      if (error) {
        console.error("[HouseChallengeService] Error fetching active challenges:", error);
        // Fallback to direct query
        return this.getActiveChallengesDirect();
      }

      return (data || []).map((challenge: any) => ({
        ...challenge,
        can_attempt: this.canAttemptChallenge(challenge),
      }));
    } catch (err) {
      console.error("[HouseChallengeService] Error in getActiveChallenges:", err);
      return this.getActiveChallengesDirect();
    }
  }

  /**
   * Direct query fallback for getting active challenges
   */
  private async getActiveChallengesDirect(): Promise<HouseChallenge[]> {
    const { data, error } = await supabase
      .from("house_challenges")
      .select("*")
      .eq("is_active", true)
      .eq("status", "active")
      .order("entry_fee_tct", { ascending: true });

    if (error) {
      console.error("[HouseChallengeService] Direct query error:", error);
      return [];
    }

    return (data || []).map((challenge: HouseChallengeDB) => ({
      ...challenge,
      can_attempt: true, // Default to true without user-specific info
    }));
  }

  /**
   * Check if user can attempt a challenge
   */
  private canAttemptChallenge(challenge: HouseChallenge): boolean {
    if (challenge.max_entries_per_user === null) return true;
    const userAttempts = challenge.user_attempts || 0;
    return userAttempts < challenge.max_entries_per_user;
  }

  /**
   * Get a specific challenge by ID
   */
  async getChallengeById(challengeId: string): Promise<HouseChallenge | null> {
    const { data, error } = await supabase
      .from("house_challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (error || !data) {
      console.error("[HouseChallengeService] Error fetching challenge:", error);
      return null;
    }

    // Get user's attempt count if userId is set
    let userAttempts = 0;
    if (this.userId) {
      const { data: countData } = await supabase.rpc(
        "get_user_house_challenge_attempts",
        {
          p_user_id: this.userId,
          p_challenge_id: challengeId,
        }
      );
      userAttempts = countData || 0;
    }

    return {
      ...data,
      user_attempts: userAttempts,
      can_attempt: data.max_entries_per_user === null || userAttempts < data.max_entries_per_user,
    };
  }

  /**
   * Check if user needs to pay entry fee or has remaining attempts
   * Also checks if user is eligible to attempt at all (max entries, dates, etc.)
   */
  async checkNeedsEntryPayment(
    challengeId: string
  ): Promise<{
    needsPayment: boolean;
    remainingAttempts: number;
    currentSessionId: string | null;
    attemptsPerEntry: number;
    canAttempt: boolean;
    errorMessage: string | null;
  }> {
    if (!this.userId) {
      return { needsPayment: true, remainingAttempts: 0, currentSessionId: null, attemptsPerEntry: 1, canAttempt: false, errorMessage: "Not authenticated" };
    }

    try {
      // Get challenge details for attempts_per_entry
      const challenge = await this.getChallengeById(challengeId);
      const attemptsPerEntry = challenge?.attempts_per_entry || 1;

      const { data, error } = await supabase.rpc("check_needs_entry_payment", {
        p_user_id: this.userId,
        p_challenge_id: challengeId,
      });

      if (error) {
        console.error("[HouseChallengeService] Error checking entry payment:", error);
        return { needsPayment: true, remainingAttempts: 0, currentSessionId: null, attemptsPerEntry, canAttempt: false, errorMessage: error.message };
      }

      const result = data?.[0] || data;
      return {
        needsPayment: result?.needs_payment ?? true,
        remainingAttempts: result?.remaining_attempts ?? 0,
        currentSessionId: result?.current_session_id ?? null,
        attemptsPerEntry,
        canAttempt: result?.can_attempt ?? true,
        errorMessage: result?.error_message ?? null,
      };
    } catch (err) {
      console.error("[HouseChallengeService] Error in checkNeedsEntryPayment:", err);
      return { needsPayment: true, remainingAttempts: 0, currentSessionId: null, attemptsPerEntry: 1, canAttempt: false, errorMessage: "Failed to check eligibility" };
    }
  }

  /**
   * Start a house challenge attempt
   */
  async startChallenge(challengeId: string, entrySessionId?: string): Promise<StartHouseChallengeResult & {
    newEntrySessionId?: string;
    attemptNumber?: number;
    attemptsRemaining?: number;
  }> {
    if (!this.userId) {
      return { success: false, attempt_id: null, player_color: null, error_message: "Not authenticated" };
    }

    try {
      const { data, error } = await supabase.rpc("start_house_challenge", {
        p_user_id: this.userId,
        p_challenge_id: challengeId,
        p_entry_session_id: entrySessionId || null,
      });

      if (error) {
        console.error("[HouseChallengeService] Error starting challenge:", error);
        return { success: false, attempt_id: null, player_color: null, error_message: error.message };
      }

      // The RPC returns an array with one row
      const result = data?.[0] || data;
      return {
        success: result?.success ?? false,
        attempt_id: result?.attempt_id ?? null,
        player_color: result?.player_color ?? null,
        error_message: result?.error_message ?? null,
        newEntrySessionId: result?.new_entry_session_id ?? undefined,
        attemptNumber: result?.attempt_number ?? undefined,
        attemptsRemaining: result?.attempts_remaining ?? undefined,
      };
    } catch (err) {
      console.error("[HouseChallengeService] Error in startChallenge:", err);
      return {
        success: false,
        attempt_id: null,
        player_color: null,
        error_message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Complete a house challenge attempt
   */
  async completeChallenge(
    attemptId: string,
    objectiveMet: boolean,
    movesMade: number,
    finalFen?: string,
    pgn?: string,
    checkmatingPiece?: string,
    queenSacrificed?: boolean
  ): Promise<CompleteHouseChallengeResult> {
    try {
      const { data, error } = await supabase.rpc("complete_house_challenge", {
        p_attempt_id: attemptId,
        p_objective_met: objectiveMet,
        p_moves_made: movesMade,
        p_final_fen: finalFen || null,
        p_pgn: pgn || null,
        p_checkmating_piece: checkmatingPiece || null,
        p_queen_sacrificed: queenSacrificed || false,
      });

      if (error) {
        console.error("[HouseChallengeService] Error completing challenge:", error);
        return { success: false, won: false, payout_amount: null, error_message: error.message };
      }

      const result = data?.[0] || data;
      return {
        success: result?.success ?? false,
        won: result?.won ?? false,
        payout_amount: result?.payout_amount ?? null,
        error_message: result?.error_message ?? null,
      };
    } catch (err) {
      console.error("[HouseChallengeService] Error in completeChallenge:", err);
      return {
        success: false,
        won: false,
        payout_amount: null,
        error_message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Trigger payout processing for a winning attempt
   */
  async processWinPayout(attemptId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      console.log("[HouseChallengeService] Triggering payout for attempt:", attemptId);

      const response = await supabase.functions.invoke("process-house-payout", {
        body: { attempt_id: attemptId },
      });

      console.log("[HouseChallengeService] Payout full response:", JSON.stringify(response));

      // Check for HTTP-level error
      if (response.error) {
        // Try to get more details from the error context
        const errorContext = (response.error as any)?.context;
        let errorBody = "";
        if (errorContext?.body) {
          try {
            errorBody = await errorContext.text?.() || JSON.stringify(errorContext);
          } catch {
            errorBody = String(errorContext);
          }
        }
        console.error("[HouseChallengeService] Payout invoke error:", response.error, "Body:", errorBody);
        return { success: false, error: response.error.message + (errorBody ? ` - ${errorBody}` : "") };
      }

      const data = response.data;
      console.log("[HouseChallengeService] Payout response data:", data);

      // Check if the payout was successful
      const result = data?.results?.[0];
      if (result?.success) {
        return { success: true, txHash: result.txHash };
      } else if (data?.success === false) {
        return { success: false, error: data.error || "Payout failed" };
      } else {
        return { success: false, error: result?.error || "Payout failed" };
      }
    } catch (err) {
      console.error("[HouseChallengeService] Error processing payout:", err);
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  /**
   * Forfeit a house challenge attempt
   */
  async forfeitChallenge(attemptId: string): Promise<ForfeitHouseChallengeResult> {
    try {
      const { data, error } = await supabase.rpc("forfeit_house_challenge", {
        p_attempt_id: attemptId,
      });

      if (error) {
        console.error("[HouseChallengeService] Error forfeiting challenge:", error);
        return { success: false, error_message: error.message };
      }

      const result = data?.[0] || data;
      return {
        success: result?.success ?? false,
        error_message: result?.error_message ?? null,
      };
    } catch (err) {
      console.error("[HouseChallengeService] Error in forfeitChallenge:", err);
      return {
        success: false,
        error_message: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Get user's attempt history
   */
  async getMyAttempts(limit: number = 50): Promise<HouseChallengeAttempt[]> {
    if (!this.userId) return [];

    const { data, error } = await supabase
      .from("house_challenge_attempts")
      .select(`
        *,
        challenge:house_challenges(name, description, difficulty, objective_type, objective_value)
      `)
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[HouseChallengeService] Error fetching attempts:", error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a specific attempt by ID
   */
  async getAttemptById(attemptId: string): Promise<HouseChallengeAttempt | null> {
    const { data, error } = await supabase
      .from("house_challenge_attempts")
      .select(`
        *,
        challenge:house_challenges(name, description, difficulty, objective_type, objective_value)
      `)
      .eq("id", attemptId)
      .single();

    if (error || !data) {
      console.error("[HouseChallengeService] Error fetching attempt:", error);
      return null;
    }

    return data;
  }

  /**
   * Get current in-progress attempt for a challenge
   */
  async getCurrentAttempt(challengeId: string): Promise<HouseChallengeAttempt | null> {
    if (!this.userId) return null;

    const { data, error } = await supabase
      .from("house_challenge_attempts")
      .select("*")
      .eq("user_id", this.userId)
      .eq("challenge_id", challengeId)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[HouseChallengeService] Error fetching current attempt:", error);
      return null;
    }

    return data;
  }

  // ============================================================================
  // Admin Methods
  // ============================================================================

  /**
   * Get all challenges (admin view)
   */
  async getAllChallenges(filters?: HouseChallengeFilters): Promise<HouseChallenge[]> {
    let query = supabase
      .from("house_challenges")
      .select("*")
      .order("created_at", { ascending: false });

    if (filters?.difficulty) {
      query = query.eq("difficulty", filters.difficulty);
    }
    if (filters?.minEntryFee !== undefined) {
      query = query.gte("entry_fee_tct", filters.minEntryFee);
    }
    if (filters?.maxEntryFee !== undefined) {
      query = query.lte("entry_fee_tct", filters.maxEntryFee);
    }
    if (filters?.objectiveType) {
      query = query.eq("objective_type", filters.objectiveType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[HouseChallengeService] Error fetching all challenges:", error);
      return [];
    }

    return data || [];
  }

  /**
   * Create a new house challenge (admin only)
   */
  async createChallenge(input: CreateHouseChallengeInput): Promise<HouseChallenge | null> {
    if (!this.userId) return null;

    const { data, error } = await supabase
      .from("house_challenges")
      .insert({
        name: input.name,
        description: input.description,
        entry_fee_tct: input.entry_fee_tct,
        prize_multiplier: input.prize_multiplier ?? 2.0,
        difficulty: input.difficulty,
        ai_difficulty: input.ai_difficulty,
        time_limit_seconds: input.time_limit_seconds,
        player_color: input.player_color,
        objective_type: input.objective_type,
        objective_value: input.objective_value,
        max_entries_per_user: input.max_entries_per_user ?? null,
        max_total_entries: input.max_total_entries ?? null,
        is_active: input.is_active ?? true,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        created_by: this.userId,
      })
      .select()
      .single();

    if (error) {
      console.error("[HouseChallengeService] Error creating challenge:", error);
      return null;
    }

    return data;
  }

  /**
   * Update a house challenge (admin only)
   */
  async updateChallenge(
    challengeId: string,
    input: UpdateHouseChallengeInput
  ): Promise<HouseChallenge | null> {
    const { data, error } = await supabase
      .from("house_challenges")
      .update(input)
      .eq("id", challengeId)
      .select()
      .single();

    if (error) {
      console.error("[HouseChallengeService] Error updating challenge:", error);
      return null;
    }

    return data;
  }

  /**
   * Delete a house challenge (admin only - soft delete via status change)
   */
  async deleteChallenge(challengeId: string): Promise<boolean> {
    const { error } = await supabase
      .from("house_challenges")
      .update({ status: "archived", is_active: false })
      .eq("id", challengeId);

    if (error) {
      console.error("[HouseChallengeService] Error deleting challenge:", error);
      return false;
    }

    return true;
  }

  /**
   * Get all attempts (admin view)
   */
  async getAllAttempts(
    challengeId?: string,
    limit: number = 100
  ): Promise<HouseChallengeAttempt[]> {
    let query = supabase
      .from("house_challenge_attempts")
      .select(`
        *,
        challenge:house_challenges(name, description, difficulty),
        user:profiles(username, elo_rating)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (challengeId) {
      query = query.eq("challenge_id", challengeId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[HouseChallengeService] Error fetching all attempts:", error);
      return [];
    }

    return data || [];
  }

  /**
   * Get challenge statistics (admin)
   */
  async getChallengeStats(): Promise<HouseChallengeStats> {
    const { data: challenges, error } = await supabase
      .from("house_challenges")
      .select("is_active, status, total_attempts, total_wins, total_entry_fees_collected, total_payouts");

    if (error || !challenges) {
      console.error("[HouseChallengeService] Error fetching stats:", error);
      return {
        totalChallenges: 0,
        activeChallenges: 0,
        totalAttempts: 0,
        totalWins: 0,
        winRate: 0,
        totalFeesCollected: 0,
        totalPayouts: 0,
        netRevenue: 0,
      };
    }

    const stats = challenges.reduce(
      (acc, c) => ({
        totalChallenges: acc.totalChallenges + 1,
        activeChallenges: acc.activeChallenges + (c.is_active && c.status === "active" ? 1 : 0),
        totalAttempts: acc.totalAttempts + (c.total_attempts || 0),
        totalWins: acc.totalWins + (c.total_wins || 0),
        totalFeesCollected: acc.totalFeesCollected + (c.total_entry_fees_collected || 0),
        totalPayouts: acc.totalPayouts + (c.total_payouts || 0),
      }),
      {
        totalChallenges: 0,
        activeChallenges: 0,
        totalAttempts: 0,
        totalWins: 0,
        totalFeesCollected: 0,
        totalPayouts: 0,
      }
    );

    return {
      ...stats,
      winRate: stats.totalAttempts > 0 ? (stats.totalWins / stats.totalAttempts) * 100 : 0,
      netRevenue: stats.totalFeesCollected - stats.totalPayouts,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createHouseChallengeService(userId?: string): HouseChallengeService {
  return new HouseChallengeService(userId);
}

// ============================================================================
// Singleton Instance (for use without user context)
// ============================================================================

let _publicService: HouseChallengeService | null = null;

export function getPublicHouseChallengeService(): HouseChallengeService {
  if (!_publicService) {
    _publicService = new HouseChallengeService();
  }
  return _publicService;
}
