/**
 * Admin Vault Statistics Screen
 *
 * View treasury balances, rake metrics, and financial statistics.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAdmin } from "@/hooks/useAdmin";
import type { VaultBalances, VaultStatisticEntry, RakeSettings } from "@/types/admin";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function AdminVaultScreen() {
  return (
    <AdminGate featureName="Vault Statistics">
      <AdminVaultContent />
    </AdminGate>
  );
}

function AdminVaultContent() {
  const router = useRouter();
  const {
    isLoading,
    isSuperAdmin,
    getVaultBalances,
    getVaultStatistics,
    getRakeSettings,
  } = useAdmin();

  const [vaultBalances, setVaultBalances] = useState<VaultBalances | null>(null);
  const [statistics, setStatistics] = useState<VaultStatisticEntry[]>([]);
  const [rakeSettings, setRakeSettings] = useState<RakeSettings | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "week" | "month" | "all">(
    "week"
  );

  const loadData = useCallback(async () => {
    const [balances, stats, settings] = await Promise.all([
      getVaultBalances(),
      getVaultStatistics(),
      getRakeSettings(),
    ]);

    setVaultBalances(balances);
    setStatistics(stats);
    setRakeSettings(settings);
  }, [getVaultBalances, getVaultStatistics, getRakeSettings]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  // Helper to find stat by name
  const getStat = (name: string): number => {
    const stat = statistics.find((s) => s.statName === name);
    return stat?.statValue ?? 0;
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
            <Text style={styles.headerTitle}>Vault Statistics</Text>
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

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor="#FFD700"
              />
            }
          >
            {/* Balance Cards */}
            {vaultBalances && (
              <>
                <Text style={styles.sectionTitle}>Current Balances</Text>
                <View style={styles.balanceCardsContainer}>
                  <BalanceCard
                    title="Treasury"
                    balance={vaultBalances.treasuryBalanceTCT}
                    icon="wallet"
                    color="#34C759"
                    description="Platform revenue (90% of rake)"
                  />
                  <BalanceCard
                    title="Reward Pool"
                    balance={vaultBalances.rewardPoolBalanceTCT}
                    icon="gift"
                    color="#FF9500"
                    description="Player rewards (10% of rake)"
                  />
                </View>

                {/* Total Balance */}
                <View style={styles.totalBalanceCard}>
                  <View style={styles.totalBalanceHeader}>
                    <Ionicons name="cash" size={24} color="#FFD700" />
                    <Text style={styles.totalBalanceLabel}>Total Vault Balance</Text>
                  </View>
                  <Text style={styles.totalBalanceValue}>
                    {formatTCT(
                      vaultBalances.treasuryBalanceTCT + vaultBalances.rewardPoolBalanceTCT
                    )}{" "}
                    TCT
                  </Text>
                  <Text style={styles.totalBalanceUSD}>
                    ${formatUSD((vaultBalances.treasuryBalanceTCT + vaultBalances.rewardPoolBalanceTCT) / 25)} USD
                  </Text>
                </View>
              </>
            )}

            {/* Rake Statistics */}
            {vaultBalances && (
              <>
                <Text style={styles.sectionTitle}>Rake Collection</Text>
                <View style={styles.rakeStatsContainer}>
                  <RakeStatCard
                    label="Total Collected"
                    value={vaultBalances.totalRakeCollectedTCT}
                    color="#FFD700"
                    icon="trending-up"
                  />
                  <RakeStatCard
                    label="Games Settled"
                    value={vaultBalances.totalGamesSettled}
                    color="#4CAF82"
                    icon="game-controller"
                    isCurrency={false}
                  />
                  <RakeStatCard
                    label="Draw Refunds"
                    value={vaultBalances.totalDrawRefundsTCT}
                    color="#A0A0A0"
                    icon="return-down-back"
                  />
                </View>
              </>
            )}

            {/* Rake Settings */}
            {rakeSettings && (
              <>
                <Text style={styles.sectionTitle}>Rake Configuration</Text>
                <View style={styles.settingsCard}>
                  <SettingRow
                    label="Rake Rate"
                    value={`${(rakeSettings.rakePercentage * 100).toFixed(1)}%`}
                    description="Percentage taken from winning pot"
                  />
                  <View style={styles.settingsDivider} />
                  <SettingRow
                    label="Treasury Split"
                    value={`${(rakeSettings.treasurySplit * 100).toFixed(0)}%`}
                    description="Portion of rake to treasury"
                  />
                  <View style={styles.settingsDivider} />
                  <SettingRow
                    label="Reward Pool Split"
                    value={`${(rakeSettings.rewardPoolSplit * 100).toFixed(0)}%`}
                    description="Portion of rake to reward pool"
                  />
                  <View style={styles.settingsDivider} />
                  <SettingRow
                    label="Minimum Rake"
                    value={`${rakeSettings.minRakeTCT} TCT`}
                    description="Minimum rake per game"
                  />
                  <View style={styles.settingsDivider} />
                  <SettingRow
                    label="Rake on Draws"
                    value={rakeSettings.rakeOnDraws ? "Yes" : "No"}
                    description="Whether rake is taken from draws"
                  />
                  <View style={styles.settingsDivider} />
                  <SettingRow
                    label="Status"
                    value={rakeSettings.enabled ? "Enabled" : "Disabled"}
                    description="Rake system status"
                    valueColor={rakeSettings.enabled ? "#34C759" : "#FF453A"}
                  />
                </View>

                {isSuperAdmin && (
                  <TouchableOpacity
                    style={styles.editSettingsButton}
                    onPress={() => router.push("/admin/settings")}
                  >
                    <Ionicons name="settings-outline" size={20} color="#FFD700" />
                    <Text style={styles.editSettingsText}>Edit Rake Settings</Text>
                    <Ionicons name="chevron-forward" size={20} color="#FFD700" />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Detailed Statistics */}
            <Text style={styles.sectionTitle}>Detailed Statistics</Text>
            <View style={styles.detailedStatsCard}>
              {statistics.map((stat, index) => (
                <View key={stat.statName}>
                  <DetailedStatRow
                    label={formatStatLabel(stat.statName)}
                    value={stat.statValue}
                    unit={stat.statUnit}
                  />
                  {index < statistics.length - 1 && (
                    <View style={styles.detailedStatDivider} />
                  )}
                </View>
              ))}
            </View>

            {/* Rake Flow Diagram */}
            <Text style={styles.sectionTitle}>Rake Flow</Text>
            <View style={styles.flowDiagram}>
              <View style={styles.flowNode}>
                <View style={[styles.flowNodeIcon, { backgroundColor: "#4CAF8220" }]}>
                  <Ionicons name="game-controller" size={24} color="#4CAF82" />
                </View>
                <Text style={styles.flowNodeLabel}>Game Pot</Text>
              </View>

              <View style={styles.flowArrow}>
                <Ionicons name="arrow-down" size={20} color="#666" />
                <Text style={styles.flowArrowLabel}>10% Rake</Text>
              </View>

              <View style={styles.flowSplit}>
                <View style={styles.flowBranch}>
                  <View style={styles.flowArrow}>
                    <Ionicons name="arrow-down" size={16} color="#666" />
                    <Text style={styles.flowArrowLabel}>90%</Text>
                  </View>
                  <View style={styles.flowNode}>
                    <View style={[styles.flowNodeIcon, { backgroundColor: "#34C75920" }]}>
                      <Ionicons name="wallet" size={20} color="#34C759" />
                    </View>
                    <Text style={styles.flowNodeLabel}>Treasury</Text>
                  </View>
                </View>

                <View style={styles.flowBranch}>
                  <View style={styles.flowArrow}>
                    <Ionicons name="arrow-down" size={16} color="#666" />
                    <Text style={styles.flowArrowLabel}>10%</Text>
                  </View>
                  <View style={styles.flowNode}>
                    <View style={[styles.flowNodeIcon, { backgroundColor: "#FF950020" }]}>
                      <Ionicons name="gift" size={20} color="#FF9500" />
                    </View>
                    <Text style={styles.flowNodeLabel}>Rewards</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.bottomPadding} />
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface BalanceCardProps {
  title: string;
  balance: number;
  icon: string;
  color: string;
  description: string;
}

function BalanceCard({ title, balance, icon, color, description }: BalanceCardProps) {
  return (
    <View style={[styles.balanceCard, { borderLeftColor: color }]}>
      <View style={styles.balanceCardHeader}>
        <View style={[styles.balanceCardIcon, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <Text style={styles.balanceCardTitle}>{title}</Text>
      </View>
      <Text style={[styles.balanceCardValue, { color }]}>
        {formatTCT(balance)} TCT
      </Text>
      <Text style={styles.balanceCardUSD}>
        ${formatUSD(balance / 25)} USD
      </Text>
      <Text style={styles.balanceCardDescription}>{description}</Text>
    </View>
  );
}

interface RakeStatCardProps {
  label: string;
  value: number;
  color: string;
  icon: string;
  isCurrency?: boolean;
}

function RakeStatCard({
  label,
  value,
  color,
  icon,
  isCurrency = true,
}: RakeStatCardProps) {
  return (
    <View style={styles.rakeStatCard}>
      <View style={[styles.rakeStatIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.rakeStatValue}>
        {isCurrency ? formatTCT(value) : value.toLocaleString()}
        {isCurrency && " TCT"}
      </Text>
      <Text style={styles.rakeStatLabel}>{label}</Text>
    </View>
  );
}

interface SettingRowProps {
  label: string;
  value: string;
  description: string;
  valueColor?: string;
}

function SettingRow({ label, value, description, valueColor }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowLeft}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Text style={[styles.settingValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
  );
}

interface DetailedStatRowProps {
  label: string;
  value: number;
  unit: string;
}

function DetailedStatRow({ label, value, unit }: DetailedStatRowProps) {
  const formattedValue =
    unit === "TCT" ? formatTCT(value) : value.toLocaleString();

  return (
    <View style={styles.detailedStatRow}>
      <Text style={styles.detailedStatLabel}>{label}</Text>
      <Text style={styles.detailedStatValue}>
        {formattedValue} {unit}
      </Text>
    </View>
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
    return (value / 1000).toFixed(2) + "K";
  }
  return value.toFixed(2);
}

function formatUSD(value: number): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(2) + "M";
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(2) + "K";
  }
  return value.toFixed(2);
}

function formatStatLabel(statName: string): string {
  return statName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 12,
  },
  balanceCardsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
  },
  balanceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  balanceCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  balanceCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  balanceCardValue: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  balanceCardUSD: {
    fontSize: 12,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  balanceCardDescription: {
    fontSize: 10,
    color: "#666",
  },
  totalBalanceCard: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  totalBalanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  totalBalanceLabel: {
    fontSize: 14,
    color: "#FFD700",
    fontWeight: "600",
  },
  totalBalanceValue: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFD700",
  },
  totalBalanceUSD: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  rakeStatsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  rakeStatCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  rakeStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  rakeStatValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  rakeStatLabel: {
    fontSize: 10,
    color: "#A0A0A0",
    textAlign: "center",
    marginTop: 4,
  },
  settingsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  settingRowLeft: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  settingDescription: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  settingValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF82",
  },
  settingsDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 8,
  },
  editSettingsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  editSettingsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
    flex: 1,
  },
  detailedStatsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  detailedStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailedStatLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  detailedStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  detailedStatDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  flowDiagram: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  flowNode: {
    alignItems: "center",
  },
  flowNodeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  flowNodeLabel: {
    fontSize: 12,
    color: "#FFFFFF",
    marginTop: 8,
    fontWeight: "500",
  },
  flowArrow: {
    alignItems: "center",
    paddingVertical: 8,
  },
  flowArrowLabel: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  flowSplit: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 8,
  },
  flowBranch: {
    alignItems: "center",
    flex: 1,
  },
  bottomPadding: {
    height: 32,
  },
});
