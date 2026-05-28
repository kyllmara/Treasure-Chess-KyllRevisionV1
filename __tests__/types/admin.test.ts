/**
 * Admin Type Definitions Tests
 *
 * Validates type structures and constants for:
 * - Admin roles and permissions
 * - User restriction types
 * - Admin action types
 * - Dashboard statistics types
 * - User management types
 * - Vault statistics types
 * - Admin permission matrix
 */

import type {
  AdminRole,
  AdminStatus,
  RestrictionType,
  UserRestriction,
  BanInfo,
  SuspensionInfo,
  AdminActionType,
  AdminActionSeverity,
  AdminAuditLogEntry,
  UserStats,
  GameStats,
  FinancialStats,
  ChallengeStats,
  AdminStats,
  DashboardStats,
  AdminUserListItem,
  AdminUserDetails,
  UserSearchFilters,
  BanUserParams,
  SuspendUserParams,
  AdjustBalanceParams,
  AdminActionResult,
  VaultBalances,
  VaultStatisticEntry,
  RakeSettings,
  UpdateRakeSettingsParams,
  AdminSession,
  AdminState,
} from "@/types/admin";

import {
  ADMIN_ROUTES,
  ADMIN_PERMISSIONS,
} from "@/types/admin";

// ============================================================================
// Admin Role Type Tests
// ============================================================================

describe("AdminRole type", () => {
  it("should accept valid admin roles", () => {
    const userRole: AdminRole = "user";
    const adminRole: AdminRole = "admin";
    const superAdminRole: AdminRole = "super_admin";

    expect(userRole).toBe("user");
    expect(adminRole).toBe("admin");
    expect(superAdminRole).toBe("super_admin");
  });
});

describe("AdminStatus interface", () => {
  it("should have correct structure", () => {
    const status: AdminStatus = {
      isAdmin: true,
      isSuperAdmin: false,
      requires2FA: true,
      is2FAVerified: false,
    };

    expect(status.isAdmin).toBe(true);
    expect(status.isSuperAdmin).toBe(false);
    expect(status.requires2FA).toBe(true);
    expect(status.is2FAVerified).toBe(false);
  });
});

// ============================================================================
// User Restriction Type Tests
// ============================================================================

describe("RestrictionType type", () => {
  it("should accept valid restriction types", () => {
    const banned: RestrictionType = "banned";
    const suspended: RestrictionType = "suspended";
    const none: RestrictionType = null;

    expect(banned).toBe("banned");
    expect(suspended).toBe("suspended");
    expect(none).toBeNull();
  });
});

describe("UserRestriction interface", () => {
  it("should have correct structure for banned user", () => {
    const restriction: UserRestriction = {
      isRestricted: true,
      restrictionType: "banned",
      reason: "Cheating",
      expiresAt: null,
    };

    expect(restriction.isRestricted).toBe(true);
    expect(restriction.restrictionType).toBe("banned");
    expect(restriction.reason).toBe("Cheating");
  });

  it("should have correct structure for non-restricted user", () => {
    const restriction: UserRestriction = {
      isRestricted: false,
      restrictionType: null,
      reason: null,
      expiresAt: null,
    };

    expect(restriction.isRestricted).toBe(false);
    expect(restriction.restrictionType).toBeNull();
  });
});

describe("BanInfo interface", () => {
  it("should have correct structure for permanent ban", () => {
    const banInfo: BanInfo = {
      isBanned: true,
      banReason: "Cheating",
      bannedAt: "2024-01-15T10:00:00Z",
      bannedBy: "admin-123",
      banExpiresAt: null,
      isPermanent: true,
    };

    expect(banInfo.isBanned).toBe(true);
    expect(banInfo.isPermanent).toBe(true);
    expect(banInfo.banExpiresAt).toBeNull();
  });

  it("should have correct structure for temporary ban", () => {
    const banInfo: BanInfo = {
      isBanned: true,
      banReason: "First offense",
      bannedAt: "2024-01-15T10:00:00Z",
      bannedBy: "admin-123",
      banExpiresAt: "2024-01-22T10:00:00Z",
      isPermanent: false,
    };

    expect(banInfo.isPermanent).toBe(false);
    expect(banInfo.banExpiresAt).not.toBeNull();
  });
});

