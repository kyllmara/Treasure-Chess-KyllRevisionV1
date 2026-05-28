/**
 * useAdmin Hook
 *
 * Provides admin functionality including role checks, user management,
 * vault statistics, and audit logging.
 */

import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import * as adminService from "@/lib/admin";
import type {
  AdminState,
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
  AdminActionSeverity,
} from "@/types/admin";

interface UseAdminReturn extends AdminState {
  // Dashboard
  loadDashboardStats: () => Promise<void>;
  refreshDashboardStats: () => Promise<void>;

  // User Management
  searchUsers: (filters: UserSearchFilters) => Promise<AdminUserListItem[]>;
  getUserDetails: (userId: string) => Promise<AdminUserDetails | null>;
  banUser: (params: BanUserParams) => Promise<AdminActionResult>;
  unbanUser: (userId: string, reason?: string) => Promise<AdminActionResult>;
  suspendUser: (params: SuspendUserParams) => Promise<AdminActionResult>;
  unsuspendUser: (userId: string, reason?: string) => Promise<AdminActionResult>;
  adjustBalance: (params: AdjustBalanceParams) => Promise<AdminActionResult>;

  // Admin Management (super admin only)
  grantAdminRole: (userId: string, reason?: string) => Promise<AdminActionResult>;
  revokeAdminRole: (userId: string, reason?: string) => Promise<AdminActionResult>;
  grantSuperAdminRole: (userId: string, reason?: string) => Promise<AdminActionResult>;

  // Vault Management
  getVaultBalances: () => Promise<VaultBalances | null>;
  getVaultStatistics: (startDate?: string, endDate?: string) => Promise<VaultStatisticEntry[]>;
  getRakeSettings: () => Promise<RakeSettings | null>;
  updateRakeSettings: (params: UpdateRakeSettingsParams) => Promise<RakeSettings | null>;

  // Audit
  getAuditLog: (
    limit?: number,
    offset?: number,
    actionType?: AdminActionType
  ) => Promise<AdminAuditLogEntry[]>;

  // 2FA
  verify2FA: () => Promise<boolean>;
  require2FAForAction: (actionSeverity: AdminActionSeverity) => boolean;

  // Utilities
  clearError: () => void;
  checkAdminStatus: () => Promise<void>;
}

