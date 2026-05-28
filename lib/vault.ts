/**
 * Platform Vault Service
 *
 * Handles all platform custody vault operations:
 * - Fetching the vault deposit address
 * - Recording deposits
 * - Requesting/processing withdrawals
 * - Checking vault status for reserve proof
 */

import { supabase } from "./supabase";

// ============================================================================
// Constants
// ============================================================================

export const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
export const USDC_DECIMALS = 6;
export const USDC_TO_TCT_RATE = 25; // 1 USDC = 25 TCT
export const TCT_TO_USD = 0.04; // 1 TCT = $0.04
export const MIN_WITHDRAWAL_TCT = 25; // Minimum 25 TCT ($1 USDC)
export const REQUIRED_CONFIRMATIONS = 12;

// Fallback vault address for development (should be from env or database)
const FALLBACK_VAULT_ADDRESS = process.env.EXPO_PUBLIC_VAULT_ADDRESS || "";

// ============================================================================
// Types
// ============================================================================

export interface VaultStatus {
  vaultAddress: string;
  totalTctIssued: number;
  totalUsdcValue: number;
  totalCommissionTct: number;
  activeUsers: number;
  status: "active" | "paused" | "maintenance";
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amountTct: number;
  amountUsdc: number;
  toAddress: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  txHash: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface WithdrawalResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

export interface VaultTransaction {
  id: string;
  type: "deposit" | "withdrawal" | "commission" | "refund" | "adjustment";
  userId: string | null;
  usdcAmount: number;
  tctAmount: number;
  txHash: string | null;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
}

// ============================================================================
// Vault Address Functions
// ============================================================================

/**
 * Get the platform vault deposit address.
 * This is where users send USDC for deposits.
 */
export async function getVaultAddress(): Promise<string | null> {
  try {
    // Try to get from database first
    const { data, error } = await (supabase.rpc as any)("get_vault_address");

    if (error) {
      console.error("Error fetching vault address:", error);
      // Fall back to environment variable
      return FALLBACK_VAULT_ADDRESS || null;
    }

    return data || FALLBACK_VAULT_ADDRESS || null;
  } catch (err) {
    console.error("Vault address fetch error:", err);
    return FALLBACK_VAULT_ADDRESS || null;
  }
}

/**
 * Get vault status for reserve proof display.
 */
export async function getVaultStatus(): Promise<VaultStatus | null> {
  try {
    const { data, error } = await (supabase.rpc as any)("get_vault_status");

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      console.error("Error fetching vault status:", error);
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      vaultAddress: result.vault_address,
      totalTctIssued: Number(result.total_tct_issued),
      totalUsdcValue: Number(result.total_usdc_value),
      totalCommissionTct: Number(result.total_commission_tct),
      activeUsers: Number(result.active_users),
      status: result.status,
    };
  } catch (err) {
    console.error("Vault status error:", err);
    return null;
  }
}

// ============================================================================
// Withdrawal Functions
// ============================================================================

/**
 * Request a withdrawal from the platform vault.
 */
export async function requestWithdrawal(
  userId: string,
  amountTct: number,
  toAddress: string,
  idempotencyKey?: string
): Promise<WithdrawalResult> {
  try {
    // Validate minimum amount
    if (amountTct < MIN_WITHDRAWAL_TCT) {
      return {
        success: false,
        error: `Minimum withdrawal is ${MIN_WITHDRAWAL_TCT} TCT ($1 USDC)`,
      };
    }

    // Validate address format
    if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 42) {
      return {
        success: false,
        error: "Invalid wallet address",
      };
    }

    const { data, error } = await (supabase.rpc as any)("request_withdrawal", {
      p_user_id: userId,
      p_amount_tct: amountTct,
      p_to_address: toAddress.toLowerCase(),
      p_idempotency_key: idempotencyKey || null,
    });

    if (error) {
      console.error("Withdrawal request error:", error);
      return {
        success: false,
        error: error.message || "Failed to create withdrawal request",
      };
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.success) {
      return {
        success: false,
        error: result?.error_message || "Withdrawal request failed",
      };
    }

    return {
      success: true,
      requestId: result.request_id,
    };
  } catch (err) {
    console.error("Withdrawal error:", err);
    return {
      success: false,
      error: "An unexpected error occurred",
    };
  }
}