describe("SuspensionInfo interface", () => {
  it("should have correct structure", () => {
    const suspensionInfo: SuspensionInfo = {
      isSuspended: true,
      suspensionReason: "Abusive language",
      suspendedAt: "2024-01-15T10:00:00Z",
      suspendedBy: "admin-123",
      suspensionExpiresAt: "2024-01-16T10:00:00Z",
    };

    expect(suspensionInfo.isSuspended).toBe(true);
    expect(suspensionInfo.suspensionReason).toBe("Abusive language");
  });
});

// ============================================================================
// Admin Action Type Tests
// ============================================================================

describe("AdminActionType type", () => {
  it("should accept all valid action types", () => {
    const actionTypes: AdminActionType[] = [
      "user_ban",
      "user_unban",
      "user_suspend",
      "user_unsuspend",
      "user_balance_adjust",
      "user_profile_edit",
      "user_password_reset",
      "admin_grant",
      "admin_revoke",
      "super_admin_grant",
      "super_admin_revoke",
      "config_update",
      "rake_settings_update",
      "manual_refund",
      "manual_credit",
      "manual_debit",
      "escrow_force_settle",
      "vault_adjustment",
      "system_maintenance",
      "export_data",
      "view_sensitive_data",
    ];

    expect(actionTypes).toHaveLength(21);
    expect(actionTypes).toContain("user_ban");
    expect(actionTypes).toContain("vault_adjustment");
  });
});

describe("AdminActionSeverity type", () => {
  it("should accept all valid severity levels", () => {
    const low: AdminActionSeverity = "low";
    const medium: AdminActionSeverity = "medium";
    const high: AdminActionSeverity = "high";
    const critical: AdminActionSeverity = "critical";

    expect([low, medium, high, critical]).toEqual(["low", "medium", "high", "critical"]);
  });
});

describe("AdminAuditLogEntry interface", () => {
  it("should have correct structure", () => {
    const entry: AdminAuditLogEntry = {
      id: "log-123",
      adminId: "admin-123",
      adminUsername: "admin_user",
      isSuperAdmin: false,
      actionType: "user_ban",
      actionSeverity: "high",
      targetUserId: "user-456",
      targetUserUsername: "banned_user",
      targetTable: "profiles",
      targetRecordId: "user-456",
      oldValues: { is_banned: false },
      newValues: { is_banned: true },
      reason: "Cheating",
      notes: "First offense",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      deviceInfo: { platform: "iOS" },
      was2FAVerified: true,
      createdAt: "2024-01-15T10:00:00Z",
    };

    expect(entry.id).toBe("log-123");
    expect(entry.actionType).toBe("user_ban");
    expect(entry.actionSeverity).toBe("high");
    expect(entry.was2FAVerified).toBe(true);
  });
});

// ============================================================================
// Dashboard Statistics Type Tests
// ============================================================================

describe("UserStats interface", () => {
  it("should have correct structure", () => {
    const stats: UserStats = {
      total: 10000,
      activeToday: 500,
      activeWeek: 2000,
      newToday: 50,
      newWeek: 300,
      banned: 25,
      suspended: 10,
    };

    expect(stats.total).toBe(10000);
    expect(stats.banned).toBe(25);
  });
});

describe("GameStats interface", () => {
  it("should have correct structure", () => {
    const stats: GameStats = {
      total: 50000,
      active: 100,
      completedToday: 500,
      completedWeek: 3500,
    };

    expect(stats.total).toBe(50000);
    expect(stats.active).toBe(100);
  });
});

