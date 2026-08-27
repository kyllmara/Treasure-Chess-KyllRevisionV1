import { useRouter } from "expo-router";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import { useFocusEffect } from "@react-navigation/native";
import {
  Swords,
  Target,
  Award,
  Trophy,
  UserSearch,
  Users,
  Video,
  Gift,
  Shield,
  Share2,
  LogIn,
  RefreshCw,
  WifiOff,
  Cloud,
  CloudOff,
  ChevronRight,
  Zap,
  User,
} from "lucide-react-native";
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
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/contexts/AppContext";
import { MatchmakingBanner } from "@/components/MatchmakingBanner";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useHomeStats, type ValueChangeEvent } from "@/hooks/useHomeStats";
import { useUserStore } from "@/stores/userStore";
import { createChallengeService } from "@/lib/challenges";
import { Colors, FontFamily, Spacing, BorderRadius, Shadows } from "@/constants/theme";

const { width } = Dimensions.get("window");

const TCT_SYMBOL_IMAGE =
  "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/5u9rwf8nf5781rk1dz2oc";

const TCT_TO_USD = 0.04;


let hasShownWelcomeThisSession = false;

function formatTCTBalance(tctBalance: number): string {
  if (tctBalance >= 1000000) return `${(tctBalance / 1000000).toFixed(1)}m`;
  if (tctBalance >= 1000) return `${(tctBalance / 1000).toFixed(1)}k`;
  return tctBalance.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ============================================================================
// Welcome splash — clean geometric logo animation
// ============================================================================

function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.75)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.timing(ringAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 450, useNativeDriver: true }).start(onComplete);
      }, 1100);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.18] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.25, 0] });

  return (
    <Animated.View style={[welcomeStyles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Animated.View style={[welcomeStyles.logoWrap, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Expanding ring pulse */}
        <Animated.View
          style={[
            welcomeStyles.ring,
            { opacity: ringOpacity, transform: [{ scale: ringScale }] },
          ]}
        />
        {/* Gold coin mark */}
        <View style={welcomeStyles.coin}>
          <Text style={welcomeStyles.coinText}>TC</Text>
        </View>
        <Text style={welcomeStyles.wordmark}>TREASURE CHESS</Text>
      </Animated.View>
    </Animated.View>
  );
}

const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: { alignItems: "center", gap: 20 },
  ring: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  coin: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  coinText: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 32,
    color: Colors.onPrimary,
    letterSpacing: -1,
  },
  wordmark: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 11,
    letterSpacing: 4,
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
});

// ============================================================================
// Animated number (unchanged)
// ============================================================================

interface AnimatedNumberProps {
  animatedValue: Animated.Value;
  style?: any;
  prefix?: string;
  suffix?: string;
  formatter?: (value: number) => string;
  changeIndicator?: ValueChangeEvent | null;
}

