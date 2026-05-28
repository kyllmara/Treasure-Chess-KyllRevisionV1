/**
 * Double-Entry Accounting Ledger
 *
 * Financial integrity system using double-entry bookkeeping.
 * Every transaction has matching debits and credits.
 *
 * @module lib/security/ledger
 */

import { supabase, isSupabaseConfigured } from "../supabase";
import { logger } from "./logger";

// ============================================================================
// Types
// ============================================================================

/** Account types in the ledger */
export type AccountType =
  | "user_balance"      // User's available TCT balance
  | "user_escrow"       // User's funds locked in escrow
  | "platform_fees"     // Platform fee collection
  | "platform_escrow"   // Platform escrow holding
  | "external_deposit"  // Deposits from payment providers
  | "external_withdraw" // Withdrawals to payment providers
  | "game_pool"         // Game prize pool
  | "rake_pool"         // Platform rake collection
  | "promotional"       // Promotional/bonus funds
  | "adjustment";       // Manual adjustments (admin only)

/** Transaction types */
export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "game_stake"
  | "game_win"
  | "game_loss"
  | "escrow_lock"
  | "escrow_release"
  | "platform_fee"
  | "refund"
  | "bonus"
  | "adjustment";

/** Entry direction */
export type EntryDirection = "debit" | "credit";

/** A single ledger entry */
export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountType: AccountType;
  accountId: string; // User ID or system account ID
  direction: EntryDirection;
  amount: number;
  balance: number; // Balance after this entry
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** A complete transaction with its entries */
export interface LedgerTransaction {
  id: string;
  type: TransactionType;
  status: "pending" | "completed" | "failed" | "reversed";
  entries: LedgerEntry[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  reversedAt?: string;
  reversalTransactionId?: string;
  metadata?: Record<string, unknown>;
}

/** Balance summary for an account */
export interface AccountBalance {
  accountType: AccountType;
  accountId: string;
  balance: number;
  pendingDebits: number;
  pendingCredits: number;
  availableBalance: number;
  lastUpdated: string;
}

// ============================================================================
// Constants
// ============================================================================

/** System account IDs */
export const SYSTEM_ACCOUNTS = {
  PLATFORM_FEES: "system_platform_fees",
  PLATFORM_ESCROW: "system_platform_escrow",
  EXTERNAL_DEPOSIT: "system_external_deposit",
  EXTERNAL_WITHDRAW: "system_external_withdraw",
  RAKE_POOL: "system_rake_pool",
  PROMOTIONAL: "system_promotional",
} as const;

/** Platform fee percentage (10%) */
export const PLATFORM_FEE_RATE = 0.10;

/** Minimum transaction amount */
export const MIN_TRANSACTION_AMOUNT = 0.01;

// ============================================================================
// Ledger Service
// ============================================================================

export class LedgerService {
  private transactionCache: Map<string, LedgerTransaction> = new Map();

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Validate transaction is balanced (debits = credits)
   */
  private validateBalance(entries: Array<{ direction: EntryDirection; amount: number }>): boolean {
    const totalDebits = entries
      .filter((e) => e.direction === "debit")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalCredits = entries
      .filter((e) => e.direction === "credit")
      .reduce((sum, e) => sum + e.amount, 0);

    // Use epsilon comparison for floating point
    return Math.abs(totalDebits - totalCredits) < 0.001;
  }

  // --------------------------------------------------------------------------
  // Core Transaction Methods
  // --------------------------------------------------------------------------

