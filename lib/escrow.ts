/**
 * Escrow Service
 *
 * Handles all escrow and wager operations for Treasure Chess games:
 * - Balance validation before wagers
 * - Fund locking for challenges and matchmaking
 * - Escrow creation for active games
 * - Game settlement with winner payout and rake deduction
 * - Refunds for cancelled/abandoned games
 * - Vault balance queries and rake statistics
 *
 * Security: Integrated with security module for logging and validation
 */

import { supabase } from "./supabase";
import type { GameEscrow } from "@/types/supabase";

// Security module imports for audit logging and validation
import {
  logger,
  stakeAmountSchema,
  validate,
} from "./security";

// ============================================================================
// Types
// ============================================================================

export interface WagerValidationResult {
  isValid: boolean;
  availableBalance: number;
  errorMessage: string | null;
}

export interface LockFundsResult {
  success: boolean;
  error?: string;
}

export interface EscrowCreationResult {
  success: boolean;
  escrowId?: string;
  error?: string;
}

export interface SettlementResult {
  success: boolean;
  escrowId?: string;
  winnerPayout?: number;
  loserRefund?: number;
  commission?: number;
  rakeAmount?: number;
  treasuryAmount?: number;
  rewardPoolAmount?: number;
  isDraw?: boolean;
  ledgerTransactionId?: string;
  error?: string;
}

export interface EscrowStatus {
  escrowId: string;
  status: "active" | "settled" | "refunded" | "disputed";
  totalPool: number;
  commissionRate: number;
  winnerId: string | null;
  winnerPayout: number | null;
  commission: number | null;
  settledAt: string | null;
}

/** Platform rake configuration settings */
export interface RakeSettings {
  rakePercentage: number;
  treasurySplit: number;
  rewardPoolSplit: number;
  minRakeTct: number;
  rakeOnDraws: boolean;
  enabled: boolean;
}

/** Vault account balances */
export interface VaultBalances {
  treasuryBalanceTct: number;
  rewardPoolBalanceTct: number;
  totalRakeCollectedTct: number;
  totalGamesSettled: number;
  totalDrawRefundsTct: number;
}

/** Vault statistics for a period */
export interface VaultStatistic {
  statName: string;
  statValue: number;
  statUnit: string;
}

/** Admin vault dashboard data */
export interface VaultDashboard {
  balances: {
    treasury: number;
    rewardPool: number;
    total: number;
  };
  rake: {
    totalCollected: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  settings: RakeSettings;
  generatedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

export const MIN_WAGER_TCT = 25;
export const MAX_WAGER_TCT = 1000;
export const DEFAULT_RAKE_RATE = 0.05; // 5% rake
export const DEFAULT_COMMISSION_RATE = 0.05; // 5% (alias for backward compatibility)
export const TREASURY_SPLIT = 0.80; // 80% to treasury
export const REWARD_POOL_SPLIT = 0.20; // 20% to reward pool
export { TCT_TO_USD, tctToUsd, usdToTct } from "./tct";

// ============================================================================
// Wager Presets
// ============================================================================

export const WAGER_PRESETS = [0, 25, 50, 100, 250, 500] as const;
export type WagerPreset = (typeof WAGER_PRESETS)[number];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates that a user has sufficient balance for a wager.
 * Calls the database function for atomic validation.
 */
export async function validateWagerBalance(
  userId: string,
  wagerAmount: number
): Promise<WagerValidationResult> {
  try {
    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("validate_wager_balance", {
      p_user_id: userId,
      p_wager_amount: wagerAmount,
    });

    if (error) {
      logger.error("Escrow", "Error validating wager balance", { error: error.message, userId });
      return {
        isValid: false,
        availableBalance: 0,
        errorMessage: "Failed to validate balance",
      };
    }

    // The RPC returns a table, so we get the first row
    const result = Array.isArray(data) ? data[0] : data;

    return {
      isValid: result?.is_valid ?? false,
      availableBalance: result?.available_balance ?? 0,
      errorMessage: result?.error_message ?? null,
    };
  } catch (err) {
    logger.error("Escrow", "Wager validation error", { error: err instanceof Error ? err.message : String(err), userId });
    return {
      isValid: false,
      availableBalance: 0,
      errorMessage: "An unexpected error occurred",
    };
  }
}

/**
 * Simple balance check without full validation.
 */
export async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("balances")
    .select("available_tct")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    logger.error("Escrow", "Error fetching user balance", { error: error?.message, userId });
    return 0;
  }

