/**
 * Admin Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - Admin role checks (isUserAdmin, isUserSuperAdmin)
 * - User restriction checks
 * - Dashboard statistics
 * - User search and management
 * - User moderation actions (ban, suspend, adjust balance)
 * - Admin role management
 * - Vault statistics and rake settings
 * - Audit log retrieval
 */

import {
  isUserAdmin,
  isUserSuperAdmin,
  checkUserRestriction,
  getDashboardStats,
  searchUsers,
  getUserDetails,
  banUser,
  unbanUser,
  suspendUser,
  unsuspendUser,
  adjustBalance,
  grantAdminRole,
  revokeAdminRole,
  getVaultBalances,
  getVaultStatistics,
  getRakeSettings,
  updateRakeSettings,
  getAuditLog,
  getAdminProfile,
} from "@/lib/admin";

// ============================================================================
// Mock Supabase
// ============================================================================

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Setup chained mock methods
mockFrom.mockReturnValue({
  select: mockSelect,
});

mockSelect.mockReturnValue({
  eq: mockEq,
});

mockEq.mockReturnValue({
  single: mockSingle,
});

// ============================================================================
// Test Utilities
// ============================================================================

const resetMocks = () => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockSingle.mockReset();

  // Re-setup chain
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
};

// ============================================================================
// Admin Role Check Tests
// ============================================================================

describe("isUserAdmin", () => {
  beforeEach(resetMocks);

  it("should return true when user is admin", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await isUserAdmin("user-123");

    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_user_admin", { p_user_id: "user-123" });
  });

  it("should return false when user is not admin", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await isUserAdmin("user-456");

    expect(result).toBe(false);
  });

  it("should return false on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Database error" } });

    const result = await isUserAdmin("user-789");

    expect(result).toBe(false);
  });
});

describe("isUserSuperAdmin", () => {
  beforeEach(resetMocks);

  it("should return true when user is super admin", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const result = await isUserSuperAdmin("super-admin-123");

    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_user_super_admin", { p_user_id: "super-admin-123" });
  });

  it("should return false when user is regular admin", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const result = await isUserSuperAdmin("admin-123");

    expect(result).toBe(false);
  });

  it("should return false on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Database error" } });

    const result = await isUserSuperAdmin("user-789");

    expect(result).toBe(false);
  });
});

describe("checkUserRestriction", () => {
  beforeEach(resetMocks);

  it("should return banned status for banned user", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        is_restricted: true,
        restriction_type: "banned",
        reason: "Cheating",
        expires_at: null,
      }],
      error: null,
    });

    const result = await checkUserRestriction("banned-user");

    expect(result.isRestricted).toBe(true);
    expect(result.restrictionType).toBe("banned");
    expect(result.reason).toBe("Cheating");
  });

  it("should return suspended status for suspended user", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        is_restricted: true,
        restriction_type: "suspended",
        reason: "Abusive language",
        expires_at: "2024-12-31T23:59:59Z",
      }],
      error: null,
    });

    const result = await checkUserRestriction("suspended-user");

    expect(result.isRestricted).toBe(true);
    expect(result.restrictionType).toBe("suspended");
    expect(result.expiresAt).toBe("2024-12-31T23:59:59Z");
  });

  it("should return not restricted for normal user", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await checkUserRestriction("normal-user");

    expect(result.isRestricted).toBe(false);
    expect(result.restrictionType).toBeNull();
  });

  it("should return not restricted on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await checkUserRestriction("user-123");

    expect(result.isRestricted).toBe(false);
  });
});

// ============================================================================
// Dashboard Statistics Tests
// ============================================================================

