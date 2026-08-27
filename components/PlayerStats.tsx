/**
 * PlayerStats Component
 *
 * Displays comprehensive player statistics including:
 * - Win rate with visual indicator
 * - Current and longest streaks
 * - ELO rating with history
 * - Earnings breakdown
 * - Game outcome breakdown
 */

import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Trophy,
  Target,
  TrendingUp,
  TrendingDown,
  Flame,
  Award,
  Swords,
  Crown,
  Flag,
  Clock,
  Coins,
  BarChart3,
} from "lucide-react-native";
import type { PlayerStats as PlayerStatsType } from "@/lib/gameHistory";

// ============================================================================
// Types
// ============================================================================

interface PlayerStatsProps {
  stats: PlayerStatsType;
  compact?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  trend?: "up" | "down" | "neutral";
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes}m ${secs}s`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatTCT(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  if (Math.abs(amount) >= 1000) {
    return `${sign}${(amount / 1000).toFixed(1)}K`;
  }
  return `${sign}${amount.toFixed(0)}`;
}

// ============================================================================
// StatCard Component
// ============================================================================

const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  subValue,
  color = "#FFFFFF",
  trend,
}: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statCardHeader}>
        {icon}
        {trend === "up" && <TrendingUp size={12} color="#4CAF82" />}
        {trend === "down" && <TrendingDown size={12} color="#E05C5C" />}
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subValue && <Text style={styles.statSubValue}>{subValue}</Text>}
    </View>
  );
});

// ============================================================================
// WinRateRing Component
// ============================================================================

interface WinRateRingProps {
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
}

const WinRateRing = memo(function WinRateRing({
  winRate,
  wins,
  losses,
  draws,
}: WinRateRingProps) {
  const totalGames = wins + losses + draws;

  return (
    <View style={styles.winRateContainer}>
      <View style={styles.winRateRing}>
        <View style={styles.winRateInner}>
          <Text style={styles.winRatePercent}>{winRate.toFixed(1)}%</Text>
          <Text style={styles.winRateLabel}>Win Rate</Text>
        </View>
      </View>
      <View style={styles.winRateBreakdown}>
        <View style={styles.breakdownItem}>
          <View style={[styles.breakdownDot, { backgroundColor: "#4CAF82" }]} />
          <Text style={styles.breakdownText}>{wins} Wins</Text>
        </View>
        <View style={styles.breakdownItem}>
          <View style={[styles.breakdownDot, { backgroundColor: "#E05C5C" }]} />
          <Text style={styles.breakdownText}>{losses} Losses</Text>
        </View>
        {draws > 0 && (
          <View style={styles.breakdownItem}>
            <View style={[styles.breakdownDot, { backgroundColor: "#A0A0A0" }]} />
            <Text style={styles.breakdownText}>{draws} Draws</Text>
          </View>
        )}
        <Text style={styles.totalGamesText}>{totalGames} Total Games</Text>
      </View>
    </View>
  );
});

// ============================================================================
// Main PlayerStats Component
// ============================================================================

export const PlayerStats = memo(function PlayerStats({
  stats,
  compact = false,
}: PlayerStatsProps) {
  const eloTrend = useMemo(() => {
    if (stats.eloRating > stats.eloLow + 100) return "up";
    if (stats.eloRating < stats.eloHigh - 100) return "down";
    return "neutral";
  }, [stats.eloRating, stats.eloHigh, stats.eloLow]);

  const earningsTrend = stats.netEarnings >= 0 ? "up" : "down";

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View style={styles.compactStat}>
            <Trophy size={16} color="#FFD700" />
            <Text style={styles.compactValue}>{stats.wins}</Text>
            <Text style={styles.compactLabel}>Wins</Text>
          </View>
          <View style={styles.compactStat}>
            <Target size={16} color="#4CAF82" />
            <Text style={styles.compactValue}>{stats.winRate.toFixed(0)}%</Text>
            <Text style={styles.compactLabel}>Win Rate</Text>
          </View>
          <View style={styles.compactStat}>
            <TrendingUp size={16} color="#9B7EC8" />
            <Text style={styles.compactValue}>{stats.eloRating}</Text>
            <Text style={styles.compactLabel}>ELO</Text>
          </View>
          <View style={styles.compactStat}>
            <Flame size={16} color="#E05C5C" />
            <Text style={styles.compactValue}>{stats.currentStreak}</Text>
            <Text style={styles.compactLabel}>Streak</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Win Rate Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <WinRateRing
          winRate={stats.winRate}
          wins={stats.wins}
          losses={stats.losses}
          draws={stats.draws}
        />
      </View>

      {/* Main Stats Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stats Overview</Text>
        <View style={styles.statsGrid}>
          <StatCard
            icon={<TrendingUp size={18} color="#9B7EC8" />}
            label="ELO Rating"
            value={stats.eloRating}
            subValue={`High: ${stats.eloHigh} | Low: ${stats.eloLow}`}
            color="#9B7EC8"
            trend={eloTrend}
          />
          <StatCard
            icon={<Flame size={18} color="#E05C5C" />}
            label="Current Streak"
            value={stats.currentStreak}
            subValue={`Best: ${stats.longestStreak}`}
            color={stats.currentStreak >= 3 ? "#E05C5C" : "#FFFFFF"}
          />
          <StatCard
            icon={<Coins size={18} color="#FFD700" />}
            label="Net Earnings"
            value={formatTCT(stats.netEarnings)}
            subValue="TCT"
            color={stats.netEarnings >= 0 ? "#4CAF82" : "#E05C5C"}
            trend={earningsTrend}
          />
          <StatCard
            icon={<Clock size={18} color="#4CAF82" />}
            label="Avg Game Time"
            value={formatDuration(stats.avgGameDuration)}
            color="#4CAF82"
          />
        </View>
      </View>

      {/* Win Types Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Victory Breakdown</Text>
        <View style={styles.winTypesContainer}>
          <View style={styles.winTypeRow}>
            <View style={styles.winTypeInfo}>
              <Crown size={16} color="#FFD700" />
              <Text style={styles.winTypeLabel}>Checkmates</Text>
            </View>
            <Text style={styles.winTypeValue}>{stats.winsByCheckmate}</Text>
            <View style={styles.winTypeBar}>
              <View
                style={[
                  styles.winTypeProgress,
                  {
                    width: `${stats.wins > 0 ? (stats.winsByCheckmate / stats.wins) * 100 : 0}%`,
                    backgroundColor: "#FFD700",
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.winTypeRow}>
            <View style={styles.winTypeInfo}>
              <Flag size={16} color="#4CAF82" />
              <Text style={styles.winTypeLabel}>Resignations</Text>
            </View>
            <Text style={styles.winTypeValue}>{stats.winsByResignation}</Text>
            <View style={styles.winTypeBar}>
              <View
                style={[
                  styles.winTypeProgress,
                  {
                    width: `${stats.wins > 0 ? (stats.winsByResignation / stats.wins) * 100 : 0}%`,
                    backgroundColor: "#4CAF82",
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.winTypeRow}>
            <View style={styles.winTypeInfo}>
              <Clock size={16} color="#9B7EC8" />
              <Text style={styles.winTypeLabel}>Timeouts</Text>
            </View>
            <Text style={styles.winTypeValue}>{stats.winsByTimeout}</Text>
            <View style={styles.winTypeBar}>
              <View
                style={[
                  styles.winTypeProgress,
                  {
                    width: `${stats.wins > 0 ? (stats.winsByTimeout / stats.wins) * 100 : 0}%`,
                    backgroundColor: "#9B7EC8",
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Earnings Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.earningsContainer}>
          <View style={styles.earningsRow}>
            <View style={styles.earningsInfo}>
              <TrendingUp size={16} color="#4CAF82" />
              <Text style={styles.earningsLabel}>Total Won</Text>
            </View>
            <Text style={[styles.earningsValue, { color: "#4CAF82" }]}>
              +{formatNumber(stats.totalWonTct)} TCT
            </Text>
          </View>
          <View style={styles.earningsRow}>
            <View style={styles.earningsInfo}>
              <TrendingDown size={16} color="#E05C5C" />
              <Text style={styles.earningsLabel}>Total Lost</Text>
            </View>
            <Text style={[styles.earningsValue, { color: "#E05C5C" }]}>
              -{formatNumber(stats.totalLostTct)} TCT
            </Text>
          </View>
          <View style={styles.earningsDivider} />
          <View style={styles.earningsRow}>
            <View style={styles.earningsInfo}>
              <BarChart3 size={16} color={stats.netEarnings >= 0 ? "#4CAF82" : "#E05C5C"} />
              <Text style={styles.earningsLabel}>Net Profit</Text>
            </View>
            <Text
              style={[
                styles.earningsValue,
                styles.netEarnings,
                { color: stats.netEarnings >= 0 ? "#4CAF82" : "#E05C5C" },
              ]}
            >
              {formatTCT(stats.netEarnings)} TCT
            </Text>
          </View>
        </View>
      </View>

      {/* Average Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Averages</Text>
        <View style={styles.averagesRow}>
          <View style={styles.averageCard}>
            <Swords size={20} color="#FFD700" />
            <Text style={styles.averageValue}>
              {stats.avgMovesPerGame.toFixed(1)}
            </Text>
            <Text style={styles.averageLabel}>Moves/Game</Text>
          </View>
          <View style={styles.averageCard}>
            <Clock size={20} color="#4CAF82" />
            <Text style={styles.averageValue}>
              {formatDuration(stats.avgGameDuration)}
            </Text>
            <Text style={styles.averageLabel}>Time/Game</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 24,
  },

  // Compact Mode
  compactContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  compactStat: {
    alignItems: "center",
    gap: 4,
  },
  compactValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  compactLabel: {
    fontSize: 11,
    color: "#A0A0A0",
  },

  // Sections
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Win Rate Ring
  winRateContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 20,
    gap: 24,
  },
  winRateRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: "#4CAF82",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  winRateInner: {
    alignItems: "center",
  },
  winRatePercent: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  winRateLabel: {
    fontSize: 10,
    color: "#A0A0A0",
    textTransform: "uppercase",
  },
  winRateBreakdown: {
    flex: 1,
    gap: 8,
  },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownText: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  totalGamesText: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  statSubValue: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
  },

  // Win Types
  winTypesContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  winTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  winTypeInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: 120,
  },
  winTypeLabel: {
    fontSize: 13,
    color: "#FFFFFF",
  },
  winTypeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    width: 30,
    textAlign: "right",
  },
  winTypeBar: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  winTypeProgress: {
    height: "100%",
    borderRadius: 3,
  },

  // Earnings
  earningsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  earningsLabel: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  earningsValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  earningsDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  netEarnings: {
    fontSize: 16,
    fontWeight: "700",
  },

  // Averages
  averagesRow: {
    flexDirection: "row",
    gap: 12,
  },
  averageCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  averageValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  averageLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
});

export default PlayerStats;
