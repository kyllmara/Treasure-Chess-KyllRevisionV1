import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface FiatDeposit {
  id: string;
  user_id: string;
  reference_code: string;
  amount_usd: number;
  amount_tct: number;
  status: string;
  admin_id: string | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
  username?: string;
}

type FilterTab = "pending" | "approved" | "rejected" | "all";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "rgba(255, 204, 0, 0.15)", text: "#FFCC00", label: "Pending" },
  approved: { bg: "rgba(52, 199, 89, 0.15)", text: "#34C759", label: "Approved" },
  rejected: { bg: "rgba(255, 69, 58, 0.15)", text: "#FF453A", label: "Rejected" },
};

export default function AdminFiatDepositsScreen() {
  return (
    <AdminGate featureName="Fiat Deposits">
      <AdminFiatDepositsContent />
    </AdminGate>
  );
}

function AdminFiatDepositsContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [deposits, setDeposits] = useState<FiatDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadDeposits = useCallback(async () => {
    try {
      let query = supabase
        .from("pending_fiat_deposits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((d: any) => d.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const usernameMap: Record<string, string> = {};
        if (profiles) {
          for (const p of profiles) {
            usernameMap[p.id] = p.username || "Unknown";
          }
        }

        setDeposits(
          data.map((d: any) => ({
            ...d,
            username: usernameMap[d.user_id] || "Unknown",
          }))
        );
      } else {
        setDeposits([]);
      }
    } catch (error) {
      console.error("Failed to load fiat deposits:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    loadDeposits();
  }, [loadDeposits]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadDeposits();
  }, [loadDeposits]);

  const handleApprove = useCallback(
    async (deposit: FiatDeposit) => {
      Alert.alert(
        "Approve Deposit",
        `Approve $${deposit.amount_usd.toFixed(2)} deposit from ${deposit.username}?\n\nThis will credit ${deposit.amount_tct} TCT to their account.\n\nReference: ${deposit.reference_code}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Approve",
            style: "default",
            onPress: async () => {
              setProcessingId(deposit.id);
              try {
                const { error } = await supabase.rpc("approve_fiat_deposit", {
                  p_deposit_id: deposit.id,
                  p_admin_id: profile?.id,
                  p_admin_note: "Approved via admin panel",
                });
                if (error) throw error;
                Alert.alert("Success", `Deposit approved. ${deposit.amount_tct} TCT credited to ${deposit.username}.`);
                loadDeposits();
              } catch (error: any) {
                Alert.alert("Error", error.message || "Failed to approve deposit");
              } finally {
                setProcessingId(null);
              }
            },
          },
        ]
      );
    },
    [profile?.id, loadDeposits]
  );

  const handleReject = useCallback(
    async (deposit: FiatDeposit) => {
      Alert.alert(
        "Reject Deposit",
        `Reject $${deposit.amount_usd.toFixed(2)} deposit from ${deposit.username}?\n\nReference: ${deposit.reference_code}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reject",
            style: "destructive",
            onPress: async () => {
              setProcessingId(deposit.id);
              try {
                const { error } = await supabase.rpc("reject_fiat_deposit", {
                  p_deposit_id: deposit.id,
                  p_admin_id: profile?.id,
                  p_admin_note: "Rejected via admin panel",
                });
                if (error) throw error;
                Alert.alert("Rejected", "Deposit has been rejected.");
                loadDeposits();
              } catch (error: any) {
                Alert.alert("Error", error.message || "Failed to reject deposit");
              } finally {
                setProcessingId(null);
              }
            },
          },
        ]
      );
    },
    [profile?.id, loadDeposits]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const pendingCount = deposits.filter((d) => d.status === "pending").length;

  const renderDeposit = ({ item }: { item: FiatDeposit }) => {
    const statusInfo = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const isProcessing = processingId === item.id;

    return (
      <View style={styles.depositCard}>
        <View style={styles.depositHeader}>
          <View style={styles.depositUser}>
            <Ionicons name="person-circle-outline" size={20} color="#A0A0A0" />
            <Text style={styles.depositUsername}>{item.username}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.statusText, { color: statusInfo.text }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        <View style={styles.depositDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={styles.detailValue}>${item.amount_usd.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>TCT</Text>
            <Text style={styles.detailValueGold}>{item.amount_tct.toLocaleString()} TCT</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reference</Text>
            <Text style={styles.detailValueMono}>{item.reference_code}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{formatDate(item.created_at)}</Text>
          </View>
        </View>

        {item.admin_note && (
          <View style={styles.adminNoteRow}>
            <Text style={styles.adminNoteLabel}>Admin Note:</Text>
            <Text style={styles.adminNoteText}>{item.admin_note}</Text>
          </View>
        )}

        {item.status === "pending" && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => handleApprove(item)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleReject(item)}
              disabled={isProcessing}
            >
              <Ionicons name="close-circle" size={18} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Fiat Deposits</Text>
            <View style={styles.headerRight}>
              {pendingCount > 0 && filter !== "pending" && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.filterTabs}>
            {FILTER_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
                onPress={() => setFilter(tab.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === tab.key && styles.filterTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : deposits.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="card-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No Deposits</Text>
              <Text style={styles.emptySubtitle}>
                No {filter !== "all" ? filter : ""} fiat deposit requests found.
              </Text>
            </View>
          ) : (
            <FlatList
              data={deposits}
              keyExtractor={(item) => item.id}
              renderItem={renderDeposit}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor="#FFD700"
                />
              }
            />
          )}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

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
  headerRight: {
    width: 44,
    alignItems: "center",
  },
  headerBadge: {
    backgroundColor: "#FF453A",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
  },
  filterTabActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  filterTabTextActive: {
    color: "#FFD700",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  depositCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  depositHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  depositUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  depositUsername: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  depositDetails: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  detailValueGold: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
  },
  detailValueMono: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF82",
    fontFamily: "monospace",
  },
  adminNoteRow: {
    flexDirection: "row",
    gap: 6,
    paddingTop: 4,
  },
  adminNoteLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    fontWeight: "600",
  },
  adminNoteText: {
    fontSize: 12,
    color: "#A0A0A0",
    flex: 1,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  approveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#34C759",
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FF453A",
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
