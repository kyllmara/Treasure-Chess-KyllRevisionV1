/**
 * TournamentLeaderboard Component
 *
 * Displays tournament standings with player stats.
 * Supports both Swiss standings (with tiebreakers) and knockout results.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Trophy,
  Crown,
  Medal,
  Star,
  ChevronRight,
} from "lucide-react-native";
import type {
  SwissStanding,
  TournamentRegistration,
  TournamentPrize,
} from "@/lib/tournament.types";
import { formatScore, getScoreBreakdown } from "@/lib/tournamentBracket";
import { getAvatarConfig } from "@/constants/avatars";

// ============================================================================
// Types
// ============================================================================

export interface TournamentLeaderboardProps {
  standings: SwissStanding[];
  prizes?: TournamentPrize[];
  currentUserId?: string;
  showTiebreakers?: boolean;
  maxItems?: number;
  onPlayerPress?: (userId: string) => void;
}

interface StandingRowProps {
  standing: SwissStanding;
  prize?: TournamentPrize;
  isCurrentUser: boolean;
  showTiebreakers: boolean;
  onPress?: () => void;
}

// ============================================================================
// Place Badge Component
// ============================================================================

function PlaceBadge({ place }: { place: number }) {
  if (place === 1) {
    return (
      <LinearGradient
        colors={["#FFD700", "#FFA500"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.placeBadge}
      >
        <Trophy size={14} color="#FFF" />
      </LinearGradient>
    );
  }

  if (place === 2) {
    return (
      <LinearGradient
        colors={["#C0C0C0", "#A0A0A0"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.placeBadge}
      >
        <Medal size={14} color="#FFF" />
      </LinearGradient>
    );
  }

  if (place === 3) {
    return (
      <LinearGradient
        colors={["#CD7F32", "#8B4513"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.placeBadge}
      >
        <Star size={14} color="#FFF" />
      </LinearGradient>
    );
  }

  return (
    <View style={styles.placeNumber}>
      <Text style={styles.placeNumberText}>{place}</Text>
    </View>
  );
}

// ============================================================================
// Standing Row Component
// ============================================================================

function StandingRow({
  standing,
  prize,
  isCurrentUser,
  showTiebreakers,
  onPress,
}: StandingRowProps) {
  const avatar = getAvatarConfig(standing.profile.avatar_index);
  const scoreBreakdown = getScoreBreakdown(standing.registration);

  return (
    <TouchableOpacity
      style={[
        styles.standingRow,
        isCurrentUser && styles.standingRowHighlight,
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      {/* Rank */}
      <PlaceBadge place={standing.rank} />

      {/* Player Info */}
      <View style={styles.playerInfo}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: avatar.color },
          ]}
        >
          <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
        </View>
        <View style={styles.playerDetails}>
          <Text
            style={[
              styles.playerName,
              isCurrentUser && styles.playerNameHighlight,
            ]}
            numberOfLines={1}
          >
            {standing.profile.username}
          </Text>
          <View style={styles.playerMeta}>
            <Crown size={10} color="#FFD700" />
            <Text style={styles.ratingText}>{standing.profile.elo_rating}</Text>
          </View>
        </View>
      </View>

      {/* Score */}
      <View style={styles.scoreSection}>
        <Text style={styles.scoreValue}>
          {formatScore(standing.registration.score)}
        </Text>
        <Text style={styles.scoreBreakdown}>{scoreBreakdown}</Text>
      </View>

      {/* Tiebreakers */}
      {showTiebreakers && (
        <View style={styles.tiebreakers}>
          <View style={styles.tiebreakerItem}>
            <Text style={styles.tiebreakerLabel}>BH</Text>
            <Text style={styles.tiebreakerValue}>
              {standing.registration.buchholz_score.toFixed(1)}
            </Text>
          </View>
          <View style={styles.tiebreakerItem}>
            <Text style={styles.tiebreakerLabel}>SB</Text>
            <Text style={styles.tiebreakerValue}>
              {standing.registration.sonneborn_berger.toFixed(1)}
            </Text>
          </View>
        </View>
      )}

      {/* Prize */}
      {prize && prize.amount_tct && prize.amount_tct > 0 && (
        <View style={styles.prizeContainer}>
          <Text style={styles.prizeAmount}>
            {prize.amount_tct.toLocaleString()}
          </Text>
          <Text style={styles.prizeCurrency}>TCT</Text>
        </View>
      )}

      {/* Arrow */}
      {onPress && (
        <ChevronRight size={20} color="#666" style={styles.arrow} />
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TournamentLeaderboard({
  standings,
  prizes = [],
  currentUserId,
  showTiebreakers = false,
  maxItems,
  onPlayerPress,
}: TournamentLeaderboardProps) {
  const displayStandings = maxItems ? standings.slice(0, maxItems) : standings;

  // Map prizes by place for quick lookup
  const prizeByPlace = new Map<number, TournamentPrize>();
  prizes.forEach((p) => prizeByPlace.set(p.place, p));

  if (standings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Trophy size={48} color="#666" />
        <Text style={styles.emptyText}>
          No standings yet
        </Text>
        <Text style={styles.emptySubtext}>
          Standings will appear after games are played
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: SwissStanding }) => (
    <StandingRow
      standing={item}
      prize={prizeByPlace.get(item.rank)}
      isCurrentUser={item.profile.id === currentUserId}
      showTiebreakers={showTiebreakers}
      onPress={onPlayerPress ? () => onPlayerPress(item.profile.id) : undefined}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerPlace}>#</Text>
        <Text style={styles.headerPlayer}>Player</Text>
        <Text style={styles.headerScore}>Score</Text>
        {showTiebreakers && (
          <Text style={styles.headerTiebreaker}>Tiebreak</Text>
        )}
        {prizes.length > 0 && (
          <Text style={styles.headerPrize}>Prize</Text>
        )}
      </View>

      {/* Standings List */}
      <FlatList
        data={displayStandings}
        renderItem={renderItem}
        keyExtractor={(item) => item.profile.id}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Show more indicator */}
      {maxItems && standings.length > maxItems && (
        <View style={styles.showMore}>
          <Text style={styles.showMoreText}>
            +{standings.length - maxItems} more players
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    overflow: "hidden",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerPlace: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    width: 36,
    textAlign: "center",
  },
  headerPlayer: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    marginLeft: 8,
  },
  headerScore: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    width: 60,
    textAlign: "center",
  },
  headerTiebreaker: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    width: 70,
    textAlign: "center",
  },
  headerPrize: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    width: 70,
    textAlign: "right",
  },

  // Standing row
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  standingRowHighlight: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  separator: {
    height: 1,
    backgroundColor: "#2a2a3e",
    marginHorizontal: 16,
  },

  // Place badge
  placeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  placeNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  placeNumberText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "700",
  },

  // Player info
  playerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEmoji: {
    fontSize: 18,
  },
  playerDetails: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  playerNameHighlight: {
    color: "#4CAF82",
  },
  playerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    color: "#A0A0A0",
    fontSize: 11,
  },

  // Score
  scoreSection: {
    width: 60,
    alignItems: "center",
  },
  scoreValue: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  scoreBreakdown: {
    color: "#666",
    fontSize: 10,
    marginTop: 2,
  },

  // Tiebreakers
  tiebreakers: {
    width: 70,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  tiebreakerItem: {
    alignItems: "center",
  },
  tiebreakerLabel: {
    color: "#666",
    fontSize: 9,
    fontWeight: "500",
  },
  tiebreakerValue: {
    color: "#A0A0A0",
    fontSize: 11,
    fontWeight: "600",
  },

  // Prize
  prizeContainer: {
    width: 70,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 2,
  },
  prizeAmount: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
  },
  prizeCurrency: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "500",
  },

  // Arrow
  arrow: {
    marginLeft: 8,
  },

  // Empty state
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    color: "#666",
    fontSize: 13,
    textAlign: "center",
  },

  // Show more
  showMore: {
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  showMoreText: {
    color: "#4CAF82",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default TournamentLeaderboard;
