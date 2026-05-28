/**
 * Admin Service
 *
 * Service layer for admin panel operations. Handles all admin-related
 * API calls to Supabase including user management, vault statistics,
 * and audit logging.
 */

import { supabase } from "./supabase";
import { ethers } from "ethers";

// Platform vault configuration
const PLATFORM_VAULT_ADDRESS = process.env.EXPO_PUBLIC_VAULT_ADDRESS || "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";
const USDC_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://mainnet.base.org";
const USDC_DECIMALS = 6;
const USDC_TO_TCT_RATE = 25;

// Minimal ERC20 ABI for balanceOf
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
import type {
  AdminUserListItem,
  AdminUserDetails,
  UserSearchFilters,
  BanUserParams,
  SuspendUserParams,
  AdjustBalanceParams,
  AdminActionResult,
  DashboardStats,
  VaultBalances,
  VaultStatisticEntry,
  RakeSettings,
  UpdateRakeSettingsParams,
  AdminAuditLogEntry,
  AdminActionType,
} from "@/types/admin";

// ============================================================================
// Admin Role Checks
// ============================================================================

/**
 * Check if a user is an admin
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_user_admin", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error checking admin status:", error);
    return false;
  }

  return data === true;
}

/**
 * Check if a user is a super admin
 */
export async function isUserSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_user_super_admin", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error checking super admin status:", error);
    return false;
  }

  return data === true;
}

/**
 * Check if a user is banned or suspended
 */
export async function checkUserRestriction(userId: string): Promise<{
  isRestricted: boolean;
  restrictionType: "banned" | "suspended" | null;
  reason: string | null;
  expiresAt: string | null;
}> {
  const { data, error } = await supabase.rpc("is_user_restricted", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error checking user restriction:", error);
    return { isRestricted: false, restrictionType: null, reason: null, expiresAt: null };
  }

  if (data && data.length > 0) {
    const row = data[0];
    return {
      isRestricted: row.is_restricted,
      restrictionType: row.restriction_type as "banned" | "suspended" | null,
      reason: row.reason,
      expiresAt: row.expires_at,
    };
  }

  return { isRestricted: false, restrictionType: null, reason: null, expiresAt: null };
}

// ============================================================================
// Dashboard Statistics
// ============================================================================

/**
 * Get comprehensive dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats | null> {
  const { data, error } = await supabase.rpc("admin_get_dashboard_stats");

  if (error) {
    console.error("Error fetching dashboard stats:", error);
    return null;
  }

  if (!data) return null;

  // Transform snake_case to camelCase
  return {
    users: {
      total: data.users?.total ?? 0,
      activeToday: data.users?.active_today ?? 0,
      activeWeek: data.users?.active_week ?? 0,
      newToday: data.users?.new_today ?? 0,
      newWeek: data.users?.new_week ?? 0,
      banned: data.users?.banned ?? 0,
      suspended: data.users?.suspended ?? 0,
    },
    games: {
      total: data.games?.total ?? 0,
      active: data.games?.active ?? 0,
      completedToday: data.games?.completed_today ?? 0,
      completedWeek: data.games?.completed_week ?? 0,
    },
    financial: {
      balances: {
        treasury: data.financial?.balances?.treasury ?? 0,
        rewardPool: data.financial?.balances?.reward_pool ?? 0,
        total: data.financial?.balances?.total ?? 0,
      },
      rake: {
        totalCollected: data.financial?.rake?.total_collected ?? 0,
        today: data.financial?.rake?.today ?? 0,
        thisWeek: data.financial?.rake?.this_week ?? 0,
        thisMonth: data.financial?.rake?.this_month ?? 0,
      },
      settings: {
        rakePercentage: data.financial?.settings?.rake_percentage ?? 0.05,
        treasurySplit: data.financial?.settings?.treasury_split ?? 0.8,
        rewardPoolSplit: data.financial?.settings?.reward_pool_split ?? 0.2,
        minRakeTCT: data.financial?.settings?.min_rake_tct ?? 0.01,
        rakeOnDraws: data.financial?.settings?.rake_on_draws ?? false,
        enabled: data.financial?.settings?.enabled ?? true,
      },
    },
    challenges: {
      pending: data.challenges?.pending ?? 0,
      createdToday: data.challenges?.created_today ?? 0,
    },
    admins: {
      totalAdmins: data.admins?.total_admins ?? 0,
      superAdmins: data.admins?.super_admins ?? 0,
      actionsToday: data.admins?.actions_today ?? 0,
    },
    generatedAt: data.generated_at ?? new Date().toISOString(),
  };
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Search users with filters
 */
