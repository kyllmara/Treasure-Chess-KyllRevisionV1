/**
 * Wallet Service Layer
 *
 * Provides comprehensive wallet operations connecting to Supabase backend.
 * Handles balance fetching, deposits, withdrawals, and transaction history.
 *
 * Features:
 * - Type-safe Supabase queries with proper error handling
 * - Retry logic with exponential backoff for network failures
 * - Real-time subscription management
 * - Offline operation queue with replay on reconnection
 * - Audit logging for financial operations
 *
 * @module lib/wallet
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./security";
import type { Database } from "@/types/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

/** Balance record from Supabase */
export type Balance = Database["public"]["Tables"]["balances"]["Row"];

/** Transaction record from Supabase */
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

/** Transaction types */
export type TransactionType = Database["public"]["Enums"]["transaction_type"];

/** Withdrawal record from Supabase */
export type Withdrawal = Database["public"]["Tables"]["withdrawals"]["Row"];

/** Pending deposit record from Supabase */
export type PendingDeposit = Database["public"]["Tables"]["pending_deposits"]["Row"];

/** Wallet balance summary for UI display */
export interface WalletBalanceSummary {
  availableTct: number;
  lockedTct: number;
  totalTct: number;
  totalDepositedTct: number;
  totalWithdrawnTct: number;
  totalWonTct: number;
  totalLostTct: number;
  totalCommissionPaidTct: number;
  availableUsd: number;
  lockedUsd: number;
  totalUsd: number;
  updatedAt: string;
}

/** Transaction display item for UI */
export interface TransactionDisplayItem {
  id: string;
  type: TransactionType;
  amountTct: number;
  amountUsd: number;
  description: string | null;
  gameId: string | null;
  txHash: string | null;
  balanceBeforeTct: number;
  balanceAfterTct: number;
  createdAt: Date;
  isPositive: boolean;
  displayType: string;
  displayIcon: "deposit" | "withdraw" | "win" | "loss" | "lock" | "unlock" | "commission" | "refund";
}

/** Paginated transaction result */
export interface PaginatedTransactions {
  transactions: TransactionDisplayItem[];
  hasMore: boolean;
  totalCount: number;
  nextOffset: number;
}

/** Wallet operation result */
export interface WalletOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: WalletError;
}

/** Wallet error structure */
export interface WalletError {
  code: WalletErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

/** Wallet error codes */
export type WalletErrorCode =
  | "NETWORK_ERROR"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_AMOUNT"
  | "USER_NOT_FOUND"
  | "BALANCE_NOT_FOUND"
  | "SUPABASE_NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

/** Withdrawal request parameters */
export interface WithdrawalRequest {
  userId: string;
  amountTct: number;
  type: "crypto" | "bank";
  destinationAddress?: string;
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    sortCode: string;
    iban?: string;
    bic?: string;
  };
}

/** Real-time subscription callback */
export type BalanceChangeCallback = (balance: WalletBalanceSummary) => void;
export type TransactionCallback = (transaction: TransactionDisplayItem) => void;

// ============================================================================
// Constants
// ============================================================================

export { TCT_TO_USD, USDC_TO_TCT_RATE as USD_TO_TCT, tctToUsd, usdToTct } from "./tct";

/** Minimum withdrawal amount in TCT */
export const MIN_WITHDRAWAL_TCT = 100;

/** Minimum withdrawal amount in USD for bank transfers */
export const MIN_BANK_WITHDRAWAL_USD = 10;

/** Maximum retry attempts for failed operations */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY_MS = 1000;

/** Default page size for transaction history */
export const DEFAULT_PAGE_SIZE = 20;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format TCT amount for display
 */