describe("FinancialStats interface", () => {
  it("should have correct structure", () => {
    const stats: FinancialStats = {
      balances: {
        treasury: 100000,
        rewardPool: 25000,
        total: 125000,
      },
      rake: {
        totalCollected: 5000,
        today: 250,
        thisWeek: 1500,
        thisMonth: 5000,
      },
      settings: {
        rakePercentage: 0.05,
        treasurySplit: 0.8,
        rewardPoolSplit: 0.2,
        minRakeTCT: 0.01,
        rakeOnDraws: false,
        enabled: true,
      },
    };

    expect(stats.balances.total).toBe(125000);
    expect(stats.rake.totalCollected).toBe(5000);
    expect(stats.settings.rakePercentage).toBe(0.05);
  });
});

describe("DashboardStats interface", () => {
  it("should have correct structure", () => {
    const stats: DashboardStats = {
      users: {
        total: 10000,
        activeToday: 500,
        activeWeek: 2000,
        newToday: 50,
        newWeek: 300,
        banned: 25,
        suspended: 10,
      },
      games: {
        total: 50000,
        active: 100,
        completedToday: 500,
        completedWeek: 3500,
      },
      financial: {
        balances: { treasury: 100000, rewardPool: 25000, total: 125000 },
        rake: { totalCollected: 5000, today: 250, thisWeek: 1500, thisMonth: 5000 },
        settings: {
          rakePercentage: 0.05,
          treasurySplit: 0.8,
          rewardPoolSplit: 0.2,
          minRakeTCT: 0.01,
          rakeOnDraws: false,
          enabled: true,
        },
      },
      challenges: { pending: 50, createdToday: 100 },
      admins: { totalAdmins: 5, superAdmins: 2, actionsToday: 20 },
      generatedAt: "2024-01-15T10:00:00Z",
    };

    expect(stats.users.total).toBe(10000);
    expect(stats.games.active).toBe(100);
    expect(stats.admins.totalAdmins).toBe(5);
  });
});

// ============================================================================
// User Management Type Tests
// ============================================================================

describe("AdminUserListItem interface", () => {
  it("should have correct structure", () => {
    const user: AdminUserListItem = {
      id: "user-123",
      username: "player1",
      email: "player1@test.com",
      eloRating: 1500,
      gamesPlayed: 100,
      gamesWon: 60,
      isAdmin: false,
      isSuperAdmin: false,
      isBanned: false,
      banReason: null,
      isSuspended: false,
      suspensionReason: null,
      availableTCT: 1000,
      lockedTCT: 50,
      createdAt: "2024-01-01T00:00:00Z",
      lastSeenAt: "2024-01-15T10:00:00Z",
    };

    expect(user.username).toBe("player1");
    expect(user.eloRating).toBe(1500);
    expect(user.isBanned).toBe(false);
  });
});

describe("UserSearchFilters interface", () => {
  it("should have correct structure with all optional fields", () => {
    const filters: UserSearchFilters = {
      searchTerm: "test",
      filterBanned: true,
      filterSuspended: false,
      filterAdmin: true,
      orderBy: "elo_rating",
      orderDir: "DESC",
      limit: 25,
      offset: 50,
    };

    expect(filters.searchTerm).toBe("test");
    expect(filters.orderBy).toBe("elo_rating");
    expect(filters.limit).toBe(25);
  });

  it("should accept empty filters object", () => {
    const filters: UserSearchFilters = {};

    expect(filters.searchTerm).toBeUndefined();
    expect(filters.limit).toBeUndefined();
  });
});

// ============================================================================
// Admin Action Parameter Type Tests
// ============================================================================

describe("BanUserParams interface", () => {
  it("should have correct structure for permanent ban", () => {
    const params: BanUserParams = {
      targetUserId: "user-123",
      reason: "Cheating",
      notes: "Multiple offenses",
    };

    expect(params.targetUserId).toBe("user-123");
    expect(params.reason).toBe("Cheating");
    expect(params.durationDays).toBeUndefined();
  });

  it("should have correct structure for temporary ban", () => {
    const params: BanUserParams = {
      targetUserId: "user-123",
      reason: "First offense",
      durationDays: 7,
    };

    expect(params.durationDays).toBe(7);
  });
});

