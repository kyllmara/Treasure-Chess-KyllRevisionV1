/**
 * Tournament Detail Screen
 *
 * Displays full tournament information including:
 * - Tournament info and countdown
 * - Registration/unregistration actions
 * - Bracket visualization
 * - Standings/leaderboard
 * - Prize distribution
 */

import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Trophy,
  Users,
  Coins,
  Clock,
  Calendar,
  Share2,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Swords,
  Target,
  Zap,
} from "lucide-react-native";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/useAuth";
import { useTournament } from "@/hooks/useTournament";
import { AuthGate } from "@/components/AuthGate";
import { TournamentBracket } from "@/components/TournamentBracket";
import { TournamentCountdown } from "@/components/TournamentCountdown";
import { TournamentLeaderboard } from "@/components/TournamentLeaderboard";
import {
  formatTournamentType,
  formatTournamentStatus,
  isRegistrationOpen,
  formatPlace,
  calculatePrizeAmount,
} from "@/lib/tournament";
import { supabase } from "@/lib/supabase";
import type { TournamentType, TournamentMatch } from "@/lib/tournament.types";

// ============================================================================
// Types
// ============================================================================

type TabType = "overview" | "bracket" | "standings" | "prizes";

// ============================================================================
// Tab Button Component
// ============================================================================

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Prize Row Component
// ============================================================================

interface PrizeRowProps {
  place: number;
  percentage: number;
  amount: number;
  winnerId?: string | null;
  winnerName?: string;
}

function PrizeRow({ place, percentage, amount, winnerId, winnerName }: PrizeRowProps) {
  const placeColors = {
    1: "#FFD700",
    2: "#C0C0C0",
    3: "#CD7F32",
  };
  const color = placeColors[place as keyof typeof placeColors] || "#A0A0A0";

  return (
    <View style={styles.prizeRow}>
      <View style={styles.prizePlace}>
        <Text style={[styles.prizePlaceText, { color }]}>
          {formatPlace(place)}
        </Text>
      </View>
      <View style={styles.prizeInfo}>
        <Text style={styles.prizePercentage}>{percentage}%</Text>
        {winnerName && (
          <Text style={styles.prizeWinner}>{winnerName}</Text>
        )}
      </View>
      <View style={styles.prizeAmount}>
        <Coins size={14} color="#FFD700" />
        <Text style={styles.prizeAmountText}>
          {amount.toLocaleString()} TCT
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Collapsible Section
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.collapsibleSection}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.collapsibleTitle}>{title}</Text>
        {expanded ? (
          <ChevronUp size={20} color="#A0A0A0" />
        ) : (
          <ChevronDown size={20} color="#A0A0A0" />
        )}
      </TouchableOpacity>
      {expanded && <View style={styles.collapsibleContent}>{children}</View>}
    </View>
  );
}

// ============================================================================
// Tournament Info Card
// ============================================================================

function TournamentInfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <View style={styles.infoCard}>
      {icon}
      <Text style={styles.infoCardLabel}>{label}</Text>
      <Text style={styles.infoCardValue}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Main Content Component
// ============================================================================

