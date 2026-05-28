/**
 * GameHistoryCard Component
 *
 * Displays a single game history entry in a compact card format.
 * Features:
 * - Result indicator (win/loss/draw)
 * - Opponent info with avatar
 * - ELO change with color coding
 * - Wager and earnings display
 * - Relative time display
 */

import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  Trophy,
  Target,
  XCircle,
  Minus,
  TrendingUp,
  TrendingDown,
  Crown,
  Flag,
  Clock,
  Swords,
  ChevronRight,
} from "lucide-react-native";
import { AvatarDisplay } from "./AvatarPicker";
import type { GameHistoryItem, GameResult, GameEndReason } from "@/lib/gameHistory";

// ============================================================================
// Types
// ============================================================================

interface GameHistoryCardProps {
  game: GameHistoryItem;
  onPress?: (game: GameHistoryItem) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getResultConfig(result: GameResult): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
} {
  switch (result) {
    case "win":
      return {
        icon: <Trophy size={16} color="#4ECDC4" />,
        color: "#4ECDC4",
        bgColor: "rgba(78, 205, 196, 0.15)",
        label: "Victory",
      };
    case "loss":
      return {
        icon: <XCircle size={16} color="#FF6B6B" />,
        color: "#FF6B6B",
        bgColor: "rgba(255, 107, 107, 0.15)",
        label: "Defeat",
      };
    case "draw":
      return {
        icon: <Minus size={16} color="#A0A0A0" />,
        color: "#A0A0A0",
        bgColor: "rgba(160, 160, 160, 0.15)",
        label: "Draw",
      };
  }
}

function getEndReasonLabel(reason: GameEndReason): string {
  switch (reason) {
    case "checkmate":
      return "Checkmate";
    case "resignation":
      return "Resignation";
    case "timeout":
      return "Timeout";
    case "stalemate":
      return "Stalemate";
    case "draw_agreement":
      return "Agreement";
    case "insufficient_material":
      return "Insufficient material";
    case "threefold_repetition":
      return "Threefold repetition";
    case "fifty_move_rule":
      return "Fifty move rule";
    default:
      return reason;
  }
}

