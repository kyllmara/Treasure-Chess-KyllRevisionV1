/**
 * Admin Dashboard Screen
 *
 * Main admin panel hub with quick stats overview, navigation to
 * detailed sections, and recent activity.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/lib/supabase";
import type { DashboardStats } from "@/types/admin";

export default function AdminDashboardScreen() {
  return (
    <AdminGate featureName="Admin Dashboard">
      <AdminDashboardContent />
    </AdminGate>
  );
}

function AdminDashboardContent() {
  const router = useRouter();
  const {
    dashboardStats,
    isLoading,
    isSuperAdmin,
    loadDashboardStats,
    refreshDashboardStats,
    error,
  } = useAdmin();

  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [pendingFiatCount, setPendingFiatCount] = useState(0);

  useEffect(() => {
    loadDashboardStats();
  }, [loadDashboardStats]);

  useEffect(() => {
    supabase
      .rpc("get_admin_unread_support_count")
      .then(({ data }) => {
        if (typeof data === "number") setUnreadSupportCount(data);
      });
    supabase
      .from("pending_fiat_deposits")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .then(({ count }) => {
        if (typeof count === "number") setPendingFiatCount(count);
      });
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshDashboardStats();
  }, [refreshDashboardStats]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="shield-checkmark" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>Admin Panel</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={isLoading}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={isLoading ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Admin Badge */}
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, isSuperAdmin && styles.superAdminBadge]}>
              <Ionicons
                name={isSuperAdmin ? "star" : "shield"}
                size={14}
                color={isSuperAdmin ? "#FFD700" : "#4ECDC4"}
              />
              <Text style={[styles.badgeText, isSuperAdmin && styles.superAdminBadgeText]}>
                {isSuperAdmin ? "Super Admin" : "Admin"}
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={onRefresh}
                tintColor="#FFD700"
              />
            }
          >
            {/* Error Display */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#FF453A" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Quick Stats Grid */}
            {dashboardStats && (
              <>
                <Text style={styles.sectionTitle}>Overview</Text>
                <View style={styles.statsGrid}>
                  <StatCard
                    icon="people"
                    label="Total Users"
                    value={dashboardStats.users.total}
                    color="#4ECDC4"
                  />
                  <StatCard
                    icon="game-controller"
                    label="Total Games"
                    value={dashboardStats.games.total}
                    color="#FFD700"
                  />
                  <StatCard
                    icon="cash"
                    label="Treasury"
                    value={formatTCT(dashboardStats.financial.balances.treasury)}
                    color="#34C759"
                    suffix=" TCT"
                  />
                  <StatCard
                    icon="trending-up"
                    label="Today's Rake"
                    value={formatTCT(dashboardStats.financial.rake.today)}
                    color="#FF9500"
                    suffix=" TCT"
                  />
                </View>

                {/* Activity Stats */}
                <Text style={styles.sectionTitle}>Activity</Text>
                <View style={styles.activityContainer}>
                  <ActivityRow
                    label="Active Users Today"
                    value={dashboardStats.users.activeToday}
                  />
                  <ActivityRow
                    label="New Users Today"
                    value={dashboardStats.users.newToday}
                  />
                  <ActivityRow
                    label="Games Completed Today"
                    value={dashboardStats.games.completedToday}
                  />
                  <ActivityRow
                    label="Active Games"
                    value={dashboardStats.games.active}
                    highlight
                  />
                  <ActivityRow
                    label="Pending Challenges"
                    value={dashboardStats.challenges.pending}
                  />
                  <ActivityRow
                    label="Admin Actions Today"
                    value={dashboardStats.admins.actionsToday}
                  />
                </View>

                {/* Moderation Stats */}
                <Text style={styles.sectionTitle}>Moderation</Text>
                <View style={styles.moderationContainer}>
                  <ModerationCard
                    icon="ban"
                    label="Banned Users"
                    value={dashboardStats.users.banned}
                    color="#FF453A"
                  />
                  <ModerationCard
                    icon="time"
                    label="Suspended Users"
                    value={dashboardStats.users.suspended}
                    color="#FF9500"
                  />
                </View>
              </>
            )}

            {/* Navigation Menu */}
            <Text style={styles.sectionTitle}>Admin Tools</Text>
            <View style={styles.menuContainer}>
              <MenuItem
                icon="people-outline"
                label="User Management"
                description="Search, ban, suspend, adjust balances"
                onPress={() => router.push("/admin/users")}
              />
              <MenuItem
                icon="swap-horizontal-outline"
                label="Transactions"
                description="Withdrawals, deposits, and transfers"
                onPress={() => router.push("/admin/transactions")}
              />
              <MenuItem
                icon="flash-outline"
                label="Challenges"
                description="View all player challenges"
                onPress={() => router.push("/admin/challenges" as any)}
              />
              <MenuItem
                icon="game-controller-outline"
                label="Play Now"
                description="View all matchmaking games"
                onPress={() => router.push("/admin/playnow" as any)}
              />
              <MenuItem
                icon="trophy-outline"
                label="Tournaments"
                description="Create and manage tournaments"
                onPress={() => router.push("/admin/tournaments")}
              />
              <MenuItem
                icon="flash-outline"
                label="House Challenges"
                description="Create and manage AI challenges"
                onPress={() => router.push("/admin/house-challenges" as any)}
              />
              <MenuItem
                icon="wallet-outline"
                label="Vault Statistics"
                description="Treasury, rake, reward pool metrics"
                onPress={() => router.push("/admin/vault")}
              />
              <MenuItem
                icon="people-circle-outline"
                label="Manage Admins"
                description="Grant and revoke admin privileges"
                onPress={() => router.push("/admin/manage-admins" as any)}
              />
              <MenuItem
                icon="document-text-outline"
                label="Audit Log"
                description="View all admin actions"
                onPress={() => router.push("/admin/audit")}
              />
              <MenuItem
                icon="chatbubbles-outline"
                label="Support Tickets"
                description="Manage user support requests"
                onPress={() => router.push("/admin/support-tickets" as any)}
                badge={unreadSupportCount}
              />
              <MenuItem
                icon="card-outline"
                label="Fiat Deposits"
                description="Approve or reject bank/Revolut deposits"
                onPress={() => router.push("/admin/fiat-deposits" as any)}
                badge={pendingFiatCount}
              />
              {isSuperAdmin && (
                <MenuItem
                  icon="settings-outline"
                  label="Platform Settings"
                  description="Rake configuration, system settings"
                  onPress={() => router.push("/admin/settings")}
                  superAdminOnly
                />
              )}
            </View>

            {/* Financial Summary */}
            {dashboardStats && (
              <>
                <Text style={styles.sectionTitle}>Financial Summary</Text>
                <View style={styles.financialCard}>
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Treasury Balance</Text>
                    <Text style={styles.financialValue}>
                      {formatTCT(dashboardStats.financial.balances.treasury)} TCT
                    </Text>
                  </View>
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Reward Pool</Text>
                    <Text style={styles.financialValue}>
                      {formatTCT(dashboardStats.financial.balances.rewardPool)} TCT
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Weekly Rake</Text>
                    <Text style={[styles.financialValue, styles.positiveValue]}>
                      +{formatTCT(dashboardStats.financial.rake.thisWeek)} TCT
                    </Text>
                  </View>
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Monthly Rake</Text>
                    <Text style={[styles.financialValue, styles.positiveValue]}>
                      +{formatTCT(dashboardStats.financial.rake.thisMonth)} TCT
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Rake Rate</Text>
                    <Text style={styles.financialValue}>
                      {(dashboardStats.financial.settings.rakePercentage * 100).toFixed(0)}%
                    </Text>
                  </View>
                  <View style={styles.financialRow}>
                    <Text style={styles.financialLabel}>Treasury Split</Text>
                    <Text style={styles.financialValue}>
                      {(dashboardStats.financial.settings.treasurySplit * 100).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Admin Team */}
            {dashboardStats && (
              <>
                <Text style={styles.sectionTitle}>Admin Team</Text>
                <View style={styles.adminTeamCard}>
                  <View style={styles.adminTeamRow}>
                    <View style={styles.adminTeamIcon}>
                      <Ionicons name="shield" size={20} color="#4ECDC4" />
                    </View>
                    <Text style={styles.adminTeamLabel}>Total Admins</Text>
                    <Text style={styles.adminTeamValue}>
                      {dashboardStats.admins.totalAdmins}
                    </Text>
                  </View>
                  <View style={styles.adminTeamRow}>
                    <View style={styles.adminTeamIcon}>
                      <Ionicons name="star" size={20} color="#FFD700" />
                    </View>
                    <Text style={styles.adminTeamLabel}>Super Admins</Text>
                    <Text style={styles.adminTeamValue}>
                      {dashboardStats.admins.superAdmins}
                    </Text>
                  </View>
                </View>
              </>
            )}

            {/* Generated At */}
            {dashboardStats && (
              <Text style={styles.generatedAt}>
                Last updated: {new Date(dashboardStats.generatedAt).toLocaleString()}
              </Text>
            )}

            <View style={styles.bottomPadding} />
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

interface StatCardProps {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  suffix?: string;
}

function StatCard({ icon, label, value, color, suffix = "" }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>
        {value}
        {suffix}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Activity Row Component
// ============================================================================

interface ActivityRowProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function ActivityRow({ label, value, highlight = false }: ActivityRowProps) {
  return (
    <View style={styles.activityRow}>
      <Text style={styles.activityLabel}>{label}</Text>
      <Text style={[styles.activityValue, highlight && styles.highlightValue]}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

// ============================================================================
// Moderation Card Component
// ============================================================================

interface ModerationCardProps {
  icon: string;
  label: string;
  value: number;
  color: string;
}

function ModerationCard({ icon, label, value, color }: ModerationCardProps) {
  return (
    <View style={[styles.moderationCard, { borderLeftColor: color }]}>
      <View style={styles.moderationContent}>
        <Ionicons name={icon as any} size={20} color={color} />
        <Text style={styles.moderationLabel}>{label}</Text>
      </View>
      <Text style={[styles.moderationValue, { color }]}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Menu Item Component
// ============================================================================

interface MenuItemProps {
  icon: string;
  label: string;
  description: string;
  onPress: () => void;
  superAdminOnly?: boolean;
  badge?: number;
}

function MenuItem({ icon, label, description, onPress, superAdminOnly = false, badge = 0 }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconContainer, superAdminOnly && styles.superAdminIconContainer]}>
        <Ionicons
          name={icon as any}
          size={24}
          color={superAdminOnly ? "#FFD700" : "#4ECDC4"}
        />
        {badge > 0 && (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.menuTextContainer}>
        <View style={styles.menuLabelRow}>
          <Text style={styles.menuLabel}>{label}</Text>
          {superAdminOnly && (
            <View style={styles.superAdminTag}>
              <Ionicons name="star" size={10} color="#FFD700" />
              <Text style={styles.superAdminTagText}>Super</Text>
            </View>
          )}
        </View>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTCT(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + "M";
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + "K";
  }
  return value.toFixed(2);
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  superAdminBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4ECDC4",
  },
  superAdminBadgeText: {
    color: "#FFD700",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#FF453A",
    fontSize: 14,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "47%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
    textAlign: "center",
  },
  activityContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  activityLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  activityValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  highlightValue: {
    color: "#4ECDC4",
  },
  moderationContainer: {
    flexDirection: "row",
    gap: 12,
  },
  moderationCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moderationContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moderationLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  moderationValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  menuContainer: {
    gap: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  superAdminIconContainer: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
  },
  menuBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF453A",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  superAdminTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  superAdminTagText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFD700",
  },
  menuDescription: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  financialCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  financialLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  financialValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  positiveValue: {
    color: "#34C759",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 8,
  },
  adminTeamCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  adminTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  adminTeamIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  adminTeamLabel: {
    flex: 1,
    fontSize: 14,
    color: "#FFFFFF",
  },
  adminTeamValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  generatedAt: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 24,
  },
  bottomPadding: {
    height: 32,
  },
});
