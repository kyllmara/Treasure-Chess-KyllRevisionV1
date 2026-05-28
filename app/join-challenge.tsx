/**
 * Join Challenge Screen
 *
 * Allows users to join a private challenge using a room code.
 * Features:
 * - Room code input with validation
 * - Challenge preview before joining
 * - Animated feedback
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Key,
  Search,
  Play,
  AlertCircle,
  CheckCircle,
  Clock,
  Coins,
  Trophy,
  User,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useChallengeStore } from "@/stores/challengeStore";
import { useAuthStore } from "@/stores/authStore";
import { useWalletStore } from "@/stores/walletStore";
import { useBiconomyWallet } from "@/hooks/useBiconomyWallet";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Challenge, ChallengePlayer } from "@/lib/challenges";
import { getAvatarConfig } from "@/constants/avatars";
import { tctToUsdc } from "@/lib/relay";

// ============================================================================
// Constants
// ============================================================================

const ROOM_CODE_LENGTH = 6;
const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ============================================================================
// Component
// ============================================================================

export default function JoinChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { user, profile, walletProvider } = useAuthStore();

  // Get TCT balance from Biconomy wallet (on-chain USDC converted to TCT)
  const {
    tctBalance,
    isInitialized: isWalletInitialized,
    isInitializing: isWalletInitializing,
    hasEnoughTctBalance,
  } = useBiconomyWallet();

  // Fallback to wallet store if Biconomy not initialized
  const { tctBalance: storeTctBalance } = useWalletStore();
  const effectiveTctBalance = isWalletInitialized ? tctBalance : storeTctBalance;

  const {
    searchByCode,
    joinByRoomCode,
    joinOnChainChallenge,
    initializeBiconomy,
    currentChallenge,
    isLoading,
    isJoining,
    isOnChainPending,
    error,
    joinedGameId,
    clearError,
    clearJoinedGame,
    setCurrentChallenge,
    initialize,
    resetState,
  } = useChallengeStore();

  const [roomCode, setRoomCode] = useState(params.code || "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Animation refs
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  // Input refs for individual character boxes
  const inputRef = useRef<TextInput>(null);

  // Initialize store
  useEffect(() => {
    if (user?.id) {
      initialize(user.id);
    }
  }, [user?.id, initialize]);

  // Initialize Biconomy when wallet provider is available
  useEffect(() => {
    if (walletProvider && user?.id) {
      initializeBiconomy(walletProvider);
    }
  }, [walletProvider, user?.id, initializeBiconomy]);

  // Handle pre-filled code from params
  useEffect(() => {
    if (params.code && params.code.length === ROOM_CODE_LENGTH) {
      handleSearch(params.code);
    }
  }, [params.code]);

  // Handle game joined - navigate to online game
  useEffect(() => {
    if (joinedGameId && currentChallenge) {
      clearJoinedGame();
      router.replace({
        pathname: "/online-game",
        params: {
          gameId: joinedGameId,
          wagerTct: currentChallenge.wager_tct.toString(),
          timeControl: currentChallenge.time_control_seconds.toString(),
          source: "challenge",
        },
      });
    } else if (joinedGameId) {
      // Fallback if no challenge info
      clearJoinedGame();
      router.replace({
        pathname: "/online-game",
        params: { gameId: joinedGameId, wagerTct: "0", timeControl: "300", source: "challenge" },
      });
    }
  }, [joinedGameId, currentChallenge, router, clearJoinedGame]);

  // Show error from store
  useEffect(() => {
    if (error) {
      setSearchError(error);
      triggerShakeAnimation();
      clearError();
    }
  }, [error, clearError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetState();
    };
  }, [resetState]);

  // Animations
  const triggerShakeAnimation = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const triggerSuccessAnimation = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.spring(successAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [successAnim]);

  // Handlers
  const handleCodeChange = useCallback(
    (text: string) => {
      // Filter and uppercase
      const filtered = text
        .toUpperCase()
        .split("")
        .filter((char) => VALID_CHARS.includes(char))
        .join("")
        .slice(0, ROOM_CODE_LENGTH);

      setRoomCode(filtered);
      setSearchError(null);
      setCurrentChallenge(null);
      successAnim.setValue(0);

      // Auto-search when complete
      if (filtered.length === ROOM_CODE_LENGTH) {
        handleSearch(filtered);
      }
    },
    [setCurrentChallenge, successAnim]
  );

  const handleSearch = useCallback(
    async (code?: string) => {
      const searchCode = code || roomCode;

      if (searchCode.length !== ROOM_CODE_LENGTH) {
        setSearchError("Please enter a complete 6-character code");
        triggerShakeAnimation();
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      const challenge = await searchByCode(searchCode);

      setIsSearching(false);

      if (challenge) {
        triggerSuccessAnimation();
      } else {
        setSearchError("No challenge found with this code");
        triggerShakeAnimation();
      }
    },
    [roomCode, searchByCode, triggerShakeAnimation, triggerSuccessAnimation]
  );

  const handleJoin = useCallback(async () => {
    if (!currentChallenge) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // For wager games, use on-chain escrow
    if (currentChallenge.wager_tct > 0) {
      // Check wallet is initialized
      if (!isWalletInitialized) {
        Alert.alert(
          "Wallet Not Ready",
          "Please wait for your wallet to initialize before joining a wager game.",
          [{ text: "OK" }]
        );
        return;
      }

      // Check balance using Biconomy wallet
      if (!hasEnoughTctBalance(currentChallenge.wager_tct)) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${currentChallenge.wager_tct} TCT (${tctToUsdc(currentChallenge.wager_tct).toFixed(2)} USDC) to join this challenge. Your balance: ${effectiveTctBalance} TCT`,
          [{ text: "OK" }]
        );
        return;
      }

      // Check if challenge has on-chain game ID
      if (!currentChallenge.on_chain_game_id) {
        Alert.alert(
          "Error",
          "This wager challenge is missing on-chain game data. Please try a different challenge.",
          [{ text: "OK" }]
        );
        return;
      }

      // Use on-chain challenge joining
      const result = await joinOnChainChallenge(currentChallenge.id, currentChallenge.on_chain_game_id);

      if (!result.success) {
        setSearchError(result.error || "Failed to join challenge on-chain");
        triggerShakeAnimation();
      }
      // If successful, the useEffect watching joinedGameId will handle navigation
    } else {
      // Free games use standard flow (no on-chain escrow)
      const success = await joinByRoomCode(roomCode);

      if (!success) {
        setSearchError("Failed to join challenge");
        triggerShakeAnimation();
      }
    }
  }, [
    currentChallenge,
    roomCode,
    effectiveTctBalance,
    isWalletInitialized,
    hasEnoughTctBalance,
    joinByRoomCode,
    joinOnChainChallenge,
    triggerShakeAnimation,
  ]);

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Computed values
  const codeChars = roomCode.split("");
  const isCodeComplete = roomCode.length === ROOM_CODE_LENGTH;

  // For wager games, check Biconomy wallet balance; for free games, always allow
  const canJoin =
    currentChallenge &&
    (currentChallenge.wager_tct === 0 ||
      (isWalletInitialized && effectiveTctBalance >= currentChallenge.wager_tct));

  // Show loading state for on-chain transactions
  const isProcessing = isJoining || isOnChainPending;

  const creator = currentChallenge?.creator as ChallengePlayer | undefined;
  const creatorAvatar = creator?.avatar_index !== undefined
    ? getAvatarConfig(creator.avatar_index)
    : null;

  return (
    <LinearGradient colors={["#0a0a0f", "#1a1a2e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
              <ArrowLeft size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Join Challenge</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <View style={styles.iconContainer}>
                <Key size={32} color="#FFD700" />
              </View>
              <Text style={styles.title}>Enter Room Code</Text>
              <Text style={styles.subtitle}>
                Ask your friend for their 6-character room code
              </Text>
            </View>

            {/* Code Input */}
            <Animated.View
              style={[
                styles.codeInputContainer,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              <TouchableOpacity
                style={styles.codeBoxes}
                onPress={() => inputRef.current?.focus()}
                activeOpacity={1}
              >
                {Array.from({ length: ROOM_CODE_LENGTH }).map((_, index) => {
                  const char = codeChars[index] || "";
                  const isFilled = char.length > 0;
                  const isActive = index === codeChars.length;

                  return (
                    <View
                      key={index}
                      style={[
                        styles.codeBox,
                        isFilled && styles.codeBoxFilled,
                        isActive && styles.codeBoxActive,
                        searchError && styles.codeBoxError,
                        currentChallenge && styles.codeBoxSuccess,
                      ]}
                    >
                      <Text
                        style={[
                          styles.codeChar,
                          isFilled && styles.codeCharFilled,
                          currentChallenge && styles.codeCharSuccess,
                        ]}
                      >
                        {char}
                      </Text>
                      {isActive && !currentChallenge && (
                        <View style={styles.cursor} />
                      )}
                    </View>
                  );
                })}
              </TouchableOpacity>

              {/* Hidden input */}
              <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                value={roomCode}
                onChangeText={handleCodeChange}
                maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
            </Animated.View>

            {/* Status Message */}
            {(isSearching || searchError || currentChallenge) && (
              <View style={styles.statusContainer}>
                {isSearching && (
                  <View style={styles.statusRow}>
                    <ActivityIndicator color="#4ECDC4" size="small" />
                    <Text style={styles.statusText}>Searching...</Text>
                  </View>
                )}

                {searchError && !isSearching && (
                  <View style={styles.statusRow}>
                    <AlertCircle size={18} color="#FF6B6B" />
                    <Text style={styles.statusTextError}>{searchError}</Text>
                  </View>
                )}

                {currentChallenge && !isSearching && (
                  <View style={styles.statusRow}>
                    <CheckCircle size={18} color="#4ECDC4" />
                    <Text style={styles.statusTextSuccess}>Challenge found!</Text>
                  </View>
                )}
              </View>
            )}

            {/* Challenge Preview */}
            {currentChallenge && (
              <Animated.View
                style={[
                  styles.challengePreview,
                  {
                    opacity: successAnim,
                    transform: [
                      {
                        scale: successAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.previewHeader}>
                  <Text style={styles.previewTitle}>Challenge Details</Text>
                </View>

                {/* Creator Info */}
                {creator && (
                  <View style={styles.creatorSection}>
                    {creatorAvatar && (
                      <View
                        style={[
                          styles.creatorAvatar,
                          { backgroundColor: creatorAvatar.color },
                        ]}
                      >
                        <Text style={styles.creatorAvatarEmoji}>
                          {creatorAvatar.emoji}
                        </Text>
                      </View>
                    )}
                    <View style={styles.creatorInfo}>
                      <Text style={styles.creatorName}>{creator.username}</Text>
                      <View style={styles.creatorRating}>
                        <Trophy size={12} color="#FFD700" />
                        <Text style={styles.ratingText}>{creator.elo_rating}</Text>
                      </View>
                    </View>
                    <Text style={styles.challengeLabel}>challenges you!</Text>
                  </View>
                )}

                {/* Game Settings */}
                <View style={styles.settingsGrid}>
                  <View style={styles.settingItem}>
                    <Clock size={18} color="#4ECDC4" />
                    <Text style={styles.settingValue}>
                      {Math.floor(currentChallenge.time_control_seconds / 60)}+
                      {currentChallenge.increment_seconds}
                    </Text>
                    <Text style={styles.settingLabel}>Time</Text>
                  </View>

                  {currentChallenge.wager_tct > 0 && (
                    <View style={styles.settingItem}>
                      <Coins size={18} color="#FFD700" />
                      <Text style={styles.settingValueGold}>
                        {currentChallenge.wager_tct} TCT
                      </Text>
                      <Text style={styles.settingLabel}>Wager</Text>
                    </View>
                  )}

                  <View style={styles.settingItem}>
                    {currentChallenge.is_rated ? (
                      <>
                        <Trophy size={18} color="#4ECDC4" />
                        <Text style={styles.settingValue}>Rated</Text>
                      </>
                    ) : (
                      <>
                        <User size={18} color="#A0A0A0" />
                        <Text style={styles.settingValueMuted}>Casual</Text>
                      </>
                    )}
                    <Text style={styles.settingLabel}>Type</Text>
                  </View>
                </View>

                {/* USDC Conversion Hint */}
                {currentChallenge.wager_tct > 0 && (
                  <Text style={styles.usdcHint}>
                    = {tctToUsdc(currentChallenge.wager_tct).toFixed(2)} USDC (locked in smart contract)
                  </Text>
                )}

                {/* Wager Warning */}
                {currentChallenge.wager_tct > 0 && !canJoin && (
                  <View style={styles.warningBox}>
                    <AlertCircle size={16} color="#FF6B6B" />
                    <Text style={styles.warningText}>
                      {!isWalletInitialized
                        ? "Wallet initializing... Please wait."
                        : `Insufficient balance. You need ${currentChallenge.wager_tct} TCT (${tctToUsdc(currentChallenge.wager_tct).toFixed(2)} USDC). You have: ${effectiveTctBalance} TCT`}
                    </Text>
                  </View>
                )}

                {/* Join Button */}
                <TouchableOpacity
                  style={[styles.joinButton, (!canJoin || isProcessing) && styles.joinButtonDisabled]}
                  onPress={handleJoin}
                  disabled={isProcessing || !canJoin}
                >
                  <LinearGradient
                    colors={canJoin ? ["#4ECDC4", "#44A08D"] : ["#444", "#333"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinButtonGradient}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Play size={20} color="#FFF" />
                        <Text style={styles.joinButtonText}>Accept Challenge</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Search Button (when code is complete but not searched) */}
            {isCodeComplete && !currentChallenge && !isSearching && (
              <TouchableOpacity style={styles.searchButton} onPress={() => handleSearch()}>
                <Search size={18} color="#4ECDC4" />
                <Text style={styles.searchButtonText}>Search Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width } = Dimensions.get("window");
const CODE_BOX_SIZE = (width - 80) / 6;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#A0A0A0",
    fontSize: 14,
    textAlign: "center",
  },
  codeInputContainer: {
    marginBottom: 16,
  },
  codeBoxes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  codeBox: {
    width: CODE_BOX_SIZE,
    height: CODE_BOX_SIZE * 1.2,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  codeBoxFilled: {
    borderColor: "#4ECDC4",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  codeBoxActive: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  codeBoxError: {
    borderColor: "#FF6B6B",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
  },
  codeBoxSuccess: {
    borderColor: "#4ECDC4",
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  codeChar: {
    color: "#A0A0A0",
    fontSize: 28,
    fontWeight: "800",
    fontFamily: "monospace",
  },
  codeCharFilled: {
    color: "#FFF",
  },
  codeCharSuccess: {
    color: "#4ECDC4",
  },
  cursor: {
    position: "absolute",
    width: 2,
    height: 24,
    backgroundColor: "#FFD700",
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: "#4ECDC4",
    fontSize: 14,
  },
  statusTextError: {
    color: "#FF6B6B",
    fontSize: 14,
  },
  statusTextSuccess: {
    color: "#4ECDC4",
    fontSize: 14,
    fontWeight: "600",
  },
  challengePreview: {
    backgroundColor: "#1e1e2e",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  previewHeader: {
    marginBottom: 16,
  },
  previewTitle: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  creatorSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  creatorAvatarEmoji: {
    fontSize: 24,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  creatorRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    color: "#A0A0A0",
    fontSize: 12,
  },
  challengeLabel: {
    color: "#4ECDC4",
    fontSize: 12,
    fontWeight: "600",
  },
  settingsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  settingItem: {
    alignItems: "center",
    gap: 4,
  },
  settingValue: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  settingValueGold: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "700",
  },
  settingValueMuted: {
    color: "#A0A0A0",
    fontSize: 16,
    fontWeight: "600",
  },
  settingLabel: {
    color: "#666",
    fontSize: 11,
  },
  usdcHint: {
    color: "#4ECDC4",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  warningText: {
    color: "#FF6B6B",
    fontSize: 12,
    flex: 1,
  },
  joinButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  joinButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
  },
  searchButtonText: {
    color: "#4ECDC4",
    fontSize: 14,
    fontWeight: "600",
  },
});
