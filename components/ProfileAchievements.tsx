/**
 * Profile Achievements Component
 *
 * Displays earned achievements on the profile screen featuring:
 * - Featured achievement highlight
 * - Achievement badge grid
 * - Rarity-based styling
 * - Tap to set featured achievement
 * - Link to full rewards screen
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Medal,
  Star,
  Trophy,
  Flame,
  Target,
  Crown,
  Zap,
  Award,
  Swords,
  TrendingUp,
  Gamepad2,
  ChevronRight,
} from "lucide-react-native";
import {
  useFeaturedAchievement,
  useRewards,
} from "@/hooks/useRewards";
import {
  RARITY_COLORS,
  type AchievementRarity,
  type FeaturedAchievement,
  getRarityLabel,
} from "@/lib/rewards";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Icon Mapping
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType<any>> = {
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

function getIconComponent(iconName: string): React.ComponentType<any> {
  return ICON_MAP[iconName] || Medal;
}

// ============================================================================
// Achievement Badge Component
// ============================================================================

interface AchievementBadgeProps {
  achievement: FeaturedAchievement;
  isFeatured?: boolean;
  onPress?: () => void;
  size?: "small" | "medium" | "large";
}

export function AchievementBadge({
  achievement,
  isFeatured = false,
  onPress,
  size = "medium",
}: AchievementBadgeProps) {
  const Icon = getIconComponent(achievement.icon);
  const colors = RARITY_COLORS[achievement.rarity];

  const sizeStyles = {
    small: { container: 32, icon: 16 },
    medium: { container: 44, icon: 22 },
    large: { container: 56, icon: 28 },
  };

  const { container: containerSize, icon: iconSize } = sizeStyles[size];

  return (
    <TouchableOpacity
      style={[
        styles.badge,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: colors.bg,
          borderColor: isFeatured ? "#FFD700" : colors.border,
          borderWidth: isFeatured ? 2 : 1,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Icon size={iconSize} color={colors.text} strokeWidth={2} />
      {isFeatured && (
        <View style={styles.featuredStar}>
          <Star size={10} color="#FFD700" fill="#FFD700" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Featured Achievement Card
// ============================================================================

interface FeaturedAchievementCardProps {
  achievement: FeaturedAchievement;
  onPress?: () => void;
}

function FeaturedAchievementCard({
  achievement,
  onPress,
}: FeaturedAchievementCardProps) {
  const Icon = getIconComponent(achievement.icon);
  const colors = RARITY_COLORS[achievement.rarity];

  return (
    <TouchableOpacity
      style={[
        styles.featuredCard,
        { borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.featuredIconContainer,
          { backgroundColor: colors.bg, borderColor: colors.border },
        ]}
      >
        <Icon size={28} color={colors.text} strokeWidth={2} />
      </View>
      <View style={styles.featuredInfo}>
        <View style={styles.featuredTitleRow}>
          <Star size={12} color="#FFD700" fill="#FFD700" />
          <Text style={styles.featuredLabel}>Featured Achievement</Text>
        </View>
        <Text style={styles.featuredName} numberOfLines={1}>
          {achievement.name}
        </Text>
        <View
          style={[
            styles.rarityBadge,
            { backgroundColor: colors.bg, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.rarityText, { color: colors.text }]}>
            {getRarityLabel(achievement.rarity)}
          </Text>
        </View>
      </View>
      <ChevronRight size={20} color="#606060" />
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface ProfileAchievementsProps {
  /** User ID to fetch achievements for */
  userId?: string;
  /** Show compact view */
  compact?: boolean;
  /** Maximum badges to show in grid */
  maxBadges?: number;
}

export function ProfileAchievements({
  userId,
  compact = false,
  maxBadges = 6,
}: ProfileAchievementsProps) {
  const router = useRouter();
  const { playButtonPress } = useSoundAndHaptics();

  const {
    featured,
    earnedAchievements,
    setFeatured,
    isLoading,
  } = useFeaturedAchievement();

  const { earnedAchievements: allEarned } = useRewards();

  // Handle navigation to rewards screen
  const handleViewAll = useCallback(() => {
    playButtonPress();
    router.push("/rewards");
  }, [router, playButtonPress]);

  // Handle setting featured achievement
  const handleSetFeatured = useCallback(
    async (achievementId: string) => {
      playButtonPress();
      await setFeatured(achievementId);
    },
    [playButtonPress, setFeatured]
  );

  // Don't render if no earned achievements
  if (!isLoading && allEarned.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Medal size={18} color="#FFD700" />
          <Text style={styles.headerTitle}>Achievements</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Medal size={32} color="#3E3E5E" />
          <Text style={styles.emptyText}>No achievements yet</Text>
          <Text style={styles.emptySubtext}>
            Play games to earn achievements!
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Medal size={18} color="#FFD700" />
          <Text style={styles.headerTitle}>Achievements</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#FFD700" />
        </View>
      </View>
    );
  }

  // Get badges to display (limit to maxBadges)
  const displayBadges = earnedAchievements.slice(0, maxBadges);
  const remainingCount = earnedAchievements.length - maxBadges;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Medal size={18} color="#FFD700" />
        <Text style={styles.headerTitle}>Achievements</Text>
        <TouchableOpacity
          style={styles.viewAllButton}
          onPress={handleViewAll}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ChevronRight size={16} color="#4ECDC4" />
        </TouchableOpacity>
      </View>

      {/* Featured Achievement */}
      {featured && !compact && (
        <FeaturedAchievementCard
          achievement={featured}
          onPress={handleViewAll}
        />
      )}

      {/* Achievement Badges Grid */}
      <View style={styles.badgesContainer}>
        {displayBadges.map((achievement) => (
          <AchievementBadge
            key={achievement.achievementId}
            achievement={achievement}
            isFeatured={featured?.achievementId === achievement.achievementId}
            onPress={() => handleSetFeatured(achievement.achievementId)}
            size={compact ? "small" : "medium"}
          />
        ))}
        {remainingCount > 0 && (
          <TouchableOpacity
            style={styles.moreBadge}
            onPress={handleViewAll}
          >
            <Text style={styles.moreText}>+{remainingCount}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hint text */}
      {!compact && earnedAchievements.length > 0 && (
        <Text style={styles.hintText}>
          Tap an achievement to feature it on your profile
        </Text>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4ECDC4",
  },

  // Featured Card
  featuredCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    gap: 12,
  },
  featuredIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
  },
  featuredInfo: {
    flex: 1,
    gap: 4,
  },
  featuredTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  featuredLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFD700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  featuredName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  rarityText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // Badges Grid
  badgesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  featuredStar: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#0F0F1E",
    borderRadius: 8,
    padding: 2,
  },
  moreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  moreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#A0A0A0",
  },

  // Hint
  hintText: {
    fontSize: 11,
    color: "#606060",
    textAlign: "center",
    marginTop: 4,
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 12,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#808080",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#606060",
  },

  // Loading
  loadingContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
});

export default ProfileAchievements;
