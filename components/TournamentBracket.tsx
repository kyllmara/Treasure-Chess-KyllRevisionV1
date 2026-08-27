/**
 * TournamentBracket Component
 *
 * Displays tournament bracket visualization for knockout and Swiss formats.
 * Supports both tree view (knockout) and round-by-round view (Swiss).
 */

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Trophy,
  Crown,
  Clock,
  CheckCircle,
  XCircle,
  Minus,
  User,
} from "lucide-react-native";
import type {
  TournamentMatch,
  TournamentType,
  BracketNode,
} from "@/lib/tournament.types";
import {
  organizeMatchesByRound,
  getKnockoutRoundName,
  getSwissRoundName,
  getMatchResult,
  isBye,
} from "@/lib/tournamentBracket";
import { getAvatarConfig } from "@/constants/avatars";

// ============================================================================
// Types
// ============================================================================

export interface TournamentBracketProps {
  matches: TournamentMatch[];
  tournamentType: TournamentType;
  currentRound?: number;
  totalRounds?: number;
  userId?: string;
  onMatchPress?: (match: TournamentMatch) => void;
}

interface MatchCardProps {
  match: TournamentMatch;
  roundName?: string;
  userId?: string;
  onPress?: () => void;
  compact?: boolean;
}

// ============================================================================
// Match Card Component
// ============================================================================

