/**
 * Create Challenge Screen
 *
 * Simplified challenge creation with:
 * - Wager amount
 * - Public/Private visibility
 * - Color preference
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Share,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Coins,
  Globe,
  Lock,
  Copy,
  Share2,
  Crown,
  Clock,
  Wallet,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useChallengeStore } from "@/stores/challengeStore";
import { suppressedChallengeIdRef } from "@/components/ChallengeNotificationListener";
import { useAuthStore } from "@/stores/authStore";
import { useWalletStore } from "@/stores/walletStore";
import { useBiconomyWallet } from "@/hooks/useBiconomyWallet";
import { AudioManager } from "@/lib/audio";
import { tctToUsdc } from "@/lib/relay";
import { supabase } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

type Step = "settings" | "waiting";

// ============================================================================
// Constants
// ============================================================================

const WAGER_OPTIONS = [0, 10, 25, 50, 100, 250, 500];

const TIME_CONTROL_OPTIONS = [
  { seconds: 60, increment: 0, label: "1 min" },
  { seconds: 180, increment: 0, label: "3 min" },
  { seconds: 180, increment: 2, label: "3+2" },
  { seconds: 300, increment: 0, label: "5 min" },
  { seconds: 300, increment: 3, label: "5+3" },
  { seconds: 600, increment: 0, label: "10 min" },
  { seconds: 600, increment: 5, label: "10+5" },
  { seconds: 900, increment: 10, label: "15+10" },
];

const GRADIENT_COLORS: [string, string] = ["#4ECDC4", "#7EDDD6"];

// ============================================================================
// Component
// ============================================================================

export default function CreateChallengeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    challengeId?: string;
    roomCode?: string;
    directChallenge?: string;
    opponentName?: string;
    rejoin?: string;
    source?: string;
  }>();
  const { user, profile, walletProvider } = useAuthStore();

  // Get TCT balance from Biconomy wallet (on-chain USDC converted to TCT)
  const {
    tctBalance,
    isInitialized: isWalletInitialized,
    isInitializing: isWalletInitializing,
    hasEnoughTctBalance,
    tctToUsdc: convertTctToUsdc,
  } = useBiconomyWallet();

  // Fallback to wallet store if Biconomy not initialized
  const { tctBalance: storeTctBalance } = useWalletStore();
  const effectiveTctBalance = isWalletInitialized ? tctBalance : storeTctBalance;

  const {
    pendingSettings,
    updatePendingSettings,
    createOnChainChallenge,
    createPublicChallenge,
    createPrivateChallenge,
    cancelChallenge,
    markReady,
    unmarkReady,
    leaveLobbyAsOpponent,
    initializeBiconomy,
    currentChallenge,
    currentRoomCode,
    currentOnChainGameId,
    isCreating,
    isOnChainPending,
    error,
    joinedGameId,
    clearError,
    clearJoinedGame,
    initialize,
    resetState,
    loadChallenge,
    setCurrentChallenge,
    makePublic,
    deleteDeclinedChallenge,
  } = useChallengeStore();

  // Check if this is a direct challenge (coming from challenge-player screen)
  const isDirectChallenge = params.directChallenge === "true";
  const directOpponentName = params.opponentName;
  // Check if this is a rejoin (coming from challenge board to rejoin own challenge)
  const isRejoin = params.rejoin === "true";

  // Set initial step based on whether we're coming from a direct challenge or rejoin
  const [step, setStep] = useState<Step>(isDirectChallenge || isRejoin ? "waiting" : "settings");
  const [codeCopied, setCodeCopied] = useState(false);
  const [isLockingFunds, setIsLockingFunds] = useState(false);
  const [customWagerInput, setCustomWagerInput] = useState("");

  // Presence tracking
  const [creatorPresent, setCreatorPresent] = useState(false);
  const [opponentPresent, setOpponentPresent] = useState(false);

  // Determine if user is creator or opponent
  const isCreator = currentChallenge?.creator_id === user?.id;
  const isOpponent = currentChallenge?.opponent_id === user?.id;

  // Check ready status
  const creatorReady = currentChallenge?.creator_ready || false;
  const opponentReady = currentChallenge?.opponent_ready || false;
  const opponentJoined = !!currentChallenge?.opponent_id;
  const bothReady = creatorReady && opponentReady;

  // Only lock UI when both ready AND actively processing (no error)
  const isGameStarting = bothReady && isOnChainPending && !error;

  // Get usernames
  const creatorUsername = (currentChallenge as any)?.creator?.username || "Creator";
  const opponentUsername = (currentChallenge as any)?.opponent?.username || "Opponent";

  // Am I ready?
  const amIReady = isCreator ? creatorReady : opponentReady;

  // Suppress lobby notifications when user is viewing this challenge's lobby
  useEffect(() => {
    if (step === "waiting" && currentChallenge?.id) {
      suppressedChallengeIdRef.current = currentChallenge.id;
    } else {
      suppressedChallengeIdRef.current = null;
    }
    return () => {
      suppressedChallengeIdRef.current = null;
    };
  }, [step, currentChallenge?.id]);

  // Initialize store and Biconomy
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

  // Load challenge data if coming from direct challenge or rejoin
  useEffect(() => {
    if ((isDirectChallenge || isRejoin) && params.challengeId && params.roomCode) {
      // Load the challenge to get full details
      loadChallenge(params.challengeId);
    }
  }, [isDirectChallenge, isRejoin, params.challengeId, params.roomCode, loadChallenge]);

  // Handle game joined - navigate to online game
  useEffect(() => {
    if (joinedGameId && !hasNavigatedToGameRef.current) {
      hasNavigatedToGameRef.current = true;
      console.log("[CreateChallenge] Challenge accepted, navigating to game:", joinedGameId);
      clearJoinedGame();
      router.replace({
        pathname: "/online-game",
        params: { gameId: joinedGameId, source: params.source || "challenge" },
      });
    }
  }, [joinedGameId, router, clearJoinedGame, params.source]);

  // Show error
  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, clearError]);

  // Cleanup on unmount only - use a ref to track if we should reset
  const stepRef = React.useRef(step);
  stepRef.current = step;

  useEffect(() => {
    return () => {
      // Only reset if we're still on settings when unmounting
      // (not when transitioning to waiting)
      if (stepRef.current === "settings") {
        resetState();
      }
    };
  }, [resetState]);

  // Track if we've already triggered the escrow flow to avoid double-triggering
  const escrowFlowTriggeredRef = React.useRef(false);

  // Track if we've already started navigation to avoid double-navigation
  const hasNavigatedToGameRef = React.useRef(false);

  // Subscribe to challenge updates to detect when opponent registers
  useEffect(() => {
    if (!currentChallenge?.id || step !== "waiting") return;

    // Reset refs when subscription starts
    escrowFlowTriggeredRef.current = false;
    hasNavigatedToGameRef.current = false;

    // Subscribe to this specific challenge for updates + presence
    const subscription = supabase
      .channel(`challenge:${currentChallenge.id}`, {
        config: {
          presence: {
            key: user?.id || "unknown",
          },
        },
      })
      .on("presence", { event: "sync" }, () => {
        const presenceState = subscription.presenceState();
        const presentUserIds = Object.keys(presenceState);
        setCreatorPresent(presentUserIds.includes(currentChallenge.creator_id));
        setOpponentPresent(
          !!currentChallenge.opponent_id && presentUserIds.includes(currentChallenge.opponent_id)
        );
      })
      .on("presence", { event: "join" }, ({ key }: { key: string }) => {
        if (key === currentChallenge.creator_id) setCreatorPresent(true);
        if (key === currentChallenge.opponent_id) setOpponentPresent(true);
      })
      .on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        if (key === currentChallenge.creator_id) setCreatorPresent(false);
        if (key === currentChallenge.opponent_id) setOpponentPresent(false);
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "challenges",
          filter: `id=eq.${currentChallenge.id}`,
        },
        async (payload) => {
          console.log("[CreateChallenge] Challenge updated:", payload.new);
          const updated = payload.new as any;

          // Update the current challenge with new data
          setCurrentChallenge({
            ...currentChallenge,
            ...updated,
          } as any);

          // If challenge was declined, show Make Public / Cancel alert
          if (updated.status === "declined" && isCreator) {
            Alert.alert(
              "Challenge Declined",
              "Your opponent declined the challenge. What would you like to do?",
              [
                {
                  text: "Cancel Challenge",
                  style: "destructive",
                  onPress: async () => {
                    await deleteDeclinedChallenge(currentChallenge.id);
                    resetState();
                    router.back();
                  },
                },
                {
                  text: "Make Public",
                  onPress: async () => {
                    const success = await makePublic(currentChallenge.id);
                    if (!success) {
                      Alert.alert("Error", "Failed to make challenge public");
                    }
                  },
                },
              ]
            );
            return;
          }

          // If game was accepted (game_id set), navigate to game
          if (updated.game_id && updated.status === "accepted" && !hasNavigatedToGameRef.current) {
            hasNavigatedToGameRef.current = true;
            console.log("[CreateChallenge] Game started via realtime, navigating to:", updated.game_id);
            router.replace({
              pathname: "/online-game",
              params: { gameId: updated.game_id, source: params.source || "challenge" },
            });
            return;
          }

          // If both players are now ready and I've already marked myself ready,
          // trigger the escrow locking flow (for the player who marked ready first)
          const iAmReady = (isCreator && updated.creator_ready) || (isOpponent && updated.opponent_ready);
          const otherIsReady = (isCreator && updated.opponent_ready) || (isOpponent && updated.creator_ready);
          const bothNowReady = updated.creator_ready && updated.opponent_ready;

          // Only trigger escrow flow if challenge is still pending (not already accepted)
          if (bothNowReady && iAmReady && !escrowFlowTriggeredRef.current && !isOnChainPending && updated.status === 'pending') {
            console.log("[CreateChallenge] Both ready detected via realtime! Triggering escrow flow...");
            escrowFlowTriggeredRef.current = true;

            // Re-trigger markReady to continue the escrow flow
            // This time bothReady will be true, so it will proceed to lock funds
            try {
              const result = await markReady(currentChallenge.id);
              console.log("[CreateChallenge] Escrow flow result:", result);
            } catch (error) {
              console.error("[CreateChallenge] Escrow flow error:", error);
              escrowFlowTriggeredRef.current = false; // Allow retry
            }
          } else if (updated.status === 'accepted') {
            // Challenge already accepted by another process, skip escrow flow
            console.log("[CreateChallenge] Challenge already accepted, skipping escrow flow");
          }
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await subscription.track({
            user_id: user?.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      subscription.untrack();
      subscription.unsubscribe();
    };
  }, [currentChallenge?.id, step, setCurrentChallenge, router, isCreator, isOpponent, markReady, isOnChainPending, user?.id, makePublic, deleteDeclinedChallenge, resetState]);

  // Handlers
  const handleWagerSelect = useCallback(
    (amount: number) => {
      Haptics.selectionAsync();
      AudioManager?.play("chip");
      updatePendingSettings({ wagerAmount: amount });
    },
    [updatePendingSettings]
  );

  const handleToggleVisibility = useCallback(() => {
    Haptics.selectionAsync();
    updatePendingSettings({ isPublic: !pendingSettings.isPublic });
  }, [pendingSettings.isPublic, updatePendingSettings]);

  const handleColorPreference = useCallback(
    (color: "white" | "black" | "random") => {
      Haptics.selectionAsync();
      updatePendingSettings({ colorPreference: color });
    },
    [updatePendingSettings]
  );

  const handleTimeControlSelect = useCallback(
    (seconds: number, incrementSec: number) => {
      Haptics.selectionAsync();
      updatePendingSettings({
        timeControl: seconds,
        increment: incrementSec
      });
    },
    [updatePendingSettings]
  );

  const handleCustomWagerChange = useCallback(
    (text: string) => {
      // Only allow numeric input
      const numericText = text.replace(/[^0-9]/g, "");
      setCustomWagerInput(numericText);

      if (numericText) {
        const amount = parseInt(numericText, 10);
        if (!isNaN(amount) && amount >= 0) {
          Haptics.selectionAsync();
          updatePendingSettings({ wagerAmount: amount });
        }
      }
    },
    [updatePendingSettings]
  );

  const handleCustomWagerSubmit = useCallback(() => {
    if (customWagerInput) {
      const amount = parseInt(customWagerInput, 10);
      if (!isNaN(amount) && amount >= 0) {
        AudioManager?.play("chip");
        updatePendingSettings({ wagerAmount: amount });
      }
    }
  }, [customWagerInput, updatePendingSettings]);

  const handleCreateChallenge = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AudioManager?.play("chipStack");

    // For wager games, use on-chain escrow
    if (pendingSettings.wagerAmount > 0) {
      // Check wallet is initialized
      if (!isWalletInitialized) {
        Alert.alert(
          "Wallet Not Ready",
          "Please wait for your wallet to initialize before creating a wager game.",
          [{ text: "OK" }]
        );
        return;
      }

      // Check balance
      if (!hasEnoughTctBalance(pendingSettings.wagerAmount)) {
        Alert.alert(
          "Insufficient Balance",
          `You need ${pendingSettings.wagerAmount} TCT (${tctToUsdc(pendingSettings.wagerAmount).toFixed(2)} USDC) to create this challenge.`,
          [{ text: "OK" }]
        );
        return;
      }

      // Use on-chain challenge creation
      const result = await createOnChainChallenge(pendingSettings.isPublic);
      if (result) {
        setStep("waiting");
      }
    } else {
      // Free games use standard flow (no on-chain escrow)
      let result;
      if (pendingSettings.isPublic) {
        result = await createPublicChallenge();
      } else {
        result = await createPrivateChallenge();
      }

      if (result) {
        setStep("waiting");
      }
    }
  }, [
    pendingSettings.isPublic,
    pendingSettings.wagerAmount,
    isWalletInitialized,
    hasEnoughTctBalance,
    createOnChainChallenge,
    createPublicChallenge,
    createPrivateChallenge,
  ]);

  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelChallenge = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert("Cancel Challenge", "Are you sure you want to cancel?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          setIsCancelling(true);
          const success = await cancelChallenge();
          setIsCancelling(false);

          if (success) {
            setStep("settings");
            resetState();
            router.back();
          } else {
            // Even if cancel fails in DB, let user go back
            // The challenge will expire or can be cancelled later
            Alert.alert(
              "Warning",
              "Could not cancel challenge in database, but you can leave. The challenge will expire automatically.",
              [
                { text: "Stay", style: "cancel" },
                {
                  text: "Leave Anyway",
                  onPress: () => {
                    setStep("settings");
                    resetState();
                    router.back();
                  }
                }
              ]
            );
          }
        },
      },
    ]);
  }, [cancelChallenge, resetState, router]);

  const handleCopyCode = useCallback(async () => {
    const codeToUse = params.roomCode || currentRoomCode;
    if (!codeToUse) return;

    await Clipboard.setStringAsync(codeToUse);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [currentRoomCode, params.roomCode]);

  const handleShareCode = useCallback(async () => {
    const codeToUse = params.roomCode || currentRoomCode || currentChallenge?.room_code;
    if (!codeToUse) return;

    // Create deep link URL that opens the app directly to join the challenge
    // Format: treasurechess://join-challenge?code=XXXXXX
    const deepLink = `treasurechess://join-challenge?code=${codeToUse}`;

    // Also create a web fallback URL (for when app isn't installed)
    // This could link to app store or a web page
    const webFallback = `https://treasurechess.app/join/${codeToUse}`;

    try {
      await Share.share({
        message: `🎯 Join my chess match on Treasure Chess!\n\nRoom Code: ${codeToUse}\n\nTap to join: ${deepLink}\n\nOr download the app: ${webFallback}`,
        // iOS specific - allows the link to be tappable
        url: deepLink,
      });
    } catch {
      // User cancelled share
    }
  }, [currentRoomCode, params.roomCode, currentChallenge?.room_code]);

  // Handle decline & leave as opponent (defined before handleGoBack which references it)
  const handleDeclineAndLeave = useCallback(async () => {
    if (!currentChallenge?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Leave Lobby",
      "Are you sure you want to leave? The challenge will remain open for another player.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const result = await leaveLobbyAsOpponent(currentChallenge.id);
            if (result.success) {
              resetState();
              router.back();
            } else {
              Alert.alert("Error", result.error || "Failed to leave lobby");
            }
          },
        },
      ]
    );
  }, [currentChallenge?.id, leaveLobbyAsOpponent, resetState, router]);

  const handleGoBack = useCallback(() => {
    // Don't allow leaving when game is actively starting (both ready, no error)
    if (isGameStarting) {
      return;
    }

    if (step === "waiting") {
      if (isOpponent) {
        // Opponent back button: leave lobby (soft decline)
        handleDeclineAndLeave();
      } else {
        // Creator: ask if they want to leave or cancel
        Alert.alert(
          "Leave Challenge",
          "What would you like to do?",
          [
            { text: "Stay", style: "cancel" },
            {
              text: "Leave (Keep Active)",
              onPress: () => {
                router.back();
              },
            },
            {
              text: "Cancel Challenge",
              style: "destructive",
              onPress: async () => {
                setIsCancelling(true);
                const success = await cancelChallenge();
                setIsCancelling(false);
                if (success) {
                  resetState();
                }
                router.back();
              },
            },
          ]
        );
      }
    } else {
      router.back();
    }
  }, [step, router, cancelChallenge, resetState, isGameStarting, isOpponent, handleDeclineAndLeave]);

  // Handle ready up - marks player as ready, triggers game start when both ready
  const handleReadyUp = useCallback(async () => {
    if (!currentChallenge?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLockingFunds(true);

    try {
      const result = await markReady(currentChallenge.id);
      if (result.success) {
        if (result.gameStarted && result.gameId) {
          // Both were ready, game started!
          // Navigation will happen via joinedGameId useEffect
          console.log("[CreateChallenge] Game started via markReady:", result.gameId);
        }
        // If not gameStarted, the other player isn't ready yet
        // The UI will update via realtime subscription
      } else {
        Alert.alert("Error", result.error || "Failed to ready up");
      }
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to ready up");
    } finally {
      setIsLockingFunds(false);
    }
  }, [currentChallenge?.id, markReady, router]);

  // Handle unready - toggle back to not-ready state
  const handleUnready = useCallback(async () => {
    if (!currentChallenge?.id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await unmarkReady(currentChallenge.id);
      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to unready");
      }
    } catch (error) {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to unready");
    }
  }, [currentChallenge?.id, unmarkReady]);

  // Check wager eligibility
  const canWager =
    pendingSettings.wagerAmount === 0 ||
    effectiveTctBalance >= pendingSettings.wagerAmount;

  // Show loading state for on-chain transactions
  const isProcessing = isCreating || isOnChainPending;

  // Render settings step
  const renderSettings = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Wager Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Coins size={20} color="#FFD700" />
          <Text style={styles.sectionTitle}>Stake Amount (TCT)</Text>
          <View style={styles.balanceBadge}>
            <Text style={styles.balanceText}>
              {isWalletInitializing ? "Loading..." : `Balance: ${effectiveTctBalance.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            </Text>
          </View>
        </View>

        {/* USDC conversion hint */}
        {pendingSettings.wagerAmount > 0 && (
          <Text style={styles.usdcHint}>
            = {tctToUsdc(pendingSettings.wagerAmount).toFixed(2)} USDC (locked in smart contract)
          </Text>
        )}

        <View style={styles.wagerGrid}>
          {WAGER_OPTIONS.map((amount) => {
            const isSelected = pendingSettings.wagerAmount === amount && !customWagerInput;
            const canAfford = effectiveTctBalance >= amount;

            return (
              <TouchableOpacity
                key={amount}
                style={[
                  styles.wagerOption,
                  isSelected && styles.wagerOptionSelected,
                  !canAfford && amount > 0 && styles.wagerOptionDisabled,
                ]}
                onPress={() => {
                  if (canAfford) {
                    setCustomWagerInput("");
                    handleWagerSelect(amount);
                  }
                }}
                disabled={!canAfford && amount > 0}
              >
                <Text
                  style={[
                    styles.wagerText,
                    isSelected && styles.wagerTextSelected,
                    !canAfford && amount > 0 && styles.wagerTextDisabled,
                  ]}
                >
                  {amount === 0 ? "Free" : `${amount}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Wager Input */}
        <View style={styles.customWagerContainer}>
          <Text style={styles.customWagerLabel}>Or enter custom amount:</Text>
          <View style={styles.customWagerInputRow}>
            <TextInput
              style={[
                styles.customWagerInput,
                customWagerInput ? styles.customWagerInputActive : null,
              ]}
              placeholder="Enter TCT amount"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={customWagerInput}
              onChangeText={handleCustomWagerChange}
              onSubmitEditing={handleCustomWagerSubmit}
              returnKeyType="done"
            />
            <Text style={styles.customWagerSuffix}>TCT</Text>
          </View>
          {customWagerInput && parseInt(customWagerInput, 10) > effectiveTctBalance && (
            <Text style={styles.customWagerWarning}>
              Exceeds your balance of {effectiveTctBalance.toLocaleString()} TCT
            </Text>
          )}
        </View>
      </View>

      {/* Time Control Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Clock size={20} color="#4ECDC4" />
          <Text style={styles.sectionTitle}>Time Control</Text>
        </View>

        <View style={styles.timeControlGrid}>
          {TIME_CONTROL_OPTIONS.map((option) => {
            const isSelected =
              pendingSettings.timeControl === option.seconds &&
              pendingSettings.increment === option.increment;

            return (
              <TouchableOpacity
                key={`${option.seconds}-${option.increment}`}
                style={[
                  styles.timeControlOption,
                  isSelected && styles.timeControlOptionSelected,
                ]}
                onPress={() => handleTimeControlSelect(option.seconds, option.increment)}
              >
                <Text
                  style={[
                    styles.timeControlText,
                    isSelected && styles.timeControlTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Visibility Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Globe size={20} color="#4ECDC4" />
          <Text style={styles.sectionTitle}>Challenge Type</Text>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleOption,
              pendingSettings.isPublic && styles.toggleOptionSelected,
            ]}
            onPress={handleToggleVisibility}
          >
            <Globe
              size={18}
              color={pendingSettings.isPublic ? "#4ECDC4" : "#666"}
            />
            <View style={styles.toggleContent}>
              <Text
                style={[
                  styles.toggleText,
                  pendingSettings.isPublic && styles.toggleTextSelected,
                ]}
              >
                Public
              </Text>
              <Text style={styles.toggleSubtext}>Anyone can join</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleOption,
              !pendingSettings.isPublic && styles.toggleOptionSelected,
            ]}
            onPress={handleToggleVisibility}
          >
            <Lock
              size={18}
              color={!pendingSettings.isPublic ? "#FFD700" : "#666"}
            />
            <View style={styles.toggleContent}>
              <Text
                style={[
                  styles.toggleText,
                  !pendingSettings.isPublic && styles.toggleTextSelected,
                ]}
              >
                Private
              </Text>
              <Text style={styles.toggleSubtext}>Share room code</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Color Preference Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Crown size={20} color="#4ECDC4" />
          <Text style={styles.sectionTitle}>Play As</Text>
        </View>

        <View style={styles.colorRow}>
          <TouchableOpacity
            style={[
              styles.colorOption,
              pendingSettings.colorPreference === "white" &&
                styles.colorOptionSelected,
            ]}
            onPress={() => handleColorPreference("white")}
          >
            <View style={[styles.colorCircle, styles.colorWhite]} />
            <Text
              style={[
                styles.colorText,
                pendingSettings.colorPreference === "white" &&
                  styles.colorTextSelected,
              ]}
            >
              White
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.colorOption,
              pendingSettings.colorPreference === "random" &&
                styles.colorOptionSelected,
            ]}
            onPress={() => handleColorPreference("random")}
          >
            <View style={styles.colorCircleRandom}>
              <View style={[styles.colorHalf, styles.colorWhite]} />
              <View style={[styles.colorHalf, styles.colorBlack]} />
            </View>
            <Text
              style={[
                styles.colorText,
                pendingSettings.colorPreference === "random" &&
                  styles.colorTextSelected,
              ]}
            >
              Random
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.colorOption,
              pendingSettings.colorPreference === "black" &&
                styles.colorOptionSelected,
            ]}
            onPress={() => handleColorPreference("black")}
          >
            <View style={[styles.colorCircle, styles.colorBlack]} />
            <Text
              style={[
                styles.colorText,
                pendingSettings.colorPreference === "black" &&
                  styles.colorTextSelected,
              ]}
            >
              Black
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createButton, (!canWager || isProcessing) && styles.createButtonDisabled]}
        onPress={handleCreateChallenge}
        disabled={isProcessing || !canWager}
      >
        <LinearGradient
          colors={canWager ? GRADIENT_COLORS : ["#444", "#333"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createButtonGradient}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.createButtonText}>Create Challenge</Text>
              {pendingSettings.wagerAmount > 0 && (
                <View style={styles.wagerPreview}>
                  <Coins size={14} color="#FFD700" />
                  <Text style={styles.wagerPreviewText}>
                    {pendingSettings.wagerAmount} TCT
                  </Text>
                </View>
              )}
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {!canWager && (
        <Text style={styles.insufficientFunds}>
          Insufficient TCT balance for this wager
        </Text>
      )}
    </ScrollView>
  );

  // Determine room code to display (from params, store, or current challenge)
  // Use currentChallenge.room_code as primary source since it's set atomically with the challenge
  const displayRoomCode = params.roomCode || currentRoomCode || currentChallenge?.room_code;

  // Render waiting/lobby step
  const renderWaiting = () => (
    <ScrollView
      style={styles.waitingContainer}
      contentContainerStyle={styles.waitingContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Lobby Header */}
      <View style={styles.lobbyHeader}>
        <Text style={styles.lobbyTitle}>
          {opponentJoined ? "Game Lobby" : "Waiting for Opponent"}
        </Text>
        <Text style={styles.lobbySubtitle}>
          {opponentJoined
            ? "Both players must be ready to start"
            : isDirectChallenge
            ? `Waiting for ${directOpponentName || "opponent"} to join`
            : pendingSettings.isPublic
            ? "Your challenge is visible on the public board"
            : "Share your room code with a friend"}
        </Text>
      </View>

      {/* Players Status */}
      <View style={styles.playersContainer}>
        {/* Creator */}
        <View style={styles.playerCard}>
          <LinearGradient
            colors={creatorReady ? ["#4ECDC4", "#45B7AA"] : ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]}
            style={styles.playerCardGradient}
          >
            <View style={styles.presenceRow}>
              <Crown size={24} color={creatorReady ? "#FFF" : "#A0A0A0"} />
              <View style={[styles.presenceDot, creatorPresent ? styles.presenceDotOnline : styles.presenceDotOffline]} />
            </View>
            <Text style={[styles.playerName, creatorReady && styles.playerNameReady]}>
              {isCreator ? "You" : creatorUsername}
            </Text>
            <Text style={[styles.playerStatus, creatorReady && styles.playerStatusReady]}>
              {creatorReady ? "READY" : "Not Ready"}
            </Text>
          </LinearGradient>
        </View>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Opponent */}
        <View style={styles.playerCard}>
          <LinearGradient
            colors={opponentJoined && opponentReady ? ["#4ECDC4", "#45B7AA"] : ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]}
            style={styles.playerCardGradient}
          >
            {opponentJoined ? (
              <>
                <View style={styles.presenceRow}>
                  <Crown size={24} color={opponentReady ? "#FFF" : "#A0A0A0"} />
                  <View style={[styles.presenceDot, opponentPresent ? styles.presenceDotOnline : styles.presenceDotOffline]} />
                </View>
                <Text style={[styles.playerName, opponentReady && styles.playerNameReady]}>
                  {isOpponent ? "You" : opponentUsername}
                </Text>
                <Text style={[styles.playerStatus, opponentReady && styles.playerStatusReady]}>
                  {opponentReady ? "READY" : "Not Ready"}
                </Text>
              </>
            ) : (
              <>
                <Clock size={24} color="#A0A0A0" />
                <Text style={styles.playerName}>Waiting...</Text>
                <ActivityIndicator size="small" color="#A0A0A0" style={{ marginTop: 8 }} />
              </>
            )}
          </LinearGradient>
        </View>
      </View>

      {/* Ready Button - Show when opponent has joined and I'm not ready yet */}
      {opponentJoined && !amIReady && !bothReady && (
        <TouchableOpacity
          style={[styles.readyButton, (isLockingFunds || isOnChainPending) && styles.readyButtonDisabled]}
          onPress={handleReadyUp}
          disabled={isLockingFunds || isOnChainPending}
        >
          <LinearGradient
            colors={["#4ECDC4", "#45B7AA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.readyButtonGradient}
          >
            {isLockingFunds || isOnChainPending ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Wallet size={20} color="#FFF" />
                <Text style={styles.readyButtonText}>
                  {currentChallenge?.wager_tct && currentChallenge.wager_tct > 0
                    ? `Ready`
                    : "Ready!"}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Unready Button - Show when I'm ready but other player isn't */}
      {opponentJoined && amIReady && !bothReady && (
        <View>
          <View style={styles.waitingMessage}>
            <ActivityIndicator color="#4ECDC4" size="small" />
            <Text style={styles.waitingMessageText}>
              Waiting for {isCreator ? opponentUsername : creatorUsername} to ready up...
            </Text>
          </View>
          <TouchableOpacity
            style={styles.unreadyButton}
            onPress={handleUnready}
          >
            <Text style={styles.unreadyButtonText}>Unready</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Both ready - starting game */}
      {bothReady && (
        <View style={styles.gameStartingMessage}>
          <ActivityIndicator color="#FFD700" size="small" />
          <Text style={styles.gameStartingText}>
            Starting game...
          </Text>
        </View>
      )}

      {/* Room Code Display - Show for private games or when no opponent */}
      {displayRoomCode && !opponentJoined && (
        <View style={styles.roomCodeContainer}>
          <Text style={styles.roomCodeLabel}>ROOM CODE</Text>
          <View style={styles.roomCodeBox}>
            <Text style={styles.roomCodeText}>{displayRoomCode}</Text>
          </View>
          <Text style={styles.roomCodeHint}>
            Send this code to your friend so they can join
          </Text>

          {/* Action Buttons */}
          <View style={styles.codeActions}>
            <TouchableOpacity
              style={[styles.codeActionBtn, codeCopied && styles.codeActionBtnSuccess]}
              onPress={handleCopyCode}
            >
              <Copy size={18} color={codeCopied ? "#4ECDC4" : "#FFF"} />
              <Text
                style={[
                  styles.codeActionText,
                  codeCopied && styles.codeActionTextSuccess,
                ]}
              >
                {codeCopied ? "Copied!" : "Copy Code"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.codeActionBtn}
              onPress={handleShareCode}
            >
              <Share2 size={18} color="#FFF" />
              <Text style={styles.codeActionText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Challenge Details */}
      {currentChallenge && (
        <View style={styles.challengeDetails}>
          <Text style={styles.detailsTitle}>Challenge Details</Text>
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Clock size={16} color="#4ECDC4" />
              <Text style={styles.detailValue}>
                {Math.floor(currentChallenge.time_control_seconds / 60)}+{currentChallenge.increment_seconds}
              </Text>
              <Text style={styles.detailLabel}>Time</Text>
            </View>
            {currentChallenge.wager_tct > 0 && (
              <View style={styles.detailItem}>
                <Coins size={16} color="#FFD700" />
                <Text style={[styles.detailValue, { color: "#FFD700" }]}>
                  {currentChallenge.wager_tct} TCT
                </Text>
                <Text style={styles.detailLabel}>Wager</Text>
              </View>
            )}
            <View style={styles.detailItem}>
              <Crown size={16} color="#4ECDC4" />
              <Text style={styles.detailValue}>
                {pendingSettings.colorPreference === "random" ? "Random" : pendingSettings.colorPreference === "white" ? "White" : "Black"}
              </Text>
              <Text style={styles.detailLabel}>Color</Text>
            </View>
          </View>
        </View>
      )}

      {/* Bottom action buttons - Hidden when game is actively starting */}
      {!isGameStarting && (
        <View style={styles.bottomActions}>
          {/* Opponent: "Decline & Leave" button */}
          {isOpponent && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleDeclineAndLeave}
            >
              <Text style={styles.cancelButtonText}>Decline & Leave</Text>
            </TouchableOpacity>
          )}

          {/* Creator: "Cancel Challenge" button */}
          {isCreator && (
            <TouchableOpacity
              style={[styles.cancelButton, isCancelling && styles.cancelButtonDisabled]}
              onPress={handleCancelChallenge}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator color="#FF6B6B" size="small" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel Challenge</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );

  return (
    <LinearGradient colors={["#0a0a0f", "#1a1a2e"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, isGameStarting && styles.backButtonDisabled]}
            onPress={handleGoBack}
            disabled={isGameStarting}
          >
            <ArrowLeft size={24} color={isGameStarting ? "#666" : "#FFF"} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === "settings" ? "Create Challenge" : isGameStarting ? "Starting Game..." : "Challenge Created"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        {step === "settings" ? renderSettings() : renderWaiting()}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
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
  backButtonDisabled: {
    opacity: 0.3,
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  balanceBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  balanceText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  usdcHint: {
    color: "#4ECDC4",
    fontSize: 12,
    marginBottom: 12,
    marginLeft: 28,
  },
  wagerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  wagerOption: {
    width: (width - 52) / 4,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  wagerOptionSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderColor: "#FFD700",
  },
  wagerOptionDisabled: {
    opacity: 0.4,
  },
  wagerText: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "600",
  },
  wagerTextSelected: {
    color: "#FFD700",
  },
  wagerTextDisabled: {
    color: "#666",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
  },
  toggleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  toggleOptionSelected: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4ECDC4",
  },
  toggleContent: {
    flex: 1,
  },
  toggleText: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "600",
  },
  toggleTextSelected: {
    color: "#FFF",
  },
  toggleSubtext: {
    color: "#666",
    fontSize: 11,
    marginTop: 2,
  },
  colorRow: {
    flexDirection: "row",
    gap: 12,
  },
  colorOption: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  colorOptionSelected: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4ECDC4",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  colorWhite: {
    backgroundColor: "#FFF",
  },
  colorBlack: {
    backgroundColor: "#1a1a1a",
  },
  colorCircleRandom: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  colorHalf: {
    flex: 1,
  },
  colorText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "600",
  },
  colorTextSelected: {
    color: "#FFF",
  },
  createButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 12,
  },
  createButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  wagerPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  wagerPreviewText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  insufficientFunds: {
    color: "#FF6B6B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },

  // Waiting step
  waitingContainer: {
    flex: 1,
  },
  waitingContent: {
    padding: 16,
    paddingBottom: 32,
  },
  waitingAnimation: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  waitingCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  waitingTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 6,
  },
  waitingSubtitle: {
    color: "#A0A0A0",
    fontSize: 14,
    textAlign: "center",
  },

  // Room code display
  roomCodeContainer: {
    alignItems: "center",
    backgroundColor: "#1e1e2e",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  roomCodeLabel: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2,
    marginBottom: 12,
  },
  roomCodeBox: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFD700",
    borderStyle: "dashed",
  },
  roomCodeText: {
    color: "#FFD700",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 4,
  },
  roomCodeHint: {
    color: "#666",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  codeActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  codeActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  codeActionBtnSuccess: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderColor: "#4ECDC4",
  },
  codeActionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  codeActionTextSuccess: {
    color: "#4ECDC4",
  },

  // Challenge details
  challengeDetails: {
    backgroundColor: "#1e1e2e",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  detailsTitle: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  detailItem: {
    alignItems: "center",
    gap: 6,
  },
  detailValue: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  detailLabel: {
    color: "#666",
    fontSize: 11,
  },

  // Cancel button
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  cancelButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: "#FF6B6B",
    fontSize: 16,
    fontWeight: "600",
  },

  // Lobby styles
  lobbyHeader: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  lobbyTitle: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  lobbySubtitle: {
    color: "#A0A0A0",
    fontSize: 14,
    textAlign: "center",
  },
  playersContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    gap: 12,
  },
  playerCard: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  playerCardGradient: {
    padding: 20,
    alignItems: "center",
    minHeight: 120,
    justifyContent: "center",
  },
  presenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  presenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
  },
  presenceDotOnline: {
    backgroundColor: "#4ADE80",
  },
  presenceDotOffline: {
    backgroundColor: "#6B7280",
  },
  playerName: {
    color: "#A0A0A0",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 8,
  },
  playerNameReady: {
    color: "#FFF",
  },
  playerStatus: {
    color: "#666",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: 1,
  },
  playerStatusReady: {
    color: "#FFF",
  },
  vsDivider: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  vsText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "700",
  },
  readyButton: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
  },
  readyButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  readyButtonDisabled: {
    opacity: 0.7,
  },
  readyButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  waitingMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  waitingMessageText: {
    color: "#4ECDC4",
    fontSize: 14,
    fontWeight: "500",
  },
  gameStartingMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  gameStartingText: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "700",
  },
  unreadyButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 193, 7, 0.3)",
    marginBottom: 20,
  },
  unreadyButtonText: {
    color: "#FFC107",
    fontSize: 16,
    fontWeight: "600",
  },
  bottomActions: {
    gap: 10,
  },

  // Custom Wager Input
  customWagerContainer: {
    marginTop: 16,
  },
  customWagerLabel: {
    color: "#A0A0A0",
    fontSize: 13,
    marginBottom: 8,
  },
  customWagerInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  customWagerInput: {
    flex: 1,
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#FFF",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  customWagerInputActive: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  customWagerSuffix: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  customWagerWarning: {
    color: "#FF6B6B",
    fontSize: 12,
    marginTop: 6,
  },

  // Time Control
  timeControlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  timeControlOption: {
    width: (width - 52) / 4,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#1e1e2e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  timeControlOptionSelected: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderColor: "#4ECDC4",
  },
  timeControlText: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "600",
  },
  timeControlTextSelected: {
    color: "#4ECDC4",
  },
});
