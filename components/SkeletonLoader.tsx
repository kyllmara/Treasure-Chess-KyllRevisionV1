/**
 * Skeleton Loader Components
 *
 * Reusable loading skeleton components for async states.
 * Provides visual feedback during data loading.
 */

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// ============================================================================
// Types
// ============================================================================

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

interface SkeletonCardProps {
  lines?: number;
  showAvatar?: boolean;
  style?: ViewStyle;
}

// ============================================================================
// Base Skeleton Component
// ============================================================================

export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ============================================================================
// Skeleton Card
// ============================================================================

export function SkeletonCard({ lines = 3, showAvatar = false, style }: SkeletonCardProps) {
  return (
    <View style={[styles.card, style]}>
      {showAvatar && (
        <View style={styles.cardHeader}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={styles.cardHeaderText}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} style={styles.mt8} />
          </View>
        </View>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? "70%" : "100%"}
          height={14}
          style={i > 0 ? styles.mt12 : undefined}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Skeleton Grid
// ============================================================================

interface SkeletonGridProps {
  columns?: number;
  rows?: number;
  itemHeight?: number;
  gap?: number;
  style?: ViewStyle;
}

export function SkeletonGrid({
  columns = 3,
  rows = 2,
  itemHeight = 80,
  gap = 12,
  style,
}: SkeletonGridProps) {
  const items = columns * rows;
  const itemWidth = `${(100 - (gap * (columns - 1)) / 3) / columns}%`;

  return (
    <View style={[styles.grid, { gap }, style]}>
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton
          key={i}
          width={itemWidth}
          height={itemHeight}
          borderRadius={12}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Skeleton List
// ============================================================================

interface SkeletonListProps {
  count?: number;
  showAvatar?: boolean;
  style?: ViewStyle;
}

export function SkeletonList({ count = 5, showAvatar = true, style }: SkeletonListProps) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.listItem, i > 0 && styles.mt12]}>
          {showAvatar && (
            <Skeleton width={40} height={40} borderRadius={20} />
          )}
          <View style={styles.listItemContent}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="50%" height={12} style={styles.mt8} />
          </View>
          <Skeleton width={60} height={24} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Matchmaking Skeleton
// ============================================================================

export function MatchmakingSelectionSkeleton() {
  return (
    <View style={styles.matchmakingContainer}>
      {/* Header */}
      <View style={styles.headerSkeleton}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <Skeleton width={150} height={28} style={styles.mt16} />
        <Skeleton width={200} height={16} style={styles.mt8} />
      </View>

      {/* Stake Selector */}
      <View style={styles.selectorSkeleton}>
        <Skeleton width={120} height={18} />
        <View style={styles.stakeGridSkeleton}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              width="30%"
              height={80}
              borderRadius={12}
            />
          ))}
        </View>
      </View>

      {/* Time Control Selector */}
      <View style={styles.selectorSkeleton}>
        <Skeleton width={120} height={18} />
        <View style={styles.tabsSkeleton}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              width="23%"
              height={40}
              borderRadius={10}
            />
          ))}
        </View>
        <View style={styles.timeControlGridSkeleton}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              width="31%"
              height={100}
              borderRadius={12}
            />
          ))}
        </View>
      </View>

      {/* Start Button */}
      <Skeleton
        width="100%"
        height={56}
        borderRadius={16}
        style={styles.mt24}
      />
    </View>
  );
}

// ============================================================================
// Searching Skeleton
// ============================================================================