describe("getDashboardStats", () => {
  beforeEach(resetMocks);

  it("should return transformed dashboard stats", async () => {
    mockRpc.mockResolvedValue({
      data: {
        users: {
          total: 1000,
          active_today: 150,
          active_week: 500,
          new_today: 10,
          new_week: 50,
          banned: 5,
          suspended: 3,
        },
        games: {
          total: 5000,
          active: 20,
          completed_today: 100,
          completed_week: 700,
        },
        financial: {
          balances: {
            treasury: 10000,
            reward_pool: 2500,
            total: 12500,
          },
          rake: {
            total_collected: 500,
            today: 25,
            this_week: 150,
            this_month: 500,
          },
          settings: {
            rake_percentage: 0.05,
            treasury_split: 0.8,
            reward_pool_split: 0.2,
            min_rake_tct: 0.01,
            rake_on_draws: false,
            enabled: true,
          },
        },
        challenges: {
          pending: 15,
          created_today: 30,
        },
        admins: {
          total_admins: 3,
          super_admins: 1,
          actions_today: 12,
        },
        generated_at: "2024-01-15T10:00:00Z",
      },
      error: null,
    });

    const result = await getDashboardStats();

    expect(result).not.toBeNull();
    expect(result?.users.total).toBe(1000);
    expect(result?.users.activeToday).toBe(150);
    expect(result?.games.completedWeek).toBe(700);
    expect(result?.financial.balances.treasury).toBe(10000);
    expect(result?.financial.rake.totalCollected).toBe(500);
    expect(result?.financial.settings.rakePercentage).toBe(0.05);
    expect(result?.admins.totalAdmins).toBe(3);
  });

  it("should return null on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getDashboardStats();

    expect(result).toBeNull();
  });

  it("should handle missing data gracefully with defaults", async () => {
    mockRpc.mockResolvedValue({
      data: {
        users: {},
        games: {},
        financial: {},
        challenges: {},
        admins: {},
      },
      error: null,
    });

    const result = await getDashboardStats();

    expect(result?.users.total).toBe(0);
    expect(result?.games.active).toBe(0);
    expect(result?.financial.settings.rakePercentage).toBe(0.05);
  });
});

// ============================================================================
// User Management Tests
// ============================================================================

describe("searchUsers", () => {
  beforeEach(resetMocks);

  it("should return transformed user list", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "user-1",
          username: "player1",
          email: "player1@test.com",
          elo_rating: 1500,
          games_played: 100,
          games_won: 60,
          is_admin: false,
          is_super_admin: false,
          is_banned: false,
          ban_reason: null,
          is_suspended: false,
          suspension_reason: null,
          available_tct: 100,
          locked_tct: 0,
          created_at: "2024-01-01T00:00:00Z",
          last_seen_at: "2024-01-15T10:00:00Z",
        },
      ],
      error: null,
    });

    const result = await searchUsers({ searchTerm: "player" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("user-1");
    expect(result[0].username).toBe("player1");
    expect(result[0].eloRating).toBe(1500);
    expect(result[0].gamesPlayed).toBe(100);
  });

  it("should pass correct filter parameters", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchUsers({
      searchTerm: "test",
      filterBanned: true,
      filterSuspended: false,
      filterAdmin: true,
      orderBy: "elo_rating",
      orderDir: "DESC",
      limit: 25,
      offset: 50,
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_search_users", {
      p_search_term: "test",
      p_filter_banned: true,
      p_filter_suspended: false,
      p_filter_admin: true,
      p_order_by: "elo_rating",
      p_order_dir: "DESC",
      p_limit: 25,
      p_offset: 50,
    });
  });

  it("should return empty array on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await searchUsers({});

    expect(result).toEqual([]);
  });
});