  // Type assertion for balance data
  const balance = data as { available_tct: number };
  return Number(balance.available_tct) || 0;
}

/**
 * Check if a wager amount is valid (within min/max bounds).
 */
export function isValidWagerAmount(amount: number): boolean {
  if (amount === 0) return true; // Free play
  return amount >= MIN_WAGER_TCT && amount <= MAX_WAGER_TCT;
}

// ============================================================================
// Fund Locking Functions
// ============================================================================

/**
 * Lock funds for a challenge or matchmaking entry.
 */
export async function lockFundsForChallenge(
  userId: string,
  amount: number,
  challengeId: string
): Promise<LockFundsResult> {
  if (amount === 0) {
    return { success: true }; // No lock needed for free games
  }

  try {
    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("lock_balance_for_challenge", {
      p_user_id: userId,
      p_amount: amount,
      p_challenge_id: challengeId,
    });

    if (error) {
      logger.error("Escrow", "Error locking funds", { error: error.message, userId, amount, challengeId });
      return {
        success: false,
        error: error.message || "Failed to lock funds",
      };
    }

    logger.financialEvent("escrow_lock", "success", { userId, amount: amount.toString(), currency: "TCT" });
    return { success: true };
  } catch (err) {
    logger.error("Escrow", "Lock funds error", { error: err instanceof Error ? err.message : String(err), userId, challengeId });
    return {
      success: false,
      error: "An unexpected error occurred while locking funds",
    };
  }
}

/**
 * Unlock funds when a challenge is cancelled or declined.
 */
export async function unlockFundsForChallenge(
  userId: string,
  amount: number,
  challengeId: string
): Promise<LockFundsResult> {
  if (amount === 0) {
    return { success: true }; // No unlock needed for free games
  }

  try {
    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("unlock_balance_for_challenge", {
      p_user_id: userId,
      p_amount: amount,
      p_challenge_id: challengeId,
    });

    if (error) {
      logger.error("Escrow", "Error unlocking funds", { error: error.message, userId, amount, challengeId });
      return {
        success: false,
        error: error.message || "Failed to unlock funds",
      };
    }

    logger.financialEvent("escrow_release", "success", { userId, amount: amount.toString(), currency: "TCT" });
    return { success: true };
  } catch (err) {
    logger.error("Escrow", "Unlock funds error", { error: err instanceof Error ? err.message : String(err), userId, challengeId });
    return {
      success: false,
      error: "An unexpected error occurred while unlocking funds",
    };
  }
}

// ============================================================================
// Escrow Creation
// ============================================================================

/**
 * Create an escrow for an active game.
 * Called when a challenge is accepted or matchmaking finds a match.
 */
export async function createGameEscrow(
  gameId: string,
  whitePlayerId: string,
  whiteWager: number,
  blackPlayerId: string,
  blackWager: number,
  commissionRate: number = DEFAULT_COMMISSION_RATE
): Promise<EscrowCreationResult> {
  if (whiteWager === 0 && blackWager === 0) {
    // No escrow needed for free games
    return { success: true };
  }

  try {
    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("create_game_escrow", {
      p_game_id: gameId,
      p_white_player_id: whitePlayerId,
      p_white_wager: whiteWager,
      p_black_player_id: blackPlayerId,
      p_black_wager: blackWager,
      p_commission_rate: commissionRate,
    });

    if (error) {
      logger.error("Escrow", "Error creating escrow", { error: error.message, gameId, whitePlayerId, blackPlayerId });
      return {
        success: false,
        error: error.message || "Failed to create escrow",
      };
    }

    logger.financialEvent("escrow_lock", "success", {
      gameId,
      userId: whitePlayerId,
      amount: (whiteWager + blackWager).toString(),
      currency: "TCT",
    });

    return {
      success: true,
      escrowId: data,
    };
  } catch (err) {
    logger.error("Escrow", "Create escrow error", { error: err instanceof Error ? err.message : String(err), gameId });
    return {
      success: false,
      error: "An unexpected error occurred while creating escrow",
    };
  }
}