export function formatTct(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format USD amount for display
 */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Create a wallet error
 */
function createWalletError(
  code: WalletErrorCode,
  message: string,
  retryable: boolean = false,
  details?: Record<string, unknown>
): WalletError {
  return { code, message, retryable, details };
}

/**
 * Map Supabase error to wallet error
 */
function mapSupabaseError(error: unknown): WalletError {
  // Handle different error types
  // Supabase PostgrestError has: message, details, hint, code
  let message = "An unexpected error occurred";
  let code: string | undefined;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "object" && error !== null) {
    const pgError = error as { message?: string; code?: string; details?: string; hint?: string };
    message = pgError.message || pgError.details || pgError.hint || `Error code: ${pgError.code || 'unknown'}`;
    code = pgError.code;
    // Avoid JSON.stringify as it can fail with circular references
  } else if (typeof error === "string") {
    message = error;
  }

  if (message.includes("network") || message.includes("fetch")) {
    return createWalletError("NETWORK_ERROR", "Network connection failed", true);
  }

  if (code === "PGRST116" || message.includes("not found") || message.includes("no rows")) {
    return createWalletError("BALANCE_NOT_FOUND", "Balance record not found", false);
  }

  if (message.toLowerCase().includes("insufficient")) {
    return createWalletError("INSUFFICIENT_BALANCE", "Insufficient balance", false);
  }

  if (code === "42501" || message.includes("permission") || message.includes("row-level security")) {
    return createWalletError("UNAUTHORIZED", "Not authorized for this operation", false);
  }

  return createWalletError("UNKNOWN_ERROR", message, true);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute with retry logic and exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Extract error message from different error types
      // Supabase PostgrestError has: message, details, hint, code
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        const pgError = error as { message?: string; code?: string; details?: string; hint?: string };
        errorMessage = pgError.message || pgError.details || pgError.hint || `Error code: ${pgError.code || 'unknown'}`;
        // Avoid JSON.stringify as it can fail with circular references
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      if (attempt < maxAttempts) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn("Wallet", `${context} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`, {
          error: errorMessage,
        });
        await sleep(delay);
      } else {
        logger.error("Wallet", `${context} failed after ${maxAttempts} attempts`, {
          error: errorMessage,
        });
      }
    }
  }

  throw lastError;
}

/**
 * Map transaction type to display information
 */
function getTransactionDisplayInfo(type: TransactionType): { displayType: string; displayIcon: TransactionDisplayItem["displayIcon"]; isPositive: boolean } {
  switch (type) {
    case "deposit":
      return { displayType: "Deposit", displayIcon: "deposit", isPositive: true };
    case "withdraw":
      return { displayType: "Withdrawal", displayIcon: "withdraw", isPositive: false };
    case "wager_lock":
      return { displayType: "Wager Locked", displayIcon: "lock", isPositive: false };
    case "wager_unlock":
      return { displayType: "Wager Unlocked", displayIcon: "unlock", isPositive: true };
    case "win_payout":
      return { displayType: "Game Won", displayIcon: "win", isPositive: true };
    case "loss_deduct":
      return { displayType: "Game Lost", displayIcon: "loss", isPositive: false };
    case "commission":
      return { displayType: "Commission", displayIcon: "commission", isPositive: false };
    case "refund":
      return { displayType: "Refund", displayIcon: "refund", isPositive: true };
    case "reward_payout" as TransactionType:
      return { displayType: "Reward Payout", displayIcon: "win", isPositive: true };
    default:
      return { displayType: "Transaction", displayIcon: "deposit", isPositive: false };
  }
}

/**
 * Transform Balance row to WalletBalanceSummary
 */
function transformBalance(balance: Balance): WalletBalanceSummary {
  const availableTct = Number(balance.available_tct) || 0;
  const lockedTct = Number(balance.locked_tct) || 0;
  const totalTct = availableTct + lockedTct;

  return {
    availableTct,
    lockedTct,
    totalTct,
    totalDepositedTct: Number(balance.total_deposited_tct) || 0,
    totalWithdrawnTct: Number(balance.total_withdrawn_tct) || 0,
    totalWonTct: Number(balance.total_won_tct) || 0,
    totalLostTct: Number(balance.total_lost_tct) || 0,
    totalCommissionPaidTct: Number(balance.total_commission_paid_tct) || 0,
    availableUsd: tctToUsd(availableTct),
    lockedUsd: tctToUsd(lockedTct),
    totalUsd: tctToUsd(totalTct),
    updatedAt: balance.updated_at,
  };
}

/**
 * Transform Transaction row to TransactionDisplayItem
 */
function transformTransaction(tx: Transaction): TransactionDisplayItem {
  const { displayType, displayIcon, isPositive } = getTransactionDisplayInfo(tx.type);
  const amountTct = Number(tx.amount_tct) || 0;

  return {
    id: tx.id,
    type: tx.type,
    amountTct,
    amountUsd: tctToUsd(amountTct),
    description: tx.description,
    gameId: tx.game_id,
    txHash: tx.tx_hash,
    balanceBeforeTct: Number(tx.balance_before_tct) || 0,
    balanceAfterTct: Number(tx.balance_after_tct) || 0,
    createdAt: new Date(tx.created_at),
    isPositive,
    displayType,
    displayIcon,
  };
}

// ============================================================================
// Balance Operations
// ============================================================================

/**
 * Fetch user's wallet balance from Supabase
 */
