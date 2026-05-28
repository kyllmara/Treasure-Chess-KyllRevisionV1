/**
 * Atomic Escrow Operations
 *
 * Ensures no partial states in escrow operations.
 * All escrow changes are atomic database transactions.
 *
 * @module lib/security/escrow
 */

import { supabase, isSupabaseConfigured } from "../supabase";
import { logger } from "./logger";
import { ledger, PLATFORM_FEE_RATE } from "./ledger";

// ============================================================================
// Types
// ============================================================================

export interface EscrowState {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  whiteLockedAmount: number;
  blackLockedAmount: number;
  totalPool: number;
  status: EscrowStatus;
  createdAt: string;
  lockedAt?: string;
  releasedAt?: string;
  cancelledAt?: string;
}

export type EscrowStatus =
  | "pending"      // Waiting for both players to lock funds
  | "partial"     // One player has locked, waiting for other
  | "locked"      // Both players have locked funds
  | "released"    // Funds distributed to winner
  | "refunded"    // Funds returned (draw or cancellation)
  | "disputed"    // Under review
  | "failed";     // Transaction failed

export interface EscrowResult {
  success: boolean;
  escrow?: EscrowState;
  error?: string;
  transactionId?: string;
}

export interface GameOutcome {
  gameId: string;
  winnerId: string | null; // null for draw
  loserId: string | null;  // null for draw
  isDraw: boolean;
  isTimeout: boolean;
  isResignation: boolean;
  isCheckmate: boolean;
  isDisconnect: boolean;
}

// ============================================================================
// Escrow Service
// ============================================================================

export class EscrowService {
  private activeEscrows: Map<string, EscrowState> = new Map();
  private operationLocks: Map<string, boolean> = new Map();

  /**
   * Acquire operation lock for a game
   */
  private async acquireLock(gameId: string): Promise<boolean> {
    if (this.operationLocks.get(gameId)) {
      return false;
    }
    this.operationLocks.set(gameId, true);
    return true;
  }

  /**
   * Release operation lock
   */
  private releaseLock(gameId: string): void {
    this.operationLocks.delete(gameId);
  }

  /**
   * Execute with lock protection
   */
  private async withLock<T>(
    gameId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const acquired = await this.acquireLock(gameId);
    if (!acquired) {
      throw new Error("Escrow operation already in progress for this game");
    }

    try {
      return await operation();
    } finally {
      this.releaseLock(gameId);
    }
  }

  // --------------------------------------------------------------------------
  // Escrow Creation
  // --------------------------------------------------------------------------

  /**
   * Create escrow for a new game (atomic operation)
   */
  async createEscrow(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string,
    stakeAmount: number
  ): Promise<EscrowResult> {
    return this.withLock(gameId, async () => {
      const now = new Date().toISOString();

      const escrow: EscrowState = {
        gameId,
        whitePlayerId,
        blackPlayerId,
        whiteLockedAmount: 0,
        blackLockedAmount: 0,
        totalPool: 0,
        status: "pending",
        createdAt: now,
      };

      if (!isSupabaseConfigured) {
        // Demo mode
        this.activeEscrows.set(gameId, escrow);
        logger.audit("create_escrow", "escrow", "success", {
          resourceId: gameId,
          data: { whitePlayerId, blackPlayerId, stakeAmount },
        });
        return { success: true, escrow };
      }

      try {
        // Use database transaction for atomicity
        const { data, error } = await supabase.rpc("create_game_escrow", {
          p_game_id: gameId,
          p_white_player_id: whitePlayerId,
          p_black_player_id: blackPlayerId,
          p_stake_amount: stakeAmount,
        });

        if (error) throw error;

        escrow.status = "pending";
        this.activeEscrows.set(gameId, escrow);

        logger.audit("create_escrow", "escrow", "success", {
          resourceId: gameId,
          data: { whitePlayerId, blackPlayerId, stakeAmount },
        });

        return { success: true, escrow, transactionId: data?.transaction_id };
      } catch (error) {
        logger.error("Escrow", "Failed to create escrow", error as Error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create escrow",
        };
      }
    });
  }

  // --------------------------------------------------------------------------
  // Fund Locking
  // --------------------------------------------------------------------------

