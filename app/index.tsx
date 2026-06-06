import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Settings, Wallet, Trophy, Swords, Target, Users, Video, Award, Share2, Gift, LogIn, Shield, RefreshCw, WifiOff, Cloud, CloudOff, Play, UserSearch } from "lucide-react-native";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  Share,
  Animated,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "@/contexts/AppContext";
import { MatchmakingBanner } from "@/components/MatchmakingBanner";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useHomeStats, type ValueChangeEvent } from "@/hooks/useHomeStats";
import { useUserStore } from "@/stores/userStore";
import { createChallengeService } from "@/lib/challenges";

const { width } = Dimensions.get("window");

const WELCOME_FRAME_IMAGE = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/cyikh12hbavic2qolcsg6";
const TCT_SYMBOL_IMAGE = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/5u9rwf8nf5781rk1dz2oc";
const DRAGON_EGG_IMAGE = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pmiuevjqnf7r9sjx1y6xw";

const TCT_TO_USD = 0.04;

// Global flag to track if welcome screen has been shown this session
// This persists across component remounts (navigation)
let hasShownWelcomeThisSession = false;

function formatTCTBalance(tctBalance: number): string {
  if (tctBalance >= 1000000) {
    return `${(tctBalance / 1000000).toFixed(1)}m`;
  }
  if (tctBalance >= 1000) {
    return `${(tctBalance / 1000).toFixed(1)}k`;
  }
  return tctBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1.3,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => onComplete());
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, onComplete]);

  return (
    <Animated.View style={[welcomeStyles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" />
      <View style={welcomeStyles.gradient}>
        <Animated.View
          style={[
            welcomeStyles.frameContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Image
            source={{ uri: WELCOME_FRAME_IMAGE }}
            style={welcomeStyles.frameImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  gradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  frameContainer: {
    width: width,
    height: width * 1.25,
    justifyContent: "center",
    alignItems: "center",
  },
  frameImage: {
    width: "100%",
    height: "100%",
  },

});

// ============================================================================
// Animated Number Component
// ============================================================================

interface AnimatedNumberProps {
  animatedValue: Animated.Value;
  style?: any;
  prefix?: string;
  suffix?: string;
  formatter?: (value: number) => string;
  changeIndicator?: ValueChangeEvent | null;
}

function AnimatedNumber({
  animatedValue,
  style,
  prefix = "",
  suffix = "",
  formatter,
  changeIndicator,
}: AnimatedNumberProps) {
  // Initialize displayValue from the animated value's current internal value
  const getAnimatedValue = () => Math.round((animatedValue as any)._value ?? 0);
  const [displayValue, setDisplayValue] = useState(getAnimatedValue);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const changeOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Set initial value from animated value (in case it changed before mounting)
    setDisplayValue(getAnimatedValue());

    // Add listener for value changes
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue]);

  // Pulse animation when value changes
  useEffect(() => {
    if (changeIndicator) {
      // Pulse the main value
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(pulseAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Show change indicator
      Animated.sequence([
        Animated.timing(changeOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(changeOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [changeIndicator, pulseAnim, changeOpacity]);

  const formattedValue = formatter ? formatter(displayValue) : displayValue.toString();
  const changeAmount = changeIndicator?.change ?? 0;
  const isPositive = changeAmount > 0;

  return (
    <View style={animatedNumberStyles.container}>
      <Animated.Text
        style={[
          style,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        {prefix}{formattedValue}{suffix}
      </Animated.Text>
      {changeIndicator && (
        <Animated.View
          style={[
            animatedNumberStyles.changeIndicator,
            { opacity: changeOpacity },
          ]}
        >
          <Text
            style={[
              animatedNumberStyles.changeText,
              isPositive ? animatedNumberStyles.positiveChange : animatedNumberStyles.negativeChange,
            ]}
          >
            {isPositive ? "+" : ""}{changeAmount}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const animatedNumberStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  changeIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  changeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  positiveChange: {
    color: "#4ECDC4",
  },
  negativeChange: {
    color: "#FF6B6B",
  },
});

// ============================================================================
// Sync Status Indicator Component
// ============================================================================

interface SyncStatusIndicatorProps {
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  onRetry?: () => void;
}

function SyncStatusIndicator({
  isSyncing,
  isOnline,
  lastSyncedAt,
  syncError,
  onRetry,
}: SyncStatusIndicatorProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing, spinAnim]);

  // Update relative time display every 30 seconds
  useEffect(() => {
    if (!lastSyncedAt || isSyncing || syncError || !isOnline) return;

    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 30000);

    return () => clearInterval(interval);
  }, [lastSyncedAt, isSyncing, syncError, isOnline]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // Format last synced time
  const getLastSyncText = (): string => {
    if (!lastSyncedAt) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSyncedAt.getTime()) / 1000);

    if (diff < 10) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Show sync status: offline, error, syncing, or stale data indicator
  const isStale = lastSyncedAt && (Date.now() - lastSyncedAt.getTime()) > 300000; // 5 minutes

  // Don't show anything if online, not syncing, no error, and data is fresh
  if (isOnline && !isSyncing && !syncError && !isStale) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[
        syncStatusStyles.container,
        !isOnline && syncStatusStyles.containerOffline,
        syncError && syncStatusStyles.containerError,
        isStale && !syncError && syncStatusStyles.containerStale,
      ]}
      onPress={syncError || isStale ? onRetry : undefined}
      disabled={!syncError && !isStale}
    >
      {!isOnline ? (
        <>
          <WifiOff size={12} color="#FFA500" />
          <Text style={syncStatusStyles.offlineText}>Offline</Text>
        </>
      ) : syncError ? (
        <>
          <CloudOff size={12} color="#FF6B6B" />
          <Text style={syncStatusStyles.errorText}>Tap to retry</Text>
        </>
      ) : isSyncing ? (
        <>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <RefreshCw size={12} color="#4ECDC4" />
          </Animated.View>
          <Text style={syncStatusStyles.syncingText}>Syncing...</Text>
        </>
      ) : isStale ? (
        <>
          <Cloud size={12} color="#888888" />
          <Text style={syncStatusStyles.staleText}>{getLastSyncText()}</Text>
        </>
      ) : null}
    </TouchableOpacity>
  );
}

const syncStatusStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  containerOffline: {
    backgroundColor: "rgba(255, 165, 0, 0.15)",
  },
  containerError: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
  },
  containerStale: {
    backgroundColor: "rgba(136, 136, 136, 0.15)",
  },
  syncingText: {
    fontSize: 10,
    color: "#4ECDC4",
    fontWeight: "500",
  },
  offlineText: {
    fontSize: 10,
    color: "#FFA500",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 10,
    color: "#FF6B6B",
    fontWeight: "500",
  },
  staleText: {
    fontSize: 10,
    color: "#888888",
    fontWeight: "500",
  },
});

export default function HomeScreen() {
  const router = useRouter();
  const { user, t, saveGeneratedDragon, updateProfile, customChallengeMatchmaking } = useApp();
  const { isAuthenticated, isGuest, isLoading: isAuthLoadingRaw, profile } = useAuth();
  const { isAdmin, checkAdminStatus } = useAdmin();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAuthTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const isAuthLoading = isAuthLoadingRaw && !authTimedOut;

  // Redirect unauthenticated users to login — guest mode removed
  useEffect(() => {
    if (!isAuthLoading && isGuest) {
      router.replace("/login");
    }
  }, [isAuthLoading, isGuest, router]);
  // Subscribe directly to userStore for immediate username updates
  const userStoreUsername = useUserStore((state) => state.profile?.username);

  // Home stats from Supabase with real-time sync
  const {
    stats,
    isLoading: isStatsLoading,
    isRefreshing: isStatsRefreshing,
    syncStatus,
    lastValueChange,
    animatedValues,
    syncNow,
    refresh: refreshStats,
  } = useHomeStats();

  // Only show welcome screen on first app load, not when navigating back
  const [showWelcome, setShowWelcome] = useState(!hasShownWelcomeThisSession);
  const [showHatchingModal, setShowHatchingModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDragonUrl, setGeneratedDragonUrl] = useState<string | null>(null);
  const [showKeepOptions, setShowKeepOptions] = useState(false);
  const [challengeNotificationCount, setChallengeNotificationCount] = useState(0);
  const [activeGame, setActiveGame] = useState<{ id: string; opponentName: string; wagerTct: number } | null>(null);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [adminUnreadSupportCount, setAdminUnreadSupportCount] = useState(0);

  // Computed values from server stats (with fallback to AppContext for guests)
  const displayStats = useMemo(() => {
    if (!isAuthenticated || isGuest) {
      // Guests use local AppContext data
      return {
        username: "Guest",
        availableTct: user.walletBalance / TCT_TO_USD, // Convert USD to TCT
        eloRating: user.eloRating,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalEarnings: user.totalEarnings,
        profilePicture: user.profilePicture,
      };
    }

    // Authenticated users use server-synced stats
    // Priority for username: userStore (most up-to-date) > stats > user
    if (stats) {
      // Net earnings = won - lost, but floor at 0 (don't show negative)
      const netEarnings = Math.max(0, stats.totalWonTct - stats.totalLostTct);
      return {
        username: userStoreUsername || stats.username || user.username,
        availableTct: stats.availableTct, // Already in TCT from on-chain balance
        eloRating: stats.eloRating,
        totalWins: stats.gamesWon,
        totalLosses: stats.gamesLost,
        totalEarnings: netEarnings, // Net profit in TCT, floored at 0
        profilePicture: user.profilePicture, // Profile picture still from AppContext
      };
    }

    // Fallback to AppContext while loading
    return {
      username: userStoreUsername || user.username,
      availableTct: user.walletBalance / TCT_TO_USD, // Convert USD to TCT
      eloRating: user.eloRating,
      totalWins: user.totalWins,
      totalLosses: user.totalLosses,
      totalEarnings: user.totalEarnings,
      profilePicture: user.profilePicture,
    };
  }, [isAuthenticated, isGuest, stats, user, userStoreUsername]);

  // Get change indicator for specific field
  const getChangeIndicator = useCallback((field: ValueChangeEvent["field"]) => {
    if (lastValueChange?.field === field) {
      return lastValueChange;
    }
    return null;
  }, [lastValueChange]);

  // Load challenge notification count - refresh when screen is focused
  const loadNotificationCount = useCallback(async () => {
    if (!isAuthenticated || isGuest || !profile?.id) return;
    try {
      const challengeService = createChallengeService(profile.id);
      const count = await challengeService.getUnreadNotificationCount();
      setChallengeNotificationCount(count);
    } catch (error) {
      console.error("Error loading notification count:", error);
    }
  }, [isAuthenticated, isGuest, profile?.id]);

  // Refresh notification count when home screen is focused
  useFocusEffect(
    useCallback(() => {
      loadNotificationCount();
    }, [loadNotificationCount])
  );

  // Also poll every 30 seconds while on home screen
  useEffect(() => {
    if (isAuthenticated && !isGuest && profile?.id) {
      const interval = setInterval(loadNotificationCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, isGuest, profile?.id, loadNotificationCount]);

  // Check admin status for authenticated users
  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      checkAdminStatus();
    }
  }, [isAuthenticated, isGuest, checkAdminStatus]);

  // Load unread support ticket counts (refresh on screen focus)
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || isGuest || !profile?.id) return;
      supabase
        .rpc("get_user_unread_support_count", { p_user_id: profile.id })
        .then(({ data }) => {
          if (typeof data === "number") setUnreadSupportCount(data);
        });
      if (isAdmin) {
        supabase
          .rpc("get_admin_unread_support_count")
          .then(({ data }) => {
            if (typeof data === "number") setAdminUnreadSupportCount(data);
          });
      }
    }, [isAuthenticated, isGuest, profile?.id, isAdmin])
  );

  // Check for active games that user can rejoin
  const checkActiveGames = useCallback(async () => {
    if (!isAuthenticated || isGuest || !profile?.id) {
      setActiveGame(null);
      return;
    }

    try {
      // Query games table with STRICT conditions for truly active games
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .select(`
          id,
          status,
          result,
          end_reason,
          ended_at,
          created_at,
          wager_tct,
          white_player_id,
          black_player_id,
          white_player:profiles!games_white_player_id_fkey(username),
          black_player:profiles!games_black_player_id_fkey(username)
        `)
        .eq("status", "active")
        .is("result", null)
        .is("end_reason", null)
        .is("ended_at", null)
        .or(`white_player_id.eq.${profile.id},black_player_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (gameError || !gameData) {
        setActiveGame(null);
        return;
      }

      // Check if game was created recently (within last 10 minutes) or has moves
      // This ensures we show rejoin for fresh games AND games in progress
      const { count: moveCount } = await supabase
        .from("game_moves")
        .select("*", { count: "exact", head: true })
        .eq("game_id", gameData.id);

      const gameAge = Date.now() - new Date(gameData.created_at || 0).getTime();
      const isRecent = gameAge < 10 * 60 * 1000; // 10 minutes

      if ((moveCount === null || moveCount === 0) && !isRecent) {
        // No moves AND old = zombie game
        console.log("[Home] Game has no moves and is old, not showing rejoin banner");
        setActiveGame(null);
        return;
      }

      // Game is active - show rejoin banner
      const isWhite = gameData.white_player_id === profile.id;
      const opponentName = isWhite
        ? (gameData.black_player as any)?.username || "Opponent"
        : (gameData.white_player as any)?.username || "Opponent";

      console.log("[Home] Found active game with", moveCount, "moves:", gameData.id);

      setActiveGame({
        id: gameData.id,
        opponentName,
        wagerTct: gameData.wager_tct || 0,
      });
    } catch (err) {
      console.error("[Home] Active game check error:", err);
      setActiveGame(null);
    }
  }, [isAuthenticated, isGuest, profile?.id]);

  // Run active game check when screen focuses
  useFocusEffect(
    useCallback(() => {
      checkActiveGames();
    }, [checkActiveGames])
  );

  // Helper to check if feature requires auth and redirect if needed
  const requiresAuth = (route: string) => {
    if (!isAuthenticated || isGuest) {
      router.push(route as any);
      return false;
    }
    return true;
  };

  const handleEggClick = async () => {
    if (user.profilePicture !== DRAGON_EGG_IMAGE) {
      return;
    }

    setShowHatchingModal(true);
    setIsGenerating(true);
    setShowKeepOptions(false);
    setGeneratedDragonUrl(null);

    console.log("Starting dragon generation...");

    try {
      console.log("Sending request to image generation API...");
      const response = await fetch("https://toolkit.rork.com/images/generate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "multicoloured baby cartoon dragon on a black background",
          size: "1024x1024",
        }),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", JSON.stringify([...response.headers]));

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      console.log("Raw response (first 500 chars):", responseText.substring(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        console.error("Failed to parse response:", responseText.substring(0, 200));
        throw new Error("Invalid JSON response from server");
      }

      console.log("Parsed data keys:", Object.keys(data));
      console.log("Full response structure:", JSON.stringify(data, null, 2).substring(0, 500));

      if (!data || typeof data !== 'object') {
        console.error("Response is not an object:", typeof data);
        throw new Error("Invalid response format");
      }

      if (!data.image) {
        console.error("Missing 'image' property. Available keys:", Object.keys(data));
        throw new Error("Response missing image data");
      }

      if (!data.image.base64) {
        console.error("Missing 'base64' in image. Image keys:", Object.keys(data.image));
        throw new Error("Response missing base64");
      }

      if (!data.image.mimeType) {
        console.error("Missing 'mimeType' in image. Image keys:", Object.keys(data.image));
        throw new Error("Response missing mimeType");
      }

      console.log("base64 length:", data.image.base64.length);
      console.log("mimeType:", data.image.mimeType);

      const dragonUrl = `data:${data.image.mimeType};base64,${data.image.base64}`;
      console.log("Successfully created data URL, length:", dragonUrl.length);

      setGeneratedDragonUrl(dragonUrl);
      setShowKeepOptions(true);
    } catch (error) {
      console.error("Dragon generation error:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      Alert.alert(
        "Hatching Failed",
        `Failed to hatch your dragon: ${errorMessage}`,
        [{ text: "OK", onPress: () => setShowHatchingModal(false) }]
      );
      setShowHatchingModal(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeepDragon = async () => {
    if (generatedDragonUrl) {
      await saveGeneratedDragon(generatedDragonUrl);
      updateProfile({ profilePicture: generatedDragonUrl });

      // Also save to Supabase so other users can see it on leaderboard
      if (profile?.id) {
        try {
          await supabase
            .from("profiles")
            .update({ profile_picture_url: generatedDragonUrl })
            .eq("id", profile.id);
          console.log("[Index] Saved dragon to Supabase profile_picture_url");
        } catch (e) {
          console.warn("[Index] Failed to save dragon to Supabase:", e);
        }
      }

      setShowHatchingModal(false);
      setGeneratedDragonUrl(null);
      setShowKeepOptions(false);
    }
  };

  const handleSeeMore = () => {
    if (generatedDragonUrl) {
      saveGeneratedDragon(generatedDragonUrl);
    }
    setShowHatchingModal(false);
    setGeneratedDragonUrl(null);
    setShowKeepOptions(false);
    router.push("/settings" as any);
  };

  if (showWelcome) {
    return <WelcomeScreen onComplete={() => {
      hasShownWelcomeThisSession = true;
      setShowWelcome(false);
    }} />;
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: "Join me on Treasure Chess! Compete in high-stakes chess matches and win real money. Download now and use my referral code for bonus starting credits!",
        title: "Join Treasure Chess",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const menuItems = [
    {
      title: t("playNow"),
      subtitle: t("quickMatch"),
      icon: Swords,
      gradient: ["#FFD700", "#FFA500"] as [string, string],
      route: "/play-now" as const,
      disabled: customChallengeMatchmaking.isWaiting,
    },
    {
      title: t("practice"),
      subtitle: t("practiceMode"),
      icon: Target,
      gradient: ["#4ECDC4", "#44A08D"] as [string, string],
      route: "/practice" as const,
    },
    {
      title: t("tournaments"),
      subtitle: t("prizePool"),
      icon: Award,
      gradient: ["#A770EF", "#CF8BF3"] as [string, string],
      route: "/tournaments" as const,
    },
    {
      title: t("challengeBoard"),
      subtitle: t("peerToPeer"),
      icon: Trophy,
      gradient: ["#F093FB", "#F5576C"] as [string, string],
      route: "/challenge-board" as const,
      badge: challengeNotificationCount > 0 ? challengeNotificationCount : undefined,
    },
    {
      title: "Challenge\na Friend",
      subtitle: "Find & challenge a player",
      icon: UserSearch,
      gradient: ["#4ECDC4", "#44A08D"] as [string, string],
      route: "/challenge-board" as const,
      routeParams: { openFriendSearch: "true" },
    },
    {
      title: t("leaderboard"),
      subtitle: t("rank"),
      icon: Users,
      gradient: ["#4A90E2", "#357ABD"] as [string, string],
      route: "/leaderboard" as const,
    },
    {
      title: t("livestream"),
      subtitle: t("watchLive"),
      icon: Video,
      gradient: ["#FF6B6B", "#EE5A6F"] as [string, string],
      route: "/livestream" as const,
    },
    {
      title: t("rewards"),
      subtitle: t("dailyRewards"),
      icon: Gift,
      gradient: ["#FFA500", "#FF6347"] as [string, string],
      route: "/rewards" as const,
    },
    // Admin Panel - only visible to admin users
    ...(isAdmin
      ? [
          {
            title: "Admin Panel",
            subtitle: "Manage platform",
            icon: Shield,
            gradient: ["#FF453A", "#FF6B6B"] as [string, string],
            route: "/admin" as const,
            badge: adminUnreadSupportCount > 0 ? adminUnreadSupportCount : undefined,
          },
        ]
      : []),
  ];

  // Show loading screen while auth initializes to prevent flash
  if (isAuthLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={[styles.gradient, { justifyContent: "center", alignItems: "center" }]}>
          <ActivityIndicator size="large" color="#FFD700" />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <MatchmakingBanner />
          {/* Active Game Rejoin Banner */}
          {activeGame && (
            <TouchableOpacity
              style={styles.activeGameBanner}
              onPress={() => router.push({ pathname: "/online-game", params: { gameId: activeGame.id } })}
            >
              <View style={styles.activeGameContent}>
                <View style={styles.activeGameText}>
                  <Text style={styles.activeGameTitle}>Game in Progress</Text>
                  <Text style={styles.activeGameSubtitle}>
                    vs {activeGame.opponentName} • {activeGame.wagerTct > 0 ? `${activeGame.wagerTct} TCT` : "Practice"}
                  </Text>
                </View>
                <Text style={styles.activeGameAction}>Rejoin →</Text>
              </View>
            </TouchableOpacity>
          )}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <TouchableOpacity onPress={handleEggClick} disabled={displayStats.profilePicture !== DRAGON_EGG_IMAGE}>
                <Image
                  source={{ uri: displayStats.profilePicture }}
                  style={styles.profilePic}
                />
              </TouchableOpacity>
              <View>
                <View style={styles.usernameRow}>
                  <Text style={styles.username}>
                    {displayStats.username}
                  </Text>
                  {isAuthenticated && !isGuest && (
                    <SyncStatusIndicator
                      isSyncing={syncStatus.isSyncing}
                      isOnline={syncStatus.isOnline}
                      lastSyncedAt={syncStatus.lastSyncedAt}
                      syncError={syncStatus.syncError}
                      onRetry={syncNow}
                    />
                  )}
                </View>
                {isAuthenticated && !isGuest ? (
                  <>
                    <View style={styles.balanceContainer}>
                      <Text style={styles.balanceLabel}>{t("balance")}: </Text>
                      <Image
                        source={{ uri: TCT_SYMBOL_IMAGE }}
                        style={styles.tctSymbol}
                      />
                      {isStatsLoading && !stats ? (
                        <View style={styles.headerSkeleton} />
                      ) : animatedValues ? (
                        <AnimatedNumber
                          animatedValue={animatedValues.availableTct}
                          style={styles.balance}
                          formatter={(value) => formatTCTBalance(value)}
                          changeIndicator={getChangeIndicator("availableTct")}
                        />
                      ) : (
                        <Text style={styles.balance}>{formatTCTBalance(displayStats.availableTct)}</Text>
                      )}
                    </View>
                    <View style={styles.eloContainer}>
                      <Text style={styles.eloLabel}>ELO Score: </Text>
                      {isStatsLoading && !stats ? (
                        <View style={styles.headerSkeletonSmall} />
                      ) : animatedValues ? (
                        <AnimatedNumber
                          animatedValue={animatedValues.eloRating}
                          style={styles.eloValue}
                          changeIndicator={getChangeIndicator("eloRating")}
                        />
                      ) : (
                        <Text style={styles.eloValue}>{displayStats.eloRating}</Text>
                      )}
                    </View>
                  </>
                ) : (
                  <TouchableOpacity onPress={() => router.push("/login" as any)}>
                    <Text style={styles.guestLoginText}>Sign in to play online</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={styles.headerButtons}>
              {isAuthenticated && !isGuest ? (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => router.push("/wallet" as any)}
                >
                  <Wallet size={24} color="#FFD700" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.iconButton, styles.loginButton]}
                  onPress={() => router.push("/login" as any)}
                >
                  <LogIn size={24} color="#FFD700" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleShare}
              >
                <Share2 size={24} color="#FFD700" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => router.push("/settings" as any)}
              >
                <Settings size={24} color="#FFD700" />
                {unreadSupportCount > 0 && (
                  <View style={styles.settingsBadgeDot} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.content}>
            <ScrollView
              style={styles.menuScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.menuContainer}
              refreshControl={
                isAuthenticated && !isGuest ? (
                  <RefreshControl
                    refreshing={isStatsRefreshing}
                    onRefresh={refreshStats}
                    tintColor="#FFD700"
                    colors={["#FFD700"]}
                    progressBackgroundColor="#1A1A2E"
                  />
                ) : undefined
              }
            >
              <View style={styles.titleContainer}>
                <Text style={styles.title}>TREASURE CHESS</Text>
                <Text style={styles.subtitle}>playtreasurechess.com</Text>
              </View>

              {menuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.card, item.disabled && styles.cardDisabled]}
                    onPress={() => {
                      if (item.disabled) return;
                      if ((item as any).routeParams) {
                        router.push({ pathname: item.route as any, params: (item as any).routeParams });
                      } else {
                        router.push(item.route as any);
                      }
                    }}
                    activeOpacity={0.8}
                    disabled={item.disabled}
                  >
                    <LinearGradient
                      colors={item.gradient}
                      style={styles.cardGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.cardContent}>
                        <View style={styles.iconContainer}>
                          <Icon size={28} color="#FFFFFF" strokeWidth={2.5} />
                          {item.badge && (
                            <View style={styles.notificationBadge}>
                              <Text style={styles.notificationBadgeText}>
                                {item.badge > 99 ? "99+" : item.badge}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.textContainer}>
                          <Text style={styles.cardTitle}>{item.title}</Text>
                          <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                {isAuthenticated && !isGuest && animatedValues ? (
                  <AnimatedNumber
                    animatedValue={animatedValues.gamesWon}
                    style={styles.statValue}
                    changeIndicator={getChangeIndicator("gamesWon")}
                  />
                ) : (
                  <Text style={styles.statValue}>{displayStats.totalWins}</Text>
                )}
                <Text style={styles.statLabel}>{t("wins")}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                {isAuthenticated && !isGuest && animatedValues ? (
                  <AnimatedNumber
                    animatedValue={animatedValues.gamesLost}
                    style={styles.statValue}
                    changeIndicator={getChangeIndicator("gamesLost")}
                  />
                ) : (
                  <Text style={styles.statValue}>{displayStats.totalLosses}</Text>
                )}
                <Text style={styles.statLabel}>{t("losses")}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <View style={styles.earningsValueContainer}>
                  <Image
                    source={{ uri: TCT_SYMBOL_IMAGE }}
                    style={styles.earningsTctSymbol}
                  />
                  <Text style={styles.statValue}>
                    {formatTCTBalance(displayStats.totalEarnings)}
                  </Text>
                </View>
                <Text style={styles.statLabel}>{t("earnings")}</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <Modal
        visible={showHatchingModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {}}
      >
        <View style={hatchingStyles.modalOverlay}>
          <View style={hatchingStyles.modalContent}>
            {isGenerating ? (
              <>
                <Image
                  source={{ uri: DRAGON_EGG_IMAGE }}
                  style={hatchingStyles.eggImage}
                />
                <Text style={hatchingStyles.hatchingText}>
                  Your baby dragon is hatching...
                </Text>
                <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 20 }} />
              </>
            ) : showKeepOptions && generatedDragonUrl ? (
              <>
                <Image
                  source={{ uri: generatedDragonUrl }}
                  style={hatchingStyles.dragonImage}
                />
                <Text style={hatchingStyles.congratsText}>
                  Your dragon has hatched!
                </Text>
                <View style={hatchingStyles.buttonContainer}>
                  <TouchableOpacity
                    style={hatchingStyles.keepButton}
                    onPress={handleKeepDragon}
                  >
                    <LinearGradient
                      colors={["#FFD700", "#FFA500"]}
                      style={hatchingStyles.buttonGradient}
                    >
                      <Text style={hatchingStyles.buttonText}>Keep My Dragon</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={hatchingStyles.seeMoreButton}
                    onPress={handleSeeMore}
                  >
                    <Text style={hatchingStyles.seeMoreText}>See More</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  activeGameBanner: {
    backgroundColor: "#FFD700",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeGameContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  activeGameText: {
    flexDirection: "column",
  },
  activeGameTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  activeGameSubtitle: {
    fontSize: 13,
    color: "#333",
  },
  activeGameAction: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profilePic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  username: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  balanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  tctSymbol: {
    width: 16,
    height: 16,
    marginRight: 4,
  },
  balance: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  eloContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  eloLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  eloValue: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  headerSkeleton: {
    width: 50,
    height: 14,
    borderRadius: 4,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  headerSkeletonSmall: {
    width: 35,
    height: 12,
    borderRadius: 4,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsBadgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF453A",
    borderWidth: 2,
    borderColor: "#0F0F1E",
  },
  loginButton: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderWidth: 1,
    borderColor: "#4ECDC4",
  },
  guestLoginText: {
    fontSize: 12,
    color: "#4ECDC4",
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  titleContainer: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 1,
  },

  subtitle: {
    fontSize: 16,
    color: "#FFD700",
    marginTop: 4,
    fontWeight: "500" as const,
  },
  menuScrollView: {
    flex: 1,
    marginBottom: 20,
  },
  menuContainer: {
    gap: 12,
    paddingBottom: 12,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardGradient: {
    padding: 18,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative" as const,
  },
  notificationBadge: {
    position: "absolute" as const,
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
    textTransform: "uppercase" as const,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  earningsValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  earningsTctSymbol: {
    width: 24,
    height: 24,
  },
  cardDisabled: {
    opacity: 0.5,
  },
});

const hatchingStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    alignItems: "center",
    gap: 24,
  },
  eggImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  hatchingText: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  dragonImage: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 4,
    borderColor: "#FFD700",
  },
  congratsText: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: "#FFD700",
    textAlign: "center",
  },
  buttonContainer: {
    width: "100%",
    gap: 16,
    marginTop: 20,
  },
  keepButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  buttonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  seeMoreButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#FFD700",
    alignItems: "center",
  },
  seeMoreText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
});