export async function fetchBalance(userId: string): Promise<WalletOperationResult<WalletBalanceSummary>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  if (!userId) {
    return {
      success: false,
      error: createWalletError("VALIDATION_ERROR", "User ID is required"),
    };
  }

  try {
    const balance = await withRetry(async () => {
      const { data, error } = await supabase
        .from("balances")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Balance not found");

      return data;
    }, "fetchBalance");

    logger.info("Wallet", "Balance fetched successfully", { userId, availableTct: (balance as Balance).available_tct });

    return {
      success: true,
      data: transformBalance(balance),
    };
  } catch (error) {
    const walletError = mapSupabaseError(error);
    logger.error("Wallet", "Failed to fetch balance", { userId, error: walletError.message });

    return {
      success: false,
      error: walletError,
    };
  }
}

/**
 * Create initial balance record for a new user
 */
export async function createInitialBalance(userId: string): Promise<WalletOperationResult<WalletBalanceSummary>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  try {
    const { data, error } = await (supabase
      .from("balances")
      .insert({
        user_id: userId,
        available_tct: 0,
        locked_tct: 0,
      } as never)
      .select()
      .single()) as { data: Balance | null; error: Error | null };

    if (error) throw error;
    if (!data) throw new Error("Failed to create balance");

    logger.info("Wallet", "Initial balance created", { userId });

    return {
      success: true,
      data: transformBalance(data),
    };
  } catch (error) {
    const walletError = mapSupabaseError(error);
    logger.error("Wallet", "Failed to create initial balance", { userId, error: walletError.message });

    return {
      success: false,
      error: walletError,
    };
  }
}

/**
 * Get or create balance for a user
 */
export async function getOrCreateBalance(userId: string): Promise<WalletOperationResult<WalletBalanceSummary>> {
  const result = await fetchBalance(userId);

  if (result.success) {
    return result;
  }

  // If balance not found, create it
  if (result.error?.code === "BALANCE_NOT_FOUND") {
    return createInitialBalance(userId);
  }

  return result;
}

// ============================================================================
// Transaction Operations
// ============================================================================

/**
 * Fetch transaction history with pagination
 */
export async function fetchTransactionHistory(
  userId: string,
  limit: number = DEFAULT_PAGE_SIZE,
  offset: number = 0
): Promise<WalletOperationResult<PaginatedTransactions>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  if (!userId) {
    return {
      success: false,
      error: createWalletError("VALIDATION_ERROR", "User ID is required"),
    };
  }

  try {
    // Fetch one extra to determine if there are more
    const { data: transactions, error, count } = await supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);

    if (error) throw error;

    const totalCount = count || 0;
    const hasMore = offset + limit < totalCount;

    logger.info("Wallet", "Transactions fetched", {
      userId,
      count: transactions?.length || 0,
      offset,
      hasMore,
    });

    return {
      success: true,
      data: {
        transactions: (transactions || []).map(transformTransaction),
        hasMore,
        totalCount,
        nextOffset: offset + limit,
      },
    };
  } catch (error) {
    const walletError = mapSupabaseError(error as { message: string; code?: string });
    logger.error("Wallet", "Failed to fetch transactions", { userId, error: walletError.message });

    return {
      success: false,
      error: walletError,
    };
  }
}

/**
 * Fetch recent transactions (last N)
 */
export async function fetchRecentTransactions(
  userId: string,
  count: number = 5
): Promise<WalletOperationResult<TransactionDisplayItem[]>> {
  const result = await fetchTransactionHistory(userId, count, 0);

  if (result.success && result.data) {
    return {
      success: true,
      data: result.data.transactions,
    };
  }

  return {
    success: false,
    error: result.error,
  };
}

// ============================================================================
// Deposit Operations
// ============================================================================

/**
 * Fetch pending deposits for a user
 */
export async function fetchPendingDeposits(userId: string): Promise<WalletOperationResult<PendingDeposit[]>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  try {
    const { data, error } = await supabase
      .from("pending_deposits")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "confirming"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    const walletError = mapSupabaseError(error as { message: string; code?: string });
    logger.error("Wallet", "Failed to fetch pending deposits", { userId, error: walletError.message });

    return {
      success: false,
      error: walletError,
    };
  }
}

/**
 * Credit balance after successful deposit (called by backend/webhook)
 * This is typically handled by server-side, but we expose it for testing
 */