  /**
   * Lock player's funds in escrow (atomic operation)
   */
  async lockFunds(
    gameId: string,
    playerId: string,
    amount: number
  ): Promise<EscrowResult> {
    return this.withLock(gameId, async () => {
      const escrow = this.activeEscrows.get(gameId);

      if (!escrow) {
        return { success: false, error: "Escrow not found" };
      }

      if (escrow.status !== "pending" && escrow.status !== "partial") {
        return { success: false, error: `Cannot lock funds in ${escrow.status} state` };
      }

      const isWhitePlayer = playerId === escrow.whitePlayerId;
      const isBlackPlayer = playerId === escrow.blackPlayerId;

      if (!isWhitePlayer && !isBlackPlayer) {
        return { success: false, error: "Player not part of this game" };
      }

      // Check if already locked
      if (isWhitePlayer && escrow.whiteLockedAmount > 0) {
        return { success: false, error: "White player already locked funds" };
      }
      if (isBlackPlayer && escrow.blackLockedAmount > 0) {
        return { success: false, error: "Black player already locked funds" };
      }

      if (!isSupabaseConfigured) {
        // Demo mode - simulate balance check
        if (isWhitePlayer) {
          escrow.whiteLockedAmount = amount;
        } else {
          escrow.blackLockedAmount = amount;
        }

        // Check if both players have locked
        if (escrow.whiteLockedAmount > 0 && escrow.blackLockedAmount > 0) {
          escrow.status = "locked";
          escrow.lockedAt = new Date().toISOString();
          escrow.totalPool = escrow.whiteLockedAmount + escrow.blackLockedAmount;
        } else {
          escrow.status = "partial";
        }

        // Record in ledger
        await ledger.lockEscrow(playerId, gameId, amount);

        logger.audit("lock_funds", "escrow", "success", {
          resourceId: gameId,
          data: { playerId, amount, newStatus: escrow.status },
        });

        return { success: true, escrow };
      }

      try {
        // Atomic database operation
        const { data, error } = await supabase.rpc("lock_escrow_funds", {
          p_game_id: gameId,
          p_player_id: playerId,
          p_amount: amount,
        });

        if (error) {
          // Check for insufficient funds
          if (error.message.includes("insufficient")) {
            logger.audit("lock_funds", "escrow", "failure", {
              resourceId: gameId,
              failureReason: "Insufficient funds",
              data: { playerId, amount },
            });
            return { success: false, error: "Insufficient funds" };
          }
          throw error;
        }

        // Update local state
        if (isWhitePlayer) {
          escrow.whiteLockedAmount = amount;
        } else {
          escrow.blackLockedAmount = amount;
        }

        escrow.status = data.new_status;
        if (escrow.status === "locked") {
          escrow.lockedAt = new Date().toISOString();
          escrow.totalPool = escrow.whiteLockedAmount + escrow.blackLockedAmount;
        }

        // Record in ledger
        await ledger.lockEscrow(playerId, gameId, amount);

        logger.audit("lock_funds", "escrow", "success", {
          resourceId: gameId,
          data: { playerId, amount, newStatus: escrow.status },
        });

        return { success: true, escrow, transactionId: data.transaction_id };
      } catch (error) {
        logger.error("Escrow", "Failed to lock funds", error as Error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to lock funds",
        };
      }
    });
  }

  /**
   * Lock both players' funds atomically (for instant games)
   */
  async lockBothPlayers(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string,
    stakeAmount: number
  ): Promise<EscrowResult> {
    return this.withLock(gameId, async () => {
      if (!isSupabaseConfigured) {
        // Demo mode
        const escrow: EscrowState = {
          gameId,
          whitePlayerId,
          blackPlayerId,
          whiteLockedAmount: stakeAmount,
          blackLockedAmount: stakeAmount,
          totalPool: stakeAmount * 2,
          status: "locked",
          createdAt: new Date().toISOString(),
          lockedAt: new Date().toISOString(),
        };

        this.activeEscrows.set(gameId, escrow);

        // Record in ledger for both players
        await ledger.lockEscrow(whitePlayerId, gameId, stakeAmount);
        await ledger.lockEscrow(blackPlayerId, gameId, stakeAmount);

        logger.audit("lock_both_players", "escrow", "success", {
          resourceId: gameId,
          data: { whitePlayerId, blackPlayerId, stakeAmount },
        });

        return { success: true, escrow };
      }

      try {
        // Single atomic transaction for both players
        const { data, error } = await supabase.rpc("lock_escrow_both_players", {
          p_game_id: gameId,
          p_white_player_id: whitePlayerId,
          p_black_player_id: blackPlayerId,
          p_stake_amount: stakeAmount,
        });

        if (error) {
          if (error.message.includes("insufficient")) {
            const insufficientPlayer = error.message.includes("white")
              ? "white"
              : error.message.includes("black")
              ? "black"
              : "unknown";

            logger.audit("lock_both_players", "escrow", "failure", {
              resourceId: gameId,
              failureReason: `Insufficient funds for ${insufficientPlayer} player`,
              data: { whitePlayerId, blackPlayerId, stakeAmount },
            });

            return {
              success: false,
              error: `Insufficient funds for ${insufficientPlayer} player`,
            };
          }
          throw error;
        }

        const escrow: EscrowState = {
          gameId,
          whitePlayerId,
          blackPlayerId,
          whiteLockedAmount: stakeAmount,
          blackLockedAmount: stakeAmount,
          totalPool: stakeAmount * 2,
          status: "locked",
          createdAt: data.created_at,
          lockedAt: new Date().toISOString(),
        };

        this.activeEscrows.set(gameId, escrow);

        // Record in ledger for both players
        await ledger.lockEscrow(whitePlayerId, gameId, stakeAmount);
        await ledger.lockEscrow(blackPlayerId, gameId, stakeAmount);

        logger.audit("lock_both_players", "escrow", "success", {
          resourceId: gameId,
          data: { whitePlayerId, blackPlayerId, stakeAmount },
        });

        return { success: true, escrow, transactionId: data.transaction_id };
      } catch (error) {
        logger.error("Escrow", "Failed to lock both players", error as Error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to lock funds",
        };
      }
    });
  }

