/**
 * Play Now Screen
 *
 * Quick matchmaking like Chess.com:
 * - Wager selection only (fixed 5+3 time control)
 * - Real-time player searching
 * - On-chain USDC escrow
 * - Match found animation
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Coins,
  Clock,
  Users,
  Zap,
  Search,
  X,
  CheckCircle,
  Swords,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  usePlayNowStore,
  PLAY_NOW_WAGER_OPTIONS,
} from "@/stores/playNowStore";
import { useAuthStore } from "@/stores/authStore";
import { useBiconomyWallet } from "@/hooks/useBiconomyWallet";
import { AudioManager } from "@/lib/audio";
import { tctToUsdc } from "@/lib/relay";
import { NotificationService } from "@/lib/notifications.native";
import { supabase } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

type Step = "settings" | "searching" | "matched";

// ============================================================================
// Constants
// ============================================================================

const GRADIENT_COLORS: [string, string] = ["#FFD700", "#FFA500"];

// Fixed time control: 5 minutes + 3 second increment (like Chess.com default)
const FIXED_TIME_CONTROL = 300; // 5 minutes
const FIXED_INCREMENT = 3; // 3 seconds

// ============================================================================
// Component
// ============================================================================

export default function PlayNowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    wagerTct?: string;
    autoStart?: string;
  }>();
  const { user, profile, walletProvider } = useAuthStore();

  // Biconomy wallet
  const {
    tctBalance,
    isInitialized: isWalletInitialized,
    isInitializing: isWalletInitializing,
    hasEnoughTctBalance,
  } = useBiconomyWallet();

  // Play Now store
  const {
    status,
    settings,
    error,
    matchedGameId,
    matchedOpponent,
    playerColor,
    searchDurationSeconds,
    playersInQueue,
    compatiblePlayers,
    updateSettings,
    startSearching,
    cancelSearch,
    initializeBiconomy,
    initialize,
    clearError,
    clearMatch,
    resetState,
  } = usePlayNowStore();

  // Local state
  const [step, setStep] = useState<Step>("settings");
  const [waitingPlayers, setWaitingPlayers] = useState<any[]>([]);
  const [joiningPlayerId, setJoiningPlayerId] = useState<string | null>(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const searchRotation = useRef(new Animated.Value(0)).current;
  const matchScale = useRef(new Animated.Value(0)).current;

  // Track if we've auto-started to prevent multiple triggers
  const hasAutoStarted = useRef(false);

  // Initialize store and Biconomy
  useEffect(() => {
    if (user?.id && profile?.elo_rating !== undefined) {
      initialize(user.id, profile.elo_rating || 1200);
      // Set fixed time control
      updateSettings({
        timeControlSeconds: FIXED_TIME_CONTROL,
        incrementSeconds: FIXED_INCREMENT,
      });

      // If coming from notification with wager amount, pre-select it
      if (params.wagerTct) {
        const wager = parseInt(params.wagerTct, 10);
        if (!isNaN(wager) && PLAY_NOW_WAGER_OPTIONS.includes(wager)) {
          updateSettings({ wagerTct: wager });
        }
      }
    }
  }, [user?.id, profile?.elo_rating, initialize, updateSettings, params.wagerTct]);

  // Auto-start search if coming from notification (user tapped "Player Found!")
  useEffect(() => {
    if (
      params.autoStart === "true" &&
      !hasAutoStarted.current &&
      isWalletInitialized &&
      user?.id &&
      status === "idle"
    ) {
      hasAutoStarted.current = true;
      // Check if user can afford the wager before auto-starting
      const wager = params.wagerTct ? parseInt(params.wagerTct, 10) : 0;
      if (wager === 0 || hasEnoughTctBalance(wager)) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          handleStartSearch();
        }, 500);
      }
    }
  }, [params.autoStart, isWalletInitialized, user?.id, status, params.wagerTct, hasEnoughTctBalance]);

  useEffect(() => {
    if (walletProvider && user?.id) {
      initializeBiconomy(walletProvider);
    }
  }, [walletProvider, user?.id, initializeBiconomy]);

  // Handle status changes
  useEffect(() => {
    if (status === "searching") {
      setStep("searching");
      startSearchAnimation();
    } else if (status === "matched") {
      setStep("matched");
      stopSearchAnimation();
      playMatchFoundAnimation();
    } else if (status === "error" || status === "cancelled") {
      setStep("settings");
      stopSearchAnimation();
    }
  }, [status]);

  // Handle match found - navigate to online game
  useEffect(() => {
    if (matchedGameId && step === "matched") {
      // Show match animation briefly then navigate to online-game
      const timer = setTimeout(() => {
        const gId = matchedGameId;
        const wager = settings.wagerTct;

        // Full cleanup: stop all polling/subscriptions before navigating
        resetState();

        router.replace({
          pathname: "/online-game",
          params: {
            gameId: gId,
            wagerTct: wager.toString(),
            source: "play-now",
          },
        });
      }, 1000);

      // Notify match found (wrapped in try-catch — notification failure must never crash the app)
      if (matchedOpponent) {
        try {
          NotificationService.notifyMatchFound(
            matchedGameId,
            matchedOpponent.username,
            settings.wagerTct > 0 ? tctToUsdc(settings.wagerTct) : undefined
          );
        } catch (e) {
          console.warn("[PlayNow] Notification error (non-fatal):", e);
        }
      }

      return () => clearTimeout(timer);
    }
  }, [matchedGameId, step, matchedOpponent, playerColor, settings.wagerTct]);

  // Show error
  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, clearError]);

  // Cleanup on unmount — always stop polling/subscriptions
  useEffect(() => {
    return () => {
      resetState();
    };
  }, []);

  // Fetch waiting players for the lobby (poll every 3s on settings screen)
  useEffect(() => {
    if (step !== "settings" || !user?.id) return;

    const fetchWaitingPlayers = async () => {
      const { data } = await supabase
        .from("play_now_queue")
        .select("*, profiles:user_id(id, username, avatar_index, elo_rating)")
        .eq("status", "waiting")
        .neq("user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true })
        .limit(20);

      if (data) {
        setWaitingPlayers(data);
      }
    };

    fetchWaitingPlayers();
    const interval = setInterval(fetchWaitingPlayers, 3000);
    return () => clearInterval(interval);
  }, [step, user?.id]);

  // Join a specific waiting player
  const handleJoinPlayer = useCallback(async (player: any) => {
    if (!user?.id || !profile) return;

    const wager = player.wager_tct || 0;

    // Check balance
    if (wager > 0) {
      if (!isWalletInitialized) {
        Alert.alert("Wallet Not Ready", "Please wait for your wallet to initialize.");
        return;
      }
      if (!hasEnoughTctBalance(wager)) {
        Alert.alert("Insufficient Balance", `You need ${wager} TCT to join this match.`);
        return;
      }
    }

    setJoiningPlayerId(player.user_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Set the wager to match the opponent's
      updateSettings({
        wagerTct: wager,
        timeControlSeconds: player.time_control_seconds,
        incrementSeconds: player.increment_seconds,
      });

      // Start searching - the _findMatch will pick up this opponent
      await startSearching();
    } catch (err) {
      console.error("[PlayNow] Join player error:", err);
      Alert.alert("Error", "Failed to join match. Please try again.");
    } finally {
      setJoiningPlayerId(null);
    }
  }, [user?.id, profile, isWalletInitialized, hasEnoughTctBalance, updateSettings, startSearching]);

  // Animation helpers
  const startSearchAnimation = () => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotation animation
    Animated.loop(
      Animated.timing(searchRotation, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  };

  const stopSearchAnimation = () => {
    pulseAnim.setValue(1);
    searchRotation.setValue(0);
  };

  const playMatchFoundAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AudioManager?.play("achievement"); // Use achievement sound for match found

    Animated.spring(matchScale, {
      toValue: 1,
      friction: 4,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  // Handlers
  const handleWagerSelect = useCallback(
    (amount: number) => {
      Haptics.selectionAsync();
      AudioManager?.play("chip");
      updateSettings({ wagerTct: amount });
    },
    [updateSettings]
  );

  const handleStartSearch = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AudioManager?.play("chipStack");

    // Check balance for wager games
    if (settings.wagerTct > 0) {
      if (!isWalletInitialized) {
        Alert.alert(
          "Wallet Not Ready",
          "Please wait for your wallet to initialize."
        );
        return;
      }

      if (!hasEnoughTctBalance(settings.wagerTct)) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${settings.wagerTct} TCT to play this match.`
        );
        return;
      }
    }

    await startSearching();
  }, [settings.wagerTct, isWalletInitialized, hasEnoughTctBalance, startSearching]);

  const handleCancelSearch = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert("Cancel Search", "Are you sure you want to stop searching?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          await cancelSearch();
          setStep("settings");
        },
      },
    ]);
  }, [cancelSearch]);

  const handleGoBack = useCallback(() => {
    if (step === "searching") {
      handleCancelSearch();
    } else {
      resetState();
      router.back();
    }
  }, [step, handleCancelSearch, resetState, router]);

  // Format search duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Check wager eligibility
  const canWager =
    settings.wagerTct === 0 || tctBalance >= settings.wagerTct;

  const rotationInterpolate = searchRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Render settings step
  const renderSettings = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Game Info */}
      <View style={styles.gameInfoSection}>
        <View style={styles.gameInfoItem}>
          <Clock size={20} color="#4ECDC4" />
          <Text style={styles.gameInfoText}>5+3 Blitz</Text>
        </View>
        <Text style={styles.gameInfoSubtext}>
          5 minutes per side with 3 second increment
        </Text>
      </View>

      {/* Wager Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Coins size={20} color="#FFD700" />
          <Text style={styles.sectionTitle}>Stake Amount (TCT)</Text>
          <View style={styles.balanceBadge}>
            <Text style={styles.balanceText}>
              {isWalletInitializing
                ? "Loading..."
                : `Balance: ${tctBalance.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            </Text>
          </View>
        </View>

        {settings.wagerTct > 0 && (
          <Text style={styles.usdcHint}>
            = {tctToUsdc(settings.wagerTct).toFixed(2)} USDC (locked in smart
            contract)
          </Text>
        )}

        <View style={styles.wagerGrid}>
          {PLAY_NOW_WAGER_OPTIONS.map((amount) => {
            const isSelected = settings.wagerTct === amount;
            const canAfford = tctBalance >= amount;

            return (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.wagerOption,
                  isSelected && styles.wagerOptionSelected,
                  !canAfford && amount > 0 && styles.wagerOptionDisabled,
                ]}
                onPress={() => canAfford && handleWagerSelect(amount)}
                disabled={!canAfford && amount > 0}
              >
                <Text
                  style={[
                    styles.wagerText,
                    isSelected && styles.wagerTextSelected,
                    !canAfford && amount > 0 && styles.wagerTextDisabled,
                  ]}
                >
                  {amount === 0 ? "Free" : `${amount}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <View style={styles.infoItem}>
          <Zap size={16} color="#4ECDC4" />
          <Text style={styles.infoText}>
            Matched by ELO rating for fair games
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Users size={16} color="#4ECDC4" />
          <Text style={styles.infoText}>
            Players online get notified when you search
          </Text>
        </View>
      </View>

      {/* Start Button */}
      <TouchableOpacity
        style={[styles.startButton, !canWager && styles.startButtonDisabled]}
        onPress={handleStartSearch}
        disabled={!canWager}
      >
        <LinearGradient
          colors={canWager ? GRADIENT_COLORS : ["#444", "#333"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButtonGradient}
        >
          <Swords size={24} color="#FFF" />
          <Text style={styles.startButtonText}>Find Opponent</Text>
          {settings.wagerTct > 0 && (
            <View style={styles.wagerPreview}>
              <Coins size={14} color="#FFD700" />
              <Text style={styles.wagerPreviewText}>
                {settings.wagerTct} TCT
              </Text>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {!canWager && (
        <Text style={styles.insufficientFunds}>
          Insufficient TCT balance for this wager
        </Text>
      )}

      {/* Lobby: Waiting Players */}
      {waitingPlayers.length > 0 && (
        <View style={styles.lobbySection}>
          <View style={styles.lobbySectionHeader}>
            <Users size={18} color="#4ECDC4" />
            <Text style={styles.lobbySectionTitle}>Players Waiting</Text>
            <View style={styles.lobbyCountBadge}>
              <Text style={styles.lobbyCountText}>{waitingPlayers.length}</Text>
            </View>
          </View>

          {waitingPlayers.map((player) => {
            const playerProfile = player.profiles as any;
            const canAffordJoin = player.wager_tct === 0 || tctBalance >= player.wager_tct;
            const isJoining = joiningPlayerId === player.user_id;

            return (
              <View key={player.id} style={styles.lobbyPlayerCard}>
                <View style={styles.lobbyPlayerInfo}>
                  <Text style={styles.lobbyPlayerName}>
                    {playerProfile?.username || "Anonymous"}
                  </Text>
                  <View style={styles.lobbyPlayerStats}>
                    <View style={styles.lobbyStatChip}>
                      <Zap size={12} color="#FFD700" />
                      <Text style={styles.lobbyStatText}>
                        {playerProfile?.elo_rating || player.elo_rating}
                      </Text>
                    </View>
                    <View style={styles.lobbyStatChip}>
                      <Clock size={12} color="#4ECDC4" />
                      <Text style={styles.lobbyStatText}>
                        {Math.floor(player.time_control_seconds / 60)}+{player.increment_seconds}
                      </Text>
                    </View>
                    <View style={[styles.lobbyStatChip, player.wager_tct > 0 && styles.lobbyWagerChip]}>
                      <Coins size={12} color={player.wager_tct > 0 ? "#FFD700" : "#666"} />
                      <Text style={[styles.lobbyStatText, player.wager_tct > 0 && styles.lobbyWagerText]}>
                        {player.wager_tct === 0 ? "Free" : `${player.wager_tct} TCT`}
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.lobbyJoinButton,
                    !canAffordJoin && styles.lobbyJoinButtonDisabled,
                  ]}
                  onPress={() => handleJoinPlayer(player)}
                  disabled={!canAffordJoin || isJoining}
                >
                  {isJoining ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={[
                      styles.lobbyJoinButtonText,
                      !canAffordJoin && styles.lobbyJoinButtonTextDisabled,
                    ]}>
                      {canAffordJoin ? "Join" : "Low Balance"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  // Get dynamic status info based on current store status and queue data
  const getSearchStatusInfo = () => {
    if (status === "matched") {
      return {
        title: "Match Found!",
        subtitle: "Starting game...",
        stepNumber: 3,
      };
    }
    if (status === "searching" && compatiblePlayers > 0) {
      return {
        title: "Opponent Found!",
        subtitle: "Connecting to match...",
        stepNumber: 2,
      };
    }
    if (status === "searching") {
      return {
        title: "Searching for Opponent",
        subtitle: `5+3 Blitz • ${settings.wagerTct > 0 ? `${settings.wagerTct} TCT` : "Free"}`,
        stepNumber: 1,
      };
    }
    return {
      title: "Preparing...",
      subtitle: "Setting up your match",
      stepNumber: 0,
    };
  };

  // Render searching step
  const renderSearching = () => {
    const statusInfo = getSearchStatusInfo();

    return (
    <View style={styles.searchingContainer}>
      {/* Step progress indicators */}
      <View style={styles.stepIndicators}>
        {[
          { label: "Search", step: 1 },
          { label: "Found", step: 2 },
          { label: "Play", step: 3 },
        ].map((item, idx) => (
          <React.Fragment key={item.step}>
            {idx > 0 && (
              <View style={[styles.stepLine, statusInfo.stepNumber >= item.step && styles.stepLineActive]} />
            )}
            <View style={styles.stepDot}>
              <View style={[
                styles.stepDotInner,
                statusInfo.stepNumber >= item.step && styles.stepDotActive,
                statusInfo.stepNumber === item.step && styles.stepDotCurrent,
              ]}>
                {statusInfo.stepNumber > item.step ? (
                  <CheckCircle size={14} color="#FFF" />
                ) : (
                  <Text style={[
                    styles.stepDotText,
                    statusInfo.stepNumber >= item.step && styles.stepDotTextActive,
                  ]}>{item.step}</Text>
                )}
              </View>
              <Text style={[
                styles.stepLabel,
                statusInfo.stepNumber >= item.step && styles.stepLabelActive,
              ]}>{item.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Animated search indicator */}
      <Animated.View
        style={[
          styles.searchCircle,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={compatiblePlayers > 0
            ? ["#22C55E", "#16A34A"] as [string, string]
            : GRADIENT_COLORS}
          style={styles.searchCircleGradient}
        >
          <Animated.View
            style={{
              transform: [{ rotate: rotationInterpolate }],
            }}
          >
            <Search size={48} color="#FFF" />
          </Animated.View>
        </LinearGradient>
      </Animated.View>

      <Text style={styles.searchingTitle}>{statusInfo.title}</Text>
      <Text style={styles.searchingSubtitle}>{statusInfo.subtitle}</Text>

      {/* Search timer */}
      <View style={styles.searchTimer}>
        <Clock size={16} color="#A0A0A0" />
        <Text style={styles.searchTimerText}>
          {formatDuration(searchDurationSeconds)}
        </Text>
      </View>

      {/* Queue stats */}
      <View style={styles.queueStats}>
        <View style={styles.queueStatItem}>
          <Text style={styles.queueStatValue}>{playersInQueue}</Text>
          <Text style={styles.queueStatLabel}>In Queue</Text>
        </View>
        <View style={styles.queueStatDivider} />
        <View style={styles.queueStatItem}>
          <Text style={styles.queueStatValue}>{compatiblePlayers}</Text>
          <Text style={styles.queueStatLabel}>Compatible</Text>
        </View>
      </View>

      {/* ELO range info */}
      <Text style={styles.eloRangeText}>
        ELO range expands as you wait...
      </Text>

      {/* Cancel button */}
      <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSearch}>
        <X size={20} color="#FF6B6B" />
        <Text style={styles.cancelButtonText}>Cancel Search</Text>
      </TouchableOpacity>
    </View>
    );
  };

  // Render matched step
  const renderMatched = () => (
    <View style={styles.matchedContainer}>
      <Animated.View
        style={[
          styles.matchedContent,
          {
            transform: [{ scale: matchScale }],
          },
        ]}
      >
        <LinearGradient
          colors={["#4ECDC4", "#44A08D"]}
          style={styles.matchedCircle}
        >
          <CheckCircle size={64} color="#FFF" />
        </LinearGradient>

        <Text style={styles.matchedTitle}>Match Found!</Text>

        {matchedOpponent && (
          <View style={styles.opponentInfo}>
            <Text style={styles.opponentName}>{matchedOpponent.username}</Text>
            <Text style={styles.opponentElo}>
              ELO: {matchedOpponent.eloRating}
            </Text>
          </View>
        )}

        <Text style={styles.matchedSubtitle}>
          You play as {playerColor === "w" ? "White" : "Black"}
        </Text>

        <ActivityIndicator
          color="#4ECDC4"
          size="small"
          style={{ marginTop: 20 }}
        />
        <Text style={styles.loadingGameText}>Starting game...</Text>
      </Animated.View>
    </View>
  );

  return (
    <LinearGradient colors={["#0a0a0f", "#1a1a2e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <ArrowLeft size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === "settings"
              ? "Play Now"
              : step === "searching"
              ? "Finding Match"
              : "Match Found"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        {step === "settings" && renderSettings()}
        {step === "searching" && renderSearching()}
        {step === "matched" && renderMatched()}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  gameInfoSection: {
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  gameInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  gameInfoText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
  },
  gameInfoSubtext: {
    color: "#A0A0A0",
    fontSize: 13,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  balanceBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  balanceText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  usdcHint: {
    color: "#4ECDC4",
    fontSize: 12,
    marginBottom: 12,
    marginLeft: 28,
  },
  wagerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  wagerOption: {
    width: (width - 52) / 3,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  wagerOptionSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderColor: "#FFD700",
  },
  wagerOptionDisabled: {
    opacity: 0.4,
  },
  wagerText: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "600",
  },
  wagerTextSelected: {
    color: "#FFD700",
  },
  wagerTextDisabled: {
    color: "#666",
  },
  infoSection: {
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    color: "#A0A0A0",
    fontSize: 13,
    flex: 1,
  },
  startButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 12,
  },
  startButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  wagerPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  wagerPreviewText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  insufficientFunds: {
    color: "#FF6B6B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },

  // Lobby styles
  lobbySection: {
    marginTop: 24,
    marginBottom: 16,
  },
  lobbySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  lobbySectionTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  lobbyCountBadge: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  lobbyCountText: {
    color: "#4ECDC4",
    fontSize: 13,
    fontWeight: "700",
  },
  lobbyPlayerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  lobbyPlayerInfo: {
    flex: 1,
  },
  lobbyPlayerName: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  lobbyPlayerStats: {
    flexDirection: "row",
    gap: 8,
  },
  lobbyStatChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lobbyStatText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "500",
  },
  lobbyWagerChip: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
  },
  lobbyWagerText: {
    color: "#FFD700",
  },
  lobbyJoinButton: {
    backgroundColor: "#4ECDC4",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },
  lobbyJoinButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  lobbyJoinButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  lobbyJoinButtonTextDisabled: {
    color: "#666",
  },

  // Step indicator styles
  stepIndicators: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 32,
    width: "100%",
    maxWidth: 280,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginTop: 14,
  },
  stepLineActive: {
    backgroundColor: "#4ECDC4",
  },
  stepDot: {
    alignItems: "center",
  },
  stepDotInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  stepDotActive: {
    backgroundColor: "#4ECDC4",
    borderColor: "#4ECDC4",
  },
  stepDotCurrent: {
    borderColor: "#FFF",
    shadowColor: "#4ECDC4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  stepDotText: {
    color: "#666",
    fontSize: 12,
    fontWeight: "700",
  },
  stepDotTextActive: {
    color: "#FFF",
  },
  stepLabel: {
    color: "#666",
    fontSize: 10,
    marginTop: 4,
    fontWeight: "500",
  },
  stepLabelActive: {
    color: "#4ECDC4",
  },

  // Searching styles
  searchingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  searchCircle: {
    marginBottom: 24,
  },
  searchCircleGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  searchingTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  searchingSubtitle: {
    color: "#A0A0A0",
    fontSize: 16,
    marginBottom: 24,
  },
  searchTimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  searchTimerText: {
    color: "#A0A0A0",
    fontSize: 24,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  queueStats: {
    flexDirection: "row",
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    width: "100%",
    maxWidth: 300,
  },
  queueStatItem: {
    flex: 1,
    alignItems: "center",
  },
  queueStatValue: {
    color: "#FFD700",
    fontSize: 28,
    fontWeight: "700",
  },
  queueStatLabel: {
    color: "#666",
    fontSize: 12,
    marginTop: 4,
  },
  queueStatDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 16,
  },
  eloRangeText: {
    color: "#666",
    fontSize: 12,
    marginBottom: 32,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  cancelButtonText: {
    color: "#FF6B6B",
    fontSize: 16,
    fontWeight: "600",
  },

  // Matched styles
  matchedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  matchedContent: {
    alignItems: "center",
  },
  matchedCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  matchedTitle: {
    color: "#4ECDC4",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16,
  },
  opponentInfo: {
    alignItems: "center",
    marginBottom: 16,
  },
  opponentName: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "600",
  },
  opponentElo: {
    color: "#A0A0A0",
    fontSize: 14,
    marginTop: 4,
  },
  matchedSubtitle: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "500",
  },
  loadingGameText: {
    color: "#666",
    fontSize: 14,
    marginTop: 8,
  },
});