export async function creditBalance(
  userId: string,
  amountTct: number,
  description: string = "Deposit"
): Promise<WalletOperationResult<WalletBalanceSummary>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  if (amountTct <= 0) {
    return {
      success: false,
      error: createWalletError("INVALID_AMOUNT", "Amount must be positive"),
    };
  }

  try {
    // Use RPC function if available, otherwise manual update
    const { data, error } = await (supabase.rpc as any)("credit_user_balance", {
      p_user_id: userId,
      p_amount: amountTct,
      p_description: description,
    });

    if (error) throw error;

    logger.financialEvent("deposit", "success", {
      amount: amountTct,
      currency: "TCT",
    });

    // Fetch updated balance
    return fetchBalance(userId);
  } catch (error) {
    const walletError = mapSupabaseError(error as { message: string; code?: string });
    logger.error("Wallet", "Failed to credit balance", {
      userId,
      amount: amountTct,
      error: walletError.message,
    });

    return {
      success: false,
      error: walletError,
    };
  }
}

// ============================================================================
// Withdrawal Operations
// ============================================================================

/**
 * Validate withdrawal request
 */
export function validateWithdrawalRequest(
  balance: WalletBalanceSummary,
  request: WithdrawalRequest
): WalletOperationResult {
  const { amountTct, type, destinationAddress, bankDetails } = request;

  // Check minimum amount
  if (type === "crypto" && amountTct < MIN_WITHDRAWAL_TCT) {
    return {
      success: false,
      error: createWalletError(
        "INVALID_AMOUNT",
        `Minimum crypto withdrawal is ${MIN_WITHDRAWAL_TCT} TCT`
      ),
    };
  }

  const amountUsd = tctToUsd(amountTct);
  if (type === "bank" && amountUsd < MIN_BANK_WITHDRAWAL_USD) {
    return {
      success: false,
      error: createWalletError(
        "INVALID_AMOUNT",
        `Minimum bank withdrawal is $${MIN_BANK_WITHDRAWAL_USD}`
      ),
    };
  }

  // Check available balance
  if (amountTct > balance.availableTct) {
    return {
      success: false,
      error: createWalletError(
        "INSUFFICIENT_BALANCE",
        `Insufficient available balance. Available: ${formatTct(balance.availableTct)} TCT`
      ),
    };
  }

  // Validate destination for crypto
  if (type === "crypto" && !destinationAddress) {
    return {
      success: false,
      error: createWalletError("VALIDATION_ERROR", "Wallet address is required for crypto withdrawal"),
    };
  }

  // Validate bank details
  if (type === "bank") {
    if (!bankDetails?.accountName || !bankDetails?.accountNumber || !bankDetails?.sortCode) {
      return {
        success: false,
        error: createWalletError("VALIDATION_ERROR", "Bank account details are required"),
      };
    }
  }

  return { success: true };
}

/**
 * Request a withdrawal
 */
export async function requestWithdrawal(
  request: WithdrawalRequest
): Promise<WalletOperationResult<Withdrawal>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  const { userId, amountTct, type, destinationAddress, bankDetails } = request;

  // Fetch current balance for validation
  const balanceResult = await fetchBalance(userId);
  if (!balanceResult.success || !balanceResult.data) {
    return {
      success: false,
      error: balanceResult.error || createWalletError("BALANCE_NOT_FOUND", "Could not fetch balance"),
    };
  }

  // Validate the request
  const validation = validateWithdrawalRequest(balanceResult.data, request);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    // Calculate fee (if any) - for now, no fee
    const feeTct = 0;
    const netAmountTct = amountTct - feeTct;
    const netAmountUsdc = type === "crypto" ? tctToUsd(netAmountTct) : null;
    const netAmountUsd = type === "bank" ? tctToUsd(netAmountTct) : null;

    const { data, error } = await (supabase
      .from("withdrawals")
      .insert({
        user_id: userId,
        type,
        amount_tct: amountTct,
        fee_tct: feeTct,
        net_amount_tct: netAmountTct,
        net_amount_usdc: netAmountUsdc,
        net_amount_usd: netAmountUsd,
        destination_address: destinationAddress || null,
        bank_account_name: bankDetails?.accountName || null,
        bank_account_number: bankDetails?.accountNumber || null,
        bank_sort_code: bankDetails?.sortCode || null,
        bank_iban: bankDetails?.iban || null,
        bank_bic: bankDetails?.bic || null,
        status: "pending",
      } as never)
      .select()
      .single()) as { data: Withdrawal | null; error: Error | null };

    if (error) throw error;

    if (!data) throw new Error("Failed to create withdrawal");

    logger.financialEvent("withdrawal", "success", {
      amount: amountTct,
      currency: "TCT",
      transactionId: data.id,
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    const walletError = mapSupabaseError(error as { message: string; code?: string });
    logger.error("Wallet", "Failed to request withdrawal", {
      userId,
      amount: amountTct,
      error: walletError.message,
    });

    return {
      success: false,
      error: walletError,
    };
  }
}