describe("getUserDetails", () => {
  beforeEach(resetMocks);

  it("should return transformed user details", async () => {
    mockRpc.mockResolvedValue({
      data: {
        profile: {
          id: "user-1",
          username: "player1",
          email: "player1@test.com",
          elo_rating: 1500,
          games_played: 100,
          games_won: 60,
          games_lost: 35,
          games_drawn: 5,
          current_streak: 3,
          longest_streak: 10,
          created_at: "2024-01-01T00:00:00Z",
          last_seen_at: "2024-01-15T10:00:00Z",
        },
        admin_status: {
          is_admin: false,
          is_super_admin: false,
          admin_2fa_enabled: false,
        },
        restrictions: {
          is_banned: false,
          ban_reason: null,
          banned_at: null,
          ban_expires_at: null,
          is_suspended: false,
          suspension_reason: null,
          suspended_at: null,
          suspension_expires_at: null,
        },
        balance: {
          available_tct: 100,
          locked_tct: 0,
          total_deposited_tct: 200,
          total_withdrawn_tct: 50,
          total_won_tct: 80,
          total_lost_tct: 30,
          total_commission_paid_tct: 5,
        },
        recent_games: [
          { id: "game-1", opponent_id: "opp-1", result: "win", wager_tct: 10, ended_at: "2024-01-15T09:00:00Z" },
        ],
        recent_transactions: [
          { id: "tx-1", type: "deposit", amount_tct: 50, description: "Crypto deposit", created_at: "2024-01-14T00:00:00Z" },
        ],
        admin_notes: null,
      },
      error: null,
    });

    const result = await getUserDetails("user-1");

    expect(result).not.toBeNull();
    expect(result?.profile.username).toBe("player1");
    expect(result?.balance.availableTCT).toBe(100);
    expect(result?.recentGames).toHaveLength(1);
    expect(result?.recentTransactions).toHaveLength(1);
  });

  it("should return null on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getUserDetails("user-1");

    expect(result).toBeNull();
  });

  it("should return null when data has error field", async () => {
    mockRpc.mockResolvedValue({ data: { error: "User not found" }, error: null });

    const result = await getUserDetails("nonexistent");

    expect(result).toBeNull();
  });
});

// ============================================================================
// User Moderation Action Tests
// ============================================================================

describe("banUser", () => {
  beforeEach(resetMocks);

  it("should call ban RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true, userId: "user-1" }, error: null });

    const result = await banUser("admin-1", {
      targetUserId: "user-1",
      reason: "Cheating",
      durationDays: 7,
      notes: "First offense",
    });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_ban_user", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-1",
      p_reason: "Cheating",
      p_duration_days: 7,
      p_notes: "First offense",
    });
  });

  it("should handle permanent ban (no duration)", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await banUser("admin-1", {
      targetUserId: "user-1",
      reason: "Multiple offenses",
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_ban_user", expect.objectContaining({
      p_duration_days: null,
    }));
  });

  it("should return error on failure", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Insufficient permissions" } });

    const result = await banUser("admin-1", {
      targetUserId: "user-1",
      reason: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Insufficient permissions");
  });
});

describe("unbanUser", () => {
  beforeEach(resetMocks);

  it("should call unban RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await unbanUser("admin-1", "user-1", "Appeal approved");

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_unban_user", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-1",
      p_reason: "Appeal approved",
    });
  });

  it("should use default reason if not provided", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await unbanUser("admin-1", "user-1");

    expect(mockRpc).toHaveBeenCalledWith("admin_unban_user", expect.objectContaining({
      p_reason: "Admin unbanned user",
    }));
  });
});

describe("suspendUser", () => {
  beforeEach(resetMocks);

  it("should call suspend RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await suspendUser("admin-1", {
      targetUserId: "user-1",
      reason: "Abusive language",
      durationHours: 48,
      notes: "Warning issued",
    });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_suspend_user", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-1",
      p_reason: "Abusive language",
      p_duration_hours: 48,
      p_notes: "Warning issued",
    });
  });

  it("should use default 24 hours if not provided", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await suspendUser("admin-1", {
      targetUserId: "user-1",
      reason: "Test",
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_suspend_user", expect.objectContaining({
      p_duration_hours: 24,
    }));
  });
});

describe("unsuspendUser", () => {
  beforeEach(resetMocks);

  it("should call unsuspend RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await unsuspendUser("admin-1", "user-1", "Behavior improved");

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_unsuspend_user", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-1",
      p_reason: "Behavior improved",
    });
  });
});

