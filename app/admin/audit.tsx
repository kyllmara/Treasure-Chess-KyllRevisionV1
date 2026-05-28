/**
 * Admin Audit Log Screen
 *
 * View all admin actions with filtering and search.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAdmin } from "@/hooks/useAdmin";
import type { AdminAuditLogEntry, AdminActionType } from "@/types/admin";

export default function AdminAuditScreen() {
  return (
    <AdminGate featureName="Audit Log">
      <AdminAuditContent />
    </AdminGate>
  );
}

function AdminAuditContent() {
  const router = useRouter();
  const { getAuditLog } = useAdmin();

  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<AdminActionType | undefined>();
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const LIMIT = 50;

  const loadLogs = useCallback(
    async (reset = false) => {
      const newOffset = reset ? 0 : offset;
      const results = await getAuditLog(LIMIT, newOffset, selectedFilter);

      if (reset) {
        setLogs(results);
        setOffset(LIMIT);
      } else {
        setLogs((prev) => [...prev, ...results]);
        setOffset((prev) => prev + LIMIT);
      }

      setHasMore(results.length === LIMIT);
    },
    [getAuditLog, offset, selectedFilter]
  );

  useEffect(() => {
    setIsLoading(true);
    loadLogs(true).finally(() => setIsLoading(false));
  }, [selectedFilter]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadLogs(true);
    setIsRefreshing(false);
  }, [loadLogs]);

  const onLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    await loadLogs(false);
    setIsLoadingMore(false);
  }, [loadLogs, isLoadingMore, hasMore]);

  const renderLogItem = ({ item }: { item: AdminAuditLogEntry }) => (
    <AuditLogCard entry={item} />
  );

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color="#FFD700" />
      </View>
    );
  };

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
            <Text style={styles.headerTitle}>Audit Log</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={isRefreshing}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={isRefreshing ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Filters */}
          <View style={styles.filtersContainer}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={FILTER_OPTIONS}
              keyExtractor={(item) => item.value ?? "all"}
              renderItem={({ item }) => (
                <FilterChip
                  label={item.label}
                  isActive={selectedFilter === item.value}
                  onPress={() => {
                    setSelectedFilter(item.value);
                    setOffset(0);
                  }}
                  color={item.color}
                />
              )}
              contentContainerStyle={styles.filtersList}
            />
          </View>

          {/* Log List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingText}>Loading audit logs...</Text>
            </View>
          ) : (
            <FlatList
              data={logs}
              renderItem={renderLogItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor="#FFD700"
                />
              }
              onEndReached={onLoadMore}
              onEndReachedThreshold={0.3}
              ListFooterComponent={renderFooter}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="document-text" size={48} color="#666" />
                  <Text style={styles.emptyText}>No audit logs found</Text>
                  <Text style={styles.emptySubtext}>
                    Admin actions will appear here
                  </Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Filter Options
// ============================================================================

interface FilterOption {
  label: string;
  value: AdminActionType | undefined;
  color: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { label: "All", value: undefined, color: "#A0A0A0" },
  { label: "Bans", value: "user_ban", color: "#FF453A" },
  { label: "Unbans", value: "user_unban", color: "#34C759" },
  { label: "Suspends", value: "user_suspend", color: "#FF9500" },
  { label: "Balance", value: "user_balance_adjust", color: "#4ECDC4" },
  { label: "Admin Grant", value: "admin_grant", color: "#FFD700" },
  { label: "Config", value: "config_update", color: "#AF52DE" },
];

// ============================================================================
// Components
// ============================================================================

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  color: string;
}

function FilterChip({ label, isActive, onPress, color }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && { backgroundColor: `${color}30`, borderColor: color },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, isActive && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

interface AuditLogCardProps {
  entry: AdminAuditLogEntry;
}

function AuditLogCard({ entry }: AuditLogCardProps) {
  const details = getActionDetails(entry.actionType);
  const icon = details.icon || "help-circle";
  const color = details.color || "#A0A0A0";
  const label = details.label || "Unknown Action";

  return (
    <View style={styles.logCard}>
      <View style={styles.logCardHeader}>
        <View style={[styles.logIconContainer, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.logHeaderText}>
          <Text style={styles.logAction}>{label}</Text>
          <Text style={styles.logTime}>
            {new Date(entry.createdAt).toLocaleString()}
          </Text>
        </View>
        {entry.was2FAVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#34C759" />
          </View>
        )}
      </View>

      <View style={styles.logCardBody}>
        <LogDetailRow
          label="Admin"
          value={entry.adminUsername || entry.adminId.slice(0, 8)}
          icon="person"
        />
        {entry.targetUserUsername && (
          <LogDetailRow
            label="Target"
            value={entry.targetUserUsername}
            icon="person-outline"
          />
        )}
        {entry.targetTable && (
          <LogDetailRow label="Table" value={entry.targetTable} icon="grid" />
        )}
      </View>

      {entry.deviceInfo && Object.keys(entry.deviceInfo).length > 0 && (
        <View style={styles.logCardChanges}>
          <Text style={styles.changesLabel}>Changes</Text>
          <View style={styles.changesContent}>
            {Object.entries(entry.deviceInfo).map(([key, value]) => (
              <Text key={key} style={styles.changeItem}>
                {key}: {JSON.stringify(value)}
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

interface LogDetailRowProps {
  label: string;
  value: string;
  icon: string;
}

function LogDetailRow({ label, value, icon }: LogDetailRowProps) {
  return (
    <View style={styles.logDetailRow}>
      <Ionicons name={icon as any} size={14} color="#666" />
      <Text style={styles.logDetailLabel}>{label}:</Text>
      <Text style={styles.logDetailValue}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

interface ActionDetails {
  icon: string;
  color: string;
  label: string;
}

function getActionDetails(actionType: AdminActionType): ActionDetails {
  const actionMap: Record<AdminActionType, ActionDetails> = {
    user_ban: { icon: "ban", color: "#FF453A", label: "User Banned" },
    user_unban: { icon: "checkmark-circle", color: "#34C759", label: "User Unbanned" },
    user_suspend: { icon: "time", color: "#FF9500", label: "User Suspended" },
    user_unsuspend: { icon: "checkmark-circle", color: "#34C759", label: "Suspension Lifted" },
    user_balance_adjust: { icon: "cash", color: "#4ECDC4", label: "Balance Adjusted" },
    user_profile_edit: { icon: "create", color: "#5856D6", label: "Profile Edited" },
    user_password_reset: { icon: "key", color: "#FF9500", label: "Password Reset" },
    admin_grant: { icon: "shield", color: "#FFD700", label: "Admin Granted" },
    admin_revoke: { icon: "shield-outline", color: "#FF453A", label: "Admin Revoked" },
    super_admin_grant: { icon: "star", color: "#FFD700", label: "Super Admin Granted" },
    super_admin_revoke: { icon: "star-outline", color: "#FF453A", label: "Super Admin Revoked" },
    config_update: { icon: "settings", color: "#AF52DE", label: "Config Updated" },
    rake_settings_update: { icon: "calculator", color: "#AF52DE", label: "Rake Settings Updated" },
    manual_refund: { icon: "return-down-back", color: "#4ECDC4", label: "Manual Refund" },
    manual_credit: { icon: "add-circle", color: "#34C759", label: "Manual Credit" },
    manual_debit: { icon: "remove-circle", color: "#FF453A", label: "Manual Debit" },
    escrow_force_settle: { icon: "hammer", color: "#FF9500", label: "Escrow Force Settled" },
    vault_adjustment: { icon: "wallet", color: "#AF52DE", label: "Vault Adjustment" },
    system_maintenance: { icon: "construct", color: "#A0A0A0", label: "System Maintenance" },
    export_data: { icon: "download", color: "#5856D6", label: "Data Exported" },
    view_sensitive_data: { icon: "eye", color: "#A0A0A0", label: "Viewed Sensitive Data" },
  };

  const fallback: ActionDetails = { icon: "help-circle", color: "#A0A0A0", label: actionType || "Unknown" };
  if (!actionType) return fallback;
  return actionMap[actionType] || fallback;
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
  filtersContainer: {
    marginBottom: 12,
  },
  filtersList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "transparent",
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 13,
    color: "#A0A0A0",
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  logCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  logCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  logHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  logAction: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  logTime: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(52, 199, 89, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  logCardBody: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  logDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logDetailLabel: {
    fontSize: 12,
    color: "#666",
  },
  logDetailValue: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  logCardChanges: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  changesLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  changesContent: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    padding: 8,
  },
  changeItem: {
    fontSize: 11,
    color: "#A0A0A0",
    fontFamily: "monospace",
    marginBottom: 2,
  },
  loadingMore: {
    padding: 16,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
  },
});
