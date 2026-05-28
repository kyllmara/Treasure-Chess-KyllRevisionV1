/**
 * Admin Type Definitions
 *
 * Comprehensive type system for admin panel functionality.
 * Used throughout the admin screens and components.
 */

// ============================================================================
// Admin Role Types
// ============================================================================

export type AdminRole = 'user' | 'admin' | 'super_admin';

export interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  requires2FA: boolean;
  is2FAVerified: boolean;
}

// ============================================================================
// User Restriction Types
// ============================================================================

export type RestrictionType = 'banned' | 'suspended' | null;

export interface UserRestriction {
  isRestricted: boolean;
  restrictionType: RestrictionType;
  reason: string | null;
  expiresAt: string | null;
}

export interface BanInfo {
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  bannedBy: string | null;
  banExpiresAt: string | null;
  isPermanent: boolean;
}

export interface SuspensionInfo {
  isSuspended: boolean;
  suspensionReason: string | null;
  suspendedAt: string | null;
  suspendedBy: string | null;
  suspensionExpiresAt: string | null;
}

// ============================================================================
// Admin Action Types
// ============================================================================

export type AdminActionType =
  | 'user_ban'
  | 'user_unban'
  | 'user_suspend'
  | 'user_unsuspend'
  | 'user_balance_adjust'
  | 'user_profile_edit'
  | 'user_password_reset'
  | 'admin_grant'
  | 'admin_revoke'
  | 'super_admin_grant'
  | 'super_admin_revoke'
  | 'config_update'
  | 'rake_settings_update'
  | 'manual_refund'
  | 'manual_credit'
  | 'manual_debit'
  | 'escrow_force_settle'
  | 'vault_adjustment'
  | 'system_maintenance'
  | 'export_data'
  | 'view_sensitive_data'
  // House Challenge Actions
  | 'house_challenge_create'
  | 'house_challenge_update'
  | 'house_challenge_delete'
  | 'house_challenge_attempt_payout';

export type AdminActionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AdminAuditLogEntry {
  id: string;
  adminId: string;
  adminUsername: string;
  isSuperAdmin: boolean;
  actionType: AdminActionType;
  actionSeverity: AdminActionSeverity;
  targetUserId: string | null;
  targetUserUsername: string | null;
  targetTable: string | null;
  targetRecordId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  notes: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: Record<string, unknown> | null;
  was2FAVerified: boolean;
  createdAt: string;
}

// ============================================================================
// Admin Dashboard Types
// ============================================================================

export interface UserStats {
  total: number;
  activeToday: number;
  activeWeek: number;
  newToday: number;
  newWeek: number;
  banned: number;
  suspended: number;
}

export interface GameStats {
  total: number;
  active: number;
  completedToday: number;
  completedWeek: number;
}

export interface FinancialStats {
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
  settings: {
    rakePercentage: number;
    treasurySplit: number;
    rewardPoolSplit: number;
    minRakeTCT: number;
    rakeOnDraws: boolean;
    enabled: boolean;
  };
}

export interface ChallengeStats {
  pending: number;
  createdToday: number;
}

export interface AdminStats {
  totalAdmins: number;
  superAdmins: number;
  actionsToday: number;
}

export interface DashboardStats {
  users: UserStats;
  games: GameStats;
  financial: FinancialStats;
  challenges: ChallengeStats;
  admins: AdminStats;
  generatedAt: string;
}

// ============================================================================
// User Management Types
// ============================================================================

export interface AdminUserListItem {
  id: string;
  username: string;
  email: string | null;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isBanned: boolean;
  banReason: string | null;
  isSuspended: boolean;
  suspensionReason: string | null;
  availableTCT: number;
  lockedTCT: number;
  createdAt: string;
  lastSeenAt: string;
}

