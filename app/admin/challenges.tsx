/**
 * Admin Challenge Management Screen
 *
 * View all challenges with wager amount, time control, players, status, and result.
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

type ChallengeStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

interface AdminChallenge {
  id: string;
  room_code: string;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  status: ChallengeStatus;
  game_id: string | null;
  created_at: string;
  accepted_at: string | null;
  expires_at: string;
  creator: { id: string; username: string; elo_rating: number } | null;
  opponent: { id: string; username: string; elo_rating: number } | null;
  game: { result: string | null; winner_id: string | null } | null;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<ChallengeStatus, string> = {
  pending: "#FCD34D",
  accepted: "#4ADE80",
  declined: "#FB923C",
  cancelled: "#FF453A",
  expired: "#A0A0A0",
};

const STATUS_LABELS: Record<ChallengeStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: ChallengeStatus }) {
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

function ResultBadge({ result, winnerId, creatorId }: { result: string | null; winnerId: string | null; creatorId: string }) {
  if (!result) return null;

  let label = result;
  let color = "#A0A0A0";

  if (result === "white_wins" || result === "black_wins") {
    label = winnerId === creatorId ? "Creator Won" : "Opponent Won";
    color = "#4ADE80";
  } else if (result === "draw") {
    label = "Draw";
    color = "#FCD34D";
  }

  return (
    <View style={[styles.resultBadge, { backgroundColor: `${color}20` }]}>
      <Text style={[styles.resultBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function AdminChallengesScreen() {
  return (
    <AdminGate featureName="Challenge Management">
      <AdminChallengesContent />
    </AdminGate>
  );
}

function AdminChallengesContent() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ChallengeStatus | "all">("all");

  const loadChallenges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await (supabase
        .from("challenges")
        .select(`
          id,
          room_code,
          wager_tct,
          time_control_seconds,
          increment_seconds,
          status,
          game_id,
          created_at,
          accepted_at,
          expires_at,
          creator:profiles!challenges_creator_id_fkey(id, username, elo_rating),
          opponent:profiles!challenges_opponent_id_fkey(id, username, elo_rating),
          game:games!challenges_game_id_fkey(result, winner_id)
        `)
        .order("created_at", { ascending: false })
        .limit(100) as any);

      if (fetchError) throw fetchError;
      setChallenges(data || []);
    } catch (err: any) {
      console.error("Error loading challenges:", err);
      setError(err.message || "Failed to load challenges");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  const filteredChallenges =
    filterStatus === "all"
      ? challenges
      : challenges.filter((c) => c.status === filterStatus);

  const formatTime = (seconds: number, inc: number) => {
    return `${Math.floor(seconds / 60)}+${inc}`;
  };

  const renderChallenge = useCallback(
    ({ item }: { item: AdminChallenge }) => {
      const creatorName = item.creator?.username || "Unknown";
      const opponentName = item.opponent?.username || "—";
      const creatorElo = item.creator?.elo_rating ?? 0;
      const opponentElo = item.opponent?.elo_rating ?? 0;

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.playersRow}>
              <Text style={styles.playerName} numberOfLines={1}>
                {creatorName}
                <Text style={styles.eloText}> ({creatorElo})</Text>
              </Text>
              <Text style={styles.vsText}>vs</Text>
              <Text style={styles.playerName} numberOfLines={1}>
                {opponentName}
                {item.opponent && <Text style={styles.eloText}> ({opponentElo})</Text>}
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>

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
                {formatTime(item.time_control_seconds, item.increment_seconds)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="key-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>{item.room_code}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          </View>

          {item.game?.result && (
            <ResultBadge
              result={item.game.result}
              winnerId={item.game.winner_id}
              creatorId={item.creator?.id || ""}
            />
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
              <Ionicons name="flash" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>Challenges</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={loadChallenges}
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
            {(["all", "pending", "accepted", "declined", "cancelled", "expired"] as const).map(
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
                    {status === "all" ? "All" : STATUS_LABELS[status]}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>

          {/* Count */}
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {filteredChallenges.length} challenge{filteredChallenges.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* List */}
          {isLoading && challenges.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : (
            <FlatList
              data={filteredChallenges}
              renderItem={renderChallenge}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="flash-outline" size={48} color="#666" />
                  <Text style={styles.emptyText}>No challenges found</Text>
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
    alignItems: "center",
  },
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  eloText: { fontSize: 12, color: "#A0A0A0", fontWeight: "400" },
  vsText: { fontSize: 12, color: "#666", fontWeight: "500" },
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
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resultBadgeText: { fontSize: 12, fontWeight: "600" },
});