export function useAdmin(): UseAdminReturn {
  const { user, profile } = useAuth();

  const [state, setState] = useState<AdminState>({
    isLoading: false,
    isAdmin: false,
    isSuperAdmin: false,
    requires2FA: false,
    is2FAVerified: false,
    adminProfile: null,
    dashboardStats: null,
    error: null,
  });

  // Get admin ID from auth
  const adminId = useMemo(() => user?.id ?? null, [user]);

  // Check admin status
  const checkAdminStatus = useCallback(async () => {
    if (!adminId) {
      setState((prev) => ({
        ...prev,
        isAdmin: false,
        isSuperAdmin: false,
        requires2FA: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const adminProfile = await adminService.getAdminProfile(adminId);

      if (adminProfile) {
        setState((prev) => ({
          ...prev,
          isAdmin: adminProfile.isAdmin,
          isSuperAdmin: adminProfile.isSuperAdmin,
          requires2FA: adminProfile.requires2FA,
          isLoading: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isAdmin: false,
          isSuperAdmin: false,
          requires2FA: false,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      setState((prev) => ({
        ...prev,
        isAdmin: false,
        isSuperAdmin: false,
        requires2FA: false,
        isLoading: false,
        error: "Failed to check admin status",
      }));
    }
  }, [adminId]);

  // Dashboard
  const loadDashboardStats = useCallback(async () => {
    if (!adminId) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const stats = await adminService.getDashboardStats();
      setState((prev) => ({
        ...prev,
        dashboardStats: stats,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Failed to load dashboard statistics",
      }));
    }
  }, [adminId]);

  const refreshDashboardStats = useCallback(async () => {
    await loadDashboardStats();
  }, [loadDashboardStats]);

  // User Management
  const searchUsers = useCallback(
    async (filters: UserSearchFilters): Promise<AdminUserListItem[]> => {
      return adminService.searchUsers(filters);
    },
    []
  );

  const getUserDetails = useCallback(
    async (userId: string): Promise<AdminUserDetails | null> => {
      return adminService.getUserDetails(userId);
    },
    []
  );

  const banUser = useCallback(
    async (params: BanUserParams): Promise<AdminActionResult> => {
      if (!adminId) {
        return { success: false, error: "Unauthorized" };
      }

      // Banning requires super admin for permanent bans
      if (!params.durationDays && !state.isSuperAdmin) {
        return { success: false, error: "Permanent bans require super admin privileges" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.banUser(adminId, params);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to ban user";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId, state.isSuperAdmin]
  );

  const unbanUser = useCallback(
    async (userId: string, reason?: string): Promise<AdminActionResult> => {
      if (!adminId) {
        return { success: false, error: "Unauthorized" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.unbanUser(adminId, userId, reason);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to unban user";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId]
  );

  const suspendUser = useCallback(
    async (params: SuspendUserParams): Promise<AdminActionResult> => {
      if (!adminId) {
        return { success: false, error: "Unauthorized" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.suspendUser(adminId, params);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to suspend user";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId]
  );

  const unsuspendUser = useCallback(
    async (userId: string, reason?: string): Promise<AdminActionResult> => {
      if (!adminId) {
        return { success: false, error: "Unauthorized" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.unsuspendUser(adminId, userId, reason);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to unsuspend user";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId]
  );

  const adjustBalance = useCallback(
    async (params: AdjustBalanceParams): Promise<AdminActionResult> => {
      if (!adminId) {
        return { success: false, error: "Unauthorized" };
      }

      // Large adjustments require super admin
      if (Math.abs(params.amountTCT) > 100 && !state.isSuperAdmin) {
        return { success: false, error: "Adjustments over 100 TCT require super admin privileges" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.adjustBalance(adminId, params);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to adjust balance";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId, state.isSuperAdmin]
  );

  // Admin Management
  const grantAdminRole = useCallback(
    async (userId: string, reason?: string): Promise<AdminActionResult> => {
      if (!adminId || !state.isSuperAdmin) {
        return { success: false, error: "Super admin privileges required" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.grantAdminRole(adminId, userId, reason);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to grant admin role";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId, state.isSuperAdmin]
  );

  const revokeAdminRole = useCallback(
    async (userId: string, reason?: string): Promise<AdminActionResult> => {
      if (!adminId || !state.isSuperAdmin) {
        return { success: false, error: "Super admin privileges required" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.revokeAdminRole(adminId, userId, reason);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to revoke admin role";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId, state.isSuperAdmin]
  );

  const grantSuperAdminRole = useCallback(
    async (userId: string, reason?: string): Promise<AdminActionResult> => {
      if (!adminId || !state.isSuperAdmin) {
        return { success: false, error: "Super admin privileges required" };
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.grantSuperAdminRole(adminId, userId, reason);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to grant super admin role";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    },
    [adminId, state.isSuperAdmin]
  );

  // Vault Management
  const getVaultBalances = useCallback(async (): Promise<VaultBalances | null> => {
    return adminService.getVaultBalances();
  }, []);

  const getVaultStatistics = useCallback(
    async (startDate?: string, endDate?: string): Promise<VaultStatisticEntry[]> => {
      return adminService.getVaultStatistics(startDate, endDate);
    },
    []
  );

  const getRakeSettings = useCallback(async (): Promise<RakeSettings | null> => {
    return adminService.getRakeSettings();
  }, []);

  const updateRakeSettings = useCallback(
    async (params: UpdateRakeSettingsParams): Promise<RakeSettings | null> => {
      if (!adminId || !state.isSuperAdmin) {
        setState((prev) => ({ ...prev, error: "Super admin privileges required" }));
        return null;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const result = await adminService.updateRakeSettings(adminId, params);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to update rake settings";
        setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
        return null;
      }
    },
    [adminId, state.isSuperAdmin]
  );

  // Audit
  const getAuditLog = useCallback(
    async (
      limit?: number,
      offset?: number,
      actionType?: AdminActionType
    ): Promise<AdminAuditLogEntry[]> => {
      return adminService.getAuditLog(limit, offset, actionType);
    },
    []
  );

  // 2FA
  const verify2FA = useCallback(async (): Promise<boolean> => {
    // In a real implementation, this would trigger biometric auth
    // For now, we'll mark as verified
    setState((prev) => ({ ...prev, is2FAVerified: true }));
    return true;
  }, []);

  const require2FAForAction = useCallback(
    (actionSeverity: AdminActionSeverity): boolean => {
      // Require 2FA for high and critical actions
      if (actionSeverity === "high" || actionSeverity === "critical") {
        return state.requires2FA && !state.is2FAVerified;
      }
      return false;
    },
    [state.requires2FA, state.is2FAVerified]
  );

  // Utilities
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    loadDashboardStats,
    refreshDashboardStats,
    searchUsers,
    getUserDetails,
    banUser,
    unbanUser,
    suspendUser,
    unsuspendUser,
    adjustBalance,
    grantAdminRole,
    revokeAdminRole,
    grantSuperAdminRole,
    getVaultBalances,
    getVaultStatistics,
    getRakeSettings,
    updateRakeSettings,
    getAuditLog,
    verify2FA,
    require2FAForAction,
    clearError,
    checkAdminStatus,
  };
}

export type { UseAdminReturn };