export interface AdminUserDetails {
  profile: {
    id: string;
    username: string;
    email: string | null;
    eloRating: number;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDrawn: number;
    currentStreak: number;
    longestStreak: number;
    createdAt: string;
    lastSeenAt: string;
  };
  adminStatus: {
    isAdmin: boolean;
    isSuperAdmin: boolean;
    admin2FAEnabled: boolean;
  };
  restrictions: {
    isBanned: boolean;
    banReason: string | null;
    bannedAt: string | null;
    banExpiresAt: string | null;
    isSuspended: boolean;
    suspensionReason: string | null;
    suspendedAt: string | null;
    suspensionExpiresAt: string | null;
  };
  balance: {
    availableTCT: number;
    lockedTCT: number;
    totalDepositedTCT: number;
    totalWithdrawnTCT: number;
    totalWonTCT: number;
    totalLostTCT: number;
    totalCommissionPaidTCT: number;
  };
  recentGames: Array<{
    id: string;
    opponentId: string;
    result: string;
    wagerTCT: number;
    endedAt: string;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    amountTCT: number;
    description: string | null;
    createdAt: string;
  }>;
  adminNotes: string | null;
}

export interface UserSearchFilters {
  searchTerm?: string;
  filterBanned?: boolean;
  filterSuspended?: boolean;
  filterAdmin?: boolean;
  orderBy?: 'created_at' | 'username' | 'elo_rating' | 'last_seen_at';
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

// ============================================================================
// Admin Action Parameters
// ============================================================================

export interface BanUserParams {
  targetUserId: string;
  reason: string;
  durationDays?: number; // null for permanent
  notes?: string;
}

export interface SuspendUserParams {
  targetUserId: string;
  reason: string;
  durationHours?: number;
  notes?: string;
}

export interface AdjustBalanceParams {
  targetUserId: string;
  amountTCT: number; // Positive for credit, negative for debit
  reason: string;
  adjustmentType?: 'adjustment' | 'compensation' | 'refund' | 'correction' | 'penalty';
  notes?: string;
}

export interface AdminActionResult {
  success: boolean;
  userId?: string;
  username?: string;
  error?: string;
  [key: string]: unknown;
}

// ============================================================================
// Vault Statistics Types
// ============================================================================

export interface VaultBalances {
  treasuryBalanceTCT: number;
  rewardPoolBalanceTCT: number;
  totalRakeCollectedTCT: number;
  totalGamesSettled: number;
  totalDrawRefundsTCT: number;
}

export interface VaultStatisticEntry {
  statName: string;
  statValue: number;
  statUnit: string;
}

export interface RakeSettings {
  rakePercentage: number;
  treasurySplit: number;
  rewardPoolSplit: number;
  minRakeTCT: number;
  rakeOnDraws: boolean;
  enabled: boolean;
}

export interface UpdateRakeSettingsParams {
  rakePercentage?: number;
  treasurySplit?: number;
  rewardPoolSplit?: number;
  minRakeTCT?: number;
  enabled?: boolean;
}

// ============================================================================
// Admin Session Types
// ============================================================================

export interface AdminSession {
  id: string;
  adminId: string;
  sessionToken: string;
  is2FAVerified: boolean;
  verifiedAt: string | null;
  verificationMethod: '2fa' | 'biometric' | 'pin' | null;
  deviceId: string | null;
  deviceInfo: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

// ============================================================================
// Admin Context State
// ============================================================================

export interface AdminState {
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  requires2FA: boolean;
  is2FAVerified: boolean;
  adminProfile: AdminUserDetails | null;
  dashboardStats: DashboardStats | null;
  error: string | null;
}

export interface AdminActions {
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
}

export type AdminContextType = AdminState & AdminActions;

// ============================================================================
// Admin Route Protection
// ============================================================================

export const ADMIN_ROUTES = [
  '/admin',
  '/admin/dashboard',
  '/admin/users',
  '/admin/vault',
  '/admin/audit',
  '/admin/settings',
] as const;

export type AdminRoute = typeof ADMIN_ROUTES[number];

// ============================================================================
// Admin Permission Matrix
// ============================================================================

export const ADMIN_PERMISSIONS = {
  // Actions available to regular admins
  admin: [
    'view_dashboard',
    'search_users',
    'view_user_details',
    'suspend_user',
    'unsuspend_user',
    'adjust_balance_small', // < 100 TCT
    'view_audit_log',
    'view_vault_stats',
  ],
  // Additional actions for super admins
  super_admin: [
    'ban_user',
    'unban_user',
    'adjust_balance_large', // >= 100 TCT
    'grant_admin',
    'revoke_admin',
    'update_rake_settings',
    'export_data',
    'force_settle_escrow',
  ],
} as const;

export type AdminPermission =
  | typeof ADMIN_PERMISSIONS.admin[number]
  | typeof ADMIN_PERMISSIONS.super_admin[number];
