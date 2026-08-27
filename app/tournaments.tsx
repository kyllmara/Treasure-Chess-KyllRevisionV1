/**
 * Tournaments Screen
 *
 * Displays list of available tournaments with real-time data.
 * Users can browse, filter, and register for tournaments.
 */

import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Calendar,
  Coins,
  Users,
  Trophy,
  Clock,
  Filter,
  RefreshCw,
  Zap,
  Target,
  Swords,
} from "lucide-react-native";
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTournaments } from "@/hooks/useTournament";
import { AuthGate } from "@/components/AuthGate";
import { TournamentCountdown } from "@/components/TournamentCountdown";
import type { Tournament, TournamentType, TournamentStatus } from "@/lib/tournament.types";
import {
  formatTournamentType,
  formatTournamentStatus,
  isRegistrationOpen,
} from "@/lib/tournament";

// ============================================================================
// Types
// ============================================================================

type FilterType = "all" | "knockout" | "swiss" | "arena";
type StatusFilter = "all" | "registration" | "active" | "upcoming";

// ============================================================================
// Tournament Card Component
// ============================================================================

interface TournamentCardProps {
  tournament: Tournament;
  onPress: () => void;
}

function getTypeGradient(type: TournamentType): [string, string] {
  switch (type) {
    case "knockout":
      return ["#E05C5C", "#E88080"];
    case "swiss":
      return ["#4CAF82", "#7EDDD6"];
    case "arena":
      return ["#FFB347", "#FFCC80"];
    default:
      return ["#667eea", "#764ba2"];
  }
}

function getTypeIcon(type: TournamentType) {
  switch (type) {
    case "knockout":
      return Swords;
    case "swiss":
      return Target;
    case "arena":
      return Zap;
    default:
      return Trophy;
  }
}