// Database row types (not in generated types yet)
interface WithdrawalRequestRow {
  id: string;
  user_id: string;
  amount_tct: number;
  amount_usdc: number;
  to_address: string;
  status: string;
  tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface VaultTransactionRow {
  id: string;
  type: string;
  user_id: string | null;
  usdc_amount: number;
  tct_amount: number;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

/**
 * Get withdrawal requests for a user.
 */
export async function getUserWithdrawals(
  userId: string
): Promise<WithdrawalRequest[]> {
  try {
    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching withdrawals:", error);
      return [];
    }

    // Type assertion for database rows
    const rows = (data || []) as unknown as WithdrawalRequestRow[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      amountTct: Number(row.amount_tct),
      amountUsdc: Number(row.amount_usdc),
      toAddress: row.to_address,
      status: row.status as WithdrawalRequest["status"],
      txHash: row.tx_hash,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  } catch (err) {
    console.error("Fetch withdrawals error:", err);
    return [];
  }
}

/**
 * Get pending withdrawal requests (for processing).
 */
export async function getPendingWithdrawals(): Promise<WithdrawalRequest[]> {
  try {
    const { data, error } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching pending withdrawals:", error);
      return [];
    }

    // Type assertion for database rows
    const rows = (data || []) as unknown as WithdrawalRequestRow[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      amountTct: Number(row.amount_tct),
      amountUsdc: Number(row.amount_usdc),
      toAddress: row.to_address,
      status: row.status as WithdrawalRequest["status"],
      txHash: row.tx_hash,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  } catch (err) {
    console.error("Fetch pending withdrawals error:", err);
    return [];
  }
}

// ============================================================================
// Vault Transaction History
// ============================================================================

/**
 * Get vault transactions for a user.
 */
export async function getUserVaultTransactions(
  userId: string
): Promise<VaultTransaction[]> {
  try {
    const { data, error } = await supabase
      .from("vault_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching vault transactions:", error);
      return [];
    }

    // Type assertion for database rows
    const rows = (data || []) as unknown as VaultTransactionRow[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type as VaultTransaction["type"],
      userId: row.user_id,
      usdcAmount: Number(row.usdc_amount),
      tctAmount: Number(row.tct_amount),
      txHash: row.tx_hash,
      status: row.status as VaultTransaction["status"],
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("Fetch vault transactions error:", err);
    return [];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert USDC to TCT.
 */
export function usdcToTct(usdc: number): number {
  return Math.floor(usdc * USDC_TO_TCT_RATE);
}

/**
 * Convert TCT to USDC.
 */
export function tctToUsdc(tct: number): number {
  return tct / USDC_TO_TCT_RATE;
}

/**
 * Format TCT for display.
 */
export function formatTct(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Format USDC for display.
 */
export function formatUsdc(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Parse USDC from smallest units (6 decimals).
 */
export function parseUsdcAmount(amountWei: string): number {
  const amount = BigInt(amountWei);
  return Number(amount) / Math.pow(10, USDC_DECIMALS);
}

/**
 * Truncate wallet address for display.
 */
export function truncateAddress(
  address: string,
  start = 6,
  end = 4
): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Address
  getVaultAddress,
  getVaultStatus,

  // Withdrawals
  requestWithdrawal,
  getUserWithdrawals,
  getPendingWithdrawals,

  // Transactions
  getUserVaultTransactions,

  // Utilities
  usdcToTct,
  tctToUsdc,
  formatTct,
  formatUsdc,
  parseUsdcAmount,
  truncateAddress,

  // Constants
  USDC_CONTRACT_ADDRESS,
  USDC_DECIMALS,
  USDC_TO_TCT_RATE,
  TCT_TO_USD,
  MIN_WITHDRAWAL_TCT,
  REQUIRED_CONFIRMATIONS,
};
