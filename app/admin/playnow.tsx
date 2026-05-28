/**
 * Admin Play Now Screen
 *
 * View all Play Now (matchmaking) games: players, usernames, ELO scores,
 * wager amount, result, and who won.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { supabase } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

type GameStatus = "pending" | "active" | "completed" | "abandoned" | "cancelled";

interface PlayNowGame {
  id: string;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  status: GameStatus;
  result: string | null;
  winner_id: string | null;
  move_count: number;
  white_elo_before: number | null;
  white_elo_after: number | null;
  black_elo_before: number | null;
  black_elo_after: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  white_player: { id: string; username: string; elo_rating: number } | null;
  black_player: { id: string; username: string; elo_rating: number } | null;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  pending: "#FCD34D",
  active: "#4ECDC4",
  completed: "#4ADE80",
  abandoned: "#FF453A",
  cancelled: "#A0A0A0",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  completed: "Completed",
  abandoned: "Abandoned",
  cancelled: "Cancelled",
};

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#888";
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>
        {STATUS_LABELS[status] || status}
      </Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function AdminPlayNowScreen() {
  return (
    <AdminGate featureName="Play Now Games">
      <AdminPlayNowContent />
    </AdminGate>
  );
}

function AdminPlayNowContent() {
  const router = useRouter();
  const [games, setGames] = useState<PlayNowGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const loadGames = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch games that came from play_now_queue (have a matching entry)
      // First get the game IDs from play_now_queue
      const { data: queueData, error: queueError } = await supabase
        .from("play_now_queue")
        .select("game_id")
        .not("game_id", "is", null) as { data: any[] | null; error: any };

      if (queueError) throw queueError;

      const gameIds = (queueData || [])
        .map((q: any) => q.game_id)
        .filter(Boolean);

      // Remove duplicates
      const uniqueGameIds = [...new Set(gameIds)] as string[];

      if (uniqueGameIds.length === 0) {
        setGames([]);
        setIsLoading(false);
        return;
      }

      const { data, error: fetchError } = await (supabase
        .from("games")
        .select(`
          id,
          wager_tct,
          time_control_seconds,
          increment_seconds,
          status,
          result,
          winner_id,
          move_count,
          white_elo_before,
          white_elo_after,
          black_elo_before,
          black_elo_after,
          created_at,
          started_at,
          ended_at,
          white_player:profiles!games_white_player_id_fkey(id, username, elo_rating),
          black_player:profiles!games_black_player_id_fkey(id, username, elo_rating)
        `)
        .in("id", uniqueGameIds)
        .order("created_at", { ascending: false })
        .limit(100) as any);

      if (fetchError) throw fetchError;
      setGames(data || []);
    } catch (err: any) {
      console.error("Error loading play now games:", err);
      setError(err.message || "Failed to load games");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const filteredGames =
    filterStatus === "all"
      ? games
      : games.filter((g) => g.status === filterStatus);

  const getResultDisplay = (game: PlayNowGame) => {
    if (!game.result) return null;

    const whiteName = game.white_player?.username || "White";
    const blackName = game.black_player?.username || "Black";

    if (game.result === "white_wins") {
      return { label: `${whiteName} Won`, color: "#4ADE80" };
    }
    if (game.result === "black_wins") {
      return { label: `${blackName} Won`, color: "#4ADE80" };
    }
    if (game.result === "draw") {
      return { label: "Draw", color: "#FCD34D" };
    }
    return { label: game.result, color: "#A0A0A0" };
  };

  const renderGame = useCallback(
    ({ item }: { item: PlayNowGame }) => {
      const whiteName = item.white_player?.username || "Unknown";
      const blackName = item.black_player?.username || "Unknown";
      const whiteElo = item.white_elo_before ?? item.white_player?.elo_rating ?? 0;
      const blackElo = item.black_elo_before ?? item.black_player?.elo_rating ?? 0;
      const resultDisplay = getResultDisplay(item);

      return (
        <View style={styles.card}>
          {/* Players */}
          <View style={styles.cardHeader}>
            <View style={styles.playersSection}>
              <View style={styles.playerRow}>
                <View style={[styles.colorDot, { backgroundColor: "#FFFFFF" }]} />
                <Text style={styles.playerName} numberOfLines={1}>
                  {whiteName}
                </Text>
                <Text style={styles.eloText}>{whiteElo}</Text>
                {item.white_elo_after != null && item.white_elo_before != null && (
                  <Text
                    style={[
                      styles.eloDelta,
                      {
                        color:
                          item.white_elo_after >= item.white_elo_before
                            ? "#4ADE80"
                            : "#FF453A",
                      },
                    ]}
                  >
                    {item.white_elo_after >= item.white_elo_before ? "+" : ""}
                    {item.white_elo_after - item.white_elo_before}
                  </Text>
                )}
              </View>
              <View style={styles.playerRow}>
                <View style={[styles.colorDot, { backgroundColor: "#333" }]} />
                <Text style={styles.playerName} numberOfLines={1}>
                  {blackName}
                </Text>
                <Text style={styles.eloText}>{blackElo}</Text>
                {item.black_elo_after != null && item.black_elo_before != null && (
                  <Text
                    style={[
                      styles.eloDelta,
                      {
                        color:
                          item.black_elo_after >= item.black_elo_before
                            ? "#4ADE80"
                            : "#FF453A",
                      },
                    ]}
                  >
                    {item.black_elo_after >= item.black_elo_before ? "+" : ""}
                    {item.black_elo_after - item.black_elo_before}
                  </Text>
                )}
              </View>
            </View>
            <StatusBadge status={item.status} />
          </View>

          {/* Details */}
          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={14} color="#FFD700" />
              <Text style={styles.detailTextGold}>
                {Number(item.wager_tct).toLocaleString()} TCT
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {Math.floor(item.time_control_seconds / 60)}+{item.increment_seconds}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="swap-vertical-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>{item.move_count} moves</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {/* Result */}
          {resultDisplay && (
            <View
              style={[
                styles.resultBadge,
                { backgroundColor: `${resultDisplay.color}20` },
              ]}
            >
              <Ionicons
                name={
                  resultDisplay.label === "Draw"
                    ? "remove-circle-outline"
                    : "trophy-outline"
                }
                size={14}
                color={resultDisplay.color}
              />
              <Text style={[styles.resultBadgeText, { color: resultDisplay.color }]}>
                {resultDisplay.label}
              </Text>
            </View>
          )}
        </View>
      );
    },
    []
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="game-controller" size={24} color="#4ECDC4" />
              <Text style={styles.headerTitle}>Play Now</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={loadGames}
              disabled={isLoading}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={isLoading ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF453A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            {(["all", "active", "completed", "pending", "abandoned", "cancelled"] as const).map(
              (status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterTab,
                    filterStatus === status && styles.filterTabActive,
                  ]}
                  onPress={() => setFilterStatus(status)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      filterStatus === status && styles.filterTabTextActive,
                    ]}
                  >
                    {status === "all" ? "All" : STATUS_LABELS[status] || status}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>

          {/* Count */}
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* List */}
          {isLoading && games.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4ECDC4" />
            </View>
          ) : (
            <FlatList
              data={filteredGames}
              renderItem={renderGame}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="game-controller-outline" size={48} color="#666" />
                  <Text style={styles.emptyText}>No Play Now games found</Text>
                </View>
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
  container: { flex: 1, backgroundColor: "#0F0F1E" },
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorText: { color: "#FF453A", fontSize: 14, flex: 1 },
  filterContainer: { maxHeight: 44, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterTabActive: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4ECDC4",
  },
  filterTabText: { fontSize: 13, color: "#A0A0A0", fontWeight: "500" },
  filterTabTextActive: { color: "#4ECDC4" },
  countRow: { paddingHorizontal: 16, marginBottom: 8 },
  countText: { fontSize: 13, color: "#666" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  emptyContainer: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyText: { fontSize: 16, color: "#666" },

  // Card
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  playersSection: { flex: 1, gap: 6, marginRight: 8 },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  eloText: { fontSize: 12, color: "#A0A0A0" },
  eloDelta: { fontSize: 11, fontWeight: "600" },
  cardDetails: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontSize: 12, color: "#A0A0A0" },
  detailTextGold: { fontSize: 12, color: "#FFD700", fontWeight: "600" },

  // Status
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },

  // Result
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  resultBadgeText: { fontSize: 12, fontWeight: "600" },
});