  /**
   * Create a new ledger transaction with entries
   * Ensures double-entry balance (debits = credits)
   */
  async createTransaction(
    type: TransactionType,
    entries: Array<{
      accountType: AccountType;
      accountId: string;
      direction: EntryDirection;
      amount: number;
      description: string;
    }>,
    metadata?: Record<string, unknown>,
    createdBy?: string
  ): Promise<LedgerTransaction | null> {
    // Validate all amounts are positive
    if (entries.some((e) => e.amount < MIN_TRANSACTION_AMOUNT)) {
      logger.error("Ledger", "Transaction amount below minimum", {
        entries,
        minAmount: MIN_TRANSACTION_AMOUNT,
      });
      return null;
    }

    // Validate balance
    if (!this.validateBalance(entries)) {
      logger.error("Ledger", "Transaction not balanced - debits must equal credits", {
        entries,
      });
      return null;
    }

    const transactionId = this.generateTransactionId();
    const now = new Date().toISOString();

    // Create ledger entries
    const ledgerEntries: LedgerEntry[] = entries.map((entry) => ({
      id: this.generateEntryId(),
      transactionId,
      accountType: entry.accountType,
      accountId: entry.accountId,
      direction: entry.direction,
      amount: entry.amount,
      balance: 0, // Will be calculated
      currency: "TCT",
      description: entry.description,
      createdAt: now,
    }));

    const totalDebits = ledgerEntries
      .filter((e) => e.direction === "debit")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalCredits = ledgerEntries
      .filter((e) => e.direction === "credit")
      .reduce((sum, e) => sum + e.amount, 0);

    const transaction: LedgerTransaction = {
      id: transactionId,
      type,
      status: "pending",
      entries: ledgerEntries,
      totalDebits,
      totalCredits,
      isBalanced: true,
      createdBy: createdBy || "system",
      createdAt: now,
      metadata,
    };

    // Save to database
    if (isSupabaseConfigured) {
      try {
        // Insert transaction
        const { error: txnError } = await supabase
          .from("ledger_transactions")
          .insert({
            id: transaction.id,
            type: transaction.type,
            status: transaction.status,
            total_debits: transaction.totalDebits,
            total_credits: transaction.totalCredits,
            is_balanced: transaction.isBalanced,
            created_by: transaction.createdBy,
            metadata: transaction.metadata,
          });

        if (txnError) throw txnError;

        // Insert entries
        const entryRows = ledgerEntries.map((entry) => ({
          id: entry.id,
          transaction_id: entry.transactionId,
          account_type: entry.accountType,
          account_id: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency,
          description: entry.description,
        }));

        const { error: entriesError } = await supabase
          .from("ledger_entries")
          .insert(entryRows);

        if (entriesError) throw entriesError;

        logger.audit("create_transaction", "ledger", "success", {
          resourceId: transactionId,
          data: { type, totalDebits, entriesCount: entries.length },
        });
      } catch (error) {
        logger.error("Ledger", "Failed to create transaction", error as Error);
        return null;
      }
    }

    // Cache transaction
    this.transactionCache.set(transactionId, transaction);

    return transaction;
  }

  /**
   * Complete a pending transaction
   */
  async completeTransaction(transactionId: string): Promise<boolean> {
    const transaction = this.transactionCache.get(transactionId);

    if (!transaction) {
      logger.warn("Ledger", "Transaction not found for completion", { transactionId });
      return false;
    }

    if (transaction.status !== "pending") {
      logger.warn("Ledger", "Cannot complete non-pending transaction", {
        transactionId,
        status: transaction.status,
      });
      return false;
    }

    transaction.status = "completed";
    transaction.completedAt = new Date().toISOString();

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from("ledger_transactions")
          .update({
            status: "completed",
            completed_at: transaction.completedAt,
          })
          .eq("id", transactionId);

        if (error) throw error;

        // Update account balances
        for (const entry of transaction.entries) {
          await this.updateAccountBalance(entry);
        }

        logger.audit("complete_transaction", "ledger", "success", {
          resourceId: transactionId,
        });
      } catch (error) {
        logger.error("Ledger", "Failed to complete transaction", error as Error);
        return false;
      }
    }

