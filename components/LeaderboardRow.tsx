/**
 * LeaderboardRow Component
 *
 * Displays a single player row in the leaderboard.
 * Optimized with React.memo for FlashList performance.
 * Includes rank change indicators showing movement since last view.
 */

import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import {
  Trophy,
  Award,
  TrendingUp,
  TrendingDown,
  Flame,
  Minus,
  Sparkles,
  Swords,
  Medal,
  Star,
  Zap,
  Crown,
  Target,
  Gamepad2,
} from "lucide-react-native";
import { AvatarDisplay } from "./AvatarPicker";
import type { LeaderboardPlayer } from "@/lib/leaderboard";
import type { RankChange } from "@/hooks/useLeaderboard";
import { usePlayerAchievementBadges } from "@/hooks/useRewards";
import { RARITY_COLORS, type AchievementRarity, type FeaturedAchievement } from "@/lib/rewards";

// ============================================================================
// Types
// ============================================================================

interface LeaderboardRowProps {
  player: LeaderboardPlayer;
  isCurrentUser: boolean;
  onPress?: (player: LeaderboardPlayer) => void;
  onChallenge?: (player: LeaderboardPlayer) => void;
  showWinnings?: boolean;
  rankChange?: RankChange;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getRankColor(rank: number): string {
  switch (rank) {
    case 1:
      return "#FFD700"; // Gold
    case 2:
      return "#C0C0C0"; // Silver
    case 3:
      return "#CD7F32"; // Bronze
    default:
      return "#FFFFFF";
  }
}

function getRankBgColor(rank: number): string {
  switch (rank) {
    case 1:
      return "rgba(255, 215, 0, 0.15)";
    case 2:
      return "rgba(192, 192, 192, 0.15)";
    case 3:
      return "rgba(205, 127, 50, 0.15)";
    default:
      return "transparent";
  }
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
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toFixed(0);
}

// Convert country code to flag emoji
function countryToFlag(countryCode: string | null): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ============================================================================
// Rank Change Indicator Component
// ============================================================================

interface RankChangeIndicatorProps {
  rankChange?: RankChange;
  size?: "small" | "medium";
}

// ============================================================================
// Achievement Icon Mapping
// ============================================================================

const ACHIEVEMENT_ICON_MAP: Record<string, React.ComponentType<any>> = {
  flame: Flame,
  trophy: Trophy,
  target: Target,
  medal: Medal,
  crown: Crown,
  star: Star,
  zap: Zap,
  sword: Swords,
  "trending-up": TrendingUp,
  gamepad: Gamepad2,
  award: Award,
};

function getAchievementIcon(iconName: string): React.ComponentType<any> {
  return ACHIEVEMENT_ICON_MAP[iconName] || Medal;
}

// ============================================================================
// Mini Achievement Badge Component
// ============================================================================

interface MiniAchievementBadgeProps {
  achievement: FeaturedAchievement;
  size?: "tiny" | "small";
}

const MiniAchievementBadge = memo(function MiniAchievementBadge({
  achievement,
  size = "tiny",
}: MiniAchievementBadgeProps) {
  const Icon = getAchievementIcon(achievement.icon);
  const colors = RARITY_COLORS[achievement.rarity];
  const badgeSize = size === "tiny" ? 18 : 22;
  const iconSize = size === "tiny" ? 10 : 12;

  return (
    <View
      style={[
        styles.miniAchievementBadge,
        {
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
    >
      <Icon size={iconSize} color={colors.text} strokeWidth={2} />
    </View>
  );
});

// ============================================================================
// Achievement Badges Row Component
// ============================================================================

interface AchievementBadgesRowProps {
  playerId: string;
  maxBadges?: number;
  size?: "tiny" | "small";
}

const AchievementBadgesRow = memo(function AchievementBadgesRow({
  playerId,
  maxBadges = 3,
  size = "tiny",
}: AchievementBadgesRowProps) {
  const { badges, isLoading } = usePlayerAchievementBadges(playerId);

  if (isLoading || badges.length === 0) {
    return null;
  }

  const displayBadges = badges.slice(0, maxBadges);

  return (
    <View style={styles.achievementBadgesRow}>
      {displayBadges.map((badge, index) => (
        <View
          key={badge.achievementId}
          style={[
            styles.achievementBadgeWrapper,
            { marginLeft: index > 0 ? -4 : 0, zIndex: maxBadges - index },
          ]}
        >
          <MiniAchievementBadge achievement={badge} size={size} />
        </View>
      ))}
      {badges.length > maxBadges && (
        <View style={styles.moreBadgesIndicator}>
          <Text style={styles.moreBadgesText}>+{badges.length - maxBadges}</Text>
        </View>
      )}
    </View>
  );
});

// ============================================================================
// Rank Change Indicator Component
// ============================================================================

const RankChangeIndicator = memo(function RankChangeIndicator({
  rankChange,
  size = "small",
}: RankChangeIndicatorProps) {
  if (!rankChange || rankChange.direction === "same") {
    return null;
  }

  const iconSize = size === "small" ? 10 : 14;
  const fontSize = size === "small" ? 9 : 11;
  const paddingH = size === "small" ? 4 : 6;
  const paddingV = size === "small" ? 2 : 3;

  if (rankChange.direction === "new") {
    return (
      <View style={[styles.rankChangeNew, { paddingHorizontal: paddingH, paddingVertical: paddingV }]}>
        <Sparkles size={iconSize} color="#A78BFA" />
        <Text style={[styles.rankChangeNewText, { fontSize }]}>NEW</Text>
      </View>
    );
  }

  const isUp = rankChange.direction === "up";

  return (
    <View
      style={[
        styles.rankChangeBadge,
        isUp ? styles.rankChangeUp : styles.rankChangeDown,
        { paddingHorizontal: paddingH, paddingVertical: paddingV },
      ]}
    >
      {isUp ? (
        <TrendingUp size={iconSize} color="#4ADE80" />
      ) : (
        <TrendingDown size={iconSize} color="#F87171" />
      )}
      <Text
        style={[
          styles.rankChangeText,
          isUp ? styles.rankChangeTextUp : styles.rankChangeTextDown,
          { fontSize },
        ]}
      >
        {rankChange.change}
      </Text>
    </View>
  );
});

// ============================================================================
// Podium Card Component (for top 3)
// ============================================================================

interface PodiumCardProps {
  player: LeaderboardPlayer;
  isCurrentUser: boolean;
  onPress?: (player: LeaderboardPlayer) => void;
  onChallenge?: (player: LeaderboardPlayer) => void;
  rankChange?: RankChange;
}

export const PodiumCard = memo(function PodiumCard({
  player,
  isCurrentUser,
  onPress,
  onChallenge,
  rankChange,
}: PodiumCardProps) {
  const rankColor = getRankColor(player.rank);

  const content = (
    <View
      style={[
        styles.podiumCard,
        player.rank === 1 && styles.firstPlace,
        isCurrentUser && styles.currentUserPodium,
      ]}
    >
      {/* Rank Badge */}
      <View style={[styles.rankBadge, { backgroundColor: getRankBgColor(player.rank) }]}>
        {player.rank === 1 ? (
          <Trophy size={20} color={rankColor} />
        ) : (
          <Award size={20} color={rankColor} />
        )}
      </View>

      {/* Rank Change Indicator */}
      {rankChange && rankChange.direction !== "same" && (
        <View style={styles.podiumRankChange}>
          <RankChangeIndicator rankChange={rankChange} size="medium" />
        </View>
      )}

      {/* Avatar */}
      {player.profilePictureUrl ? (
        <Image
          source={{ uri: player.profilePictureUrl }}
          style={styles.profilePicturePodium}
        />
      ) : (
        <AvatarDisplay
          index={player.avatarIndex}
          size={56}
          showBorder
        />
      )}

      {/* Username */}
      <Text
        style={[styles.podiumUsername, { color: rankColor }]}
        numberOfLines={1}
      >
        {player.username}
      </Text>

      {/* ELO Rating */}
      <View style={styles.eloContainer}>
        <TrendingUp size={12} color="#4ECDC4" />
        <Text style={styles.eloText}>{player.eloRating}</Text>
      </View>

      {/* Win/Loss Record */}
      <Text style={styles.podiumRecord}>
        {player.gamesWon}W - {player.gamesLost}L
        {player.gamesDrawn > 0 && ` - ${player.gamesDrawn}D`}
      </Text>

      {/* Streak indicator */}
      {player.currentStreak >= 3 && (
        <View style={styles.streakBadge}>
          <Flame size={12} color="#FF6B6B" />
          <Text style={styles.streakText}>{player.currentStreak}</Text>
        </View>
      )}

      {/* Winnings */}
      {player.totalWonTct > 0 && (
        <Text style={styles.podiumWinnings}>
          {formatTCT(player.totalWonTct)} TCT
        </Text>
      )}

      {/* Challenge Button (only if not current user) */}
      {!isCurrentUser && onChallenge && (
        <TouchableOpacity
          style={styles.podiumChallengeButton}
          onPress={() => onChallenge(player)}
          activeOpacity={0.5}
          delayPressIn={0}
        >
          <Swords size={16} color="#0F0F1E" />
        </TouchableOpacity>
      )}

      {/* Current user indicator */}
      {isCurrentUser && (
        <View style={styles.youBadge}>
          <Text style={styles.youBadgeText}>YOU</Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(player)} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

// ============================================================================
// List Row Component (for rank 4+)
// ============================================================================

export const LeaderboardRow = memo(function LeaderboardRow({
  player,
  isCurrentUser,
  onPress,
  onChallenge,
  showWinnings = true,
  rankChange,
}: LeaderboardRowProps) {
  const content = (
    <View
      style={[
        styles.rowContainer,
        isCurrentUser && styles.currentUserRow,
      ]}
    >
      {/* Rank */}
      <View style={styles.rankColumn}>
        <Text
          style={[
            styles.rankNumber,
            isCurrentUser && styles.currentUserRankText,
          ]}
        >
          #{player.rank}
        </Text>
        {/* Rank Change Indicator under rank number */}
        <RankChangeIndicator rankChange={rankChange} size="small" />
      </View>

      {/* Avatar */}
      {player.profilePictureUrl ? (
        <Image
          source={{ uri: player.profilePictureUrl }}
          style={styles.profilePictureRow}
        />
      ) : (
        <AvatarDisplay
          index={player.avatarIndex}
          size={44}
          showBorder={isCurrentUser}
        />
      )}

      {/* Player Info */}
      <View style={styles.playerInfo}>
        <View style={styles.usernameRow}>
          <Text
            style={[
              styles.playerUsername,
              isCurrentUser && styles.currentUserUsername,
            ]}
            numberOfLines={1}
          >
            {player.username}
          </Text>
          {isCurrentUser && (
            <View style={styles.youBadgeSmall}>
              <Text style={styles.youBadgeTextSmall}>YOU</Text>
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.playerStats}>
            {player.gamesWon}W - {player.gamesLost}L
          </Text>
          <View style={styles.eloBadge}>
            <TrendingUp size={10} color="#4ECDC4" />
            <Text style={styles.eloBadgeText}>{player.eloRating}</Text>
          </View>
          {player.currentStreak >= 3 && (
            <View style={styles.streakBadgeSmall}>
              <Flame size={10} color="#FF6B6B" />
              <Text style={styles.streakTextSmall}>{player.currentStreak}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Right Column: Winnings & Challenge */}
      <View style={styles.rightColumn}>
        {/* Winnings */}
        {showWinnings && player.totalWonTct > 0 && (
          <View style={styles.winningsColumn}>
            <Text style={styles.winningsAmount}>
              {formatTCT(player.totalWonTct)} TCT
            </Text>
            <Text style={styles.winningsLabel}>won</Text>
          </View>
        )}

        {/* Challenge Button (only if not current user) */}
        {!isCurrentUser && onChallenge && (
          <TouchableOpacity
            style={styles.challengeButton}
            onPress={() => onChallenge(player)}
            activeOpacity={0.5}
            delayPressIn={0}
          >
            <Swords size={14} color="#0F0F1E" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(player)} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Podium Card Styles
  podiumCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    position: "relative",
    minHeight: 180,
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  firstPlace: {
    borderColor: "#FFD700",
    borderTopColor: "rgba(255, 215, 0, 0.5)",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  currentUserPodium: {
    borderColor: "#4ECDC4",
    borderTopColor: "rgba(78, 205, 196, 0.5)",
    backgroundColor: "rgba(78, 205, 196, 0.05)",
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  podiumUsername: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  eloContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  eloText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  podiumRecord: {
    fontSize: 11,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 4,
  },
  streakText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FF6B6B",
  },
  podiumWinnings: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFD700",
  },
  youBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#4ECDC4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#0F0F1E",
  },

  // List Row Styles
  rowContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  currentUserRow: {
    backgroundColor: "rgba(78, 205, 196, 0.08)",
    borderColor: "#4ECDC4",
    borderTopColor: "rgba(78, 205, 196, 0.5)",
  },
  rankColumn: {
    width: 44,
    alignItems: "center",
    marginRight: 8,
  },
  rankNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: "#A0A0A0",
  },
  currentUserRankText: {
    color: "#4ECDC4",
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerUsername: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  currentUserUsername: {
    color: "#4ECDC4",
  },
  youBadgeSmall: {
    backgroundColor: "#4ECDC4",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  youBadgeTextSmall: {
    fontSize: 8,
    fontWeight: "800",
    color: "#0F0F1E",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  playerStats: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  eloBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  eloBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#4ECDC4",
  },
  streakBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  streakTextSmall: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FF6B6B",
  },
  winningsColumn: {
    alignItems: "flex-end",
  },
  winningsAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFD700",
  },
  winningsLabel: {
    fontSize: 10,
    color: "#A0A0A0",
  },
  // Right column for winnings and challenge
  rightColumn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // Challenge button styles
  challengeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
  },
  podiumChallengeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  podiumRankChange: {
    position: "absolute",
    top: 6,
    left: 6,
  },
  // Rank change indicator styles
  rankChangeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  rankChangeUp: {
    backgroundColor: "rgba(74, 222, 128, 0.15)",
  },
  rankChangeDown: {
    backgroundColor: "rgba(248, 113, 113, 0.15)",
  },
  rankChangeNew: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    borderRadius: 6,
    marginTop: 4,
  },
  rankChangeText: {
    fontWeight: "700",
  },
  rankChangeTextUp: {
    color: "#4ADE80",
  },
  rankChangeTextDown: {
    color: "#F87171",
  },
  rankChangeNewText: {
    fontWeight: "700",
    color: "#A78BFA",
  },

  // Achievement Badge Styles
  miniAchievementBadge: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  achievementBadgesRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  achievementBadgeWrapper: {
    backgroundColor: "#0F0F1E",
    borderRadius: 20,
  },
  moreBadgesIndicator: {
    marginLeft: 2,
    paddingHorizontal: 4,
  },
  moreBadgesText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#606060",
  },
  // Avatar container styles
  avatarContainer: {
    position: "relative",
  },
  avatarContainerRow: {
    position: "relative",
  },
  profilePicturePodium: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  profilePictureRow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  countryBadgePodium: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#1A1A2E",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  countryBadgeRow: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#1A1A2E",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  countryFlag: {
    fontSize: 12,
  },
  countryFlagSmall: {
    fontSize: 10,
  },
});

export default LeaderboardRow;