export function MatchmakingSearchingSkeleton() {
  return (
    <View style={styles.searchingContainer}>
      {/* Header */}
      <View style={styles.headerSkeleton}>
        <Skeleton width={64} height={64} borderRadius={32} />
        <Skeleton width={180} height={28} style={styles.mt16} />
        <Skeleton width={140} height={16} style={styles.mt8} />
      </View>

      {/* Searching Card */}
      <View style={styles.searchingCardSkeleton}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <Skeleton width={80} height={24} style={styles.mt16} />
        <Skeleton width={100} height={16} style={styles.mt12} />
      </View>

      {/* Stats */}
      <View style={styles.statsSkeleton}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.statCardSkeleton}>
            <Skeleton width={40} height={24} />
            <Skeleton width={60} height={12} style={styles.mt8} />
          </View>
        ))}
      </View>

      {/* Info Card */}
      <View style={styles.infoCardSkeleton}>
        <Skeleton width={24} height={24} borderRadius={12} />
        <Skeleton width={120} height={18} style={styles.mt12} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            width={i === 3 ? "70%" : "90%"}
            height={14}
            style={styles.mt8}
          />
        ))}
      </View>

      {/* Cancel Button */}
      <Skeleton
        width="100%"
        height={52}
        borderRadius={12}
        style={styles.mt24}
      />
    </View>
  );
}

// ============================================================================
// Pre-Game Skeleton
// ============================================================================

export function PreGameReadySkeleton() {
  return (
    <View style={styles.preGameContainer}>
      {/* Title */}
      <Skeleton width={200} height={32} style={styles.mb40} />

      {/* Players Row */}
      <View style={styles.playersRowSkeleton}>
        {/* Player Card */}
        <View style={styles.playerCardSkeleton}>
          <Skeleton width={60} height={60} borderRadius={30} />
          <Skeleton width={80} height={16} style={styles.mt12} />
          <Skeleton width={60} height={14} style={styles.mt8} />
          <Skeleton width={50} height={12} style={styles.mt8} />
        </View>

        <Skeleton width={40} height={24} />

        {/* Opponent Card */}
        <View style={styles.playerCardSkeleton}>
          <Skeleton width={60} height={60} borderRadius={30} />
          <Skeleton width={80} height={16} style={styles.mt12} />
          <Skeleton width={60} height={14} style={styles.mt8} />
          <Skeleton width={50} height={12} style={styles.mt8} />
        </View>
      </View>

      {/* Ready Button */}
      <Skeleton
        width={200}
        height={56}
        borderRadius={16}
        style={styles.mt40}
      />
    </View>
  );
}

// ============================================================================
// Leaderboard Skeleton
// ============================================================================

export function LeaderboardSkeleton({ count = 10 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.leaderboardItem, i > 0 && styles.mt12]}>
          <Skeleton width={30} height={24} borderRadius={4} />
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={styles.leaderboardContent}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} style={styles.mt4} />
          </View>
          <View style={styles.leaderboardStats}>
            <Skeleton width={50} height={20} />
            <Skeleton width={40} height={12} style={styles.mt4} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  // Matchmaking specific
  matchmakingContainer: {
    flex: 1,
    padding: 20,
    paddingTop: 80,
  },
  headerSkeleton: {
    alignItems: "center",
    marginBottom: 32,
  },
  selectorSkeleton: {
    marginBottom: 24,
  },
  stakeGridSkeleton: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  tabsSkeleton: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  timeControlGridSkeleton: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  // Searching specific
  searchingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  searchingCardSkeleton: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
  },
  statsSkeleton: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  statCardSkeleton: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  infoCardSkeleton: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
  },
  // Pre-game specific
  preGameContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  playersRowSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
  },
  playerCardSkeleton: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "40%",
  },
  // Leaderboard specific
  leaderboardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  leaderboardContent: {
    flex: 1,
  },
  leaderboardStats: {
    alignItems: "flex-end",
  },
  // Spacing utilities
  mt4: {
    marginTop: 4,
  },
  mt8: {
    marginTop: 8,
  },
  mt12: {
    marginTop: 12,
  },
  mt16: {
    marginTop: 16,
  },
  mt24: {
    marginTop: 24,
  },
  mt40: {
    marginTop: 40,
  },
  mb40: {
    marginBottom: 40,
  },
});