    return true;
  }

  /**
   * Reverse a completed transaction
   */
  async reverseTransaction(
    transactionId: string,
    reason: string
  ): Promise<LedgerTransaction | null> {
    const original = this.transactionCache.get(transactionId);

    if (!original) {
      logger.warn("Ledger", "Transaction not found for reversal", { transactionId });
      return null;
    }

    if (original.status !== "completed") {
      logger.warn("Ledger", "Can only reverse completed transactions", {
        transactionId,
        status: original.status,
      });
      return null;
    }

    // Create reversal entries (swap debit/credit)
    const reversalEntries = original.entries.map((entry) => ({
      accountType: entry.accountType,
      accountId: entry.accountId,
      direction: (entry.direction === "debit" ? "credit" : "debit") as EntryDirection,
      amount: entry.amount,
      description: `REVERSAL: ${entry.description} (${reason})`,
    }));

    const reversalTransaction = await this.createTransaction(
      "refund",
      reversalEntries,
      {
        originalTransactionId: transactionId,
        reversalReason: reason,
      }
    );

    if (reversalTransaction) {
      original.status = "reversed";
      original.reversedAt = new Date().toISOString();
      original.reversalTransactionId = reversalTransaction.id;

      if (isSupabaseConfigured) {
        await supabase
          .from("ledger_transactions")
          .update({
            status: "reversed",
            reversed_at: original.reversedAt,
            reversal_transaction_id: reversalTransaction.id,
          })
          .eq("id", transactionId);
      }

      await this.completeTransaction(reversalTransaction.id);

      logger.audit("reverse_transaction", "ledger", "success", {
        resourceId: transactionId,
        data: { reversalId: reversalTransaction.id, reason },
      });
    }

    return reversalTransaction;
  }

  /**
   * Update account balance based on entry
   */
  private async updateAccountBalance(entry: LedgerEntry): Promise<void> {
    if (!isSupabaseConfigured) return;

    const balanceChange = entry.direction === "credit" ? entry.amount : -entry.amount;

    try {
      // Upsert balance record
      const { error } = await supabase.rpc("update_ledger_balance", {
        p_account_type: entry.accountType,
        p_account_id: entry.accountId,
        p_amount: balanceChange,
        p_currency: entry.currency,
      });

      if (error) throw error;
    } catch (error) {
      logger.error("Ledger", "Failed to update account balance", {
        entry,
        error,
      });
    }
  }

  // --------------------------------------------------------------------------
  // High-Level Transaction Methods
  // --------------------------------------------------------------------------

  /**
   * Record a user deposit
   */
  async recordDeposit(
    userId: string,
    amount: number,
    paymentProvider: string,
    paymentId: string
  ): Promise<LedgerTransaction | null> {
    const transaction = await this.createTransaction(
      "deposit",
      [
        {
          accountType: "external_deposit",
          accountId: SYSTEM_ACCOUNTS.EXTERNAL_DEPOSIT,
          direction: "debit",
          amount,
          description: `Deposit from ${paymentProvider}`,
        },
        {
          accountType: "user_balance",
          accountId: userId,
          direction: "credit",
          amount,
          description: `Deposit received via ${paymentProvider}`,
        },
      ],
      { paymentProvider, paymentId }
    );

    if (transaction) {
      await this.completeTransaction(transaction.id);
    }

    return transaction;
  }

  /**
   * Record a user withdrawal
   */
  async recordWithdrawal(
    userId: string,
    amount: number,
    paymentProvider: string,
    destinationAddress?: string
  ): Promise<LedgerTransaction | null> {
    const transaction = await this.createTransaction(
      "withdrawal",
      [
        {
          accountType: "user_balance",
          accountId: userId,
          direction: "debit",
          amount,
          description: `Withdrawal to ${paymentProvider}`,
        },
        {
          accountType: "external_withdraw",
          accountId: SYSTEM_ACCOUNTS.EXTERNAL_WITHDRAW,
          direction: "credit",
          amount,
          description: `Withdrawal processed via ${paymentProvider}`,
        },
      ],
      { paymentProvider, destinationAddress }
    );

    if (transaction) {
      await this.completeTransaction(transaction.id);
    }

    return transaction;
  }

  /**
   * Lock funds in escrow for a game
   */
  async lockEscrow(
    userId: string,
    gameId: string,
    amount: number
  ): Promise<LedgerTransaction | null> {
    const transaction = await this.createTransaction(
      "escrow_lock",
      [
        {
          accountType: "user_balance",
          accountId: userId,
          direction: "debit",
          amount,
          description: `Escrow lock for game ${gameId}`,
        },
        {
          accountType: "user_escrow",
          accountId: userId,
          direction: "credit",
          amount,
          description: `Escrow locked for game ${gameId}`,
        },
      ],
      { gameId }
    );

    if (transaction) {
      await this.completeTransaction(transaction.id);
    }

    return transaction;
  }

  /**
   * Release escrow funds after game completion
   */
  async releaseEscrow(
    winnerId: string,
    loserId: string,
    gameId: string,
    stakeAmount: number,
    isDraw: boolean = false
  ): Promise<LedgerTransaction | null> {
    const totalPool = stakeAmount * 2;
    const platformFee = isDraw ? 0 : totalPool * PLATFORM_FEE_RATE;
    const winnerPayout = isDraw ? stakeAmount : totalPool - platformFee;

    const entries: Array<{
      accountType: AccountType;
      accountId: string;
      direction: EntryDirection;
      amount: number;
      description: string;
    }> = [];

    // Debit escrow from both players
    entries.push({
      accountType: "user_escrow",
      accountId: winnerId,
      direction: "debit",
      amount: stakeAmount,
      description: `Escrow release for game ${gameId}`,
    });

    entries.push({
      accountType: "user_escrow",
      accountId: loserId,
      direction: "debit",
      amount: stakeAmount,
      description: `Escrow release for game ${gameId}`,
    });

    if (isDraw) {
      // Return stakes to both players
      entries.push({
        accountType: "user_balance",
        accountId: winnerId,
        direction: "credit",
        amount: stakeAmount,
        description: `Draw refund for game ${gameId}`,
      });
      entries.push({
        accountType: "user_balance",
        accountId: loserId,
        direction: "credit",
        amount: stakeAmount,
        description: `Draw refund for game ${gameId}`,
      });
    } else {
      // Pay winner (minus platform fee)
      entries.push({
        accountType: "user_balance",
        accountId: winnerId,
        direction: "credit",
        amount: winnerPayout,
        description: `Game win payout for game ${gameId}`,
      });

      // Platform fee
      if (platformFee > 0) {
        entries.push({
          accountType: "platform_fees",
          accountId: SYSTEM_ACCOUNTS.PLATFORM_FEES,
          direction: "credit",
          amount: platformFee,
          description: `Platform fee for game ${gameId}`,
        });
      }
    }

    const transaction = await this.createTransaction(
      isDraw ? "refund" : "game_win",
      entries,
      { gameId, winnerId, loserId, stakeAmount, platformFee, isDraw }
    );

    if (transaction) {
      await this.completeTransaction(transaction.id);
    }

    return transaction;
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  /**
   * Get account balance
   */
  async getAccountBalance(
    accountType: AccountType,
    accountId: string
  ): Promise<AccountBalance | null> {
    if (!isSupabaseConfigured) {
      return {
        accountType,
        accountId,
        balance: 0,
        pendingDebits: 0,
        pendingCredits: 0,
        availableBalance: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    try {
      const { data, error } = await supabase
        .from("ledger_balances")
        .select("*")
        .eq("account_type", accountType)
        .eq("account_id", accountId)
        .single();

      if (error) throw error;

      return {
        accountType,
        accountId,
        balance: data.balance,
        pendingDebits: data.pending_debits || 0,
        pendingCredits: data.pending_credits || 0,
        availableBalance: data.balance - (data.pending_debits || 0),
        lastUpdated: data.updated_at,
      };
    } catch (error) {
      logger.warn("Ledger", "Failed to get account balance", { accountType, accountId });
      return null;
    }
  }

  /**
   * Get user's full balance summary
   */
  async getUserBalance(userId: string): Promise<{
    available: number;
    escrow: number;
    total: number;
  }> {
    const [balanceData, escrowData] = await Promise.all([
      this.getAccountBalance("user_balance", userId),
      this.getAccountBalance("user_escrow", userId),
    ]);

    const available = balanceData?.availableBalance || 0;
    const escrow = escrowData?.balance || 0;

    return {
      available,
      escrow,
      total: available + escrow,
    };
  }

  /**
   * Get transaction history for an account
   */
  async getTransactionHistory(
    accountId: string,
    limit: number = 50
  ): Promise<LedgerEntry[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        transactionId: row.transaction_id,
        accountType: row.account_type,
        accountId: row.account_id,
        direction: row.direction,
        amount: row.amount,
        balance: row.balance_after || 0,
        currency: row.currency,
        description: row.description,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error("Ledger", "Failed to get transaction history", error as Error);
      return [];
    }
  }

  /**
   * Verify ledger integrity (all transactions balanced)
   */
  async verifyIntegrity(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    if (!isSupabaseConfigured) {
      return { valid: true, issues: [] };
    }

    try {
      // Check all transactions are balanced
      const { data: unbalanced, error: balanceError } = await supabase
        .from("ledger_transactions")
        .select("id, total_debits, total_credits")
        .neq("total_debits", supabase.raw("total_credits"));

      if (balanceError) throw balanceError;

      if (unbalanced && unbalanced.length > 0) {
        issues.push(`Found ${unbalanced.length} unbalanced transactions`);
      }

      // Check for orphaned entries
      const { data: orphaned, error: orphanError } = await supabase
        .from("ledger_entries")
        .select("id, transaction_id")
        .is("transaction_id", null);

      if (orphanError) throw orphanError;

      if (orphaned && orphaned.length > 0) {
        issues.push(`Found ${orphaned.length} orphaned ledger entries`);
      }

      logger.audit("verify_integrity", "ledger", issues.length === 0 ? "success" : "failure", {
        data: { issuesCount: issues.length },
      });

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      logger.error("Ledger", "Failed to verify integrity", error as Error);
      return {
        valid: false,
        issues: ["Failed to complete integrity check"],
      };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const ledger = new LedgerService();

// ============================================================================
// Convenience Functions
// ============================================================================

export const recordDeposit = ledger.recordDeposit.bind(ledger);
export const recordWithdrawal = ledger.recordWithdrawal.bind(ledger);
export const lockEscrow = ledger.lockEscrow.bind(ledger);
export const releaseEscrow = ledger.releaseEscrow.bind(ledger);
export const getUserBalance = ledger.getUserBalance.bind(ledger);
export const getTransactionHistory = ledger.getTransactionHistory.bind(ledger);
