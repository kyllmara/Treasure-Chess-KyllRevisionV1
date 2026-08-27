/**
 * Admin Transactions Screen
 *
 * View all user deposits and withdrawals with username and email.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

type TransactionType = "all" | "deposits" | "withdrawals";

interface AdminTransaction {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  type: string;
  amountTct: number;
  amountUsd: number;
  status: string;
  method: string | null;
  destinationAddress: string | null;
  destinationChainName: string | null;
  txHash: string | null;
  createdAt: string;
  bankDetails?: {
    accountName: string | null;
    accountNumber: string | null;
    sortCode: string | null;
    iban: string | null;
    bic: string | null;
  } | null;
}

const PAGE_SIZE = 30;

export default function AdminTransactionsScreen() {
  return (
    <AdminGate featureName="Transaction Log">
      <AdminTransactionsContent />
    </AdminGate>
  );
}

function AdminTransactionsContent() {
  const router = useRouter();
  const [filter, setFilter] = useState<TransactionType>("all");
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchTransactions = useCallback(
    async (reset = false) => {
      if (!isSupabaseConfigured) return;

      const currentOffset = reset ? 0 : offset;
      if (reset) {
        setIsLoading(true);
      }

      try {
        // Fetch deposits from transactions table
        // Fetch withdrawals from withdrawals table
        // Combine and sort by date
        const results: AdminTransaction[] = [];

        if (filter === "all" || filter === "deposits") {
          // Fetch from transactions table (completed deposits)
          const { data: txDepositData } = await supabase
            .from("transactions")
            .select("id, user_id, type, amount_tct, created_at, tx_hash, description")
            .in("type", ["deposit"])
            .order("created_at", { ascending: false })
            .range(currentOffset, currentOffset + PAGE_SIZE - 1);

          // Also fetch from pending_deposits table
          const { data: pendingDepositData } = await supabase
            .from("pending_deposits")
            .select("id, user_id, amount_tct, amount_usdc, status, tx_hash, created_at")
            .order("created_at", { ascending: false })
            .range(currentOffset, currentOffset + PAGE_SIZE - 1);

          // Collect all user IDs from both sources
          const allDepositUserIds = [
            ...new Set([
              ...(txDepositData || []).map((d: any) => d.user_id),
              ...(pendingDepositData || []).map((d: any) => d.user_id),
            ]),
          ];

          let profileMap = new Map<string, { username: string; email: string | null }>();
          if (allDepositUserIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, email")
              .in("id", allDepositUserIds);
            profileMap = new Map(
              (profiles || []).map((p: any) => [p.id, { username: p.username, email: p.email }])
            );
          }

          // Add transaction deposits
          for (const tx of txDepositData || []) {
            const profile = profileMap.get(tx.user_id) || { username: "Unknown", email: null };
            results.push({
              id: tx.id,
              userId: tx.user_id,
              username: profile.username,
              email: profile.email,
              type: "deposit",
              amountTct: tx.amount_tct || 0,
              amountUsd: (tx.amount_tct || 0) * 0.04,
              status: "confirmed",
              method: tx.description || "Crypto",
              destinationAddress: null,
              destinationChainName: null,
              txHash: tx.tx_hash,
              createdAt: tx.created_at,
            });
          }

          // Add pending deposits
          for (const pd of pendingDepositData || []) {
            // Skip if already in transactions (avoid duplicates by tx_hash)
            const existingTxHashes = new Set(results.map((r) => r.txHash).filter(Boolean));
            if (pd.tx_hash && existingTxHashes.has(pd.tx_hash)) continue;

            const profile = profileMap.get(pd.user_id) || { username: "Unknown", email: null };
            results.push({
              id: `pd-${pd.id}`,
              userId: pd.user_id,
              username: profile.username,
              email: profile.email,
              type: "deposit",
              amountTct: pd.amount_tct || 0,
              amountUsd: pd.amount_usdc || (pd.amount_tct || 0) * 0.04,
              status: pd.status || "pending",
              method: "Crypto (on-chain)",
              destinationAddress: null,
              destinationChainName: null,
              txHash: pd.tx_hash,
              createdAt: pd.created_at,
            });
          }
        }

        if (filter === "all" || filter === "withdrawals") {
          let query = supabase
            .from("withdrawals")
            .select(
              "id, user_id, type, amount_tct, fee_tct, net_amount_tct, net_amount_usdc, net_amount_usd, status, destination_address, tx_hash, bank_account_name, bank_account_number, bank_sort_code, bank_iban, bank_bic, created_at"
            )
            .order("created_at", { ascending: false })
            .range(currentOffset, currentOffset + PAGE_SIZE - 1);

          const { data: withdrawalData, error: withdrawalError } = await query;

          if (withdrawalError) {
            console.error("[AdminTransactions] Withdrawal query error:", withdrawalError);
          }

          if (!withdrawalError && withdrawalData) {
            const userIds = [
              ...new Set(withdrawalData.map((w: any) => w.user_id)),
            ];
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, email")
              .in("id", userIds);

            const profileMap = new Map(
              (profiles || []).map((p: any) => [
                p.id,
                { username: p.username, email: p.email },
              ])
            );

            for (const w of withdrawalData) {
              const profile = profileMap.get(w.user_id) || {
                username: "Unknown",
                email: null,
              };
              results.push({
                id: w.id,
                userId: w.user_id,
                username: profile.username,
                email: profile.email,
                type: "withdrawal",
                amountTct: w.amount_tct || 0,
                amountUsd: w.net_amount_usd || w.net_amount_usdc || (w.amount_tct || 0) * 0.04,
                status: w.status || "pending",
                method: w.type || "crypto",
                destinationAddress: w.destination_address,
                destinationChainName: null,
                txHash: w.tx_hash || null,
                createdAt: w.created_at,
                bankDetails: w.type === "bank" ? {
                  accountName: w.bank_account_name,
                  accountNumber: w.bank_account_number,
                  sortCode: w.bank_sort_code,
                  iban: w.bank_iban,
                  bic: w.bank_bic,
                } : null,
              });
            }
          }
        }

        // Sort combined results by date descending
        results.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Deduplicate by key (type-id) to avoid React key warnings
        const seen = new Set<string>();
        const deduped = results.filter((r) => {
          const key = `${r.type}-${r.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (reset) {
          setTransactions(deduped);
          setOffset(PAGE_SIZE);
        } else {
          setTransactions((prev) => {
            const existingKeys = new Set(prev.map((r) => `${r.type}-${r.id}`));
            const newItems = deduped.filter((r) => !existingKeys.has(`${r.type}-${r.id}`));
            return [...prev, ...newItems];
          });
          setOffset((prev) => prev + PAGE_SIZE);
        }

        setHasMore(deduped.length >= PAGE_SIZE);
      } catch (error) {
        console.error("[AdminTransactions] Error:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filter, offset]
  );

  useEffect(() => {
    fetchTransactions(true);
  }, [filter]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTransactions(true);
  }, [fetchTransactions]);

  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchTransactions(false);
    }
  }, [isLoading, hasMore, fetchTransactions]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "completed":
        return "#34C759";
      case "pending":
      case "processing":
        return "#FF9500";
      case "failed":
        return "#FF453A";
      default:
        return "#A0A0A0";
    }
  };

  const renderTransaction = ({ item }: { item: AdminTransaction }) => (
    <View style={styles.txCard}>
      <View style={styles.txHeader}>
        <View style={styles.txTypeContainer}>
          <View
            style={[
              styles.txTypeIcon,
              {
                backgroundColor:
                  item.type === "deposit"
                    ? "rgba(52, 199, 89, 0.15)"
                    : "rgba(255, 69, 58, 0.15)",
              },
            ]}
          >
            <Ionicons
              name={item.type === "deposit" ? "arrow-down" : "arrow-up"}
              size={16}
              color={item.type === "deposit" ? "#34C759" : "#FF453A"}
            />
          </View>
          <View>
            <Text style={styles.txType}>
              {item.type === "deposit" ? "Deposit" : "Withdrawal"}
            </Text>
            <Text style={styles.txMethod}>
              {item.method === "crypto"
                ? "Crypto (Polygon)"
                : item.method === "bridge"
                ? `Bridge → ${item.destinationChainName || "Unknown Chain"}`
                : item.method === "bank"
                ? "Bank Transfer"
                : item.method || "—"}
            </Text>
          </View>
        </View>
        <View style={styles.txAmountContainer}>
          <Text
            style={[
              styles.txAmount,
              { color: item.type === "deposit" ? "#34C759" : "#FF453A" },
            ]}
          >
            {item.type === "deposit" ? "+" : "-"}
            {item.amountTct.toLocaleString("en-US", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}{" "}
            TCT
          </Text>
          <Text style={styles.txAmountUsd}>
            ${item.amountUsd.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.txUserRow}>
        <Ionicons name="person" size={14} color="#A0A0A0" />
        <Text style={styles.txUsername}>{item.username}</Text>
        {item.email && (
          <Text style={styles.txEmail} numberOfLines={1}>
            {item.email}
          </Text>
        )}
      </View>

      <View style={styles.txFooter}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: `${getStatusColor(item.status)}20` },
          ]}
        >
          <Text
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
        <Text style={styles.txDate}>
          {new Date(item.createdAt).toLocaleDateString()}{" "}
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      {item.destinationAddress && (
        <View style={styles.txAddressRow}>
          <Ionicons name="wallet" size={12} color="#666" />
          <Text style={styles.txAddress} numberOfLines={1} ellipsizeMode="middle">
            {item.destinationAddress}
          </Text>
        </View>
      )}

      {item.txHash && (
        <View style={styles.txAddressRow}>
          <Ionicons name="link" size={12} color="#666" />
          <Text style={styles.txAddress} numberOfLines={1} ellipsizeMode="middle">
            Tx: {item.txHash}
          </Text>
        </View>
      )}

      {item.bankDetails && (
        <View style={styles.bankDetailsContainer}>
          <View style={styles.bankDetailsHeader}>
            <Ionicons name="business" size={14} color="#FFD700" />
            <Text style={styles.bankDetailsTitle}>Bank Details</Text>
          </View>
          {item.bankDetails.accountName && (
            <Text style={styles.bankDetailRow}>Name: {item.bankDetails.accountName}</Text>
          )}
          {item.bankDetails.accountNumber && (
            <Text style={styles.bankDetailRow}>Account: {item.bankDetails.accountNumber}</Text>
          )}
          {item.bankDetails.sortCode && (
            <Text style={styles.bankDetailRow}>Sort Code: {item.bankDetails.sortCode}</Text>
          )}
          {item.bankDetails.iban && (
            <Text style={styles.bankDetailRow}>IBAN: {item.bankDetails.iban}</Text>
          )}
          {item.bankDetails.bic && (
            <Text style={styles.bankDetailRow}>BIC: {item.bankDetails.bic}</Text>
          )}
          <Text style={styles.bankDetailAmount}>
            Amount to send: ${item.amountUsd.toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  );

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
            <Text style={styles.headerTitle}>Deposits & Withdrawals</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Filter Tabs */}
          <View style={styles.filterContainer}>
            {(["all", "deposits", "withdrawals"] as TransactionType[]).map(
              (f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterTab, filter === f && styles.filterTabActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      filter === f && styles.filterTabTextActive,
                    ]}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* Transaction List */}
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFD700"
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                {isLoading ? (
                  <ActivityIndicator size="large" color="#FFD700" />
                ) : (
                  <>
                    <Ionicons name="receipt" size={48} color="#666" />
                    <Text style={styles.emptyText}>No transactions found</Text>
                  </>
                )}
              </View>
            }
            ListFooterComponent={
              isLoading && transactions.length > 0 ? (
                <View style={styles.loadMoreContainer}>
                  <ActivityIndicator size="small" color="#FFD700" />
                </View>
              ) : null
            }
          />
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
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 44,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterTabActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#A0A0A0",
  },
  filterTabTextActive: {
    color: "#FFD700",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  txCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  txHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  txTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  txTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  txType: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  txMethod: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 1,
  },
  txAmountContainer: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  txAmountUsd: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 1,
  },
  txUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  txUsername: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },
  txEmail: {
    fontSize: 12,
    color: "#A0A0A0",
    flex: 1,
    marginLeft: 4,
  },
  txFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  txDate: {
    fontSize: 12,
    color: "#666",
  },
  txAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  txAddress: {
    fontSize: 11,
    color: "#666",
    flex: 1,
    fontFamily: "monospace",
  },
  bankDetailsContainer: {
    marginTop: 8,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 8,
  },
  bankDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  bankDetailsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFD700",
  },
  bankDetailRow: {
    fontSize: 12,
    color: "#CCC",
    marginBottom: 2,
    fontFamily: "monospace",
  },
  bankDetailAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4CAF82",
    marginTop: 6,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
  },
  loadMoreContainer: {
    padding: 16,
    alignItems: "center",
  },
});
