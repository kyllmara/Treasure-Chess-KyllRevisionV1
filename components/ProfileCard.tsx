import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { AvatarDisplay } from "@/components/AvatarPicker";
import { Trophy, Zap, Target, TrendingUp } from "lucide-react-native";
import { sanitizeForDisplay } from "@/lib/security";

type ProfileCardProps = {
  username: string;
  avatarIndex: number;
  eloRating?: number;
  totalGames?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  winStreak?: number;
  earnings?: number;
  compact?: boolean;
};

export function ProfileCard({
  username,
  avatarIndex,
  eloRating = 0,
  totalGames = 0,
  wins = 0,
  losses = 0,
  draws = 0,
  winStreak = 0,
  earnings = 0,
  compact = false,
}: ProfileCardProps) {
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  // Sanitize user-generated content for safe display
  const safeUsername = sanitizeForDisplay(username);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <AvatarDisplay index={avatarIndex} size={48} showBorder />
        <View style={styles.compactInfo}>
          <Text style={styles.compactUsername}>{safeUsername}</Text>
          <View style={styles.compactStats}>
            <Text style={styles.compactRating}>{eloRating} ELO</Text>
            <Text style={styles.compactRecord}>
              {wins}W - {losses}L
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <AvatarDisplay index={avatarIndex} size={80} showBorder />
        <View style={styles.headerInfo}>
          <Text style={styles.username}>{safeUsername}</Text>
          <View style={styles.ratingBadge}>
            <Trophy size={16} color="#FFD700" />
            <Text style={styles.ratingText}>{eloRating} ELO</Text>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Target size={18} color="#4ECDC4" />
          </View>
          <Text style={styles.statValue}>{totalGames}</Text>
          <Text style={styles.statLabel}>Games</Text>
        </View>

        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <TrendingUp size={18} color="#4CAF50" />
          </View>
          <Text style={styles.statValue}>{winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>

        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Zap size={18} color="#FF9800" />
          </View>
          <Text style={styles.statValue}>{winStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
      </View>

      {/* Record */}
      <View style={styles.recordContainer}>
        <View style={styles.recordItem}>
          <Text style={[styles.recordValue, styles.wins]}>{wins}</Text>
          <Text style={styles.recordLabel}>Wins</Text>
        </View>
        <View style={styles.recordDivider} />
        <View style={styles.recordItem}>
          <Text style={[styles.recordValue, styles.losses]}>{losses}</Text>
          <Text style={styles.recordLabel}>Losses</Text>
        </View>
        <View style={styles.recordDivider} />
        <View style={styles.recordItem}>
          <Text style={[styles.recordValue, styles.draws]}>{draws}</Text>
          <Text style={styles.recordLabel}>Draws</Text>
        </View>
      </View>

      {/* Earnings */}
      {earnings > 0 && (
        <View style={styles.earningsContainer}>
          <Text style={styles.earningsLabel}>Total Earnings</Text>
          <Text style={styles.earningsValue}>
            ${earnings.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  headerInfo: {
    flex: 1,
  },
  username: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  ratingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  recordContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 12,
    padding: 16,
    justifyContent: "space-around",
  },
  recordItem: {
    alignItems: "center",
  },
  recordDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  recordValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  wins: {
    color: "#4CAF50",
  },
  losses: {
    color: "#F44336",
  },
  draws: {
    color: "#9E9E9E",
  },
  recordLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  earningsContainer: {
    marginTop: 16,
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  earningsLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFD700",
  },
  // Compact styles
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  compactInfo: {
    flex: 1,
  },
  compactUsername: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  compactStats: {
    flexDirection: "row",
    gap: 12,
  },
  compactRating: {
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "500",
  },
  compactRecord: {
    fontSize: 13,
    color: "#888",
  },
});