// ============================================================================
// Game Settlement
// ============================================================================

/**
 * Settle an escrow when a game ends.
 * Handles win/loss payouts, draws, and rake deduction.
 * - Winners receive full pot minus 5% rake
 * - Draws return 100% of stakes (no rake)
 * - Rake is split 80% treasury, 20% reward pool
 */
export async function settleGameEscrow(
  gameId: string,
  winnerId: string | null, // null for draw
  reason: string = "checkmate"
): Promise<SettlementResult> {
  try {
    // First check if there's an escrow for this game
    const { data: escrowData } = await supabase
      .from("game_escrows")
      .select("id, status, total_pool_tct")
      .eq("game_id", gameId)
      .single();

    // Type assertion for escrow data
    const escrowExists = escrowData as { id: string; status: string; total_pool_tct: number } | null;

    if (!escrowExists) {
      // No escrow = free game, nothing to settle
      return { success: true, isDraw: winnerId === null };
    }

    if (escrowExists.status !== "active") {
      return {
        success: false,
        error: `Escrow already ${escrowExists.status}`,
      };
    }

    // Use the new settle_escrow_with_rake function for full rake handling
    // Falls back to settle_escrow for backward compatibility
    const { data, error } = await (supabase.rpc as any)("settle_escrow_with_rake", {
      p_game_id: gameId,
      p_winner_id: winnerId,
      p_reason: reason,
    });

    if (error) {
      // Fall back to original settle_escrow if new function not available
      const { data: fallbackData, error: fallbackError } = await (supabase.rpc as any)("settle_escrow", {
        p_game_id: gameId,
        p_winner_id: winnerId,
        p_reason: reason,
      });

      if (fallbackError) {
        logger.error("Escrow", "Error settling escrow", { error: fallbackError.message, gameId, winnerId });
        return {
          success: false,
          error: fallbackError.message || "Failed to settle escrow",
        };
      }

      const fallbackResult = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData;
      return {
        success: true,
        escrowId: fallbackResult?.escrow_id,
        winnerPayout: fallbackResult?.winner_payout ? Number(fallbackResult.winner_payout) : 0,
        loserRefund: fallbackResult?.loser_refund ? Number(fallbackResult.loser_refund) : 0,
        commission: fallbackResult?.commission ? Number(fallbackResult.commission) : 0,
        rakeAmount: fallbackResult?.commission ? Number(fallbackResult.commission) : 0,
        isDraw: fallbackResult?.is_draw ?? false,
      };
    }

    // The RPC returns a table, so we get the first row
    const result = Array.isArray(data) ? data[0] : data;

    return {
      success: true,
      escrowId: result?.escrow_id,
      winnerPayout: result?.winner_payout ? Number(result.winner_payout) : 0,
      loserRefund: result?.loser_refund ? Number(result.loser_refund) : 0,
      commission: result?.rake_amount ? Number(result.rake_amount) : 0,
      rakeAmount: result?.rake_amount ? Number(result.rake_amount) : 0,
      treasuryAmount: result?.treasury_amount ? Number(result.treasury_amount) : 0,
      rewardPoolAmount: result?.reward_pool_amount ? Number(result.reward_pool_amount) : 0,
      isDraw: result?.is_draw ?? false,
      ledgerTransactionId: result?.ledger_transaction_id,
    };
  } catch (err) {
    logger.error("Escrow", "Settle escrow error", { error: err instanceof Error ? err.message : String(err), gameId, winnerId });
    return {
      success: false,
      error: "An unexpected error occurred during settlement",
    };
  }
}

/**
 * Refund an escrow for cancelled/abandoned games.
 */