describe("SuspendUserParams interface", () => {
  it("should have correct structure", () => {
    const params: SuspendUserParams = {
      targetUserId: "user-123",
      reason: "Abusive language",
      durationHours: 24,
      notes: "Warning issued",
    };

    expect(params.durationHours).toBe(24);
  });
});

describe("AdjustBalanceParams interface", () => {
  it("should have correct structure for credit", () => {
    const params: AdjustBalanceParams = {
      targetUserId: "user-123",
      amountTCT: 100,
      reason: "Compensation",
      adjustmentType: "compensation",
      notes: "Bug ticket #123",
    };

    expect(params.amountTCT).toBe(100);
    expect(params.adjustmentType).toBe("compensation");
  });

  it("should have correct structure for debit", () => {
    const params: AdjustBalanceParams = {
      targetUserId: "user-123",
      amountTCT: -50,
      reason: "Penalty",
      adjustmentType: "penalty",
    };

    expect(params.amountTCT).toBe(-50);
    expect(params.adjustmentType).toBe("penalty");
  });

  it("should accept all adjustment types", () => {
    const types: AdjustBalanceParams["adjustmentType"][] = [
      "adjustment",
      "compensation",
      "refund",
      "correction",
      "penalty",
    ];

    expect(types).toHaveLength(5);
  });
});

