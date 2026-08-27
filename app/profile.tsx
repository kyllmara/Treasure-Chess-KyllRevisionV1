/**
 * Profile Screen
 *
 * Displays comprehensive player profile with:
 * - User info header with avatar and ELO
 * - Quick stats summary
 * - Detailed statistics section
 * - Game history with infinite scroll
 * - Pull-to-refresh
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Settings,
  Trophy,
  TrendingUp,
  Target,
  Flame,
  ChevronRight,
  History,
  BarChart3,
  Edit3,
} from "lucide-react-native";
import { useUserStore } from "@/stores/userStore";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { useProfileSync } from "@/hooks/useProfileSync";
import { AvatarDisplay } from "@/components/AvatarPicker";
import { PlayerStats } from "@/components/PlayerStats";
import {
  GameHistoryCard,
  GameHistoryCardSkeleton,
} from "@/components/GameHistoryCard";
import {
  SyncStatusIndicator,
  EloChangeAnimation,
} from "@/components/SyncStatusIndicator";
import { ProfileAchievements } from "@/components/ProfileAchievements";
import {
  fetchGameHistory,
  fetchPlayerStats,
  clearGameHistoryCache,
  type GameHistoryItem,
  type PlayerStats as PlayerStatsType,
} from "@/lib/gameHistory";
import { Header3D } from "@/components/Header3D";
import { FontFamily, Colors, TextShadows } from "@/constants/theme";
import { sanitizeForDisplay } from "@/lib/security";

// ============================================================================
// Types
// ============================================================================

type ViewMode = "stats" | "history";

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PAGE_SIZE = 20;

// ============================================================================
// Main Component
// ============================================================================

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { playButtonPress } = useSoundAndHaptics();
  const flatListRef = useRef<FlatList>(null);

  // Profile sync hook
  const {
    isSyncing,
    lastSyncedAt,
    syncError,
    isOnline,
    eloChange,
    clearEloChange,
    syncNow,
  } = useProfileSync();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>("stats");
  const [stats, setStats] = useState<PlayerStatsType | null>(null);
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMoreGames, setHasMoreGames] = useState(true);
  const [totalGames, setTotalGames] = useState(0);

  // Animation for tab indicator
  const tabIndicatorPosition = useRef(new Animated.Value(0)).current;

  const userId = profile?.id;

  // ========================================================================
  // Data Fetching
  // ========================================================================

  const loadStats = useCallback(async (forceRefresh: boolean = false) => {
    if (!userId) return;

    try {
      const result = await fetchPlayerStats(userId, forceRefresh);
      setStats(result);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, [userId]);

  const loadGames = useCallback(async (forceRefresh: boolean = false) => {
    if (!userId) return;

    setIsLoadingGames(true);
    try {
      const result = await fetchGameHistory(userId, PAGE_SIZE, 0, forceRefresh);
      setGames(result.games);
      setHasMoreGames(result.hasMore);
      setTotalGames(result.totalGames);
    } catch (error) {
      console.error("Failed to load games:", error);
    } finally {
      setIsLoadingGames(false);
    }
  }, [userId]);

  const loadMoreGames = useCallback(async () => {
    if (!userId || isLoadingMore || !hasMoreGames) return;

    setIsLoadingMore(true);
    try {
      const result = await fetchGameHistory(userId, PAGE_SIZE, games.length);
      setGames(prev => [...prev, ...result.games]);
      setHasMoreGames(result.hasMore);
    } catch (error) {
      console.error("Failed to load more games:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, games.length, isLoadingMore, hasMoreGames]);

  // Initial load
  useEffect(() => {
    setIsLoadingStats(true);
    Promise.all([loadStats(), loadGames()]).finally(() => {
      setIsLoadingStats(false);
    });
  }, [loadStats, loadGames]);

  // ========================================================================
  // Handlers
  // ========================================================================

  const handleRefresh = useCallback(async () => {
    if (!userId) return;

    setIsRefreshing(true);
    clearGameHistoryCache(userId);
    // Also sync profile from server
    await Promise.all([loadStats(true), loadGames(true), syncNow()]);
    setIsRefreshing(false);
  }, [userId, loadStats, loadGames, syncNow]);

  const handleTabChange = useCallback((mode: ViewMode) => {
    if (mode !== viewMode) {
      setViewMode(mode);
      playButtonPress();

      Animated.spring(tabIndicatorPosition, {
        toValue: mode === "stats" ? 0 : 1,
        useNativeDriver: true,
        tension: 300,
        friction: 30,
      }).start();
    }
  }, [viewMode, playButtonPress, tabIndicatorPosition]);

  const handleGamePress = useCallback((game: GameHistoryItem) => {
    playButtonPress();
    router.push({
      pathname: "/game-detail",
      params: { gameId: game.id },
    });
  }, [router, playButtonPress]);

  const handleSettingsPress = useCallback(() => {
    playButtonPress();
    router.push("/settings");
  }, [router, playButtonPress]);

  const handleEditProfile = useCallback(() => {
    playButtonPress();
    // Edit profile functionality - could navigate to settings or show modal
    router.push("/settings" as const);
  }, [router, playButtonPress]);

  // ========================================================================
  // Computed Values
  // ========================================================================

  const quickStats = useMemo(() => {
    if (!profile) return null;
    return {
      wins: profile.gamesWon,
      winRate: profile.gamesPlayed > 0
        ? ((profile.gamesWon / profile.gamesPlayed) * 100).toFixed(0)
        : "0",
      elo: profile.eloRating,
      streak: profile.currentStreak,
    };
  }, [profile]);

  // ========================================================================
  // Render Functions
  // ========================================================================

  const renderHeader = useCallback(() => (
    <View>
      {/* Sync Status Indicator */}
      <View style={styles.syncStatusContainer}>
        <SyncStatusIndicator showTimestamp />
      </View>

      {/* User Info Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarSection}>
          <AvatarDisplay
            index={profile?.avatarIndex || 0}
            size={80}
            showBorder
          />
          <TouchableOpacity
            style={styles.editAvatarButton}
            onPress={handleEditProfile}
          >
            <Edit3 size={14} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.username}>{sanitizeForDisplay(profile?.username || "Player")}</Text>

        <View style={styles.eloContainer}>
          <TrendingUp size={16} color={Colors.secondary} />
          <Text style={styles.eloText}>{profile?.eloRating || 0} ELO</Text>
        </View>

        {/* Quick Stats */}
        {quickStats && (
          <View style={styles.quickStatsContainer}>
            <View style={styles.quickStat}>
              <Trophy size={16} color="#FFD700" />
              <Text style={styles.quickStatValue}>{quickStats.wins}</Text>
              <Text style={styles.quickStatLabel}>Wins</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Target size={16} color="#4CAF82" />
              <Text style={styles.quickStatValue}>{quickStats.winRate}%</Text>
              <Text style={styles.quickStatLabel}>Win Rate</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Flame size={16} color="#E05C5C" />
              <Text style={styles.quickStatValue}>{quickStats.streak}</Text>
              <Text style={styles.quickStatLabel}>Streak</Text>
            </View>
          </View>
        )}
      </View>

      {/* Achievements Section */}
      <ProfileAchievements userId={userId} maxBadges={6} />

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              transform: [
                {
                  translateX: tabIndicatorPosition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, (SCREEN_WIDTH - 32) / 2],
                  }),
                },
              ],
            },
          ]}
        />
        <TouchableOpacity
          style={styles.tab}
          onPress={() => handleTabChange("stats")}
        >
          <BarChart3
            size={16}
            color={viewMode === "stats" ? "#0F0F1E" : "#A0A0A0"}
          />
          <Text
            style={[
              styles.tabText,
              viewMode === "stats" && styles.tabTextActive,
            ]}
          >
            Statistics
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => handleTabChange("history")}
        >
          <History
            size={16}
            color={viewMode === "history" ? "#0F0F1E" : "#A0A0A0"}
          />
          <Text
            style={[
              styles.tabText,
              viewMode === "history" && styles.tabTextActive,
            ]}
          >
            History
          </Text>
          {totalGames > 0 && (
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>{totalGames}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats Section (when in stats mode) */}
      {viewMode === "stats" && (
        <View style={styles.statsSection}>
          {isLoadingStats ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFD700" />
              <Text style={styles.loadingText}>Loading statistics...</Text>
            </View>
          ) : stats ? (
            <PlayerStats stats={stats} />
          ) : (
            <View style={styles.emptyContainer}>
              <BarChart3 size={48} color="#3E3E5E" />
              <Text style={styles.emptyTitle}>No stats yet</Text>
              <Text style={styles.emptySubtitle}>
                Play some games to build your statistics!
              </Text>
            </View>
          )}
        </View>
      )}

      {/* History Section Header */}
      {viewMode === "history" && (
        <View style={styles.historySectionHeader}>
          <Text style={styles.historySectionTitle}>Game History</Text>
          <Text style={styles.historySectionSubtitle}>
            {totalGames} games played
          </Text>
        </View>
      )}
    </View>
  ), [
    profile,
    quickStats,
    viewMode,
    stats,
    isLoadingStats,
    totalGames,
    tabIndicatorPosition,
    handleTabChange,
    handleEditProfile,
  ]);

  const renderGameItem = useCallback(({ item }: { item: GameHistoryItem }) => (
    <GameHistoryCard game={item} onPress={handleGamePress} />
  ), [handleGamePress]);

  const renderFooter = useCallback(() => {
    if (!hasMoreGames || viewMode !== "history") return null;

    if (isLoadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#FFD700" />
        </View>
      );
    }

    return null;
  }, [isLoadingMore, hasMoreGames, viewMode]);

  const renderEmpty = useCallback(() => {
    if (viewMode !== "history") return null;

    if (isLoadingGames) {
      return (
        <View style={styles.loadingGamesContainer}>
          {[1, 2, 3].map((i) => (
            <GameHistoryCardSkeleton key={i} />
          ))}
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <History size={48} color="#3E3E5E" />
        <Text style={styles.emptyTitle}>No games yet</Text>
        <Text style={styles.emptySubtitle}>
          Start playing to build your game history!
        </Text>
      </View>
    );
  }, [viewMode, isLoadingGames]);

  const keyExtractor = useCallback((item: GameHistoryItem) => item.id, []);

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header with Back Button */}
      <Header3D
        title="Profile"
        subtitle="Your gaming stats"
        showBack
        rightContent={
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleSettingsPress}
          >
            <Settings size={24} color={Colors.primary} />
          </TouchableOpacity>
        }
      />

      {/* ELO Change Animation Overlay */}
      {eloChange && (
        <EloChangeAnimation
          previousElo={eloChange.previousElo}
          newElo={eloChange.newElo}
          change={eloChange.change}
          onAnimationComplete={clearEloChange}
        />
      )}

      <FlatList
        ref={flatListRef}
        data={viewMode === "history" ? games : []}
        renderItem={renderGameItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={viewMode === "history" ? loadMoreGames : undefined}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
            colors={["#FFD700"]}
          />
        }
      />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // Sync Status
  syncStatusContainer: {
    marginBottom: 16,
  },

  // Settings Button
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 215, 0, 0.3)",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  // Profile Header
  profileHeader: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 24,
  },
  avatarSection: {
    position: "relative",
  },
  editAvatarButton: {
    position: "absolute",
    bottom: 0,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#9B7EC8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0F0F1E",
  },
  // Clean styling - no explicit fontFamily
  username: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginTop: 16,
    letterSpacing: 0.5,
  },
  eloContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "rgba(155, 126, 200, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  eloText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.secondary,
  },

  // Quick Stats
  quickStatsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    borderTopColor: "rgba(255, 215, 0, 0.4)",
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  quickStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  quickStatLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  // Tabs
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    position: "relative",
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
  tabIndicator: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    backgroundColor: "#FFD700",
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  tabTextActive: {
    color: "#0F0F1E",
  },
  historyBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Stats Section
  statsSection: {
    marginBottom: 16,
  },

  // History Section
  historySectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  historySectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historySectionSubtitle: {
    fontSize: 12,
    color: "#A0A0A0",
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  loadingGamesContainer: {
    gap: 8,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
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
  emptySubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