export async function refundGameEscrow(
  gameId: string,
  reason: string = "game_cancelled"
): Promise<LockFundsResult> {
  try {
    // Check if escrow exists first
    const { data: escrowData } = await supabase
      .from("game_escrows")
      .select("id, status")
      .eq("game_id", gameId)
      .single();

    // Type assertion for escrow data
    const escrowExists = escrowData as { id: string; status: string } | null;

    if (!escrowExists) {
      // No escrow = free game
      return { success: true };
    }

    if (escrowExists.status !== "active") {
      return {
        success: false,
        error: `Escrow already ${escrowExists.status}`,
      };
    }

    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("refund_escrow", {
      p_game_id: gameId,
      p_reason: reason,
    });

    if (error) {
      logger.error("Escrow", "Error refunding escrow", { error: error.message, gameId, reason });
      return {
        success: false,
        error: error.message || "Failed to refund escrow",
      };
    }

    logger.financialEvent("escrow_release", "success", { gameId, reason });
    return { success: true };
  } catch (err) {
    logger.error("Escrow", "Refund escrow error", { error: err instanceof Error ? err.message : String(err), gameId, reason });
    return {
      success: false,
      error: "An unexpected error occurred during refund",
    };
  }
}

// ============================================================================
// Escrow Status
// ============================================================================

/**
 * Get the current status of an escrow.
 */
export async function getEscrowStatus(
  gameId: string
): Promise<EscrowStatus | null> {
  try {
    // Type assertion needed because RPC functions aren't in generated types
    const { data, error } = await (supabase.rpc as any)("get_escrow_status", {
      p_game_id: gameId,
    });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      escrowId: result.escrow_id,
      status: result.status,
      totalPool: Number(result.total_pool),
      commissionRate: Number(result.commission_rate),
      winnerId: result.winner_id,
      winnerPayout: result.winner_payout ? Number(result.winner_payout) : null,
      commission: result.commission ? Number(result.commission) : null,
      settledAt: result.settled_at,
    };
  } catch (err) {
    logger.error("Escrow", "Get escrow status error", { error: err instanceof Error ? err.message : String(err), gameId });
    return null;
  }
}

/**
 * Get escrow details for a game directly from the table.
 */