export async function searchUsers(
  filters: UserSearchFilters
): Promise<AdminUserListItem[]> {
  const { data, error } = await supabase.rpc("admin_search_users", {
    p_search_term: filters.searchTerm ?? null,
    p_filter_banned: filters.filterBanned ?? null,
    p_filter_suspended: filters.filterSuspended ?? null,
    p_filter_admin: filters.filterAdmin ?? null,
    p_order_by: filters.orderBy ?? "created_at",
    p_order_dir: filters.orderDir ?? "DESC",
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });

  if (error) {
    console.error("Error searching users:", error);
    return [];
  }

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    username: row.username as string,
    email: row.email as string | null,
    eloRating: row.elo_rating as number,
    gamesPlayed: row.games_played as number,
    gamesWon: row.games_won as number,
    isAdmin: row.is_admin as boolean,
    isSuperAdmin: row.is_super_admin as boolean,
    isBanned: row.is_banned as boolean,
    banReason: row.ban_reason as string | null,
    isSuspended: row.is_suspended as boolean,
    suspensionReason: row.suspension_reason as string | null,
    availableTCT: row.available_tct as number,
    lockedTCT: row.locked_tct as number,
    createdAt: row.created_at as string,
    lastSeenAt: row.last_seen_at as string,
  }));
}

/**
 * Get detailed user information
 */
export async function getUserDetails(
  userId: string
): Promise<AdminUserDetails | null> {
  const { data, error } = await supabase.rpc("admin_get_user_details", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error fetching user details:", error);
    return null;
  }

  if (!data || data.error) return null;

  return {
    profile: {
      id: data.profile.id,
      username: data.profile.username,
      email: data.profile.email,
      eloRating: data.profile.elo_rating,
      gamesPlayed: data.profile.games_played,
      gamesWon: data.profile.games_won,
      gamesLost: data.profile.games_lost,
      gamesDrawn: data.profile.games_drawn,
      currentStreak: data.profile.current_streak,
      longestStreak: data.profile.longest_streak,
      createdAt: data.profile.created_at,
      lastSeenAt: data.profile.last_seen_at,
    },
    adminStatus: {
      isAdmin: data.admin_status.is_admin,
      isSuperAdmin: data.admin_status.is_super_admin,
      admin2FAEnabled: data.admin_status.admin_2fa_enabled,
    },
    restrictions: {
      isBanned: data.restrictions.is_banned,
      banReason: data.restrictions.ban_reason,
      bannedAt: data.restrictions.banned_at,
      banExpiresAt: data.restrictions.ban_expires_at,
      isSuspended: data.restrictions.is_suspended,
      suspensionReason: data.restrictions.suspension_reason,
      suspendedAt: data.restrictions.suspended_at,
      suspensionExpiresAt: data.restrictions.suspension_expires_at,
    },
    balance: {
      availableTCT: data.balance.available_tct,
      lockedTCT: data.balance.locked_tct,
      totalDepositedTCT: data.balance.total_deposited_tct,
      totalWithdrawnTCT: data.balance.total_withdrawn_tct,
      totalWonTCT: data.balance.total_won_tct,
      totalLostTCT: data.balance.total_lost_tct,
      totalCommissionPaidTCT: data.balance.total_commission_paid_tct,
    },
    recentGames: data.recent_games.map((g: Record<string, unknown>) => ({
      id: g.id as string,
      opponentId: g.opponent_id as string,
      result: g.result as string,
      wagerTCT: g.wager_tct as number,
      endedAt: g.ended_at as string,
    })),
    recentTransactions: data.recent_transactions.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      type: t.type as string,
      amountTCT: t.amount_tct as number,
      description: t.description as string | null,
      createdAt: t.created_at as string,
    })),
    adminNotes: data.admin_notes,
  };
}