function TournamentCard({ tournament, onPress }: TournamentCardProps) {
  const gradient = getTypeGradient(tournament.type);
  const TypeIcon = getTypeIcon(tournament.type);
  const canRegister = isRegistrationOpen(tournament);
  const spotsLeft = tournament.max_players - tournament.current_players;
  const isFull = spotsLeft <= 0;

  return (
    <TouchableOpacity
      style={styles.tournamentCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradient}
        style={styles.tournamentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Header */}
        <View style={styles.tournamentHeader}>
          <View style={styles.tournamentHeaderLeft}>
            <Text style={styles.tournamentName}>{tournament.name}</Text>
            <View style={styles.typeRow}>
              <TypeIcon size={14} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.tournamentType}>
                {formatTournamentType(tournament.type)}
              </Text>
            </View>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {formatTournamentStatus(tournament.status)}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.tournamentDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Coins size={16} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.detailLabel}>Entry</Text>
            </View>
            <Text style={styles.detailValue}>
              {tournament.entry_fee_tct > 0
                ? `${tournament.entry_fee_tct.toLocaleString()} TCT`
                : "Free"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Trophy size={16} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.detailLabel}>Prize Pool</Text>
            </View>
            <Text style={styles.detailValue}>
              {tournament.prize_pool_tct.toLocaleString()} TCT
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Users size={16} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.detailLabel}>Players</Text>
            </View>
            <Text style={styles.detailValue}>
              {tournament.current_players}/{tournament.max_players}
              {spotsLeft <= 5 && spotsLeft > 0 && (
                <Text style={styles.spotsWarning}> ({spotsLeft} left)</Text>
              )}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Clock size={16} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.detailLabel}>Time Control</Text>
            </View>
            <Text style={styles.detailValue}>
              {Math.floor(tournament.time_control_seconds / 60)}
              {tournament.increment_seconds > 0
                ? `+${tournament.increment_seconds}`
                : " min"}
            </Text>
          </View>
        </View>

        {/* Countdown */}
        {tournament.status === "registration" && (
          <View style={styles.countdownContainer}>
            <TournamentCountdown
              startTime={tournament.start_time}
              status={tournament.status}
              variant="compact"
              showLabel={false}
            />
          </View>
        )}

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.viewButton,
            isFull && styles.viewButtonFull,
          ]}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <Text style={styles.viewButtonText}>
            {canRegister
              ? isFull
                ? "Tournament Full"
                : "View & Register"
              : "View Tournament"}
          </Text>
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// Filter Chips
// ============================================================================

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function FilterChip({ label, isActive, onPress }: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, isActive && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Content Component
// ============================================================================

function TournamentsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { tournaments, isLoading, error, refresh } = useActiveTournaments();
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      // Type filter
      if (typeFilter !== "all" && t.type !== typeFilter) return false;

      // Status filter
      if (statusFilter === "registration" && t.status !== "registration")
        return false;
      if (statusFilter === "active" && t.status !== "active") return false;
      if (
        statusFilter === "upcoming" &&
        !["registration", "draft"].includes(t.status)
      )
        return false;

      return true;
    });
  }, [tournaments, typeFilter, statusFilter]);

  const handleTournamentPress = (tournament: Tournament) => {
    router.push(`/tournament/${tournament.id}`);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Tournaments</Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={styles.refreshButton}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFD700" />
              ) : (
                <RefreshCw size={20} color="#FFD700" />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#FFD700"
              />
            }
          >
            {/* Title Section */}
            <View style={styles.titleContainer}>
              <Trophy size={32} color="#FFD700" />
              <Text style={styles.title}>Elite Competitions</Text>
              <Text style={styles.subtitle}>
                Join tournaments and compete for massive prizes
              </Text>
            </View>

            {/* Filters */}
            <View style={styles.filtersSection}>
              <View style={styles.filterRow}>
                <Filter size={16} color="#A0A0A0" />
                <Text style={styles.filterLabel}>Type:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll}
                >
                  <FilterChip
                    label="All"
                    isActive={typeFilter === "all"}
                    onPress={() => setTypeFilter("all")}
                  />
                  <FilterChip
                    label="Knockout"
                    isActive={typeFilter === "knockout"}
                    onPress={() => setTypeFilter("knockout")}
                  />
                  <FilterChip
                    label="Swiss"
                    isActive={typeFilter === "swiss"}
                    onPress={() => setTypeFilter("swiss")}
                  />
                  <FilterChip
                    label="Arena"
                    isActive={typeFilter === "arena"}
                    onPress={() => setTypeFilter("arena")}
                  />
                </ScrollView>
              </View>

              <View style={styles.filterRow}>
                <Calendar size={16} color="#A0A0A0" />
                <Text style={styles.filterLabel}>Status:</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll}
                >
                  <FilterChip
                    label="All"
                    isActive={statusFilter === "all"}
                    onPress={() => setStatusFilter("all")}
                  />
                  <FilterChip
                    label="Registration Open"
                    isActive={statusFilter === "registration"}
                    onPress={() => setStatusFilter("registration")}
                  />
                  <FilterChip
                    label="In Progress"
                    isActive={statusFilter === "active"}
                    onPress={() => setStatusFilter("active")}
                  />
                </ScrollView>
              </View>
            </View>

            {/* Error State */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Failed to load tournaments
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRefresh}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loading State */}
            {isLoading && tournaments.length === 0 && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
                <Text style={styles.loadingText}>Loading tournaments...</Text>
              </View>
            )}

            {/* Empty State */}
            {!isLoading && filteredTournaments.length === 0 && (
              <View style={styles.emptyContainer}>
                <Trophy size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Tournaments</Text>
                <Text style={styles.emptySubtext}>
                  {tournaments.length === 0
                    ? "Check back later for upcoming tournaments"
                    : "No tournaments match your filters"}
                </Text>
              </View>
            )}

            {/* Tournament List */}
            {filteredTournaments.map((tournament) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                onPress={() => handleTournamentPress(tournament)}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  titleContainer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 20,
  },

  // Filters
  filtersSection: {
    marginBottom: 20,
    gap: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterLabel: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "500",
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#FFD700",
  },
  filterChipText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#0F0F1E",
  },

  // Tournament Card
  tournamentCard: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tournamentGradient: {
    padding: 20,
  },
  tournamentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  tournamentHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  tournamentName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  tournamentType: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
    fontWeight: "600",
  },
  statusBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  tournamentDetails: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  spotsWarning: {
    color: "#FFD700",
    fontWeight: "600",
  },
  countdownContainer: {
    marginBottom: 14,
  },
  viewButton: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  viewButtonFull: {
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  viewButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
  },

  // Loading State
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    color: "#A0A0A0",
    fontSize: 14,
  },

  // Error State
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 16,
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#E05C5C",
    fontSize: 14,
    fontWeight: "600",
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtext: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
  },
});

// Wrap with AuthGate to require authentication
export default function TournamentsScreen() {
  return (
    <AuthGate featureName="Tournaments">
      <TournamentsContent />
    </AuthGate>
  );
}