describe("adjustBalance", () => {
  beforeEach(resetMocks);

  it("should call adjust balance RPC for credit", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await adjustBalance("admin-1", {
      targetUserId: "user-1",
      amountTCT: 100,
      reason: "Compensation for bug",
      adjustmentType: "compensation",
      notes: "Ticket #123",
    });

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_adjust_balance", {
      p_admin_id: "admin-1",
      p_target_user_id: "user-1",
      p_amount_tct: 100,
      p_reason: "Compensation for bug",
      p_adjustment_type: "compensation",
      p_notes: "Ticket #123",
    });
  });

  it("should call adjust balance RPC for debit", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await adjustBalance("admin-1", {
      targetUserId: "user-1",
      amountTCT: -50,
      reason: "Penalty",
      adjustmentType: "penalty",
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_adjust_balance", expect.objectContaining({
      p_amount_tct: -50,
      p_adjustment_type: "penalty",
    }));
  });

  it("should use default adjustment type", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await adjustBalance("admin-1", {
      targetUserId: "user-1",
      amountTCT: 10,
      reason: "Correction",
    });

    expect(mockRpc).toHaveBeenCalledWith("admin_adjust_balance", expect.objectContaining({
      p_adjustment_type: "adjustment",
    }));
  });
});

// ============================================================================
// Admin Role Management Tests
// ============================================================================

describe("grantAdminRole", () => {
  beforeEach(resetMocks);

  it("should call grant admin RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await grantAdminRole("super-admin-1", "user-1", "Promoted to moderator");

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_grant_admin", {
      p_super_admin_id: "super-admin-1",
      p_target_user_id: "user-1",
      p_reason: "Promoted to moderator",
    });
  });

  it("should use default reason if not provided", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    await grantAdminRole("super-admin-1", "user-1");

    expect(mockRpc).toHaveBeenCalledWith("admin_grant_admin", expect.objectContaining({
      p_reason: "Granted admin privileges",
    }));
  });
});

describe("revokeAdminRole", () => {
  beforeEach(resetMocks);

  it("should call revoke admin RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await revokeAdminRole("super-admin-1", "admin-1", "Stepped down");

    expect(result.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_revoke_admin", {
      p_super_admin_id: "super-admin-1",
      p_target_user_id: "admin-1",
      p_reason: "Stepped down",
    });
  });
});

// ============================================================================
// Vault Statistics Tests
// ============================================================================

describe("getVaultBalances", () => {
  beforeEach(resetMocks);

  it("should return transformed vault balances", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        treasury_balance_tct: 10000,
        reward_pool_balance_tct: 2500,
        total_rake_collected_tct: 500,
        total_games_settled: 1000,
        total_draw_refunds_tct: 25,
      }],
      error: null,
    });

    const result = await getVaultBalances();

    expect(result).not.toBeNull();
    expect(result?.treasuryBalanceTCT).toBe(10000);
    expect(result?.rewardPoolBalanceTCT).toBe(2500);
    expect(result?.totalRakeCollectedTCT).toBe(500);
    expect(result?.totalGamesSettled).toBe(1000);
  });

  it("should return null on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getVaultBalances();

    expect(result).toBeNull();
  });

  it("should return null for empty data", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await getVaultBalances();

    expect(result).toBeNull();
  });
});

describe("getVaultStatistics", () => {
  beforeEach(resetMocks);

  it("should return vault statistics array", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { stat_name: "Total Rake", stat_value: 500, stat_unit: "TCT" },
        { stat_name: "Games Settled", stat_value: 1000, stat_unit: "count" },
      ],
      error: null,
    });

    const result = await getVaultStatistics();

    expect(result).toHaveLength(2);
    expect(result[0].statName).toBe("Total Rake");
    expect(result[0].statValue).toBe(500);
    expect(result[0].statUnit).toBe("TCT");
  });

  it("should pass date range parameters", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await getVaultStatistics("2024-01-01", "2024-01-31");

    expect(mockRpc).toHaveBeenCalledWith("get_vault_statistics", {
      p_start_date: "2024-01-01",
      p_end_date: "2024-01-31",
    });
  });

  it("should return empty array on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getVaultStatistics();

    expect(result).toEqual([]);
  });
});

describe("getRakeSettings", () => {
  beforeEach(resetMocks);

  it("should return rake settings", async () => {
    mockRpc.mockResolvedValue({
      data: {
        rake_percentage: 0.05,
        treasury_split: 0.8,
        reward_pool_split: 0.2,
        min_rake_tct: 0.01,
        rake_on_draws: false,
        enabled: true,
      },
      error: null,
    });

    const result = await getRakeSettings();

    expect(result).not.toBeNull();
    expect(result?.rakePercentage).toBe(0.05);
    expect(result?.treasurySplit).toBe(0.8);
    expect(result?.rewardPoolSplit).toBe(0.2);
    expect(result?.enabled).toBe(true);
  });

  it("should return null on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getRakeSettings();

    expect(result).toBeNull();
  });
});

