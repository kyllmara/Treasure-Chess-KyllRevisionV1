/**
 * Challenge Board Screen
 *
 * Elite-level challenge board featuring:
 * - Real-time public challenges from Supabase
 * - Advanced filtering (time, wager, ELO, username)
 * - Challenge expiration countdown
 * - House challenges with objectives
 * - Challenge history tab
 * - Create/Accept challenge flow
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Sword,
  Clock,
  Plus,
  Users,
  Trophy,
  History,
  RefreshCw,
  AlertCircle,
  Crown,
  X,
  Key,
  ArrowLeft,
  UserSearch,
} from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import type { HouseChallenge } from "@/types/houseChallenge";
import { getDifficultyColor } from "@/types/houseChallenge";
import { useAuth } from "@/hooks/useAuth";
import { useWalletStore } from "@/stores/walletStore";
import { AuthGate } from "@/components/AuthGate";
import { ChallengeFiltersComponent } from "@/components/ChallengeFilters";
import { ChallengeCountdown } from "@/components/ChallengeCountdown";
import { useChallengeStore } from "@/stores/challengeStore";
import { useHouseChallengeStore } from "@/stores/houseChallengeStore";
import {
  ChallengeService,
  createChallengeService,
  Challenge,
  ChallengeFilters,
  ChallengeHistoryItem,
  formatTimeControl,
  getTimeControlCategory,
  isExpiringSoon,
} from "@/lib/challenges";
import {
  FriendChallengeService,
  UserSearchResult,
} from "@/lib/friendChallenge";
import { AvatarDisplay } from "@/components/AvatarPicker";

type TabType = "house" | "p2p" | "history";

const TCT_TO_USD = 0.04;

function ChallengeBoardContent() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();

  // Get TCT balance from wallet store (single source of truth)
  // Wallet is initialized globally by WalletInitializer in _layout.tsx
  const { tctBalance, tctToUsd, refreshBalance: refreshWalletBalance } = useWalletStore();

  // Get challenge store methods for on-chain joining
  const { joinOnChainChallenge, isOnChainPending, joinedGameId } = useChallengeStore();

  // Get house challenges from store
  const {
    challenges: houseChallenges,
    isLoading: houseChallengesLoading,
    loadChallenges: loadHouseChallenges,
    initialize: initializeHouseChallengeStore,
  } = useHouseChallengeStore();

  // Tab state
  const [selectedTab, setSelectedTab] = useState<TabType>("p2p");

  // Challenge service and data
  const [challengeService, setChallengeService] =
    useState<ChallengeService | null>(null);
  const [publicChallenges, setPublicChallenges] = useState<Challenge[]>([]);
  const [challengeHistory, setChallengeHistory] = useState<
    ChallengeHistoryItem[]
  >([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(null);

  // Friend search modal state
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<UserSearchResult[]>([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const friendSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter state
  const [filters, setFilters] = useState<ChallengeFilters>({});

  // Auto-open friend search modal if navigated with openFriendSearch=true
  useEffect(() => {
    if (params.openFriendSearch === "true") {
      setShowFriendSearch(true);
    }
  }, [params.openFriendSearch]);

  // Debounced user search
  const handleFriendSearchChange = useCallback(
    (query: string) => {
      setFriendSearchQuery(query);
      if (friendSearchDebounceRef.current) {
        clearTimeout(friendSearchDebounceRef.current);
      }
      if (!query || query.length < 2) {
        setFriendSearchResults([]);
        setFriendSearchLoading(false);
        return;
      }
      setFriendSearchLoading(true);
      friendSearchDebounceRef.current = setTimeout(async () => {
        if (!profile?.id) {
          setFriendSearchLoading(false);
          return;
        }
        try {
          const service = new FriendChallengeService(
            profile.id,
            profile.username || "",
            profile.avatar_index ?? 0,
            profile.elo_rating ?? 1200
          );
          const results = await service.searchUsers(query);
          setFriendSearchResults(results);
        } catch (err) {
          console.error("[ChallengeBoard] Friend search error:", err);
          setFriendSearchResults([]);
        } finally {
          setFriendSearchLoading(false);
        }
      }, 300);
    },
    [profile]
  );

  const handleSelectFriend = useCallback(
    (user: UserSearchResult) => {
      setShowFriendSearch(false);
      setFriendSearchQuery("");
      setFriendSearchResults([]);
      router.push({
        pathname: "/challenge-player",
        params: {
          playerId: user.id,
          playerName: user.username,
          playerRating: String(user.eloRating),
          playerAvatar: String(user.avatarIndex),
        },
      });
    },
    [router]
  );

  const handleCloseFriendSearch = useCallback(() => {
    setShowFriendSearch(false);
    setFriendSearchQuery("");
    setFriendSearchResults([]);
    if (friendSearchDebounceRef.current) {
      clearTimeout(friendSearchDebounceRef.current);
    }
  }, []);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.timeCategory) count++;
    if (filters.minWager !== undefined || filters.maxWager !== undefined)
      count++;
    if (filters.minElo !== undefined || filters.maxElo !== undefined) count++;
    if (filters.usernameSearch) count++;
    if (filters.isRated !== undefined) count++;
    return count;
  }, [filters]);

  // Initialize challenge service with Supabase profile UUID
  useEffect(() => {
    if (profile?.id) {
      const service = createChallengeService(profile.id, {
        onChallengeAccepted: (_challenge, _gameId) => {
          // Notification alerts are handled globally by ChallengeNotificationListener
          // Just refresh the challenge list
          loadPublicChallenges();
        },
        onNewChallenge: (_challenge) => {
          // Notification alerts are handled globally by ChallengeNotificationListener
          // Just refresh the challenge list so the new challenge appears
          loadPublicChallenges();
        },
      });

      setChallengeService(service);

      // Initialize house challenge store
      initializeHouseChallengeStore(profile.id);

      // Subscribe to updates
      service.subscribeToMyChallenges();
      service.subscribeToPublicChallenges((challenges) => {
        setPublicChallenges(challenges);
      });

      return () => {
        service.destroy();
      };
    }
  }, [profile?.id, initializeHouseChallengeStore]);

  // Mark notifications as read when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (challengeService) {
        // Mark all challenge notifications as read when user opens the board
        challengeService.markNotificationsRead().catch((err) => {
          console.error("[ChallengeBoard] Error marking notifications read:", err);
        });
      }
    }, [challengeService])
  );

  // Load public challenges, direct challenges, AND user's own created challenges
  const loadPublicChallenges = useCallback(async () => {
    if (!challengeService) return;

    console.log("[ChallengeBoard] loadPublicChallenges called");
    try {
      // Load public challenges, direct challenges (where user is opponent), AND user's own created challenges
      const [publicChallengesData, myChallengesData, myCreatedChallengesData] = await Promise.all([
        challengeService.getPublicChallenges(activeFilterCount > 0 ? filters : 50),
        challengeService.getMyChallenges(),
        challengeService.getMyCreatedChallenges(),
      ]);

      // Merge and deduplicate by ID
      const challengeMap = new Map<string, Challenge>();

      // Add user's own created challenges first (they should appear at top)
      for (const challenge of myCreatedChallengesData) {
        challengeMap.set(challenge.id, challenge);
      }

      // Add direct challenges (where user is the opponent)
      for (const challenge of myChallengesData) {
        if (!challengeMap.has(challenge.id)) {
          challengeMap.set(challenge.id, challenge);
        }
      }

      // Add public challenges (won't overwrite existing)
      for (const challenge of publicChallengesData) {
        if (!challengeMap.has(challenge.id)) {
          challengeMap.set(challenge.id, challenge);
        }
      }

      // Filter to only show joinable challenges:
      // - Must be pending status
      // - Must not have an opponent (unless I'm the opponent or creator)
      const allChallenges = Array.from(challengeMap.values()).filter(challenge => {
        // Must be pending
        if (challenge.status !== "pending") return false;

        // If I'm the creator or opponent, always show
        if (challenge.creator_id === profile?.id) return true;
        if (challenge.opponent_id === profile?.id) return true;

        // Otherwise, only show if no opponent yet (joinable)
        return !challenge.opponent_id;
      });

      console.log("[ChallengeBoard] Got challenges:", allChallenges.length, {
        public: publicChallengesData.length,
        direct: myChallengesData.length,
        myCreated: myCreatedChallengesData.length,
        merged: allChallenges.length,
      });

      setPublicChallenges(allChallenges);
    } catch (error) {
      console.error("Error loading challenges:", error);
    }
  }, [challengeService, filters, activeFilterCount, profile?.id]);

  // Load challenge history
  const loadChallengeHistory = useCallback(async () => {
    if (!challengeService) return;

    setHistoryLoading(true);
    try {
      const history = await challengeService.getChallengeHistory();
      setChallengeHistory(history);
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [challengeService]);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await loadPublicChallenges();
      setIsLoading(false);
    };

    if (challengeService) {
      loadData();
    }
  }, [challengeService, loadPublicChallenges]);

  // Reload when filters change
  useEffect(() => {
    if (challengeService && !isLoading) {
      loadPublicChallenges();
    }
  }, [filters]);

  // Load history when tab changes
  useEffect(() => {
    if (selectedTab === "history" && challengeService) {
      loadChallengeHistory();
    }
  }, [selectedTab, challengeService, loadChallengeHistory]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    console.log("[ChallengeBoard] handleRefresh called, tab:", selectedTab);
    setIsRefreshing(true);

    // Always refresh wallet balance on pull-to-refresh
    if (profile?.id) {
      try {
        await refreshWalletBalance(profile.id);
        console.log("[ChallengeBoard] Wallet balance refreshed");
      } catch (error) {
        console.error("[ChallengeBoard] Error refreshing wallet balance:", error);
      }
    }

    if (selectedTab === "history") {
      await loadChallengeHistory();
    } else if (selectedTab === "house") {
      await loadHouseChallenges();
    } else {
      await loadPublicChallenges();
    }
    console.log("[ChallengeBoard] handleRefresh complete");
    setIsRefreshing(false);
  }, [selectedTab, loadPublicChallenges, loadChallengeHistory, loadHouseChallenges, refreshWalletBalance, profile?.id]);

  // Decline a direct challenge
  const handleDeclineChallenge = useCallback(
    async (challenge: Challenge) => {
      if (!challengeService) return;

      Alert.alert(
        "Decline Challenge",
        `Are you sure you want to decline ${challenge.creator?.username}'s challenge?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Decline",
            style: "destructive",
            onPress: async () => {
              const success = await challengeService.declineChallenge(challenge.id);
              if (success) {
                Alert.alert("Challenge Declined", "The challenge has been declined.");
                loadPublicChallenges();
              } else {
                Alert.alert("Error", "Failed to decline challenge");
              }
            },
          },
        ]
      );
    },
    [challengeService, loadPublicChallenges]
  );

  // Cancel user's own challenge
  const handleCancelMyChallenge = useCallback(
    async (challenge: Challenge) => {
      if (!challengeService) return;

      Alert.alert(
        "Cancel Challenge",
        `Are you sure you want to cancel your challenge for ${challenge.wager_tct.toLocaleString()} TCT?`,
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Cancel Challenge",
            style: "destructive",
            onPress: async () => {
              const success = await challengeService.cancelChallenge(challenge.id);
              if (success) {
                Alert.alert("Challenge Cancelled", "Your challenge has been cancelled and removed.");
                loadPublicChallenges();
              } else {
                Alert.alert("Error", "Failed to cancel challenge");
              }
            },
          },
        ]
      );
    },
    [challengeService, loadPublicChallenges]
  );

  // Rejoin user's own challenge (go to waiting lobby)
  const handleRejoinMyChallenge = useCallback(
    (challenge: Challenge) => {
      router.push({
        pathname: "/create-challenge",
        params: {
          challengeId: challenge.id,
          roomCode: challenge.room_code,
          rejoin: "true",
        },
      });
    },
    [router]
  );

  // Accept a challenge
  const handleAcceptChallenge = useCallback(
    async (challenge: Challenge) => {
      if (!challengeService) return;

      // Check balance
      if (challenge.wager_tct > 0) {
        if (tctBalance < challenge.wager_tct) {
          Alert.alert(
            "Insufficient Funds",
            `You need ${challenge.wager_tct.toLocaleString()} TCT to accept this challenge.`,
            [
              {
                text: "Top Up",
                onPress: () => router.push("/wallet" as any),
              },
              { text: "Cancel", style: "cancel" },
            ]
          );
          return;
        }
      }

      // Confirm acceptance
      Alert.alert(
        "Accept Challenge",
        `Accept ${challenge.creator?.username}'s challenge for ${challenge.wager_tct.toLocaleString()} TCT?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept",
            onPress: async () => {
              // Set joining state for visual feedback
              setJoiningChallengeId(challenge.id);

              try {
                // For wager challenges, always go through lobby for fund locking + ready-up
                if (challenge.wager_tct > 0) {
                  console.log("[ChallengeBoard] Joining wager challenge lobby:", {
                    challengeId: challenge.id,
                    onChainGameId: challenge.on_chain_game_id,
                    wagerTct: challenge.wager_tct,
                  });

                  const result = await joinOnChainChallenge(
                    challenge.id,
                    challenge.on_chain_game_id || ""
                  );

                  console.log("[ChallengeBoard] joinOnChainChallenge result:", result);

                  // Navigate to lobby for ready-up flow
                  if ((result as any).joinedLobby || result.success) {
                    router.push({
                      pathname: "/create-challenge" as any,
                      params: {
                        challengeId: challenge.id,
                        roomCode: challenge.room_code,
                        rejoin: "true",
                      },
                    });
                    return;
                  }

                  if (!result.success) {
                    console.error("[ChallengeBoard] joinOnChainChallenge failed:", result.error);
                    Alert.alert("Error", result.error || "Failed to join challenge");
                  }
                } else {
                  // For free challenges, use direct service call
                  const result = await challengeService.acceptChallengeById(
                    challenge.id
                  );
                  if (result.success && result.gameId) {
                    router.push({
                      pathname: "/online-game" as any,
                      params: {
                        gameId: result.gameId,
                        wagerTct: challenge.wager_tct.toString(),
                        timeControl: challenge.time_control_seconds.toString(),
                        source: "challenge",
                      },
                    });
                  } else {
                    Alert.alert("Error", result.error || "Failed to accept challenge");
                  }
                }
              } finally {
                setJoiningChallengeId(null);
              }
            },
          },
        ]
      );
    },
    [challengeService, tctBalance, router, joinOnChainChallenge]
  );

  // Render helper functions
  const getTimeControlColor = (category: string): string => {
    switch (category.toLowerCase()) {
      case "bullet":
        return "#EF4444";
      case "blitz":
        return "#FB923C";
      case "rapid":
        return "#4ADE80";
      case "classical":
        return "#60A5FA";
      default:
        return "#A0A0A0";
    }
  };

  // Render P2P Challenge Card
  const renderP2PChallenge = (challenge: Challenge) => {
    const timeCategory = getTimeControlCategory(
      challenge.time_control_seconds,
      challenge.increment_seconds
    );
    const isExpiring = isExpiringSoon(challenge.expires_at);
    const isDirectChallenge = challenge.opponent_id === profile?.id;
    const isMyChallenge = challenge.creator_id === profile?.id;
    const isJoining = joiningChallengeId === challenge.id;
    const opponentJoined = !!challenge.opponent_id && isMyChallenge;

    return (
      <View key={challenge.id} style={styles.challengeCard}>
        <LinearGradient
          colors={
            isMyChallenge
              ? ["rgba(96, 165, 250, 0.12)", "rgba(96, 165, 250, 0.05)"]
              : isDirectChallenge
              ? ["rgba(255, 215, 0, 0.12)", "rgba(255, 215, 0, 0.05)"]
              : ["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.02)"]
          }
          style={styles.cardGradient}
        >
          {/* My Challenge Banner */}
          {isMyChallenge && (
            <View style={[
              styles.directChallengeBanner,
              { backgroundColor: opponentJoined ? "rgba(78, 205, 196, 0.2)" : "rgba(96, 165, 250, 0.2)" }
            ]}>
              <Text style={[
                styles.directChallengeBannerText,
                { color: opponentJoined ? "#4ECDC4" : "#60A5FA" }
              ]}>
                {opponentJoined ? "Opponent in Lobby! Tap Rejoin" : "Your Challenge"}
              </Text>
            </View>
          )}

          {/* Direct Challenge Banner */}
          {isDirectChallenge && !isMyChallenge && (
            <View style={styles.directChallengeBanner}>
              <Text style={styles.directChallengeBannerText}>
                Challenge for you!
              </Text>
            </View>
          )}

          {/* Header Row */}
          <View style={styles.challengeHeader}>
            <View style={styles.userInfo}>
              <Text style={styles.username}>
                {isMyChallenge ? "You" : (challenge.creator?.username || "Anonymous")}
              </Text>
              <Text style={styles.rating}>
                {challenge.creator?.elo_rating ?? 0} ELO
              </Text>
            </View>
            <View style={styles.wagerBadge}>
              <Text style={styles.tctSymbol}>$TCT</Text>
              <Text style={styles.wagerText}>
                {challenge.wager_tct.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Game Details Row */}
          <View style={styles.gameDetailsRow}>
            <View style={styles.gameDetail}>
              <Clock size={14} color="#FFD700" />
              <Text style={styles.gameDetailLabel}>Time:</Text>
              <Text style={styles.gameDetailValue}>
                {formatTimeControl(
                  challenge.time_control_seconds,
                  challenge.increment_seconds
                )}
              </Text>
            </View>
            <View
              style={[
                styles.timeCategoryBadge,
                { backgroundColor: `${getTimeControlColor(timeCategory)}20` },
              ]}
            >
              <Text
                style={[
                  styles.timeCategoryText,
                  { color: getTimeControlColor(timeCategory) },
                ]}
              >
                {timeCategory}
              </Text>
            </View>
            {challenge.is_rated && (
              <View style={styles.ratedBadge}>
                <Trophy size={12} color="#FFD700" />
                <Text style={styles.ratedText}>Rated</Text>
              </View>
            )}
          </View>

          {/* Room Code for own challenges */}
          {isMyChallenge && challenge.room_code && (
            <View style={styles.roomCodeRow}>
              <Key size={14} color="#60A5FA" />
              <Text style={styles.roomCodeLabel}>Room Code:</Text>
              <Text style={styles.roomCodeValue}>{challenge.room_code}</Text>
            </View>
          )}

          {/* Footer Row */}
          <View style={styles.challengeFooter}>
            <ChallengeCountdown
              expiresAt={challenge.expires_at}
              compact
              onExpired={() => loadPublicChallenges()}
            />
            <View style={styles.challengeActions}>
              {isMyChallenge ? (
                <>
                  <TouchableOpacity
                    style={styles.rejoinButton}
                    onPress={() => handleRejoinMyChallenge(challenge)}
                  >
                    <Text style={styles.rejoinButtonText}>Rejoin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelMyChallenge(challenge)}
                  >
                    <X size={16} color="#EF4444" />
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {isDirectChallenge && (
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleDeclineChallenge(challenge)}
                    >
                      <X size={16} color="#EF4444" />
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.acceptButton,
                      isExpiring && styles.acceptButtonUrgent,
                      isJoining && styles.acceptButtonDisabled,
                    ]}
                    onPress={() => handleAcceptChallenge(challenge)}
                    disabled={isJoining || joiningChallengeId !== null}
                  >
                    {isJoining ? (
                      <View style={styles.joiningContainer}>
                        <ActivityIndicator size="small" color="#000" />
                        <Text style={styles.acceptButtonText}>Joining...</Text>
                      </View>
                    ) : (
                      <Text style={styles.acceptButtonText}>
                        {isExpiring ? "Accept Now!" : "Accept"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  // Render House Challenge Card
  const renderHouseChallenge = (challenge: HouseChallenge) => {
    const potentialWinnings = challenge.entry_fee_tct * challenge.prize_multiplier;
    const timeInMinutes = Math.floor(challenge.time_limit_seconds / 60);
    const difficultyColorValue = getDifficultyColor(challenge.difficulty);

    // Check if user has attempts remaining
    const userAttempts = challenge.user_attempts || 0;
    const maxAttempts = challenge.max_entries_per_user;
    const hasAttemptsRemaining = maxAttempts === null || userAttempts < maxAttempts;
    const attemptsRemaining = maxAttempts !== null ? maxAttempts - userAttempts : null;

    return (
      <View key={challenge.id} style={styles.challengeCard}>
        <LinearGradient
          colors={["rgba(255, 255, 255, 0.05)", "rgba(255, 255, 255, 0.02)"]}
          style={styles.cardGradient}
        >
          <View style={styles.houseTopRow}>
            <View style={styles.houseNameRow}>
              <Crown size={16} color="#FFD700" />
              <Text style={styles.challengeName}>{challenge.name}</Text>
            </View>
            <View
              style={[
                styles.difficultyBadge,
                {
                  backgroundColor: `${difficultyColorValue}20`,
                },
              ]}
            >
              <Text
                style={[
                  styles.difficultyText,
                  { color: difficultyColorValue },
                ]}
              >
                {challenge.difficulty}
              </Text>
            </View>
          </View>

          <Text style={styles.challengeDescription}>{challenge.description}</Text>

          {/* Attempts remaining indicator */}
          {maxAttempts !== null && (
            <Text style={[
              styles.attemptsText,
              !hasAttemptsRemaining && styles.attemptsTextExhausted
            ]}>
              {hasAttemptsRemaining
                ? `${attemptsRemaining}/${maxAttempts} attempts left`
                : 'No attempts left'}
            </Text>
          )}

          <View style={styles.houseChallengeFooter}>
            <View style={styles.houseStakeContainer}>
              <Text style={styles.houseStakeLabel}>Entry</Text>
              <Text style={styles.houseStakeValue}>
                {challenge.entry_fee_tct.toLocaleString()}
              </Text>
            </View>
            <View style={styles.housePrizeContainer}>
              <Text style={styles.housePrizeLabel}>Win</Text>
              <Text style={styles.housePrizeValue}>
                {potentialWinnings.toLocaleString()}
              </Text>
            </View>
            <View style={styles.houseGameClockBadge}>
              <Clock size={12} color="#4ADE80" />
              <Text style={styles.houseGameClockText}>
                {timeInMinutes}m
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.houseStartButton,
                !hasAttemptsRemaining && styles.acceptButtonDisabled
              ]}
              disabled={!hasAttemptsRemaining}
              onPress={() => {
                router.push({
                  pathname: "/house-challenge-game" as any,
                  params: {
                    challengeId: challenge.id,
                  },
                });
              }}
            >
              <Text style={styles.houseStartButtonText}>
                {hasAttemptsRemaining ? 'Play' : 'Maxed'}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  };

  // Render History Item
  const renderHistoryItem = (item: ChallengeHistoryItem) => {
    const statusColors: Record<string, string> = {
      accepted: "#4ADE80",
      expired: "#A0A0A0",
      cancelled: "#EF4444",
      declined: "#FB923C",
      pending: "#FCD34D",
    };

    return (
      <View key={item.id} style={styles.historyCard}>
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyOpponent}>
              vs {item.opponentUsername || "Unknown"}
            </Text>
            <Text style={styles.historyDate}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View
            style={[
              styles.historyStatusBadge,
              { backgroundColor: `${statusColors[item.status] || "#A0A0A0"}20` },
            ]}
          >
            <Text
              style={[
                styles.historyStatusText,
                { color: statusColors[item.status] || "#A0A0A0" },
              ]}
            >
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>
        <View style={styles.historyDetails}>
          <Text style={styles.historyDetailText}>
            {item.wagerTct.toLocaleString()} TCT |{" "}
            {formatTimeControl(item.timeControlSeconds, item.incrementSeconds)}
          </Text>
          {item.gameResult && (
            <Text
              style={[
                styles.historyResult,
                {
                  color:
                    item.gameResult === "win"
                      ? "#4ADE80"
                      : item.gameResult === "loss"
                      ? "#EF4444"
                      : "#FCD34D",
                },
              ]}
            >
              {item.gameResult.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
          />
        }
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <ArrowLeft size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Sword size={32} color="#FFD700" />
              <View style={styles.headerSpacer} />
            </View>
            <Text style={styles.title}>Challenge Board</Text>
            <Text style={styles.subtitle}>
              {selectedTab === "house"
                ? "Platform challenges with objectives"
                : selectedTab === "p2p"
                ? "Open challenges from other players"
                : "Your challenge history"}
            </Text>
          </View>

          {/* Balance Widget */}
          <View style={styles.balanceWidget}>
            <Text style={styles.balanceLabel}>Your Balance</Text>
            <View style={styles.balanceAmounts}>
              <Text style={styles.balanceTCT}>
                {tctBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}{" "}
                $TCT
              </Text>
              <Text style={styles.balanceUSD}>
                $
                {tctToUsd(tctBalance).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.topUpButton}
              onPress={() => router.push("/wallet" as any)}
            >
              <Text style={styles.topUpButtonText}>Top Up Balance</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === "house" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab("house")}
            >
              <Crown
                size={16}
                color={selectedTab === "house" ? "#FFD700" : "#A0A0A0"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  selectedTab === "house" && styles.tabButtonTextActive,
                ]}
              >
                House
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === "p2p" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab("p2p")}
            >
              <Users
                size={16}
                color={selectedTab === "p2p" ? "#FFD700" : "#A0A0A0"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  selectedTab === "p2p" && styles.tabButtonTextActive,
                ]}
              >
                P2P
              </Text>
              {publicChallenges.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {publicChallenges.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                selectedTab === "history" && styles.tabButtonActive,
              ]}
              onPress={() => setSelectedTab("history")}
            >
              <History
                size={16}
                color={selectedTab === "history" ? "#FFD700" : "#A0A0A0"}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  selectedTab === "history" && styles.tabButtonTextActive,
                ]}
              >
                History
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filters (P2P only) */}
          {selectedTab === "p2p" && (
            <ChallengeFiltersComponent
              filters={filters}
              onFiltersChange={setFilters}
              onClear={() => setFilters({})}
              activeFilterCount={activeFilterCount}
            />
          )}

          {/* Challenge Action Buttons (P2P only) */}
          {selectedTab === "p2p" && (
            <>
              <TouchableOpacity
                style={styles.challengeFriendButton}
                onPress={() => setShowFriendSearch(true)}
              >
                <UserSearch size={20} color="#0F0F1E" />
                <Text style={styles.challengeFriendButtonText}>
                  Challenge a Friend
                </Text>
              </TouchableOpacity>
              <View style={styles.challengeActionButtons}>
                <TouchableOpacity
                  style={styles.createChallengeButton}
                  onPress={() => router.push("/create-challenge" as any)}
                >
                  <Plus size={20} color="#0F0F1E" />
                  <Text style={styles.createChallengeButtonText}>
                    Create Challenge
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.joinByCodeButton}
                  onPress={() => router.push("/join-challenge" as any)}
                >
                  <Key size={18} color="#FFD700" />
                  <Text style={styles.joinByCodeButtonText}>
                    Join by Code
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Content */}
          <View style={styles.challengeList}>
            {isLoading || (selectedTab === "history" && historyLoading) ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
                <Text style={styles.loadingText}>Loading challenges...</Text>
              </View>
            ) : selectedTab === "house" ? (
              houseChallengesLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#FFD700" />
                  <Text style={styles.loadingText}>Loading challenges...</Text>
                </View>
              ) : houseChallenges.length > 0 ? (
                houseChallenges.map(renderHouseChallenge)
              ) : (
                <View style={styles.emptyContainer}>
                  <Crown size={48} color="#A0A0A0" />
                  <Text style={styles.emptyTitle}>No House Challenges</Text>
                  <Text style={styles.emptySubtitle}>
                    Platform challenges will appear here
                  </Text>
                </View>
              )
            ) : selectedTab === "p2p" ? (
              publicChallenges.length > 0 ? (
                publicChallenges.map(renderP2PChallenge)
              ) : (
                <View style={styles.emptyContainer}>
                  <AlertCircle size={48} color="#A0A0A0" />
                  <Text style={styles.emptyTitle}>No Open Challenges</Text>
                  <Text style={styles.emptySubtitle}>
                    {activeFilterCount > 0
                      ? "Try adjusting your filters"
                      : "Be the first to create a challenge!"}
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => router.push("/create-challenge" as any)}
                  >
                    <Plus size={18} color="#0F0F1E" />
                    <Text style={styles.emptyButtonText}>Create Challenge</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : challengeHistory.length > 0 ? (
              challengeHistory.map(renderHistoryItem)
            ) : (
              <View style={styles.emptyContainer}>
                <History size={48} color="#A0A0A0" />
                <Text style={styles.emptyTitle}>No Challenge History</Text>
                <Text style={styles.emptySubtitle}>
                  Your past challenges will appear here
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Friend Search Modal */}
      <Modal
        visible={showFriendSearch}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseFriendSearch}
      >
        <KeyboardAvoidingView
          style={friendSearchStyles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={friendSearchStyles.backdrop}
            activeOpacity={1}
            onPress={handleCloseFriendSearch}
          />
          <View style={friendSearchStyles.sheet}>
            <View style={friendSearchStyles.sheetHandle} />

            {/* Sheet Header */}
            <View style={friendSearchStyles.sheetHeader}>
              <View style={friendSearchStyles.sheetTitleRow}>
                <UserSearch size={22} color="#FFD700" />
                <Text style={friendSearchStyles.sheetTitle}>Challenge a Friend</Text>
              </View>
              <TouchableOpacity
                style={friendSearchStyles.sheetCloseButton}
                onPress={handleCloseFriendSearch}
              >
                <X size={20} color="#A0A0A0" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={friendSearchStyles.searchInputContainer}>
              <UserSearch size={16} color="#A0A0A0" style={friendSearchStyles.searchIcon} />
              <TextInput
                style={friendSearchStyles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor="#666"
                value={friendSearchQuery}
                onChangeText={handleFriendSearchChange}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* Results */}
            <View style={friendSearchStyles.resultsContainer}>
              {friendSearchLoading ? (
                <View style={friendSearchStyles.centeredState}>
                  <ActivityIndicator size="small" color="#FFD700" />
                  <Text style={friendSearchStyles.centeredStateText}>Searching...</Text>
                </View>
              ) : friendSearchQuery.length >= 2 && friendSearchResults.length === 0 ? (
                <View style={friendSearchStyles.centeredState}>
                  <Users size={36} color="#444" />
                  <Text style={friendSearchStyles.centeredStateText}>No players found</Text>
                  <Text style={friendSearchStyles.centeredStateSubtext}>
                    Try a different username
                  </Text>
                </View>
              ) : friendSearchQuery.length < 2 ? (
                <View style={friendSearchStyles.centeredState}>
                  <Text style={friendSearchStyles.centeredStateSubtext}>
                    Type at least 2 characters to search
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friendSearchResults}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={friendSearchStyles.resultRow}
                      onPress={() => handleSelectFriend(item)}
                      activeOpacity={0.7}
                    >
                      <View style={friendSearchStyles.resultAvatarWrapper}>
                        <AvatarDisplay
                          index={item.avatarIndex ?? 0}
                          size={44}
                          showBorder
                        />
                        {item.isOnline && (
                          <View style={friendSearchStyles.onlineDot} />
                        )}
                      </View>
                      <View style={friendSearchStyles.resultInfo}>
                        <Text style={friendSearchStyles.resultUsername}>
                          {item.username}
                        </Text>
                        <Text style={friendSearchStyles.resultElo}>
                          {item.eloRating} ELO
                        </Text>
                      </View>
                      <View style={friendSearchStyles.challengeArrow}>
                        <Sword size={16} color="#FFD700" />
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
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
    marginTop: 4,
    textAlign: "center",
  },
  balanceWidget: {
    width: "100%",
    marginBottom: 20,
    padding: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
    marginBottom: 8,
  },
  balanceAmounts: {
    alignItems: "center",
  },
  balanceTCT: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFD700",
  },
  balanceUSD: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
    marginTop: 4,
    opacity: 0.7,
  },
  topUpButton: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  topUpButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFD700",
    textAlign: "center",
  },
  tabContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tabButtonActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  tabButtonTextActive: {
    color: "#FFD700",
    fontWeight: "700",
  },
  tabBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  challengeFriendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4ECDC4",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  challengeFriendButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  challengeActionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  createChallengeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  createChallengeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  joinByCodeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  joinByCodeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },
  challengeList: {
    gap: 16,
  },
  challengeCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  cardGradient: {
    padding: 16,
  },
  challengeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  rating: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  wagerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tctSymbol: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },
  wagerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFD700",
  },
  gameDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
  },
  gameDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gameDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  gameDetailValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  timeCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeCategoryText: {
    fontSize: 11,
    fontWeight: "700",
  },
  ratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  ratedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFD700",
  },
  challengeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  acceptButton: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptButtonUrgent: {
    backgroundColor: "#4ADE80",
  },
  acceptButtonDisabled: {
    opacity: 0.7,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  joiningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Direct challenge styles
  directChallengeBanner: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  directChallengeBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },
  challengeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  declineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  rejoinButton: {
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
  },
  rejoinButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#60A5FA",
  },
  roomCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  roomCodeLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  roomCodeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#60A5FA",
    letterSpacing: 1,
  },
  // House challenge styles
  houseTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  houseNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  challengeName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  challengeDescription: {
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 18,
    marginBottom: 6,
  },
  attemptsText: {
    fontSize: 11,
    color: "#4ADE80",
    fontWeight: "600",
    marginBottom: 10,
  },
  attemptsTextExhausted: {
    color: "#EF4444",
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "700",
  },
  houseChallengeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  houseStakeContainer: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
    minWidth: 70,
  },
  houseStakeLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  houseStakeValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFD700",
  },
  housePrizeContainer: {
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
    alignItems: "center",
    minWidth: 70,
  },
  housePrizeLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  housePrizeValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4ADE80",
  },
  houseGameClockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(160, 160, 160, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  houseGameClockText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  houseStartButton: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  houseStartButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  // History styles
  historyCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  historyOpponent: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  historyDate: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  historyDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyDetailText: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  historyResult: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Loading and empty states
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
});

// Wrap with AuthGate to require authentication
export default function ChallengeBoardScreen() {
  return (
    <AuthGate featureName="Challenge Board">
      <ChallengeBoardContent />
    </AuthGate>
  );
}

const friendSearchStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 14,
    gap: 10,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#FFFFFF",
    paddingVertical: 14,
  },
  resultsContainer: {
    minHeight: 200,
    maxHeight: 420,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  centeredState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  centeredStateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  centeredStateSubtext: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    gap: 12,
  },
  resultAvatarWrapper: {
    position: "relative",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4ADE80",
    borderWidth: 2,
    borderColor: "#1A1A2E",
  },
  resultInfo: {
    flex: 1,
  },
  resultUsername: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  resultElo: {
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "600",
  },
  challengeArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
});