function AnimatedNumber({ animatedValue, style, prefix = "", suffix = "", formatter, changeIndicator }: AnimatedNumberProps) {
  const getVal = () => Math.round((animatedValue as any)._value ?? 0);
  const [displayValue, setDisplayValue] = useState(getVal);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const changeOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setDisplayValue(getVal());
    const id = animatedValue.addListener(({ value }) => setDisplayValue(Math.round(value)));
    return () => animatedValue.removeListener(id);
  }, [animatedValue]);

  useEffect(() => {
    if (!changeIndicator) return;
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 150, useNativeDriver: true }),
      Animated.spring(pulseAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(changeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(changeOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [changeIndicator, pulseAnim, changeOpacity]);

  const formatted = formatter ? formatter(displayValue) : displayValue.toString();
  const change = changeIndicator?.change ?? 0;
  const isPos = change > 0;

  return (
    <View style={anStyles.container}>
      <Animated.Text style={[style, { transform: [{ scale: pulseAnim }] }]}>
        {prefix}{formatted}{suffix}
      </Animated.Text>
      {changeIndicator && (
        <Animated.View style={[anStyles.chip, { opacity: changeOpacity }]}>
          <Text style={[anStyles.chipText, isPos ? anStyles.pos : anStyles.neg]}>
            {isPos ? "+" : ""}{change}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const anStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
  chip: { marginLeft: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.pill, backgroundColor: Colors.surfaceElevated },
  chipText: { fontSize: 12, fontFamily: FontFamily.interBold },
  pos: { color: Colors.positive },
  neg: { color: Colors.negative },
});

// ============================================================================
// Sync status indicator (unchanged logic, restyled)
// ============================================================================

interface SyncStatusProps {
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncedAt: Date | null;
  syncError: string | null;
  onRetry?: () => void;
}

function SyncStatusIndicator({ isSyncing, isOnline, lastSyncedAt, syncError, onRetry }: SyncStatusProps) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing, spinAnim]);

  useEffect(() => {
    if (!lastSyncedAt || isSyncing || syncError || !isOnline) return;
    const id = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [lastSyncedAt, isSyncing, syncError, isOnline]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const getRelativeTime = (): string => {
    if (!lastSyncedAt) return "";
    const diff = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
    if (diff < 10) return "Just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isStale = lastSyncedAt && Date.now() - lastSyncedAt.getTime() > 300000;
  if (isOnline && !isSyncing && !syncError && !isStale) return null;

  return (
    <TouchableOpacity
      style={[
        syncStyles.pill,
        !isOnline && syncStyles.offline,
        !!syncError && syncStyles.error,
        !!(isStale && !syncError) && syncStyles.stale,
      ]}
      onPress={syncError || isStale ? onRetry : undefined}
      disabled={!syncError && !isStale}
    >
      {!isOnline ? (
        <><WifiOff size={10} color={Colors.primary} /><Text style={[syncStyles.text, { color: Colors.primary }]}>Offline</Text></>
      ) : syncError ? (
        <><CloudOff size={10} color={Colors.negative} /><Text style={[syncStyles.text, { color: Colors.negative }]}>Retry</Text></>
      ) : isSyncing ? (
        <><Animated.View style={{ transform: [{ rotate: spin }] }}><RefreshCw size={10} color={Colors.positive} /></Animated.View><Text style={[syncStyles.text, { color: Colors.positive }]}>Syncing</Text></>
      ) : isStale ? (
        <><Cloud size={10} color={Colors.textMuted} /><Text style={[syncStyles.text, { color: Colors.textMuted }]}>{getRelativeTime()}</Text></>
      ) : null}
    </TouchableOpacity>
  );
}

const syncStyles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.pill, backgroundColor: `${Colors.positive}20` },
  offline: { backgroundColor: `${Colors.primary}26` },
  error:   { backgroundColor: `${Colors.negative}20` },
  stale:   { backgroundColor: `${Colors.textMuted}26` },
  text:    { fontFamily: FontFamily.interMedium, fontSize: 10 },
});