describe("AdminActionResult interface", () => {
  it("should have correct structure for success", () => {
    const result: AdminActionResult = {
      success: true,
      userId: "user-123",
      username: "player1",
    };

    expect(result.success).toBe(true);
    expect(result.userId).toBe("user-123");
  });

  it("should have correct structure for failure", () => {
    const result: AdminActionResult = {
      success: false,
      error: "Insufficient permissions",
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient permissions");
  });
});

// ============================================================================
// Vault Statistics Type Tests
// ============================================================================

describe("VaultBalances interface", () => {
  it("should have correct structure", () => {
    const balances: VaultBalances = {
      treasuryBalanceTCT: 100000,
      rewardPoolBalanceTCT: 25000,
      totalRakeCollectedTCT: 5000,
      totalGamesSettled: 10000,
      totalDrawRefundsTCT: 250,
    };

    expect(balances.treasuryBalanceTCT).toBe(100000);
    expect(balances.totalGamesSettled).toBe(10000);
  });
});

describe("VaultStatisticEntry interface", () => {
  it("should have correct structure", () => {
    const entry: VaultStatisticEntry = {
      statName: "Total Rake Collected",
      statValue: 5000,
      statUnit: "TCT",
    };

    expect(entry.statName).toBe("Total Rake Collected");
    expect(entry.statValue).toBe(5000);
    expect(entry.statUnit).toBe("TCT");
  });
});

describe("RakeSettings interface", () => {
  it("should have correct structure", () => {
    const settings: RakeSettings = {
      rakePercentage: 0.05,
      treasurySplit: 0.8,
      rewardPoolSplit: 0.2,
      minRakeTCT: 0.01,
      rakeOnDraws: false,
      enabled: true,
    };

    expect(settings.rakePercentage).toBe(0.05);
    expect(settings.treasurySplit + settings.rewardPoolSplit).toBe(1);
    expect(settings.enabled).toBe(true);
  });
});

describe("UpdateRakeSettingsParams interface", () => {
  it("should accept partial updates", () => {
    const params: UpdateRakeSettingsParams = {
      rakePercentage: 0.04,
    };

    expect(params.rakePercentage).toBe(0.04);
    expect(params.treasurySplit).toBeUndefined();
  });

  it("should accept all fields", () => {
    const params: UpdateRakeSettingsParams = {
      rakePercentage: 0.04,
      treasurySplit: 0.75,
      rewardPoolSplit: 0.25,
      minRakeTCT: 0.02,
      enabled: false,
    };

    expect(params.enabled).toBe(false);
  });
});

// ============================================================================
// Admin Session Type Tests
// ============================================================================

describe("AdminSession interface", () => {
  it("should have correct structure", () => {
    const session: AdminSession = {
      id: "session-123",
      adminId: "admin-123",
      sessionToken: "token-abc",
      is2FAVerified: true,
      verifiedAt: "2024-01-15T10:00:00Z",
      verificationMethod: "biometric",
      deviceId: "device-123",
      deviceInfo: { platform: "iOS", model: "iPhone 15" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      createdAt: "2024-01-15T09:00:00Z",
      expiresAt: "2024-01-15T21:00:00Z",
      lastActivityAt: "2024-01-15T10:30:00Z",
      revokedAt: null,
      revokedReason: null,
    };

    expect(session.is2FAVerified).toBe(true);
    expect(session.verificationMethod).toBe("biometric");
  });

  it("should accept all verification methods", () => {
    const methods: AdminSession["verificationMethod"][] = [
      "2fa",
      "biometric",
      "pin",
      null,
    ];

    expect(methods).toHaveLength(4);
  });
});

// ============================================================================
// Admin State Type Tests
// ============================================================================

describe("AdminState interface", () => {
  it("should have correct structure", () => {
    const state: AdminState = {
      isLoading: false,
      isAdmin: true,
      isSuperAdmin: false,
      requires2FA: true,
      is2FAVerified: true,
      adminProfile: null,
      dashboardStats: null,
      error: null,
    };

    expect(state.isAdmin).toBe(true);
    expect(state.isSuperAdmin).toBe(false);
    expect(state.is2FAVerified).toBe(true);
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("ADMIN_ROUTES constant", () => {
  it("should contain all admin routes", () => {
    expect(ADMIN_ROUTES).toContain("/admin");
    expect(ADMIN_ROUTES).toContain("/admin/dashboard");
    expect(ADMIN_ROUTES).toContain("/admin/users");
    expect(ADMIN_ROUTES).toContain("/admin/vault");
    expect(ADMIN_ROUTES).toContain("/admin/audit");
    expect(ADMIN_ROUTES).toContain("/admin/settings");
  });

  it("should have correct length", () => {
    expect(ADMIN_ROUTES).toHaveLength(6);
  });
});

describe("ADMIN_PERMISSIONS constant", () => {
  it("should have admin permissions", () => {
    expect(ADMIN_PERMISSIONS.admin).toContain("view_dashboard");
    expect(ADMIN_PERMISSIONS.admin).toContain("search_users");
    expect(ADMIN_PERMISSIONS.admin).toContain("view_user_details");
    expect(ADMIN_PERMISSIONS.admin).toContain("suspend_user");
    expect(ADMIN_PERMISSIONS.admin).toContain("unsuspend_user");
    expect(ADMIN_PERMISSIONS.admin).toContain("adjust_balance_small");
    expect(ADMIN_PERMISSIONS.admin).toContain("view_audit_log");
    expect(ADMIN_PERMISSIONS.admin).toContain("view_vault_stats");
  });

  it("should have super admin permissions", () => {
    expect(ADMIN_PERMISSIONS.super_admin).toContain("ban_user");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("unban_user");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("adjust_balance_large");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("grant_admin");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("revoke_admin");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("update_rake_settings");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("export_data");
    expect(ADMIN_PERMISSIONS.super_admin).toContain("force_settle_escrow");
  });

  it("should have separate permissions for admin and super_admin", () => {
    // Admin should NOT have super_admin permissions
    expect(ADMIN_PERMISSIONS.admin).not.toContain("ban_user");
    expect(ADMIN_PERMISSIONS.admin).not.toContain("grant_admin");
    expect(ADMIN_PERMISSIONS.admin).not.toContain("update_rake_settings");
  });
});