export async function getGameEscrow(gameId: string): Promise<GameEscrow | null> {
  const { data, error } = await supabase
    .from("game_escrows")
    .select("*")
    .eq("game_id", gameId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate potential winnings for a wager amount.
 * Uses 5% rake by default.
 */
export function calculatePotentialWinnings(
  wagerAmount: number,
  rakeRate: number = DEFAULT_RAKE_RATE
): number {
  if (wagerAmount === 0) return 0;
  const totalPool = wagerAmount * 2;
  const rake = totalPool * rakeRate;
  return totalPool - rake;
}

/**
 * Calculate rake breakdown for a given pot amount.
 */
export function calculateRakeBreakdown(
  totalPot: number,
  rakeRate: number = DEFAULT_RAKE_RATE
): {
  rakeAmount: number;
  treasuryAmount: number;
  rewardPoolAmount: number;
  winnerPayout: number;
} {
  const rakeAmount = totalPot * rakeRate;
  const treasuryAmount = rakeAmount * TREASURY_SPLIT;
  const rewardPoolAmount = rakeAmount * REWARD_POOL_SPLIT;
  const winnerPayout = totalPot - rakeAmount;

  return {
    rakeAmount: Math.round(rakeAmount * 100) / 100,
    treasuryAmount: Math.round(treasuryAmount * 100) / 100,
    rewardPoolAmount: Math.round(rewardPoolAmount * 100) / 100,
    winnerPayout: Math.round(winnerPayout * 100) / 100,
  };
}

/**
 * Format TCT amount for display.
 */
export function formatTct(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format USD amount for display.
 */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ============================================================================
// Vault & Rake Query Functions
// ============================================================================

/**
 * Get current rake settings from the platform.
 */
export async function getRakeSettings(): Promise<RakeSettings> {
  try {
    const { data, error } = await (supabase.rpc as any)("get_rake_settings");

    if (error) {
      logger.warn("Escrow", "Error fetching rake settings, using defaults", { error: error.message });
      // Return defaults if unable to fetch
      return {
        rakePercentage: DEFAULT_RAKE_RATE,
        treasurySplit: TREASURY_SPLIT,
        rewardPoolSplit: REWARD_POOL_SPLIT,
        minRakeTct: 0.01,
        rakeOnDraws: false,
        enabled: true,
      };
    }

    return {
      rakePercentage: data?.rake_percentage ?? DEFAULT_RAKE_RATE,
      treasurySplit: data?.treasury_split ?? TREASURY_SPLIT,
      rewardPoolSplit: data?.reward_pool_split ?? REWARD_POOL_SPLIT,
      minRakeTct: data?.min_rake_tct ?? 0.01,
      rakeOnDraws: data?.rake_on_draws ?? false,
      enabled: data?.enabled ?? true,
    };
  } catch (err) {
    logger.error("Escrow", "Get rake settings error", { error: err instanceof Error ? err.message : String(err) });
    return {
      rakePercentage: DEFAULT_RAKE_RATE,
      treasurySplit: TREASURY_SPLIT,
      rewardPoolSplit: REWARD_POOL_SPLIT,
      minRakeTct: 0.01,
      rakeOnDraws: false,
      enabled: true,
    };
  }
}

/**
 * Get current vault balances.
 */
export async function getVaultBalances(): Promise<VaultBalances | null> {
  try {
    const { data, error } = await (supabase.rpc as any)("get_vault_balances");

    if (error) {
      logger.error("Escrow", "Error fetching vault balances", { error: error.message });
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      treasuryBalanceTct: Number(result?.treasury_balance_tct ?? 0),
      rewardPoolBalanceTct: Number(result?.reward_pool_balance_tct ?? 0),
      totalRakeCollectedTct: Number(result?.total_rake_collected_tct ?? 0),
      totalGamesSettled: Number(result?.total_games_settled ?? 0),
      totalDrawRefundsTct: Number(result?.total_draw_refunds_tct ?? 0),
    };
  } catch (err) {
    logger.error("Escrow", "Get vault balances error", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Get vault statistics for a date range.
 */
export async function getVaultStatistics(
  startDate?: string,
  endDate?: string
): Promise<VaultStatistic[]> {
  try {
    const { data, error } = await (supabase.rpc as any)("get_vault_statistics", {
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    });

    if (error) {
      logger.error("Escrow", "Error fetching vault statistics", { error: error.message });
      return [];
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((row: any) => ({
      statName: row.stat_name,
      statValue: Number(row.stat_value),
      statUnit: row.stat_unit,
    }));
  } catch (err) {
    logger.error("Escrow", "Get vault statistics error", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Get vault account balance by name.
 */
export async function getVaultAccountBalance(
  accountName: "platform_treasury" | "player_reward_pool"
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("vault_accounts")
      .select("balance_tct")
      .eq("account_name", accountName)
      .single();

    if (error) {
      logger.error("Escrow", "Error fetching vault account balance", { error: error.message, accountName });
      return 0;
    }

    return Number((data as any)?.balance_tct ?? 0);
  } catch (err) {
    logger.error("Escrow", "Get vault account balance error", { error: err instanceof Error ? err.message : String(err), accountName });
    return 0;
  }
}

/**
 * Get the treasury balance.
 */
export async function getTreasuryBalance(): Promise<number> {
  return getVaultAccountBalance("platform_treasury");
}

/**
 * Get the reward pool balance.
 */
export async function getRewardPoolBalance(): Promise<number> {
  return getVaultAccountBalance("player_reward_pool");
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Validation
  validateWagerBalance,
  getUserBalance,
  isValidWagerAmount,

  // Fund locking
  lockFundsForChallenge,
  unlockFundsForChallenge,

  // Escrow operations
  createGameEscrow,
  settleGameEscrow,
  refundGameEscrow,
  getEscrowStatus,
  getGameEscrow,

  // Vault & Rake operations
  getRakeSettings,
  getVaultBalances,
  getVaultStatistics,
  getVaultAccountBalance,
  getTreasuryBalance,
  getRewardPoolBalance,

  // Utilities
  calculatePotentialWinnings,
  calculateRakeBreakdown,
  tctToUsd,
  usdToTct,
  formatTct,
  formatUsd,

  // Constants
  MIN_WAGER_TCT,
  MAX_WAGER_TCT,
  DEFAULT_RAKE_RATE,
  DEFAULT_COMMISSION_RATE,
  TREASURY_SPLIT,
  REWARD_POOL_SPLIT,
  TCT_TO_USD,
  WAGER_PRESETS,
};
