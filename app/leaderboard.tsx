/**
 * Leaderboard Screen
 *
 * Elite-level leaderboard with real-time Supabase integration featuring:
 * - FlashList virtualization for smooth 60fps scrolling
 * - Time period filtering (All-Time, Monthly, Weekly)
 * - Sort options (ELO, Earnings, Wins)
 * - Real-time rank updates via Supabase subscriptions
 * - Rank change indicators showing movement since last view
 * - Current user highlighting with rank display
 * - Skeleton loading states
 * - Error recovery with retry
 * - Pull-to-refresh functionality
 * - Challenge other players directly
 */

import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  TrendingUp,
  Trophy,
  Calendar,
  CalendarDays,
  Clock,
  RefreshCw,
  AlertCircle,
  Medal,
  Crown,
  Coins,
  Target,
  ArrowLeft,
} from "lucide-react-native";
import { useRouter } from "expo-router";

import { useLeaderboard, formatRank, SortBy, RankChange } from "@/hooks/useLeaderboard";
import { TimePeriod, LeaderboardPlayer } from "@/lib/leaderboard";
import { LeaderboardRow, PodiumCard } from "@/components/LeaderboardRow";
import { LeaderboardSkeleton, Skeleton } from "@/components/SkeletonLoader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

interface FilterOption<T> {
  value: T;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// Constants
// ============================================================================

const TIME_PERIOD_OPTIONS: FilterOption<TimePeriod>[] = [
  { value: "all", label: "All-Time", icon: <Trophy size={14} color="#FFD700" /> },
  { value: "monthly", label: "Monthly", icon: <CalendarDays size={14} color="#FFD700" /> },
  { value: "weekly", label: "Weekly", icon: <Calendar size={14} color="#FFD700" /> },
];

const SORT_OPTIONS: FilterOption<SortBy>[] = [
  { value: "elo", label: "ELO", icon: <TrendingUp size={14} color="#4CAF82" /> },
  { value: "earnings", label: "Earnings", icon: <Coins size={14} color="#FFD700" /> },
  { value: "wins", label: "Wins", icon: <Target size={14} color="#4ADE80" /> },
];

// ============================================================================
// Podium Component
// ============================================================================

interface PodiumSectionProps {
  players: LeaderboardPlayer[];
  currentUserId?: string;
  onChallenge: (player: LeaderboardPlayer) => void;
  rankChanges: Map<string, RankChange>;
}

function PodiumSection({ players, currentUserId, onChallenge, rankChanges }: PodiumSectionProps) {
  const topThree = players.slice(0, 3);

  if (topThree.length === 0) {
    return null;
  }

  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = [
    topThree[1], // 2nd place (left)
    topThree[0], // 1st place (center, taller)
    topThree[2], // 3rd place (right)
  ].filter(Boolean);

  return (
    <View style={styles.podiumContainer}>
      {podiumOrder.map((player, index) => {
        if (!player) return null;
        const isFirst = player.rank === 1;
        return (
          <View
            key={player.id}
            style={[
              styles.podiumSlot,
              isFirst && styles.podiumSlotFirst,
            ]}
          >
            <PodiumCard
              player={player}
              isCurrentUser={player.id === currentUserId}
              onChallenge={onChallenge}
              rankChange={rankChanges.get(player.id)}
            />
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// Current User Rank Banner
// ============================================================================

interface UserRankBannerProps {
  rank: number | null;
  totalPlayers: number;
  player: LeaderboardPlayer | null;
}

function UserRankBanner({ rank, totalPlayers, player }: UserRankBannerProps) {
  if (rank === null || !player) {
    return null;
  }

  // Only show if user is not in top 100 (they'd see themselves in the list)
  if (rank <= 100) {
    return null;
  }

  return (
    <View style={styles.userRankBanner}>
      <View style={styles.userRankLeft}>
        <Medal size={20} color="#4CAF82" />
        <Text style={styles.userRankLabel}>Your Rank</Text>
      </View>
      <View style={styles.userRankRight}>
        <Text style={styles.userRankNumber}>{formatRank(rank)}</Text>
        <Text style={styles.userRankTotal}>of {totalPlayers.toLocaleString()}</Text>
      </View>
    </View>
  );
}

// ============================================================================
// Filter Pills Component
// ============================================================================

interface FilterPillsProps<T> {
  options: FilterOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

function FilterPills<T extends string>({
  options,
  selected,
  onSelect,
}: FilterPillsProps<T>) {
  return (
    <View style={styles.filterPills}>
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.filterPill,
              isActive && styles.filterPillActive,
            ]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.7}
          >
            {option.icon}
            <Text
              style={[
                styles.filterPillText,
                isActive && styles.filterPillTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ============================================================================
// Error State Component
// ============================================================================

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
  isRetrying: boolean;
}

function ErrorState({ error, onRetry, isRetrying }: ErrorStateProps) {
  return (
    <View style={styles.errorContainer}>
      <AlertCircle size={48} color="#F87171" />
      <Text style={styles.errorTitle}>Failed to Load Leaderboard</Text>
      <Text style={styles.errorMessage}>
        {error.message || "An unexpected error occurred"}
      </Text>
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        disabled={isRetrying}
        activeOpacity={0.7}
      >
        {isRetrying ? (
          <ActivityIndicator size="small" color="#0F0F1E" />
        ) : (
          <>
            <RefreshCw size={18} color="#0F0F1E" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  timePeriod: TimePeriod;
}

function EmptyState({ timePeriod }: EmptyStateProps) {
  const periodLabel = timePeriod === "weekly" ? "this week" : timePeriod === "monthly" ? "this month" : "";

  return (
    <View style={styles.emptyContainer}>
      <Trophy size={48} color="#A0A0A0" />
      <Text style={styles.emptyTitle}>No Rankings Yet</Text>
      <Text style={styles.emptyMessage}>
        {periodLabel
          ? `No games have been played ${periodLabel}. Be the first!`
          : "Play some games to appear on the leaderboard!"}
      </Text>
    </View>
  );
}

// ============================================================================
// Loading State Component
// ============================================================================

function LoadingState() {
  return (
    <View style={styles.loadingContainer}>
      {/* Podium skeleton */}
      <View style={styles.podiumSkeleton}>
        <View style={styles.podiumSlot}>
          <Skeleton width="100%" height={180} borderRadius={16} />
        </View>
        <View style={[styles.podiumSlot, styles.podiumSlotFirst]}>
          <Skeleton width="100%" height={200} borderRadius={16} />
        </View>
        <View style={styles.podiumSlot}>
          <Skeleton width="100%" height={180} borderRadius={16} />
        </View>
      </View>
      {/* List skeleton */}
      <LeaderboardSkeleton count={7} />
    </View>
  );
}

// ============================================================================
// Main Screen Component
// ============================================================================

export default function LeaderboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const currentUserId = user?.id;
  const [userBalance, setUserBalance] = useState<number>(0);

  // Pre-fetch user balance for faster challenge screen loading
  useEffect(() => {
    if (!currentUserId) return;
    supabase
      .from("balances")
      .select("available_tct")
      .eq("user_id", currentUserId)
      .single()
      .then(({ data }) => {
        if (data) setUserBalance(Number(data.available_tct) || 0);
      });
  }, [currentUserId]);

  const {
    players,
    currentUserRank,
    currentUserPlayer,
    totalPlayers,
    rankChanges,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    timePeriod,
    sortBy,
    setTimePeriod,
    setSortBy,
    refresh,
    forceRefresh,
  } = useLeaderboard({
    initialPeriod: "all",
    limit: 100,
    enableRealtime: true,
  });

  // Handle challenge player - use setTimeout(0) for instant button response
  const handleChallenge = useCallback(
    (player: LeaderboardPlayer) => {
      // Defer navigation to next tick so button press feels instant
      setTimeout(() => {
        router.push({
          pathname: "/challenge-player" as any,
          params: {
            playerId: player.id,
            playerName: player.username,
            playerRating: player.eloRating.toString(),
            playerAvatar: player.avatarIndex.toString(),
            playerProfilePicture: player.profilePictureUrl || "",
            userBalance: userBalance.toString(),
            source: "leaderboard",
          },
        });
      }, 0);
    },
    [router, userBalance]
  );

  // Get players for list (excluding top 3 which are in podium)
  const listPlayers = useMemo(() => {
    return players.slice(3);
  }, [players]);

  // Render list item
  const renderItem = useCallback(
    ({ item }: { item: LeaderboardPlayer }) => (
      <LeaderboardRow
        player={item}
        isCurrentUser={item.id === currentUserId}
        onChallenge={handleChallenge}
        showWinnings={sortBy === "earnings"}
        rankChange={rankChanges.get(item.id)}
      />
    ),
    [currentUserId, handleChallenge, sortBy, rankChanges]
  );

  // Key extractor
  const keyExtractor = useCallback((item: LeaderboardPlayer) => item.id, []);

  // List header component
  const ListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Crown size={32} color="#FFD700" />
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>
            {totalPlayers.toLocaleString()} players ranked
          </Text>
        </View>

        {/* Time Period Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Time Period</Text>
          <FilterPills
            options={TIME_PERIOD_OPTIONS}
            selected={timePeriod}
            onSelect={setTimePeriod}
          />
        </View>

        {/* Sort Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Sort By</Text>
          <FilterPills
            options={SORT_OPTIONS}
            selected={sortBy}
            onSelect={setSortBy}
          />
        </View>

        {/* User Rank Banner (if not in top 100) */}
        <UserRankBanner
          rank={currentUserRank}
          totalPlayers={totalPlayers}
          player={currentUserPlayer}
        />

        {/* Podium */}
        {players.length > 0 && (
          <PodiumSection
            players={players}
            currentUserId={currentUserId}
            onChallenge={handleChallenge}
            rankChanges={rankChanges}
          />
        )}

        {/* Divider with label */}
        {listPlayers.length > 0 && (
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Rankings</Text>
            <View style={styles.divider} />
          </View>
        )}
      </View>
    ),
    [
      totalPlayers,
      timePeriod,
      setTimePeriod,
      sortBy,
      setSortBy,
      currentUserRank,
      currentUserPlayer,
      players,
      currentUserId,
      handleChallenge,
      rankChanges,
      listPlayers.length,
    ]
  );

  // List footer component
  const ListFooter = useCallback(
    () => (
      <View style={styles.listFooter}>
        {lastUpdated && (
          <Text style={styles.lastUpdated}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </Text>
        )}
      </View>
    ),
    [lastUpdated]
  );

  // Empty component
  const ListEmpty = useCallback(
    () =>
      !isLoading && !error ? <EmptyState timePeriod={timePeriod} /> : null,
    [isLoading, error, timePeriod]
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          {isLoading ? (
            <View style={styles.content}>
              {/* Header skeleton */}
              <View style={styles.header}>
                <Skeleton width={32} height={32} borderRadius={8} />
                <Skeleton width={180} height={28} style={{ marginTop: 12 }} />
                <Skeleton width={120} height={16} style={{ marginTop: 8 }} />
              </View>

              {/* Filter skeleton */}
              <View style={styles.filterSection}>
                <Skeleton width={80} height={14} />
                <View style={[styles.filterPills, { marginTop: 8 }]}>
                  <Skeleton width="30%" height={36} borderRadius={12} />
                  <Skeleton width="30%" height={36} borderRadius={12} />
                  <Skeleton width="30%" height={36} borderRadius={12} />
                </View>
              </View>

              <LoadingState />
            </View>
          ) : error ? (
            <View style={styles.content}>
              <ErrorState
                error={error}
                onRetry={forceRefresh}
                isRetrying={isRefreshing}
              />
            </View>
          ) : (
            <FlashList
              data={listPlayers}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ListHeaderComponent={ListHeader}
              ListFooterComponent={ListFooter}
              ListEmptyComponent={ListEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={refresh}
                  tintColor="#FFD700"
                  colors={["#FFD700"]}
                />
              }
            />
          )}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
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
  content: {
    flex: 1,
    padding: 20,
  },
  listContent: {
    padding: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  // Filter Section
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterPillActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  filterPillTextActive: {
    color: "#FFD700",
  },
  // User Rank Banner
  userRankBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  userRankLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  userRankLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF82",
  },
  userRankRight: {
    alignItems: "flex-end",
  },
  userRankNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#4CAF82",
  },
  userRankTotal: {
    fontSize: 11,
    color: "#A0A0A0",
  },
  // Podium
  podiumContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  podiumSlot: {
    flex: 1,
    maxWidth: 120,
  },
  podiumSlotFirst: {
    marginBottom: 16,
  },
  podiumSkeleton: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  // Divider
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // List Header/Footer
  listHeader: {
    marginBottom: 8,
  },
  listFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  lastUpdated: {
    fontSize: 11,
    color: "#606060",
  },
  // Loading State
  loadingContainer: {
    flex: 1,
  },
  // Error State
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 24,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  // Empty State
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptyMessage: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
});