  // --------------------------------------------------------------------------
  // Fund Release
  // --------------------------------------------------------------------------

  /**
   * Release escrow funds after game completion (atomic operation)
   */
  async releaseFunds(outcome: GameOutcome): Promise<EscrowResult> {
    return this.withLock(outcome.gameId, async () => {
      const escrow = this.activeEscrows.get(outcome.gameId);

      if (!escrow) {
        return { success: false, error: "Escrow not found" };
      }

      if (escrow.status !== "locked") {
        return { success: false, error: `Cannot release funds in ${escrow.status} state` };
      }

      const stakeAmount = escrow.whiteLockedAmount; // Assuming equal stakes

      if (!isSupabaseConfigured) {
        // Demo mode
        escrow.status = outcome.isDraw ? "refunded" : "released";
        escrow.releasedAt = new Date().toISOString();

        // Record in ledger
        if (outcome.isDraw) {
          await ledger.releaseEscrow(
            escrow.whitePlayerId,
            escrow.blackPlayerId,
            outcome.gameId,
            stakeAmount,
            true
          );
        } else if (outcome.winnerId && outcome.loserId) {
          await ledger.releaseEscrow(
            outcome.winnerId,
            outcome.loserId,
            outcome.gameId,
            stakeAmount,
            false
          );
        }

        logger.audit("release_funds", "escrow", "success", {
          resourceId: outcome.gameId,
          data: {
            winnerId: outcome.winnerId,
            isDraw: outcome.isDraw,
            totalPool: escrow.totalPool,
          },
        });

        return { success: true, escrow };
      }

      try {
        // Atomic database operation
        const { data, error } = await supabase.rpc("release_escrow_funds", {
          p_game_id: outcome.gameId,
          p_winner_id: outcome.winnerId,
          p_loser_id: outcome.loserId,
          p_is_draw: outcome.isDraw,
          p_platform_fee_rate: outcome.isDraw ? 0 : PLATFORM_FEE_RATE,
        });

        if (error) throw error;

        escrow.status = outcome.isDraw ? "refunded" : "released";
        escrow.releasedAt = new Date().toISOString();

        // Record in ledger
        if (outcome.isDraw) {
          await ledger.releaseEscrow(
            escrow.whitePlayerId,
            escrow.blackPlayerId,
            outcome.gameId,
            stakeAmount,
            true
          );
        } else if (outcome.winnerId && outcome.loserId) {
          await ledger.releaseEscrow(
            outcome.winnerId,
            outcome.loserId,
            outcome.gameId,
            stakeAmount,
            false
          );
        }

        logger.audit("release_funds", "escrow", "success", {
          resourceId: outcome.gameId,
          data: {
            winnerId: outcome.winnerId,
            isDraw: outcome.isDraw,
            totalPool: escrow.totalPool,
            platformFee: data.platform_fee,
            winnerPayout: data.winner_payout,
          },
        });

        return { success: true, escrow, transactionId: data.transaction_id };
      } catch (error) {
        logger.error("Escrow", "Failed to release funds", error as Error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to release funds",
        };
      }
    });
  }

  // --------------------------------------------------------------------------
  // Cancellation and Refunds
  // --------------------------------------------------------------------------