// ============================================================================
// User Moderation Actions
// ============================================================================

/**
 * Ban a user
 */
export async function banUser(
  adminId: string,
  params: BanUserParams
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_ban_user", {
    p_admin_id: adminId,
    p_target_user_id: params.targetUserId,
    p_reason: params.reason,
    p_duration_days: params.durationDays ?? null,
    p_notes: params.notes ?? null,
  });

  if (error) {
    console.error("Error banning user:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Unban a user
 */
export async function unbanUser(
  adminId: string,
  targetUserId: string,
  reason?: string
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_unban_user", {
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
    p_reason: reason ?? "Admin unbanned user",
  });

  if (error) {
    console.error("Error unbanning user:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Suspend a user
 */
export async function suspendUser(
  adminId: string,
  params: SuspendUserParams
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_suspend_user", {
    p_admin_id: adminId,
    p_target_user_id: params.targetUserId,
    p_reason: params.reason,
    p_duration_hours: params.durationHours ?? 24,
    p_notes: params.notes ?? null,
  });

  if (error) {
    console.error("Error suspending user:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Unsuspend a user
 */
export async function unsuspendUser(
  adminId: string,
  targetUserId: string,
  reason?: string
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_unsuspend_user", {
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
    p_reason: reason ?? "Admin lifted suspension",
  });

  if (error) {
    console.error("Error unsuspending user:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Adjust user balance
 */
export async function adjustBalance(
  adminId: string,
  params: AdjustBalanceParams
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_adjust_balance", {
    p_admin_id: adminId,
    p_target_user_id: params.targetUserId,
    p_amount_tct: params.amountTCT,
    p_reason: params.reason,
    p_adjustment_type: params.adjustmentType ?? "adjustment",
    p_notes: params.notes ?? null,
  });

  if (error) {
    console.error("Error adjusting balance:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

// ============================================================================
// Admin Role Management
// ============================================================================

/**
 * Grant admin role to a user (super admin only)
 */
export async function grantAdminRole(
  superAdminId: string,
  targetUserId: string,
  reason?: string
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_grant_admin", {
    p_super_admin_id: superAdminId,
    p_target_user_id: targetUserId,
    p_reason: reason ?? "Granted admin privileges",
  });

  if (error) {
    console.error("Error granting admin:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Revoke admin role from a user (super admin only)
 */
export async function revokeAdminRole(
  superAdminId: string,
  targetUserId: string,
  reason?: string
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_revoke_admin", {
    p_super_admin_id: superAdminId,
    p_target_user_id: targetUserId,
    p_reason: reason ?? "Admin privileges revoked",
  });

  if (error) {
    console.error("Error revoking admin:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

/**
 * Grant super admin role to a user (super admin only)
 */
export async function grantSuperAdminRole(
  superAdminId: string,
  targetUserId: string,
  reason?: string
): Promise<AdminActionResult> {
  const { data, error } = await supabase.rpc("admin_grant_super_admin", {
    p_super_admin_id: superAdminId,
    p_target_user_id: targetUserId,
    p_reason: reason ?? "Granted super admin privileges",
  });

  if (error) {
    console.error("Error granting super admin:", error);
    return { success: false, error: error.message };
  }

  return data as AdminActionResult;
}

// ============================================================================
// Vault Statistics
// ============================================================================

/**
 * Get vault balances - fetches actual on-chain USDC balance from platform vault wallet
 */
export async function getVaultBalances(): Promise<VaultBalances | null> {
  try {
    console.log("[Admin] Fetching on-chain vault balance...");

    // Fetch on-chain USDC balance of platform vault
    let onChainUsdcBalance = 0;
    let onChainTctBalance = 0;

    try {
      const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
      const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);

      const balanceWei = await usdcContract.balanceOf(PLATFORM_VAULT_ADDRESS);
      onChainUsdcBalance = Number(ethers.formatUnits(balanceWei, USDC_DECIMALS));
      onChainTctBalance = onChainUsdcBalance * USDC_TO_TCT_RATE;

      console.log("[Admin] On-chain vault balance:", {
        address: PLATFORM_VAULT_ADDRESS,
        usdcBalance: onChainUsdcBalance,
        tctEquivalent: onChainTctBalance,
      });
    } catch (rpcError) {
      console.error("[Admin] Error fetching on-chain balance:", rpcError);
    }

    // Also get database stats for comparison
    const { data: balanceData } = await supabase
      .from("balances")
      .select("available_tct, locked_tct, total_commission_paid_tct");

    let totalUserBalances = 0;
    let totalCommissionPaid = 0;

    if (balanceData) {
      for (const b of balanceData) {
        totalUserBalances += (b.available_tct || 0) + (b.locked_tct || 0);
        totalCommissionPaid += b.total_commission_paid_tct || 0;
      }
    }

    // Get withdrawal fees
    const { data: withdrawalData } = await supabase
      .from("withdrawals")
      .select("fee_tct, status");

    let totalWithdrawalFees = 0;
    let completedWithdrawals = 0;

    if (withdrawalData) {
      for (const w of withdrawalData) {
        if (w.status === "completed") {
          totalWithdrawalFees += w.fee_tct || 0;
          completedWithdrawals++;
        }
      }
    }

    // Platform revenue = withdrawal fees + game commissions
    const platformRevenue = totalWithdrawalFees + totalCommissionPaid;

    console.log("[Admin] Vault summary:", {
      onChainTctBalance,
      totalUserBalances,
      platformRevenue,
      completedWithdrawals,
    });

    return {
      // Treasury = on-chain balance (actual USDC in vault wallet converted to TCT)
      treasuryBalanceTCT: onChainTctBalance,
      // Reward pool not used in current system
      rewardPoolBalanceTCT: 0,
      // Total rake/fees collected
      totalRakeCollectedTCT: platformRevenue,
      // Number of completed withdrawals
      totalGamesSettled: completedWithdrawals,
      totalDrawRefundsTCT: 0,
    };
  } catch (err) {
    console.error("Error in getVaultBalances:", err);
    return {
      treasuryBalanceTCT: 0,
      rewardPoolBalanceTCT: 0,
      totalRakeCollectedTCT: 0,
      totalGamesSettled: 0,
      totalDrawRefundsTCT: 0,
    };
  }
}

/**
 * Get vault statistics - includes on-chain balance and database stats
 */
export async function getVaultStatistics(
  startDate?: string,
  endDate?: string
): Promise<VaultStatisticEntry[]> {
  try {
    console.log("[Admin] Fetching vault statistics...");

    const stats: VaultStatisticEntry[] = [];

    // Fetch on-chain USDC balance
    try {
      const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
      const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);
      const balanceWei = await usdcContract.balanceOf(PLATFORM_VAULT_ADDRESS);
      const onChainUsdc = Number(ethers.formatUnits(balanceWei, USDC_DECIMALS));

      stats.push({
        statName: "vault_usdc_balance",
        statValue: onChainUsdc,
        statUnit: "USDC",
      });

      stats.push({
        statName: "vault_tct_equivalent",
        statValue: onChainUsdc * USDC_TO_TCT_RATE,
        statUnit: "TCT",
      });
    } catch (rpcError) {
      console.error("[Admin] Error fetching on-chain balance:", rpcError);
      stats.push({
        statName: "vault_usdc_balance",
        statValue: 0,
        statUnit: "USDC (error)",
      });
    }

    // Get total users
    const { count: totalUsers } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    stats.push({
      statName: "total_users",
      statValue: totalUsers ?? 0,
      statUnit: "users",
    });

    // Get balance aggregates
    const { data: balanceData } = await supabase
      .from("balances")
      .select("available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct");

    let totalUserBalances = 0;
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let totalCommission = 0;

    if (balanceData) {
      for (const b of balanceData) {
        totalUserBalances += (b.available_tct || 0) + (b.locked_tct || 0);
        totalDeposited += b.total_deposited_tct || 0;
        totalWithdrawn += b.total_withdrawn_tct || 0;
        totalCommission += b.total_commission_paid_tct || 0;
      }
    }

    stats.push({
      statName: "total_user_balances",
      statValue: totalUserBalances,
      statUnit: "TCT",
    });

    stats.push({
      statName: "total_deposited_all_time",
      statValue: totalDeposited,
      statUnit: "TCT",
    });

    stats.push({
      statName: "total_withdrawn_all_time",
      statValue: totalWithdrawn,
      statUnit: "TCT",
    });

    // Get withdrawal stats
    const { data: withdrawalData } = await supabase
      .from("withdrawals")
      .select("amount_tct, fee_tct, net_amount_tct, status");

    let completedWithdrawals = 0;
    let pendingWithdrawals = 0;
    let totalWithdrawalFees = 0;
    let pendingWithdrawalAmount = 0;

    if (withdrawalData) {
      for (const w of withdrawalData) {
        if (w.status === "completed") {
          completedWithdrawals++;
          totalWithdrawalFees += w.fee_tct || 0;
        } else if (w.status === "pending" || w.status === "processing") {
          pendingWithdrawals++;
          pendingWithdrawalAmount += w.amount_tct || 0;
        }
      }
    }

    stats.push({
      statName: "completed_withdrawals",
      statValue: completedWithdrawals,
      statUnit: "count",
    });

    stats.push({
      statName: "pending_withdrawals",
      statValue: pendingWithdrawals,
      statUnit: "count",
    });

    stats.push({
      statName: "pending_withdrawal_amount",
      statValue: pendingWithdrawalAmount,
      statUnit: "TCT",
    });

    stats.push({
      statName: "withdrawal_fees_collected",
      statValue: totalWithdrawalFees,
      statUnit: "TCT",
    });

    stats.push({
      statName: "game_commission_collected",
      statValue: totalCommission,
      statUnit: "TCT",
    });

    // Platform revenue (fees + commission)
    stats.push({
      statName: "total_platform_revenue",
      statValue: totalWithdrawalFees + totalCommission,
      statUnit: "TCT",
    });

    return stats;
  } catch (err) {
    console.error("Error in getVaultStatistics:", err);
    return [];
  }
}

/**
 * Get current rake settings
 */
export async function getRakeSettings(): Promise<RakeSettings | null> {
  try {
    const { data, error } = await supabase.rpc("get_rake_settings");

    if (!error && data) {
      return {
        rakePercentage: data.rake_percentage ?? 0.10,
        treasurySplit: data.treasury_split ?? 0.9,
        rewardPoolSplit: data.reward_pool_split ?? 0.1,
        minRakeTCT: data.min_rake_tct ?? 1,
        rakeOnDraws: data.rake_on_draws ?? false,
        enabled: data.enabled ?? true,
      };
    }

    // Return default settings if RPC fails
    console.log("[Admin] get_rake_settings RPC failed, using defaults");
    return {
      rakePercentage: 0.10,
      treasurySplit: 0.9,
      rewardPoolSplit: 0.1,
      minRakeTCT: 1,
      rakeOnDraws: false,
      enabled: true,
    };
  } catch (err) {
    console.error("Error in getRakeSettings:", err);
    return {
      rakePercentage: 0.10,
      treasurySplit: 0.9,
      rewardPoolSplit: 0.1,
      minRakeTCT: 1,
      rakeOnDraws: false,
      enabled: true,
    };
  }
}

/**
 * Update rake settings (super admin only)
 */
export async function updateRakeSettings(
  adminId: string,
  params: UpdateRakeSettingsParams
): Promise<RakeSettings | null> {
  const { data, error } = await supabase.rpc("admin_update_rake_settings", {
    p_admin_id: adminId,
    p_rake_percentage: params.rakePercentage ?? null,
    p_treasury_split: params.treasurySplit ?? null,
    p_reward_pool_split: params.rewardPoolSplit ?? null,
    p_min_rake_tct: params.minRakeTCT ?? null,
    p_enabled: params.enabled ?? null,
  });

  if (error) {
    console.error("Error updating rake settings:", error);
    return null;
  }

  if (!data) return null;

  return {
    rakePercentage: data.rake_percentage,
    treasurySplit: data.treasury_split,
    rewardPoolSplit: data.reward_pool_split,
    minRakeTCT: data.min_rake_tct,
    rakeOnDraws: data.rake_on_draws,
    enabled: data.enabled,
  };
}

// ============================================================================
// Audit Log
// ============================================================================

/**
 * Get admin audit log entries
 */
export async function getAuditLog(
  limit: number = 100,
  offset: number = 0,
  actionType?: AdminActionType,
  startDate?: string,
  endDate?: string
): Promise<AdminAuditLogEntry[]> {
  const { data, error } = await supabase.rpc("admin_get_audit_trail", {
    p_limit: limit,
    p_offset: offset,
    p_operation: actionType ?? null,
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) {
    console.error("Error fetching audit log:", error);
    return [];
  }

  if (!data) return [];

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    adminId: row.actor_id as string,
    adminUsername: "", // Not returned by this function
    isSuperAdmin: false,
    actionType: row.operation as AdminActionType,
    actionSeverity: "medium" as const,
    targetUserId: null,
    targetUserUsername: null,
    targetTable: row.affected_table as string | null,
    targetRecordId: null,
    oldValues: null,
    newValues: null,
    reason: null,
    notes: null,
    ipAddress: null,
    userAgent: null,
    deviceInfo: row.change_summary as Record<string, unknown> | null,
    was2FAVerified: false,
    createdAt: row.created_at as string,
  }));
}

// ============================================================================
// Admin Profile Check
// ============================================================================

/**
 * Get admin profile information from profiles table
 * Returns null for non-admin users or if admin columns don't exist yet
 */
export async function getAdminProfile(userId: string): Promise<{
  isAdmin: boolean;
  isSuperAdmin: boolean;
  requires2FA: boolean;
  is2FAEnabled: boolean;
} | null> {
  // Skip if userId is not a valid UUID (e.g., "guest_user")
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!userId || !uuidRegex.test(userId)) {
    return null;
  }

  try {
    // First try to select all admin columns
    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin, is_super_admin, admin_2fa_enabled")
      .eq("id", userId)
      .single();

    if (error) {
      // If columns don't exist (code 42703), return default non-admin
      if (error.code === "42703") {
        return {
          isAdmin: false,
          isSuperAdmin: false,
          requires2FA: false,
          is2FAEnabled: false,
        };
      }
      console.error("Error fetching admin profile:", error);
      return null;
    }

    if (!data) return null;

    return {
      isAdmin: data.is_admin ?? false,
      isSuperAdmin: data.is_super_admin ?? false,
      requires2FA: (data.is_admin || data.is_super_admin) ?? false,
      is2FAEnabled: data.admin_2fa_enabled ?? false,
    };
  } catch (e) {
    console.error("Exception in getAdminProfile:", e);
    return null;
  }
}