function TournamentDetailContent() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.id;

  const {
    tournament,
    isLoading,
    error,
    userRegistration,
    isRegistered,
    bracket,
    bracketTree,
    standings,
    currentMatch,
    prizes,
    timeUntilStart,
    formattedTimeUntilStart,
    canRegister,
    register,
    unregister,
    refresh,
  } = useTournament({
    tournamentId: id || "",
    userId,
    autoSubscribe: true,
    // Global TournamentMatchListener handles toast notifications,
    // so no Alert.alert here to avoid duplicate popups.
    onMatchReady: () => {},
  });

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleRegister = async () => {
    if (!userId) {
      Alert.alert("Login Required", "Please log in to register for tournaments.");
      return;
    }

    if (!tournament) return;

    Alert.alert(
      "Join Tournament",
      `Entry Fee: ${tournament.entry_fee_tct} TCT\n\nThe entry fee will be deducted from your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Join",
          onPress: async () => {
            setIsRegistering(true);
            const result = await register();
            setIsRegistering(false);

            if (result.success) {
              Alert.alert("Success!", "You have registered for the tournament.");
            } else {
              Alert.alert("Registration Failed", result.error || "Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleUnregister = async () => {
    Alert.alert(
      "Leave Tournament",
      "Are you sure you want to unregister? Your entry fee will be refunded.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setIsRegistering(true);
            const result = await unregister();
            setIsRegistering(false);

            if (result.success) {
              Alert.alert("Unregistered", "Your entry fee has been refunded.");
            } else {
              Alert.alert("Error", result.error || "Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!tournament) return;

    try {
      await Share.share({
        message: `Join ${tournament.name} tournament on Treasure Chess!\n\nPrize Pool: ${tournament.prize_pool_tct.toLocaleString()} TCT`,
      });
    } catch (err) {
      // Sharing cancelled or failed
    }
  };

  const handleMatchPress = async (match: TournamentMatch) => {
    if (match.game_id) {
      router.push(`/online-game?gameId=${match.game_id}`);
      return;
    }

    // No game_id yet — call create_tournament_game to create the game
    if (!userId) {
      Alert.alert("Error", "You must be logged in to join this match.");
      return;
    }

    try {
      const { data, error } = await (supabase.rpc as any)("create_tournament_game", {
        p_match_id: match.id,
        p_user_id: userId,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success && result?.game_id) {
        router.push(`/online-game?gameId=${result.game_id}`);
      } else {
        Alert.alert("Error", result?.error || "Failed to create tournament game.");
      }
    } catch (err: any) {
      console.error("Failed to create tournament game:", err);
      Alert.alert("Error", err.message || "Failed to join match. Please try again.");
    }
  };

  if (!id) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Tournament not found</Text>
      </View>
    );
  }

  if (isLoading && !tournament) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Loading tournament...</Text>
      </View>
    );
  }

  if (error || !tournament) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load tournament</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getTypeIcon = (type: TournamentType) => {
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
  };

  const TypeIcon = getTypeIcon(tournament.type);
  const spotsLeft = tournament.max_players - tournament.current_players;
  const isFull = spotsLeft <= 0;

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
            <Text style={styles.headerTitle} numberOfLines={1}>
              {tournament.name}
            </Text>
            <TouchableOpacity onPress={handleShare} style={styles.shareButton}>
              <Share2 size={20} color="#FFD700" />
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
            {/* Tournament Header */}
            <View style={styles.tournamentHeader}>
              <View style={styles.typeRow}>
                <TypeIcon size={18} color="#FFD700" />
                <Text style={styles.typeText}>
                  {formatTournamentType(tournament.type)}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>
                    {formatTournamentStatus(tournament.status)}
                  </Text>
                </View>
              </View>

              {/* Countdown */}
              {(tournament.status === "registration" ||
                tournament.status === "starting") && (
                <TournamentCountdown
                  startTime={tournament.start_time}
                  status={tournament.status}
                  variant="default"
                />
              )}

              {/* Current Match Banner */}
              {currentMatch && (
                <TouchableOpacity
                  style={styles.currentMatchBanner}
                  onPress={() => handleMatchPress(currentMatch)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={["#FFD700", "#FFA500"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.currentMatchGradient}
                  >
                    <View style={styles.currentMatchLeft}>
                      <View style={styles.currentMatchIconWrap}>
                        <Swords size={22} color="#0F0F1E" />
                      </View>
                      <View>
                        <Text style={styles.currentMatchTitle}>
                          Your match is ready!
                        </Text>
                        <Text style={styles.currentMatchSub}>
                          Tap to join your tournament game
                        </Text>
                      </View>
                    </View>
                    <View style={styles.currentMatchButton}>
                      <Text style={styles.currentMatchAction}>Play Now</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {/* Info Cards */}
            <View style={styles.infoCardsRow}>
              <TournamentInfoCard
                label="Prize Pool"
                value={`${tournament.prize_pool_tct.toLocaleString()} TCT`}
                icon={<Trophy size={20} color="#FFD700" />}
              />
              <TournamentInfoCard
                label="Entry"
                value={
                  tournament.entry_fee_tct > 0
                    ? `${tournament.entry_fee_tct} TCT`
                    : "Free"
                }
                icon={<Coins size={20} color="#4ECDC4" />}
              />
              <TournamentInfoCard
                label="Players"
                value={`${tournament.current_players}/${tournament.max_players}`}
                icon={<Users size={20} color="#FFB347" />}
              />
            </View>

            {/* Registration Button */}
            {canRegister && (
              <View style={styles.registrationSection}>
                {isRegistered ? (
                  <TouchableOpacity
                    style={styles.unregisterButton}
                    onPress={handleUnregister}
                    disabled={isRegistering}
                  >
                    {isRegistering ? (
                      <ActivityIndicator size="small" color="#FF6B6B" />
                    ) : (
                      <Text style={styles.unregisterButtonText}>
                        Unregister
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.registerButton,
                      isFull && styles.registerButtonDisabled,
                    ]}
                    onPress={handleRegister}
                    disabled={isRegistering || isFull}
                  >
                    <LinearGradient
                      colors={isFull ? ["#666", "#444"] : ["#FFD700", "#FFA500"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.registerButtonGradient}
                    >
                      {isRegistering ? (
                        <ActivityIndicator size="small" color="#0F0F1E" />
                      ) : (
                        <Text style={styles.registerButtonText}>
                          {isFull ? "Tournament Full" : "Register Now"}
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                {spotsLeft > 0 && spotsLeft <= 5 && (
                  <Text style={styles.spotsWarning}>
                    Only {spotsLeft} spots left!
                  </Text>
                )}
              </View>
            )}

            {/* User Registration Info */}
            {isRegistered && userRegistration && (
              <View style={styles.registrationInfo}>
                <Text style={styles.registrationInfoText}>
                  You are registered as seed #{userRegistration.seed || "TBD"}
                </Text>
              </View>
            )}

            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <TabButton
                label="Overview"
                isActive={activeTab === "overview"}
                onPress={() => setActiveTab("overview")}
              />
              <TabButton
                label="Bracket"
                isActive={activeTab === "bracket"}
                onPress={() => setActiveTab("bracket")}
              />
              <TabButton
                label="Standings"
                isActive={activeTab === "standings"}
                onPress={() => setActiveTab("standings")}
              />
              <TabButton
                label="Prizes"
                isActive={activeTab === "prizes"}
                onPress={() => setActiveTab("prizes")}
              />
            </View>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <View style={styles.tabContent}>
                {tournament.description && (
                  <CollapsibleSection title="Description" defaultExpanded>
                    <Text style={styles.descriptionText}>
                      {tournament.description}
                    </Text>
                  </CollapsibleSection>
                )}

                <CollapsibleSection title="Tournament Details" defaultExpanded>
                  <View style={styles.detailsGrid}>
                    <View style={styles.detailItem}>
                      <Clock size={16} color="#A0A0A0" />
                      <Text style={styles.detailLabel}>Time Control</Text>
                      <Text style={styles.detailValue}>
                        {Math.floor(tournament.time_control_seconds / 60)}
                        {tournament.increment_seconds > 0
                          ? `+${tournament.increment_seconds}`
                          : " min"}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Calendar size={16} color="#A0A0A0" />
                      <Text style={styles.detailLabel}>Start Time</Text>
                      <Text style={styles.detailValue}>
                        {new Date(tournament.start_time).toLocaleString()}
                      </Text>
                    </View>
                    {tournament.rounds && (
                      <View style={styles.detailItem}>
                        <Target size={16} color="#A0A0A0" />
                        <Text style={styles.detailLabel}>Rounds</Text>
                        <Text style={styles.detailValue}>
                          {tournament.current_round}/{tournament.rounds}
                        </Text>
                      </View>
                    )}
                    <View style={styles.detailItem}>
                      <Trophy size={16} color="#A0A0A0" />
                      <Text style={styles.detailLabel}>Rated</Text>
                      <Text style={styles.detailValue}>
                        {tournament.is_rated ? "Yes" : "No"}
                      </Text>
                    </View>
                  </View>
                </CollapsibleSection>
              </View>
            )}

            {activeTab === "bracket" && (
              <View style={styles.tabContent}>
                <TournamentBracket
                  matches={bracket}
                  tournamentType={tournament.type}
                  currentRound={tournament.current_round}
                  totalRounds={tournament.rounds || undefined}
                  userId={userId}
                  onMatchPress={handleMatchPress}
                />
              </View>
            )}

            {activeTab === "standings" && (
              <View style={styles.tabContent}>
                <TournamentLeaderboard
                  standings={standings}
                  prizes={prizes}
                  currentUserId={userId}
                  showTiebreakers={tournament.type === "swiss"}
                />
              </View>
            )}

            {activeTab === "prizes" && (
              <View style={styles.tabContent}>
                <View style={styles.prizeSection}>
                  <View style={styles.totalPrize}>
                    <Text style={styles.totalPrizeLabel}>Total Prize Pool</Text>
                    <Text style={styles.totalPrizeValue}>
                      {tournament.prize_pool_tct.toLocaleString()} TCT
                    </Text>
                  </View>

                  <View style={styles.prizeDistribution}>
                    {prizes.length > 0 ? (
                      prizes.map((prize) => (
                        <PrizeRow
                          key={prize.id}
                          place={prize.place}
                          percentage={prize.percentage}
                          amount={
                            prize.amount_tct ||
                            calculatePrizeAmount(
                              tournament.prize_pool_tct,
                              prize.percentage
                            )
                          }
                          winnerId={prize.user_id}
                          winnerName={prize.user?.username}
                        />
                      ))
                    ) : (
                      <>
                        <PrizeRow
                          place={1}
                          percentage={50}
                          amount={tournament.prize_pool_tct * 0.5}
                        />
                        <PrizeRow
                          place={2}
                          percentage={30}
                          amount={tournament.prize_pool_tct * 0.3}
                        />
                        <PrizeRow
                          place={3}
                          percentage={20}
                          amount={tournament.prize_pool_tct * 0.2}
                        />
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F0F1E",
    gap: 16,
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
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginHorizontal: 12,
  },
  shareButton: {
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

  // Tournament Header
  tournamentHeader: {
    gap: 16,
    marginBottom: 20,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  statusBadge: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: "auto",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4ECDC4",
    textTransform: "uppercase",
  },

  // Current Match Banner
  currentMatchBanner: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  currentMatchGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  currentMatchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  currentMatchIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 15, 30, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  currentMatchTitle: {
    color: "#0F0F1E",
    fontSize: 16,
    fontWeight: "800",
  },
  currentMatchSub: {
    color: "rgba(15, 15, 30, 0.6)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  currentMatchButton: {
    backgroundColor: "#0F0F1E",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  currentMatchAction: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "800",
  },

  // Info Cards
  infoCardsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  infoCardLabel: {
    color: "#A0A0A0",
    fontSize: 11,
    fontWeight: "500",
  },
  infoCardValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Registration
  registrationSection: {
    marginBottom: 20,
    gap: 8,
  },
  registerButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  unregisterButton: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  unregisterButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF6B6B",
  },
  spotsWarning: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  registrationInfo: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  registrationInfoText: {
    color: "#4ECDC4",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },

  // Tabs
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: "#FFD700",
  },
  tabButtonText: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#0F0F1E",
  },
  tabContent: {
    minHeight: 200,
  },

  // Collapsible Sections
  collapsibleSection: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  collapsibleTitle: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  collapsibleContent: {
    padding: 14,
    paddingTop: 0,
  },
  descriptionText: {
    color: "#A0A0A0",
    fontSize: 14,
    lineHeight: 20,
  },

  // Details Grid
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailLabel: {
    color: "#A0A0A0",
    fontSize: 13,
    flex: 1,
  },
  detailValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // Prizes
  prizeSection: {
    gap: 16,
  },
  totalPrize: {
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    padding: 20,
    borderRadius: 14,
  },
  totalPrizeLabel: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "500",
  },
  totalPrizeValue: {
    color: "#FFD700",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 4,
  },
  prizeDistribution: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    overflow: "hidden",
  },
  prizeRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  prizePlace: {
    width: 60,
  },
  prizePlaceText: {
    fontSize: 16,
    fontWeight: "700",
  },
  prizeInfo: {
    flex: 1,
    gap: 2,
  },
  prizePercentage: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "500",
  },
  prizeWinner: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  prizeAmount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  prizeAmountText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
  },

  // States
  loadingText: {
    color: "#A0A0A0",
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#FF6B6B",
    fontSize: 14,
    fontWeight: "600",
  },
});

// Wrap with AuthGate to require authentication
export default function TournamentDetailScreen() {
  return (
    <AuthGate featureName="Tournament Details">
      <TournamentDetailContent />
    </AuthGate>
  );
}