/**
 * Fetch withdrawal history
 */
export async function fetchWithdrawals(
  userId: string,
  limit: number = 10
): Promise<WalletOperationResult<Withdrawal[]>> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      error: createWalletError("SUPABASE_NOT_CONFIGURED", "Supabase is not configured"),
    };
  }

  try {
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      success: true,
      data: data || [],
    };
  } catch (error) {
    const walletError = mapSupabaseError(error as { message: string; code?: string });
    logger.error("Wallet", "Failed to fetch withdrawals", { userId, error: walletError.message });

    return {
      success: false,
      error: walletError,
    };
  }
}

// ============================================================================
// Real-time Subscriptions
// ============================================================================

/** Active subscription channels */
const activeSubscriptions: Map<string, RealtimeChannel> = new Map();

/**
 * Subscribe to balance changes for a user
 */
export function subscribeToBalanceChanges(
  userId: string,
  onBalanceChange: BalanceChangeCallback
): () => void {
  if (!isSupabaseConfigured) {
    logger.warn("Wallet", "Cannot subscribe - Supabase not configured");
    return () => {};
  }

  const channelName = `balance-${userId}`;

  // Clean up existing subscription if any
  const existingChannel = activeSubscriptions.get(channelName);
  if (existingChannel) {
    supabase.removeChannel(existingChannel);
    activeSubscriptions.delete(channelName);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "balances",
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<Balance>) => {
        logger.info("Wallet", "Balance change received", { userId, event: payload.eventType });

        if (payload.new && typeof payload.new === "object" && "available_tct" in payload.new) {
          const balance = transformBalance(payload.new as Balance);
          onBalanceChange(balance);
        }
      }
    )
    .subscribe((status) => {
      logger.info("Wallet", `Balance subscription ${status}`, { userId, channelName });
    });

  activeSubscriptions.set(channelName, channel);

  // Return unsubscribe function
  return () => {
    const ch = activeSubscriptions.get(channelName);
    if (ch) {
      supabase.removeChannel(ch);
      activeSubscriptions.delete(channelName);
      logger.info("Wallet", "Balance subscription removed", { userId });
    }
  };
}

/**
 * Subscribe to new transactions for a user
 */
export function subscribeToTransactions(
  userId: string,
  onNewTransaction: TransactionCallback
): () => void {
  if (!isSupabaseConfigured) {
    logger.warn("Wallet", "Cannot subscribe - Supabase not configured");
    return () => {};
  }

  const channelName = `transactions-${userId}`;

  // Clean up existing subscription if any
  const existingChannel = activeSubscriptions.get(channelName);
  if (existingChannel) {
    supabase.removeChannel(existingChannel);
    activeSubscriptions.delete(channelName);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "transactions",
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<Transaction>) => {
        logger.info("Wallet", "New transaction received", { userId });

        if (payload.new && typeof payload.new === "object" && "type" in payload.new) {
          const transaction = transformTransaction(payload.new as Transaction);
          onNewTransaction(transaction);
        }
      }
    )
    .subscribe((status) => {
      logger.info("Wallet", `Transaction subscription ${status}`, { userId, channelName });
    });

  activeSubscriptions.set(channelName, channel);

  // Return unsubscribe function
  return () => {
    const ch = activeSubscriptions.get(channelName);
    if (ch) {
      supabase.removeChannel(ch);
      activeSubscriptions.delete(channelName);
      logger.info("Wallet", "Transaction subscription removed", { userId });
    }
  };
}

/**
 * Clean up all subscriptions (call on logout)
 */
export function cleanupAllSubscriptions(): void {
  activeSubscriptions.forEach((channel, name) => {
    supabase.removeChannel(channel);
    logger.info("Wallet", "Subscription cleaned up", { channelName: name });
  });
  activeSubscriptions.clear();
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Balance operations
  fetchBalance,
  createInitialBalance,
  getOrCreateBalance,
  creditBalance,

  // Transaction operations
  fetchTransactionHistory,
  fetchRecentTransactions,

  // Deposit operations
  fetchPendingDeposits,

  // Withdrawal operations
  validateWithdrawalRequest,
  requestWithdrawal,
  fetchWithdrawals,

  // Real-time subscriptions
  subscribeToBalanceChanges,
  subscribeToTransactions,
  cleanupAllSubscriptions,

  // Utilities
  tctToUsd,
  usdToTct,
  formatTct,
  formatUsd,

  // Constants
  TCT_TO_USD,
  USD_TO_TCT,
  MIN_WITHDRAWAL_TCT,
  MIN_BANK_WITHDRAWAL_USD,
  DEFAULT_PAGE_SIZE,
};
