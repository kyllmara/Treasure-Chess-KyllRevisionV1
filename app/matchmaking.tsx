/**
 * Enhanced Matchmaking Screen
 *
 * Features:
 * - Stake tier selection (Free, $5, $10, $25, $50, $100)
 * - Time control selection (Bullet, Blitz, Rapid, Classical)
 * - Pre-game ready confirmation
 * - Real-time queue stats
 * - ELO-based matching visualization
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Users,
  Trophy,
  X,
  Clock,
  Coins,
  CheckCircle,
  Timer,
  Zap,
  Play,
  Coffee,
} from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMultiplayer,
  STAKE_TIERS,
  TIME_CONTROLS,
  type StakeTier,
  type TimeControl,
} from "@/hooks/useMultiplayer";
import { STAKE_TIER_NAMES, getTimeControlColor } from "@/types/multiplayer";
import {
  MatchmakingSelectionSkeleton,
  MatchmakingSearchingSkeleton,
  PreGameReadySkeleton,
} from "@/components/SkeletonLoader";

// ============================================================================
// Constants
// ============================================================================

const TCT_TO_USD = 0.04;

const STAKE_OPTIONS: { tier: StakeTier; label: string; color: string }[] = [
  { tier: STAKE_TIERS.FREE, label: "Free", color: "#4CAF82" },
  { tier: STAKE_TIERS.MICRO, label: "$5", color: "#FFD700" },
  { tier: STAKE_TIERS.LOW, label: "$10", color: "#FF9800" },
  { tier: STAKE_TIERS.MEDIUM, label: "$25", color: "#FF5722" },
  { tier: STAKE_TIERS.HIGH, label: "$50", color: "#E91E63" },
  { tier: STAKE_TIERS.WHALE, label: "$100", color: "#9C27B0" },
];

// Group time controls by category
const TIME_CONTROL_CATEGORIES = {
  bullet: {
    label: "Bullet",
    icon: Zap,
    color: "#FF4136",
    controls: TIME_CONTROLS.filter(tc => tc.category === "bullet"),
  },
  blitz: {
    label: "Blitz",
    icon: Timer,
    color: "#FF851B",
    controls: TIME_CONTROLS.filter(tc => tc.category === "blitz"),
  },
  rapid: {
    label: "Rapid",
    icon: Clock,
    color: "#2ECC40",
    controls: TIME_CONTROLS.filter(tc => tc.category === "rapid"),
  },
  classical: {
    label: "Classical",
    icon: Coffee,
    color: "#0074D9",
    controls: TIME_CONTROLS.filter(tc => tc.category === "classical"),
  },
} as const;

type TimeControlCategory = keyof typeof TIME_CONTROL_CATEGORIES;

// ============================================================================
// Components
// ============================================================================

function StakeSelector({
  selected,
  onSelect,
  disabled,
}: {
  selected: StakeTier;
  onSelect: (tier: StakeTier) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>Stake Amount</Text>
      <View style={styles.stakeGrid}>
        {STAKE_OPTIONS.map(({ tier, label, color }) => (
          <TouchableOpacity
            key={tier}
            style={[
              styles.stakeOption,
              selected === tier && { borderColor: color, backgroundColor: `${color}20` },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(tier);
            }}
            disabled={disabled}
          >
            <Coins size={18} color={selected === tier ? color : "#A0A0A0"} />
            <Text
              style={[
                styles.stakeLabel,
                selected === tier && { color },
              ]}
            >
              {label}
            </Text>
            {tier > 0 && (
              <Text style={styles.stakeTct}>
                {(tier / TCT_TO_USD).toLocaleString()} TCT
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TimeControlSelector({
  selected,
  onSelect,
  disabled,
}: {
  selected: TimeControl;
  onSelect: (control: TimeControl) => void;
  disabled: boolean;
}) {
  const [activeCategory, setActiveCategory] = useState<TimeControlCategory>(
    selected.category as TimeControlCategory
  );

  // Update active category when selection changes
  useEffect(() => {
    if (selected.category !== activeCategory) {
      setActiveCategory(selected.category as TimeControlCategory);
    }
  }, [selected.category]);

  const categoryInfo = TIME_CONTROL_CATEGORIES[activeCategory];
  const CategoryIcon = categoryInfo.icon;

  return (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>Time Control</Text>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        {(Object.keys(TIME_CONTROL_CATEGORIES) as TimeControlCategory[]).map((category) => {
          const info = TIME_CONTROL_CATEGORIES[category];
          const Icon = info.icon;
          const isActive = activeCategory === category;
          const hasSelected = selected.category === category;

          return (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryTab,
                isActive && { backgroundColor: `${info.color}20`, borderColor: info.color },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveCategory(category);
              }}
              disabled={disabled}
            >
              <Icon size={16} color={isActive ? info.color : "#666"} />
              <Text style={[styles.categoryTabText, isActive && { color: info.color }]}>
                {info.label}
              </Text>
              {hasSelected && !isActive && (
                <View style={[styles.categoryDot, { backgroundColor: info.color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Time Controls for Active Category */}
      <View style={styles.timeControlsGrid}>
        {categoryInfo.controls.map((control) => {
          const isSelected = selected.id === control.id;
          const color = categoryInfo.color;

          return (
            <TouchableOpacity
              key={control.id}
              style={[
                styles.timeControlOption,
                isSelected && { borderColor: color, backgroundColor: `${color}20` },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(control);
              }}
              disabled={disabled}
            >
              <CategoryIcon size={24} color={isSelected ? color : "#A0A0A0"} />
              <Text style={[styles.timeControlName, isSelected && { color }]}>
                {control.name}
              </Text>
              <Text style={[styles.timeControlDisplay, isSelected && { color }]}>
                {control.displayName}
              </Text>
              {control.incrementSeconds > 0 && (
                <Text style={[styles.timeControlIncrement, isSelected && { color }]}>
                  +{control.incrementSeconds}s/move
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category Description */}
      <View style={[styles.categoryDescription, { borderColor: `${categoryInfo.color}30` }]}>
        <Text style={[styles.categoryDescriptionTitle, { color: categoryInfo.color }]}>
          {categoryInfo.label} Games
        </Text>
        <Text style={styles.categoryDescriptionText}>
          {activeCategory === "bullet" && "Ultra-fast games requiring quick thinking and intuition."}
          {activeCategory === "blitz" && "Fast-paced games balancing speed and strategy."}
          {activeCategory === "rapid" && "Balanced games with time for thoughtful moves."}
          {activeCategory === "classical" && "Deep strategic games with time for analysis."}
        </Text>
      </View>
    </View>
  );
}

function PreGameReady({
  preGameState,
  isPlayerReady,
  countdown,
  onConfirmReady,
  userId,
}: {
  preGameState: any;
  isPlayerReady: boolean;
  countdown: number | null;
  onConfirmReady: () => void;
  userId: string;
}) {
  const isWhite = preGameState.whitePlayer.playerId === userId;
  const playerState = isWhite ? preGameState.whitePlayer : preGameState.blackPlayer;
  const opponentState = isWhite ? preGameState.blackPlayer : preGameState.whitePlayer;

  return (
    <View style={styles.preGameContainer}>
      <Text style={styles.preGameTitle}>Match Found!</Text>

      <View style={styles.playersRow}>
        {/* Player */}
        <View style={[styles.playerCard, playerState.isReady && styles.playerReady]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{playerState.username[0]}</Text>
          </View>
          <Text style={styles.playerName}>{playerState.username}</Text>
          <Text style={styles.playerElo}>{playerState.eloRating}</Text>
          <Text style={styles.playerColor}>
            {playerState.color === "w" ? "White" : "Black"}
          </Text>
          {playerState.isReady && (
            <CheckCircle size={24} color="#4CAF50" style={styles.readyIcon} />
          )}
        </View>

        <Text style={styles.vsText}>VS</Text>

        {/* Opponent */}
        <View style={[styles.playerCard, opponentState.isReady && styles.playerReady]}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{opponentState.username[0]}</Text>
          </View>
          <Text style={styles.playerName}>{opponentState.username}</Text>
          <Text style={styles.playerElo}>{opponentState.eloRating}</Text>
          <Text style={styles.playerColor}>
            {opponentState.color === "w" ? "White" : "Black"}
          </Text>
          {opponentState.isReady && (
            <CheckCircle size={24} color="#4CAF50" style={styles.readyIcon} />
          )}
        </View>
      </View>

      {countdown !== null ? (
        <View style={styles.countdownContainer}>
          <Text style={styles.countdownText}>Game starting in</Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.readyButton,
            isPlayerReady && styles.readyButtonDisabled,
          ]}
          onPress={onConfirmReady}
          disabled={isPlayerReady}
        >
          <Text style={styles.readyButtonText}>
            {isPlayerReady ? "Waiting for opponent..." : "Ready to Play!"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function MatchmakingContent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile, isLoading: isAuthLoading } = useAuth();

  // Local state for selection (before joining queue)
  const [selectedStake, setSelectedStake] = useState<StakeTier>(STAKE_TIERS.FREE);
  const [selectedTimeControl, setSelectedTimeControl] = useState<TimeControl>(
    TIME_CONTROLS[4] // 3+2 Blitz default
  );
  const [isInitializing, setIsInitializing] = useState(true);

  // Simulate initialization delay for skeleton demo
  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Multiplayer hook
  const {
    matchmakingStatus,
    queueStats,
    searchDuration,
    preGameState,
    isPlayerReady,
    countdown,
    matchResult,
    isJoiningQueue,
    joinQueue,
    leaveQueue,
    confirmReady,
  } = useMultiplayer({
    onMatchFound: (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onGameStart: (gameId) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/online-game" as any,
        params: {
          gameId,
          wagerTct: selectedStake.toString(),
          source: "matchmaking",
        },
      });
    },
    onError: (error) => {
      Alert.alert("Error", error.message);
    },
  });

  const userId = profile?.id || "guest";
  const isSearching = matchmakingStatus === "searching";
  const isMatchFound =
    matchmakingStatus === "match_found" ||
    matchmakingStatus === "waiting_ready" ||
    matchmakingStatus === "ready" ||
    matchmakingStatus === "starting";

  // Handle stake from params
  useEffect(() => {
    if (params.stake) {
      const stake = parseFloat(params.stake as string);
      if (stake >= 0) {
        // Find closest stake tier
        const tier = STAKE_OPTIONS.reduce((prev, curr) =>
          Math.abs(curr.tier - stake) < Math.abs(prev.tier - stake) ? curr : prev
        );
        setSelectedStake(tier.tier);
      }
    }
  }, [params.stake]);

  // Auto-start if stake is passed
  useEffect(() => {
    if (params.autoStart === "true" && matchmakingStatus === "idle") {
      handleStartSearch();
    }
  }, [params.autoStart]);

  const handleStartSearch = useCallback(async () => {
    // Check balance
    if (selectedStake > 0 && (profile?.elo_rating || 0) < selectedStake) {
      // In real app, check wallet balance
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await joinQueue({
      stakeTier: selectedStake,
      timeControl: selectedTimeControl,
      isRated: true,
    });
  }, [selectedStake, selectedTimeControl, joinQueue, profile]);

  const handleCancel = useCallback(async () => {
    await leaveQueue();
    router.back();
  }, [leaveQueue, router]);

  const handleConfirmReady = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await confirmReady();
  }, [confirmReady]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  // Show skeleton while initializing or auth loading
  if (isInitializing || isAuthLoading) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <MatchmakingSelectionSkeleton />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Pre-game ready screen
  if (isMatchFound && preGameState) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <PreGameReady
            preGameState={preGameState}
            isPlayerReady={isPlayerReady}
            countdown={countdown}
            onConfirmReady={handleConfirmReady}
            userId={userId}
          />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Pre-game loading state (match found but waiting for data)
  if (isMatchFound && !preGameState) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <PreGameReadySkeleton />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Searching screen
  if (isSearching) {
    return (
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleCancel}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.header}>
              <Users size={64} color="#FFD700" />
              <Text style={styles.title}>Finding Opponent</Text>
              <Text style={styles.subtitle}>
                {selectedTimeControl.displayName} • {STAKE_TIER_NAMES[selectedStake]}
              </Text>
            </View>

            <View style={styles.searchingCard}>
              <ActivityIndicator size="large" color="#FFD700" />
              <View style={styles.timeContainer}>
                <Clock size={20} color="#FFD700" />
                <Text style={styles.timeText}>{formatTime(searchDuration)}</Text>
              </View>
              <Text style={styles.searchingText}>Searching...</Text>
            </View>

            {queueStats && (
              <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{queueStats.totalInQueue}</Text>
                  <Text style={styles.statLabel}>In Queue</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{queueStats.compatiblePlayers}</Text>
                  <Text style={styles.statLabel}>Compatible</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{queueStats.queuePosition || "-"}</Text>
                  <Text style={styles.statLabel}>Position</Text>
                </View>
              </View>
            )}

            <View style={styles.infoCard}>
              <Trophy size={24} color="#FFD700" />
              <Text style={styles.infoTitle}>Matchmaking</Text>
              <Text style={styles.infoText}>
                • Rating range expands over time{"\n"}
                • Same stake players only{"\n"}
                • Fair color assignment{"\n"}
                • ELO-based matching
              </Text>
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel Search</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Selection screen
  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <X size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Users size={48} color="#FFD700" />
            <Text style={styles.title}>Find Match</Text>
            <Text style={styles.subtitle}>Select your preferences</Text>
          </View>

          <StakeSelector
            selected={selectedStake}
            onSelect={setSelectedStake}
            disabled={isJoiningQueue}
          />

          <TimeControlSelector
            selected={selectedTimeControl}
            onSelect={setSelectedTimeControl}
            disabled={isJoiningQueue}
          />

          <TouchableOpacity
            style={[styles.startButton, isJoiningQueue && styles.startButtonDisabled]}
            onPress={handleStartSearch}
            disabled={isJoiningQueue}
          >
            <LinearGradient
              colors={isJoiningQueue ? ["#666", "#666"] : ["#FFD700", "#FFA500"]}
              style={styles.startButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {isJoiningQueue ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Play size={24} color="#0F0F1E" />
                  <Text style={styles.startButtonText}>Find Match</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
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
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  closeButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginTop: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 8,
  },
  selectorContainer: {
    marginBottom: 24,
  },
  selectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  stakeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stakeOption: {
    width: "30%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  stakeLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#A0A0A0",
    marginTop: 8,
  },
  stakeTct: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
  },
  // Category tabs
  categoryTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  categoryTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: "absolute",
    top: 4,
    right: 4,
  },
  // Time controls grid
  timeControlsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  timeControlOption: {
    width: "31%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    minHeight: 100,
  },
  timeControlName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#A0A0A0",
    marginTop: 8,
  },
  timeControlDisplay: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginTop: 4,
  },
  timeControlIncrement: {
    fontSize: 10,
    color: "#888",
    marginTop: 4,
  },
  // Category description
  categoryDescription: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  categoryDescriptionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  categoryDescriptionText: {
    fontSize: 12,
    color: "#888",
    lineHeight: 18,
  },
  // Legacy styles (kept for compatibility)
  timeGrid: {
    flexDirection: "row",
    gap: 12,
  },
  timeOption: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#A0A0A0",
    marginTop: 8,
  },
  timeCategory: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    textTransform: "uppercase",
  },
  startButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 40,
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 18,
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F0F1E",
  },
  searchingCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  timeText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFD700",
  },
  searchingText: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 12,
  },
  statsContainer: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFD700",
  },
  statLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
    textAlign: "center",
  },
  infoCard: {
    width: "100%",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFD700",
    marginTop: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#A0A0A0",
    lineHeight: 22,
  },
  cancelButton: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EF4444",
  },
  // Pre-game styles
  preGameContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  preGameTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFD700",
    marginBottom: 40,
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "space-around",
    marginBottom: 40,
  },
  playerCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "40%",
    borderWidth: 2,
    borderColor: "transparent",
  },
  playerReady: {
    borderColor: "#4CAF50",
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F0F1E",
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  playerElo: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  playerColor: {
    fontSize: 12,
    color: "#FFD700",
    fontWeight: "600",
  },
  readyIcon: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  vsText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#A0A0A0",
  },
  readyButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
  },
  readyButtonDisabled: {
    backgroundColor: "#666",
  },
  readyButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  countdownContainer: {
    alignItems: "center",
  },
  countdownText: {
    fontSize: 16,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  countdownNumber: {
    fontSize: 64,
    fontWeight: "800",
    color: "#FFD700",
  },
});

// ============================================================================
// Export with AuthGate
// ============================================================================

export default function MatchmakingScreen() {
  return (
    <AuthGate featureName="Matchmaking">
      <MatchmakingContent />
    </AuthGate>
  );
}
