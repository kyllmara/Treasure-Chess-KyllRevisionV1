/**
 * StreamOverlay Component
 *
 * Displays game information overlay on the stream including
 * player names, ratings, timers, and optional move history.
 */

import React, { memo, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from "react-native";
import { Clock, Trophy, Swords } from "lucide-react-native";
import type { StreamOverlayProps } from "@/types/livestream";

// ============================================================================
// Component
// ============================================================================

export const StreamOverlay = memo(function StreamOverlay({
  config,
  playerWhite,
  playerBlack,
  moveHistory,
  stakes,
  isWhiteTurn,
}: StreamOverlayProps) {
  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Get time urgency color
  const getTimeColor = (seconds: number): string => {
    if (seconds < 30) return "#EF4444";
    if (seconds < 60) return "#F59E0B";
    return "#22C55E";
  };

  // Recent moves (last 6)
  const recentMoves = useMemo(() => {
    if (!config.showMoveHistory || moveHistory.length === 0) return [];
    return moveHistory.slice(-6);
  }, [config.showMoveHistory, moveHistory]);

  if (config.position === "side") {
    return (
      <View style={styles.sideContainer}>
        {/* White Player */}
        <PlayerCard
          player={playerWhite}
          color="white"
          isActive={isWhiteTurn}
          config={config}
          formatTime={formatTime}
          getTimeColor={getTimeColor}
        />

        {/* Stakes (if shown) */}
        {config.showStakes && stakes !== undefined && stakes > 0 && (
          <View style={styles.stakesContainer}>
            <Trophy size={14} color="#FFD700" />
            <Text style={styles.stakesAmount}>{stakes} TCT</Text>
          </View>
        )}

        {/* Black Player */}
        <PlayerCard
          player={playerBlack}
          color="black"
          isActive={!isWhiteTurn}
          config={config}
          formatTime={formatTime}
          getTimeColor={getTimeColor}
        />

        {/* Move History */}
        {config.showMoveHistory && recentMoves.length > 0 && (
          <View style={styles.moveHistorySide}>
            {recentMoves.map((move, index) => (
              <Text key={index} style={styles.moveText}>
                {moveHistory.length - recentMoves.length + index + 1}. {move}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Top or bottom position
  return (
    <View
      style={[
        styles.horizontalContainer,
        config.position === "top" ? styles.topPosition : styles.bottomPosition,
      ]}
    >
      {/* White Player */}
      <View style={styles.playerSection}>
        {config.showPlayerNames && (
          <Text style={[styles.playerName, isWhiteTurn && styles.activePlayerName]}>
            {playerWhite.username}
          </Text>
        )}
        {config.showRatings && (
          <Text style={styles.playerRating}>{playerWhite.rating}</Text>
        )}
        {config.showTimer && (
          <View style={styles.timerContainer}>
            <Clock size={12} color={getTimeColor(playerWhite.timeRemaining)} />
            <Text
              style={[
                styles.timerText,
                { color: getTimeColor(playerWhite.timeRemaining) },
              ]}
            >
              {formatTime(playerWhite.timeRemaining)}
            </Text>
          </View>
        )}
      </View>

      {/* Center - VS / Stakes */}
      <View style={styles.centerSection}>
        {config.showStakes && stakes !== undefined && stakes > 0 ? (
          <View style={styles.stakesHorizontal}>
            <Trophy size={16} color="#FFD700" />
            <Text style={styles.stakesAmountLarge}>{stakes}</Text>
            <Text style={styles.stakesLabel}>TCT</Text>
          </View>
        ) : (
          <View style={styles.vsContainer}>
            <Swords size={20} color="#6B7280" />
          </View>
        )}
      </View>

      {/* Black Player */}
      <View style={[styles.playerSection, styles.playerSectionRight]}>
        {config.showPlayerNames && (
          <Text style={[styles.playerName, !isWhiteTurn && styles.activePlayerName]}>
            {playerBlack.username}
          </Text>
        )}
        {config.showRatings && (
          <Text style={styles.playerRating}>{playerBlack.rating}</Text>
        )}
        {config.showTimer && (
          <View style={styles.timerContainer}>
            <Clock size={12} color={getTimeColor(playerBlack.timeRemaining)} />
            <Text
              style={[
                styles.timerText,
                { color: getTimeColor(playerBlack.timeRemaining) },
              ]}
            >
              {formatTime(playerBlack.timeRemaining)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

// ============================================================================
// PlayerCard Component (for side layout)
// ============================================================================

interface PlayerCardProps {
  player: {
    username: string;
    rating: number;
    timeRemaining: number;
  };
  color: "white" | "black";
  isActive: boolean;
  config: StreamOverlayProps["config"];
  formatTime: (seconds: number) => string;
  getTimeColor: (seconds: number) => string;
}

const PlayerCard = memo(function PlayerCard({
  player,
  color,
  isActive,
  config,
  formatTime,
  getTimeColor,
}: PlayerCardProps) {
  return (
    <View style={[styles.playerCard, isActive && styles.activePlayerCard]}>
      {/* Color indicator */}
      <View
        style={[
          styles.colorIndicator,
          color === "white" ? styles.whiteIndicator : styles.blackIndicator,
        ]}
      />

      <View style={styles.playerCardContent}>
        {config.showPlayerNames && (
          <Text
            style={[styles.playerCardName, isActive && styles.activePlayerName]}
            numberOfLines={1}
          >
            {player.username}
          </Text>
        )}

        <View style={styles.playerCardDetails}>
          {config.showRatings && (
            <Text style={styles.playerCardRating}>{player.rating}</Text>
          )}

          {config.showTimer && (
            <View style={styles.playerCardTimer}>
              <Clock size={10} color={getTimeColor(player.timeRemaining)} />
              <Text
                style={[
                  styles.playerCardTimerText,
                  { color: getTimeColor(player.timeRemaining) },
                ]}
              >
                {formatTime(player.timeRemaining)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Active turn indicator */}
      {isActive && <View style={styles.turnIndicator} />}
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Side layout
  sideContainer: {
    position: "absolute",
    right: 8,
    top: 8,
    bottom: 8,
    width: 120,
    justifyContent: "space-between",
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  activePlayerCard: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
  },
  whiteIndicator: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
  },
  blackIndicator: {
    backgroundColor: "#1F2937",
    borderColor: "#4B5563",
  },
  playerCardContent: {
    flex: 1,
  },
  playerCardName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  playerCardDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 8,
  },
  playerCardRating: {
    color: "#9CA3AF",
    fontSize: 10,
  },
  playerCardTimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  playerCardTimerText: {
    fontSize: 10,
    fontWeight: "600",
  },
  turnIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFD700",
    marginLeft: 4,
  },
  stakesContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  stakesAmount: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
  },
  moveHistorySide: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 8,
    padding: 8,
  },
  moveText: {
    color: "#9CA3AF",
    fontSize: 10,
    marginBottom: 2,
  },

  // Horizontal layout (top/bottom)
  horizontalContainer: {
    position: "absolute",
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  topPosition: {
    top: 8,
  },
  bottomPosition: {
    bottom: 8,
  },
  playerSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  playerSectionRight: {
    alignItems: "flex-end",
  },
  playerName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  activePlayerName: {
    color: "#FFD700",
  },
  playerRating: {
    color: "#9CA3AF",
    fontSize: 10,
    marginTop: 1,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 4,
  },
  timerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  centerSection: {
    paddingHorizontal: 16,
  },
  vsContainer: {
    opacity: 0.6,
  },
  stakesHorizontal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stakesAmountLarge: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "700",
  },
  stakesLabel: {
    color: "#FFD700",
    fontSize: 10,
    opacity: 0.8,
  },
});

export default StreamOverlay;