describe("updateRakeSettings", () => {
  beforeEach(resetMocks);

  it("should update and return new rake settings", async () => {
    mockRpc.mockResolvedValue({
      data: {
        rake_percentage: 0.04,
        treasury_split: 0.75,
        reward_pool_split: 0.25,
        min_rake_tct: 0.02,
        rake_on_draws: false,
        enabled: true,
      },
      error: null,
    });

    const result = await updateRakeSettings("admin-1", {
      rakePercentage: 0.04,
      treasurySplit: 0.75,
      rewardPoolSplit: 0.25,
    });

    expect(result).not.toBeNull();
    expect(result?.rakePercentage).toBe(0.04);
    expect(mockRpc).toHaveBeenCalledWith("admin_update_rake_settings", {
      p_admin_id: "admin-1",
      p_rake_percentage: 0.04,
      p_treasury_split: 0.75,
      p_reward_pool_split: 0.25,
      p_min_rake_tct: null,
      p_enabled: null,
    });
  });

  it("should return null on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Not authorized" } });

    const result = await updateRakeSettings("admin-1", { rakePercentage: 0.1 });

    expect(result).toBeNull();
  });
});

// ============================================================================
// Audit Log Tests
// ============================================================================

describe("getAuditLog", () => {
  beforeEach(resetMocks);

  it("should return transformed audit log entries", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "log-1",
          actor_id: "admin-1",
          operation: "user_ban",
          affected_table: "profiles",
          change_summary: { reason: "Cheating" },
          created_at: "2024-01-15T10:00:00Z",
        },
      ],
      error: null,
    });

    const result = await getAuditLog(50, 0, "user_ban");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("log-1");
    expect(result[0].adminId).toBe("admin-1");
    expect(result[0].actionType).toBe("user_ban");
  });

  it("should pass correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await getAuditLog(100, 50, "config_update");

    expect(mockRpc).toHaveBeenCalledWith("admin_get_audit_trail", {
      p_limit: 100,
      p_offset: 50,
      p_operation: "config_update",
      p_start_date: null,
      p_end_date: null,
    });
  });

  it("should return empty array on error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Error" } });

    const result = await getAuditLog();

    expect(result).toEqual([]);
  });
});

// ============================================================================
// Admin Profile Tests
// ============================================================================

describe("getAdminProfile", () => {
  beforeEach(resetMocks);

  it("should return admin profile", async () => {
    mockSingle.mockResolvedValue({
      data: {
        is_admin: true,
        is_super_admin: false,
        admin_2fa_enabled: true,
      },
      error: null,
    });

    const result = await getAdminProfile("admin-1");

    expect(result).not.toBeNull();
    expect(result?.isAdmin).toBe(true);
    expect(result?.isSuperAdmin).toBe(false);
    expect(result?.requires2FA).toBe(true);
    expect(result?.is2FAEnabled).toBe(true);
  });

  it("should return super admin profile", async () => {
    mockSingle.mockResolvedValue({
      data: {
        is_admin: true,
        is_super_admin: true,
        admin_2fa_enabled: true,
      },
      error: null,
    });

    const result = await getAdminProfile("super-admin-1");

    expect(result?.isAdmin).toBe(true);
    expect(result?.isSuperAdmin).toBe(true);
    expect(result?.requires2FA).toBe(true);
  });

  it("should return profile for non-admin user", async () => {
    mockSingle.mockResolvedValue({
      data: {
        is_admin: false,
        is_super_admin: false,
        admin_2fa_enabled: false,
      },
      error: null,
    });

    const result = await getAdminProfile("user-1");

    expect(result?.isAdmin).toBe(false);
    expect(result?.requires2FA).toBe(false);
  });

  it("should return null on error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const result = await getAdminProfile("nonexistent");

    expect(result).toBeNull();
  });
});