  /**
   * Cancel escrow and refund all locked funds (atomic operation)
   */
  async cancelEscrow(gameId: string, reason: string): Promise<EscrowResult> {
    return this.withLock(gameId, async () => {
      const escrow = this.activeEscrows.get(gameId);

      if (!escrow) {
        return { success: false, error: "Escrow not found" };
      }

      if (escrow.status === "released" || escrow.status === "refunded") {
        return { success: false, error: `Cannot cancel ${escrow.status} escrow` };
      }

      if (!isSupabaseConfigured) {
        // Demo mode - refund both players
        escrow.status = "refunded";
        escrow.cancelledAt = new Date().toISOString();

        logger.audit("cancel_escrow", "escrow", "success", {
          resourceId: gameId,
          data: { reason, refundedWhite: escrow.whiteLockedAmount, refundedBlack: escrow.blackLockedAmount },
        });

        return { success: true, escrow };
      }

      try {
        // Atomic refund operation
        const { data, error } = await supabase.rpc("cancel_escrow", {
          p_game_id: gameId,
          p_reason: reason,
        });

        if (error) throw error;

        escrow.status = "refunded";
        escrow.cancelledAt = new Date().toISOString();

        logger.audit("cancel_escrow", "escrow", "success", {
          resourceId: gameId,
          data: {
            reason,
            refundedWhite: escrow.whiteLockedAmount,
            refundedBlack: escrow.blackLockedAmount,
          },
        });

        return { success: true, escrow, transactionId: data.transaction_id };
      } catch (error) {
        logger.error("Escrow", "Failed to cancel escrow", error as Error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to cancel escrow",
        };
      }
    });
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  /**
   * Get escrow state for a game
   */
  async getEscrow(gameId: string): Promise<EscrowState | null> {
    // Check cache first
    const cached = this.activeEscrows.get(gameId);
    if (cached) return cached;

    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from("game_escrows")
        .select("*")
        .eq("game_id", gameId)
        .single();

      if (error) throw error;

      const escrow: EscrowState = {
        gameId: data.game_id,
        whitePlayerId: data.player_white_id,
        blackPlayerId: data.player_black_id,
        whiteLockedAmount: data.player_white_locked_tct,
        blackLockedAmount: data.player_black_locked_tct,
        totalPool: data.total_pool_tct,
        status: data.status,
        createdAt: data.created_at,
        lockedAt: data.locked_at,
        releasedAt: data.released_at,
      };

      this.activeEscrows.set(gameId, escrow);
      return escrow;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all active escrows for a player
   */
  async getPlayerEscrows(playerId: string): Promise<EscrowState[]> {
    if (!isSupabaseConfigured) {
      return Array.from(this.activeEscrows.values()).filter(
        (e) =>
          (e.whitePlayerId === playerId || e.blackPlayerId === playerId) &&
          (e.status === "pending" || e.status === "partial" || e.status === "locked")
      );
    }

    try {
      const { data, error } = await supabase
        .from("game_escrows")
        .select("*")
        .or(`player_white_id.eq.${playerId},player_black_id.eq.${playerId}`)
        .in("status", ["pending", "partial", "locked"]);

      if (error) throw error;

      return (data || []).map((row) => ({
        gameId: row.game_id,
        whitePlayerId: row.player_white_id,
        blackPlayerId: row.player_black_id,
        whiteLockedAmount: row.player_white_locked_tct,
        blackLockedAmount: row.player_black_locked_tct,
        totalPool: row.total_pool_tct,
        status: row.status,
        createdAt: row.created_at,
        lockedAt: row.locked_at,
        releasedAt: row.released_at,
      }));
    } catch (error) {
      logger.error("Escrow", "Failed to get player escrows", error as Error);
      return [];
    }
  }

  /**
   * Calculate player's total locked funds
   */
  async getPlayerLockedFunds(playerId: string): Promise<number> {
    const escrows = await this.getPlayerEscrows(playerId);

    return escrows.reduce((total, escrow) => {
      if (escrow.whitePlayerId === playerId) {
        return total + escrow.whiteLockedAmount;
      }
      if (escrow.blackPlayerId === playerId) {
        return total + escrow.blackLockedAmount;
      }
      return total;
    }, 0);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const escrowService = new EscrowService();

// ============================================================================
// Convenience Functions
// ============================================================================

export const createEscrow = escrowService.createEscrow.bind(escrowService);
export const lockFunds = escrowService.lockFunds.bind(escrowService);
export const lockBothPlayers = escrowService.lockBothPlayers.bind(escrowService);
export const releaseFunds = escrowService.releaseFunds.bind(escrowService);
export const cancelEscrow = escrowService.cancelEscrow.bind(escrowService);
export const getEscrow = escrowService.getEscrow.bind(escrowService);
export const getPlayerEscrows = escrowService.getPlayerEscrows.bind(escrowService);
export const getPlayerLockedFunds = escrowService.getPlayerLockedFunds.bind(escrowService);