// ============================================================================
// Home screen
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, t, customChallengeMatchmaking } = useApp();
  const { isAuthenticated, isGuest, isLoading: isAuthLoadingRaw, profile } = useAuth();
  const { isAdmin, checkAdminStatus } = useAdmin();

  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAuthTimedOut(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  const isAuthLoading = isAuthLoadingRaw && !authTimedOut;

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return; // ⚠️ TESTING ONLY — flip DEV_BYPASS_AUTH in constants/devFlags.ts to re-enable
    if (!isAuthLoading && isGuest) router.replace("/login");
  }, [isAuthLoading, isGuest, router]);

  const userStoreUsername = useUserStore((state) => state.profile?.username);

  const { stats, isLoading: isStatsLoading, isRefreshing: isStatsRefreshing, syncStatus, lastValueChange, animatedValues, syncNow, refresh: refreshStats } = useHomeStats();

  const [showWelcome, setShowWelcome] = useState(!hasShownWelcomeThisSession);
  const [challengeNotificationCount, setChallengeNotificationCount] = useState(0);
  const [activeGame, setActiveGame] = useState<{ id: string; opponentName: string; wagerTct: number } | null>(null);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [adminUnreadSupportCount, setAdminUnreadSupportCount] = useState(0);

  // Derived stats
  const displayStats = useMemo(() => {
    if (!isAuthenticated || isGuest) {
      return {
        username: "Guest",
        availableTct: user.walletBalance / TCT_TO_USD,
        eloRating: user.eloRating,
        totalWins: user.totalWins,
        totalLosses: user.totalLosses,
        totalEarnings: user.totalEarnings,
        profilePicture: user.profilePicture,
      };
    }
    if (stats) {
      return {
        username: userStoreUsername || stats.username || user.username,
        availableTct: stats.availableTct,
        eloRating: stats.eloRating,
        totalWins: stats.gamesWon,
        totalLosses: stats.gamesLost,
        totalEarnings: Math.max(0, stats.totalWonTct - stats.totalLostTct),
        profilePicture: user.profilePicture,
      };
    }
    return {
      username: userStoreUsername || user.username,
      availableTct: user.walletBalance / TCT_TO_USD,
      eloRating: user.eloRating,
      totalWins: user.totalWins,
      totalLosses: user.totalLosses,
      totalEarnings: user.totalEarnings,
      profilePicture: user.profilePicture,
    };
  }, [isAuthenticated, isGuest, stats, user, userStoreUsername]);

  const getChangeIndicator = useCallback(
    (field: ValueChangeEvent["field"]) => (lastValueChange?.field === field ? lastValueChange : null),
    [lastValueChange]
  );

  // Load challenge notification count
  const loadNotificationCount = useCallback(async () => {
    if (!isAuthenticated || isGuest || !profile?.id) return;
    try {
      const svc = createChallengeService(profile.id);
      const count = await svc.getUnreadNotificationCount();
      setChallengeNotificationCount(count);
    } catch {}
  }, [isAuthenticated, isGuest, profile?.id]);

  useFocusEffect(useCallback(() => { loadNotificationCount(); }, [loadNotificationCount]));

  useEffect(() => {
    if (isAuthenticated && !isGuest && profile?.id) {
      const id = setInterval(loadNotificationCount, 30000);
      return () => clearInterval(id);
    }
  }, [isAuthenticated, isGuest, profile?.id, loadNotificationCount]);

  useEffect(() => {
    if (isAuthenticated && !isGuest) checkAdminStatus();
  }, [isAuthenticated, isGuest, checkAdminStatus]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || isGuest || !profile?.id) return;
      supabase.rpc("get_user_unread_support_count", { p_user_id: profile.id }).then(({ data }) => {
        if (typeof data === "number") setUnreadSupportCount(data);
      });
      if (isAdmin) {
        supabase.rpc("get_admin_unread_support_count").then(({ data }) => {
          if (typeof data === "number") setAdminUnreadSupportCount(data);
        });
      }
    }, [isAuthenticated, isGuest, profile?.id, isAdmin])
  );

  // Active game check
  const checkActiveGames = useCallback(async () => {
    if (!isAuthenticated || isGuest || !profile?.id) { setActiveGame(null); return; }
    try {
      const { data, error } = await supabase
        .from("games")
        .select(`id, status, result, end_reason, ended_at, created_at, wager_tct, white_player_id, black_player_id, white_player:profiles!games_white_player_id_fkey(username), black_player:profiles!games_black_player_id_fkey(username)`)
        .eq("status", "active")
        .is("result", null)
        .is("end_reason", null)
        .is("ended_at", null)
        .or(`white_player_id.eq.${profile.id},black_player_id.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) { setActiveGame(null); return; }

      const { count: moveCount } = await supabase
        .from("game_moves")
        .select("*", { count: "exact", head: true })
        .eq("game_id", data.id);

      const isRecent = Date.now() - new Date(data.created_at || 0).getTime() < 10 * 60 * 1000;
      if ((moveCount === null || moveCount === 0) && !isRecent) { setActiveGame(null); return; }

      const isWhite = data.white_player_id === profile.id;
      const opponentName = isWhite
        ? (data.black_player as any)?.username || "Opponent"
        : (data.white_player as any)?.username || "Opponent";

      setActiveGame({ id: data.id, opponentName, wagerTct: data.wager_tct || 0 });
    } catch {
      setActiveGame(null);
    }
  }, [isAuthenticated, isGuest, profile?.id]);

  useFocusEffect(useCallback(() => { checkActiveGames(); }, [checkActiveGames]));

  const handleShare = async () => {
    try {
      await Share.share({
        message: "Join me on Treasure Chess! Compete in high-stakes chess matches and win real money. Download now and use my referral code for bonus starting credits!",
        title: "Join Treasure Chess",
      });
    } catch {}
  };

  // ── Early returns ─────────────────────────────────────────────────────────

  if (showWelcome) {
    return (
      <WelcomeScreen
        onComplete={() => { hasShownWelcomeThisSession = true; setShowWelcome(false); }}
      />
    );
  }

  if (isAuthLoading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoggedIn = isAuthenticated && !isGuest;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isLoggedIn ? (
            <RefreshControl
              refreshing={isStatsRefreshing}
              onRefresh={refreshStats}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          ) : undefined
        }
      >
        {/* ── Matchmaking banner (existing component) ──────────────────── */}
        <MatchmakingBanner />

        {/* ── Header card ─────────────────────────────────────────────── */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            {/* Avatar */}
            {displayStats.profilePicture ? (
              <Image
                source={{ uri: displayStats.profilePicture }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={24} color={Colors.primary} />
              </View>
            )}

            {/* Identity */}
            <View style={styles.identityBlock}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <View style={styles.usernameRow}>
                <Text style={styles.username} numberOfLines={1}>
                  {displayStats.username}
                </Text>
                {isLoggedIn && (
                  <SyncStatusIndicator
                    isSyncing={syncStatus.isSyncing}
                    isOnline={syncStatus.isOnline}
                    lastSyncedAt={syncStatus.lastSyncedAt}
                    syncError={syncStatus.syncError}
                    onRetry={syncNow}
                  />
                )}
              </View>
              {isLoggedIn ? (
                <Text style={styles.eloLabel}>
                  ELO{" "}
                  <Text style={styles.eloValue}>{displayStats.eloRating}</Text>
                </Text>
              ) : (
                <TouchableOpacity onPress={() => router.push("/login" as any)}>
                  <Text style={styles.signInPrompt}>Sign in to play online →</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Header action buttons */}
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerBtn} onPress={handleShare} activeOpacity={0.75}>
                <Share2 size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
              {!isLoggedIn && (
                <TouchableOpacity
                  style={[styles.headerBtn, styles.loginBtn]}
                  onPress={() => router.push("/login" as any)}
                  activeOpacity={0.75}
                >
                  <LogIn size={18} color={Colors.positive} />
                </TouchableOpacity>
              )}
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.headerBtn, styles.adminBtn]}
                  onPress={() => router.push("/admin" as any)}
                  activeOpacity={0.75}
                >
                  <Shield size={18} color={Colors.negative} />
                  {adminUnreadSupportCount > 0 && <View style={styles.btnDot} />}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Balance pill */}
          {isLoggedIn && (
            <TouchableOpacity
              style={styles.balancePill}
              onPress={() => router.push("/wallet" as any)}
              activeOpacity={0.8}
            >
              <Image source={{ uri: TCT_SYMBOL_IMAGE }} style={styles.tctSymbol} />
              {isStatsLoading && !stats ? (
                <View style={styles.balanceSkeleton} />
              ) : animatedValues ? (
                <AnimatedNumber
                  animatedValue={animatedValues.availableTct}
                  style={styles.balanceText}
                  formatter={formatTCTBalance}
                  changeIndicator={getChangeIndicator("availableTct")}
                />
              ) : (
                <Text style={styles.balanceText}>{formatTCTBalance(displayStats.availableTct)}</Text>
              )}
              <Text style={styles.balanceCurrency}>TCT</Text>
              <ChevronRight size={14} color={Colors.textMuted} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Active game rejoin banner ────────────────────────────────── */}
        {activeGame && (
          <TouchableOpacity
            style={styles.activeGameBanner}
            onPress={() => router.push({ pathname: "/online-game", params: { gameId: activeGame.id } })}
            activeOpacity={0.85}
          >
            <View style={styles.activeGamePulse} />
            <View style={styles.activeGameBody}>
              <Text style={styles.activeGameTitle}>Game in Progress</Text>
              <Text style={styles.activeGameSub}>
                vs {activeGame.opponentName}
                {activeGame.wagerTct > 0 ? ` · ${activeGame.wagerTct} TCT` : " · Practice"}
              </Text>
            </View>
            <Text style={styles.activeGameCta}>Rejoin →</Text>
          </TouchableOpacity>
        )}

        {/* ── Play Now hero ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.heroBtn, customChallengeMatchmaking.isWaiting && styles.heroBtnDisabled]}
          onPress={() => { if (!customChallengeMatchmaking.isWaiting) router.push("/play-now"); }}
          activeOpacity={0.88}
          disabled={customChallengeMatchmaking.isWaiting}
        >
          <View style={styles.heroBtnGradient}>
            {customChallengeMatchmaking.isWaiting ? (
              <>
                <ActivityIndicator size="small" color={Colors.onPrimary} />
                <Text style={styles.heroBtnText}>Searching…</Text>
              </>
            ) : (
              <>
                <Swords size={22} color={Colors.onPrimary} strokeWidth={2.5} />
                <View>
                  <Text style={styles.heroBtnText}>Play Now</Text>
                  <Text style={styles.heroBtnSub}>Quick matchmaking</Text>
                </View>
              </>
            )}
            <View style={styles.heroBtnArrow}>
              <Zap size={20} color={Colors.onPrimary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── Game modes 2×2 grid ──────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Game Modes</Text>
        <View style={styles.grid}>
          <ModeCard
            icon={<Target size={24} color={`${Colors.primary}CC`} />}
            iconBg={`${Colors.primary}1A`}
            title="Practice"
            subtitle="Solo training"
            onPress={() => router.push("/practice")}
          />
          <ModeCard
            icon={<Award size={24} color={`${Colors.primary}CC`} />}
            iconBg={`${Colors.primary}1A`}
            title="Tournaments"
            subtitle="Prize pools"
            onPress={() => router.push("/tournaments")}
          />
          <ModeCard
            icon={<Trophy size={24} color={`${Colors.primary}CC`} />}
            iconBg={`${Colors.primary}1A`}
            title="Challenges"
            subtitle="Peer-to-peer"
            onPress={() => router.push("/challenge-board")}
            badge={challengeNotificationCount}
          />
          <ModeCard
            icon={<UserSearch size={24} color={`${Colors.primary}CC`} />}
            iconBg={`${Colors.primary}1A`}
            title="vs Friend"
            subtitle="Find a player"
            onPress={() => router.push({ pathname: "/challenge-board" as any, params: { openFriendSearch: "true" } })}
          />
        </View>

        {/* ── Explore row ──────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Explore</Text>
        <View style={styles.exploreRow}>
          <ExploreChip
            icon={<Users size={16} color={Colors.textSecondary} />}
            label="Leaderboard"
            onPress={() => router.push("/leaderboard")}
          />
          <ExploreChip
            icon={<Video size={16} color={Colors.textSecondary} />}
            label="Livestream"
            onPress={() => router.push("/livestream")}
          />
          <ExploreChip
            icon={<Gift size={16} color={Colors.textSecondary} />}
            label="Rewards"
            onPress={() => router.push("/rewards")}
          />
        </View>

        {/* ── Stats bar ────────────────────────────────────────────────── */}
        {isLoggedIn && (
          <View style={styles.statsCard}>
            <StatCell
              label={t("wins")}
              animated={animatedValues ? { value: animatedValues.gamesWon, indicator: getChangeIndicator("gamesWon") } : null}
              fallback={displayStats.totalWins}
            />
            <View style={styles.statsDivider} />
            <StatCell
              label={t("losses")}
              animated={animatedValues ? { value: animatedValues.gamesLost, indicator: getChangeIndicator("gamesLost") } : null}
              fallback={displayStats.totalLosses}
            />
            <View style={styles.statsDivider} />
            <View style={styles.statCell}>
              <View style={styles.earningsRow}>
                <Image source={{ uri: TCT_SYMBOL_IMAGE }} style={styles.earningsTct} />
                <Text style={styles.statValue}>{formatTCTBalance(displayStats.totalEarnings)}</Text>
              </View>
              <Text style={styles.statLabel}>{t("earnings")}</Text>
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ModeCard({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
  badge,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <TouchableOpacity style={styles.modeCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.modeIconWrap, { backgroundColor: iconBg }]}>
        {icon}
        {badge != null && badge > 0 && (
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function ExploreChip({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.exploreChip} onPress={onPress} activeOpacity={0.75}>
      {icon}
      <Text style={styles.exploreLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatCell({
  label,
  animated,
  fallback,
}: {
  label: string;
  animated: { value: Animated.Value; indicator: ValueChangeEvent | null } | null;
  fallback: number;
}) {
  return (
    <View style={styles.statCell}>
      {animated ? (
        <AnimatedNumber
          animatedValue={animated.value}
          style={styles.statValue}
          changeIndicator={animated.indicator}
        />
      ) : (
        <Text style={styles.statValue}>{fallback}</Text>
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const CARD_HALF = (width - Spacing.lg * 2 - Spacing.md) / 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },

  // ── Header card ──────────────────────────────────────────────────────────
  headerCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    overflow: "hidden",
    gap: Spacing.md,
    ...Shadows.medium,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  identityBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
  greeting: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  username: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 17,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  eloLabel: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  eloValue: {
    fontFamily: FontFamily.interSemiBold,
    color: Colors.primary,
  },
  signInPrompt: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Colors.positive,
    marginTop: Spacing.xs,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: `${Colors.positive}50`,
  },
  adminBtn: {
    borderWidth: 1,
    borderColor: `${Colors.negative}50`,
  },
  btnDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.negative,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },

  // Balance pill
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tctSymbol: { width: 16, height: 16 },
  balanceText: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 15,
    color: Colors.primary,
  },
  balanceCurrency: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  balanceSkeleton: {
    width: 44,
    height: 14,
    borderRadius: 4,
    backgroundColor: `${Colors.primary}25`,
  },

  // ── Active game banner ───────────────────────────────────────────────────
  activeGameBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.small,
  },
  activeGamePulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.positive,
  },
  activeGameBody: { flex: 1 },
  activeGameTitle: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  activeGameSub: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  activeGameCta: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
    color: Colors.primary,
  },

  // ── Hero Play Now button ─────────────────────────────────────────────────
  heroBtn: {
    borderRadius: BorderRadius.lg,
    // overflow moved to gradient — lets iOS shadow render outside bounds
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  heroBtnDisabled: { opacity: 0.55 },
  heroBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: Colors.primary,
  },
  heroBtnText: {
    fontFamily: FontFamily.archivoblack,
    fontSize: 20,
    color: Colors.onPrimary,
  },
  heroBtnSub: {
    fontFamily: FontFamily.googleSansFlex,
    fontSize: 12,
    color: `${Colors.onPrimary}A0`,
    marginTop: 1,
  },
  heroBtnArrow: {
    marginLeft: "auto",
  },

  // ── Section label ────────────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: Spacing.xs,
  },

  // ── Game modes 2×2 grid ──────────────────────────────────────────────────
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  modeCard: {
    width: CARD_HALF,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.small,
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  modeBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: Colors.negative,
    borderRadius: BorderRadius.pill,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  modeBadgeText: {
    fontFamily: FontFamily.interBold,
    fontSize: 10,
    color: Colors.textPrimary,
  },
  modeTitle: {
    fontFamily: FontFamily.archivoblack,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  modeSub: {
    fontFamily: FontFamily.googleSansFlex,
    fontSize: 12,
    color: Colors.textMuted,
  },

  // ── Explore row ──────────────────────────────────────────────────────────
  exploreRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  exploreChip: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    ...Shadows.small,
  },
  exploreLabel: {
    fontFamily: FontFamily.googleSansFlex,
    fontSize: 11,
    color: Colors.textSecondary,
  },

  // ── Stats bar ────────────────────────────────────────────────────────────
  statsCard: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    justifyContent: "space-around",
    alignItems: "center",
    ...Shadows.small,
  },
  statsDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  statCell: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    fontFamily: FontFamily.quicksandSemiBold,
    fontSize: 24,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: FontFamily.interRegular,
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  earningsTct: { width: 18, height: 18 },
});

