/**
 * Game Result Screen
 *
 * Displays complete game results including:
 * - Win/Loss/Draw outcome with Unity celebration animation
 * - ELO rating changes
 * - Wager settlement
 * - Move list
 * - PGN export
 * - Rematch option
 */

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
  Clipboard,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import { fetchGameResult, fetchGamePGN } from "@/lib/gameSession";
import {
  formatRatingChange,
  getRatingChangeColor,
  getRatingCategory,
} from "@/lib/elo";
import { VictoryCelebration, AnimatedDragons, SpinningRays } from "@/components/VictoryCelebration";
import { useAuth } from "@/hooks/useAuth";
import type { Game } from "@/types/supabase";

// Sound assets
const SOUNDS = {
  win: require("@/assets/sounds/game_win.mp3"),
  lose: require("@/assets/sounds/lose.mp3"),
  achievement: require("@/assets/sounds/achievement.mp3"),
};

// ============================================================================
// Types
// ============================================================================

interface PlayerInfo {
  id: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
}

interface EloChange {
  before: number;
  after: number;
  change: number;
}

interface WagerResult {
  winnerPayout: number;
  refunded: boolean;
}

// ============================================================================
// Component
// ============================================================================

export default function GameResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    gameId: string;
    playerId?: string;
    source?: string; // "play-now" | "challenge" | "tournament"
  }>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [whitePlayer, setWhitePlayer] = useState<PlayerInfo | null>(null);
  const [blackPlayer, setBlackPlayer] = useState<PlayerInfo | null>(null);
  const [eloChanges, setEloChanges] = useState<{
    white: EloChange;
    black: EloChange;
  } | null>(null);
  const [wagerResult, setWagerResult] = useState<WagerResult | null>(null);
  const [pgn, setPgn] = useState<string | null>(null);
  const [showPgn, setShowPgn] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Determine which player we are — use param, fall back to auth profile
  const playerId = params.playerId || profile?.id;
  const isWhite = playerId === game?.white_player_id;
  const playerResult = game?.result === "draw"
    ? "draw"
    : isWhite
    ? game?.result === "white_wins"
      ? "win"
      : "loss"
    : game?.result === "black_wins"
    ? "win"
    : "loss";

  // Play result sound effect
  const playResultSound = async (result: string) => {
    try {
      // Unload previous sound if exists
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const soundFile = result === "win" ? SOUNDS.win : SOUNDS.lose;
      const { sound } = await Audio.Sound.createAsync(soundFile);
      soundRef.current = sound;
      await sound.playAsync();
    } catch (error) {
      console.error("Error playing sound:", error);
    }
  };

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    loadGameResult();
  }, [params.gameId]);

  // Show celebration and play sound when result is loaded
  useEffect(() => {
    if (game && playerResult) {
      setShowCelebration(true);
      playResultSound(playerResult);

      // Auto-dismiss celebration after 4 seconds so buttons are visible
      const timer = setTimeout(() => {
        setShowCelebration(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [game, playerResult]);

  const loadGameResult = async () => {
    if (!params.gameId) return;

    setLoading(true);
    try {
      const result = await fetchGameResult(params.gameId);

      setGame(result.game);
      setWhitePlayer(result.whitePlayer);
      setBlackPlayer(result.blackPlayer);
      setEloChanges(result.eloChanges);
      setWagerResult(result.wagerResult);

      // Also fetch PGN
      const pgnData = await fetchGamePGN(params.gameId);
      setPgn(pgnData);
    } catch (error) {
      console.error("Error loading game result:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!game) return;

    const resultText =
      playerResult === "win"
        ? "Won"
        : playerResult === "loss"
        ? "Lost"
        : "Drew";

    const playerEloChange = isWhite
      ? eloChanges?.white.change || 0
      : eloChanges?.black.change || 0;

    const message = `I just ${resultText.toLowerCase()} a chess game on Treasure Chess!\n\n${
      playerEloChange > 0 ? "+" : ""
    }${playerEloChange} ELO\n\n${getEndReasonText(
      game.end_reason || "",
      playerResult || "draw"
    )}`;

    try {
      await Share.share({
        message,
        title: "Treasure Chess Game Result",
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const handleCopyPgn = async () => {
    if (!pgn) return;

    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(pgn);
      } else {
        Clipboard.setString(pgn);
      }
      Alert.alert("Copied", "PGN copied to clipboard");
    } catch (error) {
      console.error("Copy error:", error);
    }
  };

  const handleRematch = () => {
    // Navigate based on where the game came from
    if (params.source === "challenge") {
      router.replace("/challenge-board" as any);
    } else if (params.source === "leaderboard") {
      router.replace("/leaderboard" as any);
    } else {
      // Default to play-now for play-now games or unknown source
      router.replace("/play-now" as any);
    }
  };

  const handleGoHome = () => {
    router.replace("/");
  };

  const getEndReasonText = (reason: string, result: string): string => {
    switch (reason) {
      case "checkmate":
        return result === "win"
          ? "You won by checkmate!"
          : "You lost by checkmate";
      case "timeout":
        return result === "win" ? "Opponent ran out of time" : "You ran out of time";
      case "resign":
        return result === "win" ? "Opponent resigned" : "You resigned";
      case "draw_agreement":
        return "Draw by agreement";
      case "stalemate":
        return "Draw by stalemate";
      case "insufficient_material":
        return "Draw - insufficient material";
      case "threefold_repetition":
        return "Draw by threefold repetition";
      case "fifty_moves":
        return "Draw by 50-move rule";
      case "abandon":
        return result === "win" ? "Opponent abandoned" : "Game abandoned";
      default:
        return "Game ended";
    }
  };

  const getResultConfig = (result: string | null) => {
    switch (result) {
      case "win":
        return {
          title: "Victory!",
          icon: "trophy" as const,
          gradientColors: ["#FFD700", "#FFA500", "#FF8C00"],
          textColor: "#1A1A2E",
        };
      case "loss":
        return {
          title: "Defeat",
          icon: "close-circle" as const,
          gradientColors: ["#4A4A5A", "#2A2A3A", "#1A1A2E"],
          textColor: "#FFFFFF",
        };
      default:
        return {
          title: "Draw",
          icon: "git-compare" as const,
          gradientColors: ["#6366F1", "#4F46E5", "#4338CA"],
          textColor: "#FFFFFF",
        };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading game result...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!game) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorText}>Game not found</Text>
          <Pressable style={styles.errorButton} onPress={handleGoHome}>
            <Text style={styles.errorButtonText}>Go Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const config = getResultConfig(playerResult);
  const playerEloChange = isWhite ? eloChanges?.white : eloChanges?.black;
  const opponentEloChange = isWhite ? eloChanges?.black : eloChanges?.white;
  const opponent = isWhite ? blackPlayer : whitePlayer;

  return (
    <SafeAreaView style={styles.container}>
      {/* Victory/Defeat Celebration Overlay */}
      <VictoryCelebration
        result={playerResult as "win" | "lose" | "draw"}
        visible={showCelebration}
        onAnimationComplete={() => {
          // Celebration continues to show, just marks animation as complete
        }}
      >
        {/* This content appears in the center of the celebration */}
        <View style={styles.celebrationContent}>
          <Text style={styles.celebrationTitle}>{config.title}</Text>
          <Text style={styles.celebrationReason}>
            {getEndReasonText(game.end_reason || "", playerResult || "draw")}
          </Text>
        </View>
      </VictoryCelebration>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={config.gradientColors as [string, string, string]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Spinning Rays Background for wins */}
          {playerResult === "win" && (
            <SpinningRays size={400} tint="#FFD700" />
          )}

          {/* Big Left Dragon */}
          <Image
            source={require("@/assets/images/result-screen/Left_Dragon.png")}
            style={styles.bigLeftDragon}
            resizeMode="contain"
          />

          {/* Big Right Dragon */}
          <Image
            source={require("@/assets/images/result-screen/Right_Dragon.png")}
            style={styles.bigRightDragon}
            resizeMode="contain"
          />

          {/* Small Animated Dragons */}
          <AnimatedDragons size={60} />

          <View style={styles.iconContainer}>
            <Ionicons name={config.icon} size={64} color={config.textColor} />
          </View>

          <Text style={[styles.resultTitle, { color: config.textColor }]}>
            {config.title}
          </Text>

          <Text style={[styles.reasonText, { color: config.textColor }]}>
            {getEndReasonText(game.end_reason || "", playerResult || "draw")}
          </Text>
        </LinearGradient>

        {/* Players Section */}
        <View style={styles.playersSection}>
          {/* Your stats */}
          <View style={styles.playerCard}>
            <Text style={styles.playerLabel}>You</Text>
            <Text style={styles.playerName}>
              {isWhite ? whitePlayer?.username : blackPlayer?.username}
            </Text>

            {playerEloChange && (
              <View style={styles.eloContainer}>
                <Text style={styles.eloValue}>{playerEloChange.after}</Text>
                <View
                  style={[
                    styles.eloChangeBadge,
                    {
                      backgroundColor:
                        getRatingChangeColor(playerEloChange.change) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.eloChangeText,
                      { color: getRatingChangeColor(playerEloChange.change) },
                    ]}
                  >
                    {formatRatingChange(playerEloChange.change)}
                  </Text>
                </View>
              </View>
            )}

            {playerEloChange && (
              <Text style={styles.ratingCategory}>
                {getRatingCategory(playerEloChange.after)}
              </Text>
            )}
          </View>

          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          {/* Opponent stats */}
          <View style={styles.playerCard}>
            <Text style={styles.playerLabel}>Opponent</Text>
            <Text style={styles.playerName}>{opponent?.username}</Text>

            {opponentEloChange && (
              <View style={styles.eloContainer}>
                <Text style={styles.eloValue}>{opponentEloChange.after}</Text>
                <View
                  style={[
                    styles.eloChangeBadge,
                    {
                      backgroundColor:
                        getRatingChangeColor(opponentEloChange.change) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.eloChangeText,
                      { color: getRatingChangeColor(opponentEloChange.change) },
                    ]}
                  >
                    {formatRatingChange(opponentEloChange.change)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Wager Result */}
        {game.wager_tct > 0 && wagerResult && (
          <View style={styles.wagerSection}>
            <Text style={styles.sectionTitle}>Wager Result</Text>

            {wagerResult.refunded ? (
              <View style={styles.wagerRefunded}>
                <Ionicons name="refresh-circle" size={32} color="#9CA3AF" />
                <View style={styles.wagerInfo}>
                  <Text style={styles.wagerLabel}>Refunded</Text>
                  <Text style={styles.wagerAmount}>{game.wager_tct} TCT</Text>
                </View>
              </View>
            ) : playerResult === "win" ? (
              <View style={styles.wagerWon}>
                <Ionicons name="cash" size={32} color="#22C55E" />
                <View style={styles.wagerInfo}>
                  <Text style={styles.wagerWonLabel}>Winnings</Text>
                  <Text style={styles.wagerWonAmount}>
                    +{wagerResult.winnerPayout} TCT
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.wagerLost}>
                <Ionicons name="trending-down" size={32} color="#EF4444" />
                <View style={styles.wagerInfo}>
                  <Text style={styles.wagerLostLabel}>Lost Wager</Text>
                  <Text style={styles.wagerLostAmount}>
                    -{game.wager_tct} TCT
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Game Info */}
        <View style={styles.gameInfoSection}>
          <Text style={styles.sectionTitle}>Game Details</Text>

          <View style={styles.gameInfoGrid}>
            <View style={styles.gameInfoItem}>
              <Ionicons name="time-outline" size={20} color="#9CA3AF" />
              <Text style={styles.gameInfoLabel}>Time Control</Text>
              <Text style={styles.gameInfoValue}>
                {Math.floor(game.time_control_seconds / 60)}+
                {game.increment_seconds}
              </Text>
            </View>

            <View style={styles.gameInfoItem}>
              <Ionicons name="swap-horizontal" size={20} color="#9CA3AF" />
              <Text style={styles.gameInfoLabel}>Moves</Text>
              <Text style={styles.gameInfoValue}>{game.move_count}</Text>
            </View>

            <View style={styles.gameInfoItem}>
              <Ionicons name="calendar-outline" size={20} color="#9CA3AF" />
              <Text style={styles.gameInfoLabel}>Date</Text>
              <Text style={styles.gameInfoValue}>
                {new Date(game.started_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#6366F1" />
            <Text style={styles.shareButtonText}>Share Result</Text>
          </Pressable>

          <View style={styles.mainActions}>
            <Pressable style={styles.rematchButton} onPress={handleRematch}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.rematchButtonText}>Find New Game</Text>
            </Pressable>

            <Pressable style={styles.homeButton} onPress={handleGoHome}>
              <Ionicons name="home" size={20} color="#1A1A2E" />
              <Text style={styles.homeButtonText}>Home</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1A",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  // Celebration overlay content
  celebrationContent: {
    alignItems: "center",
    padding: 20,
  },
  celebrationTitle: {
    fontSize: 48,
    fontWeight: "900",
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    marginBottom: 8,
  },
  celebrationReason: {
    fontSize: 18,
    color: "rgba(255, 255, 255, 0.9)",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#EF4444",
    textAlign: "center",
  },
  errorButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  header: {
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  bigLeftDragon: {
    position: "absolute",
    left: -30,
    bottom: 10,
    width: 160,
    height: 200,
    zIndex: 2,
  },
  bigRightDragon: {
    position: "absolute",
    right: -30,
    bottom: 10,
    width: 160,
    height: 200,
    zIndex: 2,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  resultTitle: {
    fontSize: 36,
    fontWeight: "800",
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 16,
    opacity: 0.9,
  },
  playersSection: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
  },
  playerCard: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  playerLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  eloContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eloValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  eloChangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eloChangeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  ratingCategory: {
    fontSize: 12,
    color: "#6366F1",
    marginTop: 8,
  },
  vsContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  vsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  wagerSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  wagerWon: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  wagerInfo: {
    flex: 1,
  },
  wagerWonLabel: {
    fontSize: 12,
    color: "#22C55E",
    opacity: 0.8,
  },
  wagerWonAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#22C55E",
  },
  wagerLost: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  wagerLostLabel: {
    fontSize: 12,
    color: "#EF4444",
    opacity: 0.8,
  },
  wagerLostAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#EF4444",
  },
  wagerRefunded: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(156, 163, 175, 0.15)",
    padding: 20,
    borderRadius: 16,
    gap: 16,
  },
  wagerLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    opacity: 0.8,
  },
  wagerAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  gameInfoSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  gameInfoGrid: {
    flexDirection: "row",
    gap: 12,
  },
  gameInfoItem: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  gameInfoLabel: {
    fontSize: 11,
    color: "#6B7280",
  },
  gameInfoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pgnSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pgnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pgnContent: {
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  pgnScroll: {
    maxHeight: 200,
  },
  pgnText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#2A2A3A",
  },
  copyButtonText: {
    fontSize: 14,
    color: "#6366F1",
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#6366F1",
    borderRadius: 12,
  },
  shareButtonText: {
    fontSize: 16,
    color: "#6366F1",
  },
  mainActions: {
    flexDirection: "row",
    gap: 12,
  },
  rematchButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#6366F1",
    paddingVertical: 16,
    borderRadius: 12,
  },
  rematchButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  homeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 12,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
});