function MatchCard({
  match,
  roundName,
  userId,
  onPress,
  compact = false,
}: MatchCardProps) {
  const player1Avatar = match.player1?.avatar_index !== undefined
    ? getAvatarConfig(match.player1.avatar_index)
    : null;
  const player2Avatar = match.player2?.avatar_index !== undefined
    ? getAvatarConfig(match.player2.avatar_index)
    : null;

  const isUserMatch = userId && (match.player1_id === userId || match.player2_id === userId);
  const userResult = userId ? getMatchResult(match, userId) : null;
  const isByeMatch = isBye(match);

  const getStatusColor = () => {
    if (match.status === "completed") return "#4CAF82";
    if (match.status === "in_progress") return "#FFB347";
    if (match.status === "bye") return "#A0A0A0";
    return "#666";
  };

  const getResultIcon = () => {
    switch (userResult) {
      case "win":
        return <CheckCircle size={16} color="#4CAF82" />;
      case "loss":
        return <XCircle size={16} color="#E05C5C" />;
      case "draw":
        return <Minus size={16} color="#FFB347" />;
      case "bye":
        return <Trophy size={16} color="#FFD700" />;
      default:
        return null;
    }
  };

  const PlayerRow = ({
    player,
    avatar,
    seed,
    isWinner,
    score,
  }: {
    player: TournamentMatch["player1"] | null;
    avatar: ReturnType<typeof getAvatarConfig> | null;
    seed: number | null;
    isWinner: boolean;
    score: number;
  }) => (
    <View style={[styles.playerRow, isWinner && styles.winnerRow]}>
      <View style={styles.playerLeft}>
        {seed && <Text style={styles.seedText}>{seed}</Text>}
        {avatar ? (
          <View
            style={[
              styles.miniAvatar,
              { backgroundColor: avatar.color },
            ]}
          >
            <Text style={styles.miniAvatarEmoji}>{avatar.emoji}</Text>
          </View>
        ) : (
          <View style={styles.miniAvatarPlaceholder}>
            <User size={12} color="#666" />
          </View>
        )}
        <Text
          style={[
            styles.playerName,
            !player && styles.playerNameTbd,
            isWinner && styles.winnerName,
          ]}
          numberOfLines={1}
        >
          {player?.username || "TBD"}
        </Text>
      </View>
      <View style={styles.playerRight}>
        {match.status === "completed" && (
          <Text
            style={[
              styles.scoreText,
              isWinner && styles.winnerScore,
            ]}
          >
            {score}
          </Text>
        )}
        {isWinner && <Trophy size={14} color="#FFD700" />}
      </View>
    </View>
  );

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.matchCardCompact,
          isUserMatch && styles.matchCardHighlight,
        ]}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={styles.matchCardCompactInner}>
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
          <View style={styles.compactPlayers}>
            <Text style={styles.compactPlayerName} numberOfLines={1}>
              {match.player1?.username || "TBD"}
            </Text>
            <Text style={styles.vsText}>vs</Text>
            <Text style={styles.compactPlayerName} numberOfLines={1}>
              {match.player2?.username || "TBD"}
            </Text>
          </View>
          {isUserMatch && getResultIcon()}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.matchCard,
        isUserMatch && styles.matchCardHighlight,
        isByeMatch && styles.matchCardBye,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <LinearGradient
        colors={["#1e1e2e", "#252540"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.matchCardGradient}
      >
        {/* Match Header */}
        {roundName && (
          <View style={styles.matchHeader}>
            <Text style={styles.roundLabel}>{roundName}</Text>
            <View style={styles.matchStatus}>
              {match.status === "in_progress" && (
                <Clock size={12} color="#FFB347" />
              )}
              <Text
                style={[
                  styles.statusText,
                  { color: getStatusColor() },
                ]}
              >
                {isByeMatch
                  ? "Bye"
                  : match.status === "completed"
                  ? "Completed"
                  : match.status === "in_progress"
                  ? "Live"
                  : "Upcoming"}
              </Text>
            </View>
          </View>
        )}

        {/* Players */}
        <PlayerRow
          player={match.player1 || null}
          avatar={player1Avatar}
          seed={match.player1_seed}
          isWinner={match.winner_id === match.player1_id}
          score={match.player1_score}
        />
        <View style={styles.divider} />
        <PlayerRow
          player={match.player2 || null}
          avatar={player2Avatar}
          seed={match.player2_seed}
          isWinner={match.winner_id === match.player2_id}
          score={match.player2_score}
        />

        {/* User Result Badge */}
        {isUserMatch && userResult && userResult !== "pending" && (
          <View style={styles.userResultBadge}>
            {getResultIcon()}
            <Text
              style={[
                styles.resultText,
                userResult === "win" && styles.resultWin,
                userResult === "loss" && styles.resultLoss,
                userResult === "draw" && styles.resultDraw,
              ]}
            >
              {userResult === "bye" ? "Advance" : userResult.toUpperCase()}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// Knockout Bracket View
// ============================================================================

function KnockoutBracketView({
  matchesByRound,
  totalRounds,
  userId,
  onMatchPress,
}: {
  matchesByRound: Map<number, TournamentMatch[]>;
  totalRounds: number;
  userId?: string;
  onMatchPress?: (match: TournamentMatch) => void;
}) {
  const rounds = Array.from(matchesByRound.keys()).sort((a, b) => a - b);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.knockoutContainer}
    >
      {rounds.map((round) => {
        const roundMatches = matchesByRound.get(round) || [];
        const roundName = getKnockoutRoundName(round, totalRounds);

        return (
          <View key={round} style={styles.roundColumn}>
            <Text style={styles.roundTitle}>{roundName}</Text>
            <View style={styles.roundMatches}>
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  userId={userId}
                  onPress={onMatchPress ? () => onMatchPress(match) : undefined}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ============================================================================
// Swiss Bracket View
// ============================================================================

function SwissBracketView({
  matchesByRound,
  currentRound,
  userId,
  onMatchPress,
}: {
  matchesByRound: Map<number, TournamentMatch[]>;
  currentRound: number;
  userId?: string;
  onMatchPress?: (match: TournamentMatch) => void;
}) {
  const rounds = Array.from(matchesByRound.keys()).sort((a, b) => b - a); // Most recent first

  return (
    <View style={styles.swissContainer}>
      {rounds.map((round) => {
        const roundMatches = matchesByRound.get(round) || [];
        const roundName = getSwissRoundName(round);
        const isCurrentRound = round === currentRound;

        return (
          <View key={round} style={styles.swissRound}>
            <View style={styles.swissRoundHeader}>
              <Text
                style={[
                  styles.swissRoundTitle,
                  isCurrentRound && styles.currentRoundTitle,
                ]}
              >
                {roundName}
              </Text>
              {isCurrentRound && (
                <View style={styles.currentBadge}>
                  <Clock size={12} color="#FFB347" />
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
            </View>
            <View style={styles.swissMatches}>
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  userId={userId}
                  onPress={onMatchPress ? () => onMatchPress(match) : undefined}
                  compact
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TournamentBracket({
  matches,
  tournamentType,
  currentRound = 1,
  totalRounds = 1,
  userId,
  onMatchPress,
}: TournamentBracketProps) {
  const matchesByRound = useMemo(
    () => organizeMatchesByRound(matches),
    [matches]
  );

  const calculatedTotalRounds = useMemo(() => {
    if (totalRounds > 1) return totalRounds;
    const maxRound = Math.max(...matches.map((m) => m.round), 1);
    return maxRound;
  }, [matches, totalRounds]);

  if (matches.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Trophy size={48} color="#666" />
        <Text style={styles.emptyText}>
          Bracket will be generated when the tournament starts
        </Text>
      </View>
    );
  }

  if (tournamentType === "swiss") {
    return (
      <SwissBracketView
        matchesByRound={matchesByRound}
        currentRound={currentRound}
        userId={userId}
        onMatchPress={onMatchPress}
      />
    );
  }

  return (
    <KnockoutBracketView
      matchesByRound={matchesByRound}
      totalRounds={calculatedTotalRounds}
      userId={userId}
      onMatchPress={onMatchPress}
    />
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width } = Dimensions.get("window");
const MATCH_CARD_WIDTH = Math.min(200, width * 0.6);

const styles = StyleSheet.create({
  // Empty state
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 16,
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
  },

  // Knockout bracket
  knockoutContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: "row",
    gap: 24,
  },
  roundColumn: {
    alignItems: "center",
    minWidth: MATCH_CARD_WIDTH,
  },
  roundTitle: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  roundMatches: {
    gap: 16,
    justifyContent: "space-around",
    flex: 1,
  },

  // Swiss bracket
  swissContainer: {
    padding: 16,
    gap: 20,
  },
  swissRound: {
    gap: 12,
  },
  swissRoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  swissRoundTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  currentRoundTitle: {
    color: "#FFB347",
  },
  currentBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 179, 71, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  currentBadgeText: {
    color: "#FFB347",
    fontSize: 12,
    fontWeight: "600",
  },
  swissMatches: {
    gap: 8,
  },

  // Match card
  matchCard: {
    width: MATCH_CARD_WIDTH,
    borderRadius: 12,
    overflow: "hidden",
  },
  matchCardGradient: {
    padding: 12,
  },
  matchCardHighlight: {
    borderWidth: 2,
    borderColor: "#4CAF82",
  },
  matchCardBye: {
    opacity: 0.7,
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  roundLabel: {
    color: "#A0A0A0",
    fontSize: 11,
    fontWeight: "500",
  },
  matchStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusIndicator: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    marginRight: 8,
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  winnerRow: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 6,
    marginHorizontal: -4,
    paddingHorizontal: 4,
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  playerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  seedText: {
    color: "#666",
    fontSize: 10,
    fontWeight: "600",
    width: 16,
    textAlign: "center",
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  miniAvatarEmoji: {
    fontSize: 10,
  },
  miniAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  playerName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  playerNameTbd: {
    color: "#666",
    fontStyle: "italic",
  },
  winnerName: {
    fontWeight: "700",
    color: "#FFD700",
  },
  scoreText: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "600",
  },
  winnerScore: {
    color: "#FFD700",
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginVertical: 2,
  },
  userResultBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
    gap: 6,
  },
  resultText: {
    fontSize: 12,
    fontWeight: "700",
  },
  resultWin: {
    color: "#4CAF82",
  },
  resultLoss: {
    color: "#E05C5C",
  },
  resultDraw: {
    color: "#FFB347",
  },

  // Compact match card
  matchCardCompact: {
    backgroundColor: "#1e1e2e",
    borderRadius: 8,
    overflow: "hidden",
  },
  matchCardCompactInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
  },
  compactPlayers: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactPlayerName: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  vsText: {
    color: "#666",
    fontSize: 11,
    fontWeight: "500",
  },
});

export default TournamentBracket;