function getEndReasonIcon(reason: GameEndReason): React.ReactNode {
  switch (reason) {
    case "checkmate":
      return <Crown size={12} color="#FFD700" />;
    case "resignation":
      return <Flag size={12} color="#9B7EC8" />;
    case "timeout":
      return <Clock size={12} color="#4ECDC4" />;
    default:
      return <Swords size={12} color="#A0A0A0" />;
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths}mo ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatTCT(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toFixed(0);
}

// ============================================================================
// Main Component
// ============================================================================

export const GameHistoryCard = memo(function GameHistoryCard({
  game,
  onPress,
}: GameHistoryCardProps) {
  const resultConfig = useMemo(() => getResultConfig(game.result), [game.result]);

  const eloChangeDisplay = useMemo(() => {
    if (game.eloChange === 0) {
      return { text: "0", color: "#A0A0A0" };
    }
    return {
      text: game.eloChange > 0 ? `+${game.eloChange}` : `${game.eloChange}`,
      color: game.eloChange > 0 ? "#4ECDC4" : "#FF6B6B",
    };
  }, [game.eloChange]);

  const earningsDisplay = useMemo(() => {
    if (game.netEarnings === 0) {
      return null;
    }
    return {
      text: game.netEarnings > 0
        ? `+${formatTCT(game.netEarnings)}`
        : `${formatTCT(game.netEarnings)}`,
      color: game.netEarnings > 0 ? "#FFD700" : "#FF6B6B",
    };
  }, [game.netEarnings]);

  const content = (
    <View style={[styles.container, { borderLeftColor: resultConfig.color }]}>
      {/* Result Badge */}
      <View style={[styles.resultBadge, { backgroundColor: resultConfig.bgColor }]}>
        {resultConfig.icon}
      </View>

      {/* Opponent Info */}
      <View style={styles.opponentSection}>
        <AvatarDisplay
          index={game.opponentAvatarIndex}
          size={44}
          showBorder
        />
        <View style={styles.opponentInfo}>
          <View style={styles.opponentNameRow}>
            <Text style={styles.opponentUsername} numberOfLines={1}>
              {game.opponentUsername}
            </Text>
            <Text style={styles.opponentRating}>({game.opponentEloRating})</Text>
          </View>
          <View style={styles.gameMetaRow}>
            {getEndReasonIcon(game.endReason)}
            <Text style={styles.gameMetaText}>
              {getEndReasonLabel(game.endReason)}
            </Text>
            <Text style={styles.metaDivider}>•</Text>
            <Text style={styles.gameMetaText}>
              {game.movesCount} moves
            </Text>
          </View>
        </View>
      </View>

      {/* Stats Section */}
      <View style={styles.statsSection}>
        {/* ELO Change */}
        <View style={styles.statItem}>
          {game.eloChange >= 0 ? (
            <TrendingUp size={14} color={eloChangeDisplay.color} />
          ) : (
            <TrendingDown size={14} color={eloChangeDisplay.color} />
          )}
          <Text style={[styles.eloChange, { color: eloChangeDisplay.color }]}>
            {eloChangeDisplay.text}
          </Text>
        </View>

        {/* Earnings */}
        {earningsDisplay && (
          <View style={styles.statItem}>
            <Text style={[styles.earnings, { color: earningsDisplay.color }]}>
              {earningsDisplay.text} TCT
            </Text>
          </View>
        )}

        {/* Time */}
        <Text style={styles.timeText}>
          {formatRelativeTime(game.endedAt)}
        </Text>
      </View>

      {/* Chevron for tap */}
      {onPress && (
        <View style={styles.chevron}>
          <ChevronRight size={18} color="#3E3E5E" />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(game)} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

// ============================================================================
// Compact Card Variant
// ============================================================================

interface CompactGameCardProps {
  game: GameHistoryItem;
  onPress?: (game: GameHistoryItem) => void;
}

export const CompactGameCard = memo(function CompactGameCard({
  game,
  onPress,
}: CompactGameCardProps) {
  const resultConfig = useMemo(() => getResultConfig(game.result), [game.result]);

  const content = (
    <View style={styles.compactContainer}>
      <View style={[styles.compactResultBar, { backgroundColor: resultConfig.color }]} />
      <View style={styles.compactContent}>
        <View style={styles.compactLeft}>
          <Text style={[styles.compactResult, { color: resultConfig.color }]}>
            {resultConfig.label}
          </Text>
          <Text style={styles.compactOpponent} numberOfLines={1}>
            vs {game.opponentUsername}
          </Text>
        </View>
        <View style={styles.compactRight}>
          <Text
            style={[
              styles.compactElo,
              { color: game.eloChange >= 0 ? "#4ECDC4" : "#FF6B6B" },
            ]}
          >
            {game.eloChange >= 0 ? "+" : ""}{game.eloChange}
          </Text>
          <Text style={styles.compactTime}>
            {formatRelativeTime(game.endedAt)}
          </Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(game)} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
});

// ============================================================================
// Loading Skeleton
// ============================================================================

export const GameHistoryCardSkeleton = memo(function GameHistoryCardSkeleton() {
  return (
    <View style={[styles.container, styles.skeleton]}>
      <View style={[styles.resultBadge, styles.skeletonBadge]} />
      <View style={styles.opponentSection}>
        <View style={[styles.skeletonAvatar]} />
        <View style={styles.opponentInfo}>
          <View style={styles.skeletonTextLong} />
          <View style={styles.skeletonTextShort} />
        </View>
      </View>
      <View style={styles.statsSection}>
        <View style={styles.skeletonTextShort} />
      </View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    gap: 12,
  },

  resultBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  opponentSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  opponentInfo: {
    flex: 1,
    gap: 4,
  },

  opponentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  opponentUsername: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    maxWidth: 120,
  },

  opponentRating: {
    fontSize: 12,
    color: "#A0A0A0",
  },

  gameMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  gameMetaText: {
    fontSize: 11,
    color: "#A0A0A0",
  },

  metaDivider: {
    fontSize: 11,
    color: "#3E3E5E",
  },

  statsSection: {
    alignItems: "flex-end",
    gap: 4,
  },

  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  eloChange: {
    fontSize: 14,
    fontWeight: "700",
  },

  earnings: {
    fontSize: 12,
    fontWeight: "600",
  },

  timeText: {
    fontSize: 10,
    color: "#666",
  },

  chevron: {
    marginLeft: 4,
  },

  // Compact Styles
  compactContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    marginBottom: 6,
    overflow: "hidden",
  },

  compactResultBar: {
    width: 4,
  },

  compactContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
  },

  compactLeft: {
    flex: 1,
    gap: 2,
  },

  compactResult: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  compactOpponent: {
    fontSize: 13,
    color: "#A0A0A0",
  },

  compactRight: {
    alignItems: "flex-end",
    gap: 2,
  },

  compactElo: {
    fontSize: 13,
    fontWeight: "700",
  },

  compactTime: {
    fontSize: 10,
    color: "#666",
  },

  // Skeleton Styles
  skeleton: {
    opacity: 0.5,
    borderLeftColor: "#3E3E5E",
  },

  skeletonBadge: {
    backgroundColor: "#3E3E5E",
  },

  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#3E3E5E",
  },

  skeletonTextLong: {
    width: 100,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3E3E5E",
  },

  skeletonTextShort: {
    width: 60,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#3E3E5E",
  },
});

export default GameHistoryCard;
