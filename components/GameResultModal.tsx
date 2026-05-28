/**
 * Game Result Modal
 *
 * Displays game outcome with:
 * - Win/Loss/Draw visualization
 * - ELO rating changes with animation
 * - Wager winnings display
 * - Rematch and return options
 * - Share game functionality
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  Share,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  formatRatingChange,
  getRatingChangeColor,
  getRatingCategory,
} from "@/lib/elo";

// ============================================================================
// Types
// ============================================================================

export type GameResultType = "win" | "loss" | "draw";
export type EndReason =
  | "checkmate"
  | "timeout"
  | "resign"
  | "draw_agreement"
  | "stalemate"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_moves"
  | "abandon";

export interface GameResultData {
  result: GameResultType;
  endReason: EndReason;
  playerColor: "w" | "b";
  opponent: {
    username: string;
    avatarIndex: number;
    eloRating: number;
  };
  eloChange: {
    before: number;
    after: number;
    change: number;
  };
  wager?: {
    amount: number;
    winnings: number;
    refunded: boolean;
  };
  gameId: string;
}

export interface GameResultModalProps {
  visible: boolean;
  data: GameResultData | null;
  onClose: () => void;
  onRematch?: () => void;
  onViewGame?: () => void;
  onGoHome?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const RESULT_CONFIG = {
  win: {
    title: "Victory!",
    icon: "trophy" as const,
    gradientColors: ["#FFD700", "#FFA500", "#FF8C00"],
    textColor: "#1A1A2E",
    bgColor: "#FFD700",
  },
  loss: {
    title: "Defeat",
    icon: "close-circle" as const,
    gradientColors: ["#4A4A5A", "#2A2A3A", "#1A1A2E"],
    textColor: "#FFFFFF",
    bgColor: "#4A4A5A",
  },
  draw: {
    title: "Draw",
    icon: "git-compare" as const,
    gradientColors: ["#6366F1", "#4F46E5", "#4338CA"],
    textColor: "#FFFFFF",
    bgColor: "#6366F1",
  },
};

// ============================================================================
// Component
// ============================================================================

export function GameResultModal({
  visible,
  data,
  onClose,
  onRematch,
  onViewGame,
  onGoHome,
}: GameResultModalProps) {
  // Animation values
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const eloAnim = useRef(new Animated.Value(0)).current;
  const trophyRotate = useRef(new Animated.Value(0)).current;
  const wagerSlide = useRef(new Animated.Value(50)).current;

  // Run animations when modal becomes visible
  useEffect(() => {
    if (visible && data) {
      // Reset animations
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      eloAnim.setValue(0);
      trophyRotate.setValue(0);
      wagerSlide.setValue(50);

      // Run entrance animations
      Animated.sequence([
        // Modal scale in
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        // Content fade in
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          // Trophy wiggle for win
          data.result === "win"
            ? Animated.sequence([
                Animated.timing(trophyRotate, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: true,
                }),
                Animated.timing(trophyRotate, {
                  toValue: -1,
                  duration: 100,
                  useNativeDriver: true,
                }),
                Animated.timing(trophyRotate, {
                  toValue: 0,
                  duration: 100,
                  useNativeDriver: true,
                }),
              ])
            : Animated.delay(0),
        ]),
        // ELO counter animation
        Animated.timing(eloAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: false,
        }),
        // Wager slide in
        Animated.timing(wagerSlide, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, data]);

  if (!data) return null;

  const config = RESULT_CONFIG[data.result];
  const trophyRotation = trophyRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-10deg", "0deg", "10deg"],
  });

  // Interpolate ELO display
  const displayedElo = eloAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [data.eloChange.before, data.eloChange.after],
  });

  const getReasonText = (reason: EndReason, result: GameResultType): string => {
    switch (reason) {
      case "checkmate":
        return result === "win" ? "by checkmate" : "by checkmate";
      case "timeout":
        return result === "win" ? "on time" : "on time";
      case "resign":
        return result === "win" ? "by resignation" : "you resigned";
      case "draw_agreement":
        return "by agreement";
      case "stalemate":
        return "by stalemate";
      case "insufficient_material":
        return "insufficient material";
      case "threefold_repetition":
        return "threefold repetition";
      case "fifty_moves":
        return "50-move rule";
      case "abandon":
        return result === "win" ? "opponent abandoned" : "by abandonment";
      default:
        return "";
    }
  };

  const handleShare = async () => {
    const resultText = data.result === "win" ? "Won" : data.result === "loss" ? "Lost" : "Drew";
    const message = `I just ${resultText.toLowerCase()} a chess game on Treasure Chess! ${
      data.eloChange.change > 0 ? `+${data.eloChange.change}` : data.eloChange.change
    } ELO`;

    try {
      await Share.share({
        message,
        title: "Treasure Chess Game Result",
      });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header with gradient */}
          <LinearGradient
            colors={config.gradientColors as [string, string, string]}
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Close button */}
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={config.textColor} />
            </Pressable>

            {/* Result icon */}
            <Animated.View
              style={[
                styles.iconContainer,
                { transform: [{ rotate: trophyRotation }] },
              ]}
            >
              <Ionicons
                name={config.icon}
                size={64}
                color={config.textColor}
              />
            </Animated.View>

            {/* Result title */}
            <Text style={[styles.resultTitle, { color: config.textColor }]}>
              {config.title}
            </Text>

            {/* Reason */}
            <Text style={[styles.reasonText, { color: config.textColor }]}>
              {getReasonText(data.endReason, data.result)}
            </Text>
          </LinearGradient>

          {/* Content */}
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            {/* Opponent info */}
            <View style={styles.opponentSection}>
              <Text style={styles.vsText}>
                vs {data.opponent.username}
              </Text>
              <Text style={styles.opponentElo}>
                {data.opponent.eloRating} ELO
              </Text>
            </View>

            {/* ELO change */}
            <View style={styles.eloSection}>
              <Text style={styles.eloLabel}>Your Rating</Text>

              <View style={styles.eloDisplay}>
                <AnimatedNumber
                  value={displayedElo}
                  style={styles.eloValue}
                />

                <View
                  style={[
                    styles.eloChangeBadge,
                    { backgroundColor: getRatingChangeColor(data.eloChange.change) + "20" },
                  ]}
                >
                  <Text
                    style={[
                      styles.eloChangeText,
                      { color: getRatingChangeColor(data.eloChange.change) },
                    ]}
                  >
                    {formatRatingChange(data.eloChange.change)}
                  </Text>
                </View>
              </View>

              <Text style={styles.ratingCategory}>
                {getRatingCategory(data.eloChange.after)}
              </Text>
            </View>

            {/* Wager result */}
            {data.wager && data.wager.amount > 0 && (
              <Animated.View
                style={[
                  styles.wagerSection,
                  { transform: [{ translateY: wagerSlide }] },
                ]}
              >
                {data.wager.refunded ? (
                  <View style={styles.wagerRefunded}>
                    <Ionicons name="refresh-circle" size={24} color="#9CA3AF" />
                    <Text style={styles.wagerRefundedText}>
                      Wager refunded: {data.wager.amount} TCT
                    </Text>
                  </View>
                ) : data.result === "win" ? (
                  <View style={styles.wagerWon}>
                    <Ionicons name="cash" size={28} color="#22C55E" />
                    <View style={styles.wagerWonInfo}>
                      <Text style={styles.wagerWonLabel}>Winnings</Text>
                      <Text style={styles.wagerWonAmount}>
                        +{data.wager.winnings} TCT
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.wagerLost}>
                    <Ionicons name="trending-down" size={24} color="#EF4444" />
                    <Text style={styles.wagerLostText}>
                      Lost wager: {data.wager.amount} TCT
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}
          </Animated.View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.shareButton}
              onPress={handleShare}
            >
              <Ionicons name="share-outline" size={20} color="#6366F1" />
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>

            {onViewGame && (
              <Pressable
                style={styles.viewGameButton}
                onPress={onViewGame}
              >
                <Ionicons name="eye-outline" size={20} color="#6366F1" />
                <Text style={styles.viewGameButtonText}>View Game</Text>
              </Pressable>
            )}

            <View style={styles.mainActions}>
              {onRematch && (
                <Pressable
                  style={styles.rematchButton}
                  onPress={onRematch}
                >
                  <Ionicons name="refresh" size={20} color="#FFFFFF" />
                  <Text style={styles.rematchButtonText}>Rematch</Text>
                </Pressable>
              )}

              <Pressable
                style={[
                  styles.homeButton,
                  !onRematch && styles.homeButtonFull,
                ]}
                onPress={onGoHome || onClose}
              >
                <Ionicons name="home" size={20} color="#1A1A2E" />
                <Text style={styles.homeButtonText}>Home</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Animated Number Component
// ============================================================================

interface AnimatedNumberProps {
  value: Animated.AnimatedInterpolation<number>;
  style: any;
}

function AnimatedNumber({ value, style }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    const listener = value.addListener(({ value: v }) => {
      setDisplayValue(Math.round(v));
    });

    return () => {
      value.removeListener(listener);
    };
  }, [value]);

  return <Text style={style}>{displayValue}</Text>;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: Math.min(SCREEN_WIDTH - 40, 380),
    backgroundColor: "#1A1A2E",
    borderRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  header: {
    paddingTop: 40,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 16,
    opacity: 0.8,
  },
  content: {
    padding: 20,
  },
  opponentSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A3A",
    marginBottom: 20,
  },
  vsText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  opponentElo: {
    fontSize: 14,
    color: "#6B7280",
  },
  eloSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  eloLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  eloDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eloValue: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  eloChangeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  eloChangeText: {
    fontSize: 18,
    fontWeight: "700",
  },
  ratingCategory: {
    fontSize: 14,
    color: "#6366F1",
    marginTop: 8,
  },
  wagerSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#2A2A3A",
  },
  wagerWon: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  wagerWonInfo: {
    flex: 1,
  },
  wagerWonLabel: {
    fontSize: 12,
    color: "#22C55E",
    opacity: 0.8,
  },
  wagerWonAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#22C55E",
  },
  wagerLost: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  wagerLostText: {
    fontSize: 16,
    color: "#EF4444",
  },
  wagerRefunded: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(156, 163, 175, 0.1)",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  wagerRefundedText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  actions: {
    padding: 20,
    paddingTop: 0,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  shareButtonText: {
    fontSize: 16,
    color: "#6366F1",
  },
  viewGameButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#6366F1",
    borderRadius: 12,
  },
  viewGameButtonText: {
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
    paddingVertical: 14,
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
    paddingVertical: 14,
    borderRadius: 12,
  },
  homeButtonFull: {
    flex: 2,
  },
  homeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A2E",
  },
});

export default GameResultModal;
