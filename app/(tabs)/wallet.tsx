import React, { useState, useEffect, useCallback, useRef } from "react";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Linking,
  StatusBar,
  Platform,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Animated,
  Image,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Trophy,
  Lock,
  Unlock,
  RotateCcw,
  Star,
  Percent,
  Minus,
  TrendingDown,
  CreditCard,
  Bitcoin,
  X,
  Copy,
  Check,
  Clock,
  AlertCircle,
  Link2,
  Coins,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthGate } from "@/components/AuthGate";
import { useWalletStore, type Transaction } from "@/stores/walletStore";
import { useUserStore } from "@/stores/userStore";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/lib/supabase";
import NetInfo from "@react-native-community/netinfo";
import { ConnectWalletModal } from "@/components/ConnectWalletModal";
import {
  Colors,
  FontFamily,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
} from "@/constants/theme";

// ─── Constants ────────────────────────────────────────────────────────────────

const NETWORK_NAME = "Base";
const VAULT_ADDRESS =
  process.env.EXPO_PUBLIC_VAULT_ADDRESS ||
  "0x8b490D45A94DC7a967D1bDA4B160Fa1c99445EEa";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const BITCOIN_BRAND_COLOR = "#F7931A"; // Official Bitcoin brand color

// ─── Transaction display config ───────────────────────────────────────────────

const POSITIVE_TYPES = new Set([
  "deposit",
  "wager_unlock",
  "win_payout",
  "refund",
  "reward",
  "reward_payout",
  "wager_won",
]);

function txIsPositive(type: string) {
  return POSITIVE_TYPES.has(type);
}

const TX_ICONS: Record<
  string,
  React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
> = {
  deposit: ArrowDownLeft,
  withdraw: ArrowUpRight,
  withdrawal: ArrowUpRight,
  wager_lock: Lock,
  wager_unlock: Unlock,
  win_payout: Trophy,
  loss_deduct: TrendingDown,
  commission: Percent,
  refund: RotateCcw,
  reward: Star,
  reward_payout: Star,
  wager_placed: Minus,
  wager_won: Trophy,
  wager_lost: TrendingDown,
};

const TX_LABELS: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  withdrawal: "Withdrawal",
  wager_lock: "Wager Locked",
  wager_unlock: "Wager Unlocked",
  win_payout: "Game Won",
  loss_deduct: "Game Lost",
  commission: "Commission",
  refund: "Refund",
  reward: "Reward",
  reward_payout: "Reward Payout",
  wager_placed: "Wager Placed",
  wager_won: "Wager Won",
  wager_lost: "Wager Lost",
};

// ─── Date grouping ─────────────────────────────────────────────────────────────

type ListItem =
  | { kind: "header"; label: string; key: string }
  | { kind: "row"; tx: Transaction };

function groupByDate(transactions: Transaction[]): ListItem[] {
  if (!transactions.length) return [];

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);

  const items: ListItem[] = [];
  let lastLabel = "";

  for (const tx of transactions) {
    const d = new Date(tx.createdAt);
    const txMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const t = txMidnight.getTime();

    let label: string;
    if (t === todayMidnight.getTime()) {
      label = "Today";
    } else if (t === yesterdayMidnight.getTime()) {
      label = "Yesterday";
    } else {
      label = txMidnight.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }

    if (label !== lastLabel) {
      items.push({ kind: "header", label, key: `h-${label}` });
      lastLabel = label;
    }
    items.push({ kind: "row", tx });
  }

  return items;
}

// ─── Tx icon ──────────────────────────────────────────────────────────────────

function TxIcon({
  type,
  pending,
  size = 18,
}: {
  type: string;
  pending: boolean;
  size?: number;
}) {
  if (pending) {
    return <Clock size={size} color={Colors.warning} strokeWidth={2} />;
  }
  const positive = txIsPositive(type);
  const Icon = TX_ICONS[type] ?? Coins;
  return (
    <Icon
      size={size}
      color={positive ? Colors.positive : Colors.negative}
      strokeWidth={2}
    />
  );
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, link && styles.detailValueLink]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function WalletContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);
  const { user } = useAuth();

  const {
    address: walletAddress,
    availableTCT: onChainTctBalance,
    isLoading: isLoadingOnChainBalance,
    refreshBalance: refreshOnChainBalance,
  } = useWallet();

  const {
    tctBalance: storeTctBalance,
    lockedTctBalance,
    isLoadingBalance,
    isLoadingTransactions,
    isRefreshing,
    balanceError,
    hasMoreTransactions,
    isOnline,
    initializeWallet,
    refreshBalance,
    refreshTransactions,
    loadMoreTransactions,
    tctToUsd,
    setOnlineStatus,
    processOfflineQueue,
    setSelectedTransaction,
    selectedTransaction,
    getCombinedTransactions,
  } = useWalletStore();

  const tctBalance = storeTctBalance || onChainTctBalance || 0;
  const usdBalance = tctToUsd(tctBalance);
  const userWalletAddress =
    walletAddress ||
    (user as any)?.walletAddress ||
    (profile as any)?.embeddedWalletAddress ||
    VAULT_ADDRESS;

  // Balance change flash
  const [balanceChange, setBalanceChange] = useState<number | null>(null);
  const changeOpacity = useRef(new Animated.Value(0)).current;
  const prevBalanceRef = useRef<number | null>(null);
  const canTrackRef = useRef(false);

  // UI state
  const [addressCopied, setAddressCopied] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConnectWallet, setShowConnectWallet] = useState(false);
  const [cryptoAddressCopied, setCryptoAddressCopied] = useState(false);

  // WalletInitializer (in the root layout) handles initialization for the stub session.
  // This guard prevents wallet.tsx from re-initializing with a stale persisted userStore
  // profile (which may belong to a different real auth session in AsyncStorage).
  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    if (profile?.id) initializeWallet(profile.id);
  }, [profile?.id, initializeWallet]);

  // Balance change animation
  useEffect(() => {
    const t = setTimeout(() => {
      if (onChainTctBalance != null && onChainTctBalance > 0) {
        prevBalanceRef.current = onChainTctBalance;
      }
      canTrackRef.current = true;
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!canTrackRef.current || onChainTctBalance == null) return;
    if (
      prevBalanceRef.current !== null &&
      prevBalanceRef.current !== onChainTctBalance
    ) {
      const delta = onChainTctBalance - prevBalanceRef.current;
      if (delta !== 0) {
        setBalanceChange(delta);
        Animated.sequence([
          Animated.timing(changeOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.delay(3000),
          Animated.timing(changeOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start(() => setBalanceChange(null));
      }
    }
    prevBalanceRef.current = onChainTctBalance;
  }, [onChainTctBalance, changeOpacity]);

  // Auto-refresh on-chain every 10s
  useEffect(() => {
    const id = setInterval(() => refreshOnChainBalance?.(), 10_000);
    return () => clearInterval(id);
  }, [refreshOnChainBalance]);

  // Network monitor
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? true;
      setOnlineStatus(online);
      if (online && profile?.id) processOfflineQueue(profile.id);
    });
    return () => unsub();
  }, [profile?.id, setOnlineStatus, processOfflineQueue]);

  const handleRefresh = useCallback(async () => {
    refreshOnChainBalance?.();
    if (profile?.id) {
      await Promise.all([
        refreshBalance(profile.id),
        refreshTransactions(profile.id),
      ]);
    }
  }, [profile?.id, refreshBalance, refreshTransactions, refreshOnChainBalance]);

  const handleLoadMore = useCallback(() => {
    if (profile?.id && hasMoreTransactions && !isLoadingTransactions) {
      loadMoreTransactions(profile.id);
    }
  }, [
    profile?.id,
    hasMoreTransactions,
    isLoadingTransactions,
    loadMoreTransactions,
  ]);

  const handleCopyVaultAddress = useCallback(async () => {
    const externalAddr = (profile as any)?.externalWalletAddress;
    if (!externalAddr) {
      Alert.alert(
        "Connect Wallet First",
        "Connect the wallet you'll send from so we can credit your deposit.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Connect Wallet",
            onPress: () => {
              setShowCryptoModal(false);
              setShowConnectWallet(true);
            },
          },
        ]
      );
      return;
    }
    await Clipboard.setStringAsync(VAULT_ADDRESS);
    setCryptoAddressCopied(true);
    setTimeout(() => setCryptoAddressCopied(false), 2000);
  }, [profile]);

  const handleCardDeposit = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setShowDepositModal(false);
      Alert.alert("Sign In Required", "Please sign in to make a card deposit.");
      return;
    }
    try {
      setShowDepositModal(false);
      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/transak-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token ?? SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ fiatCurrency: "GBP" }),
        }
      );
      const { url, error: sessionError } = await resp.json();
      if (sessionError || !url)
        throw new Error(sessionError || "Could not create payment session");
      await Linking.openURL(url);
      Alert.alert(
        "Deposit Started",
        "Complete your payment in the browser. Your TCT balance updates automatically."
      );
    } catch (e: any) {
      Alert.alert("Payment Error", e?.message || "Failed to open payment page");
    }
  }, []);

  const handleWalletConnectComplete = useCallback(
    (_txHash: string, _usdAmount: number) => {
      setTimeout(() => {
        if (profile?.id) {
          refreshBalance(profile.id);
          refreshTransactions(profile.id);
        }
      }, 5000);
    },
    [profile?.id, refreshBalance, refreshTransactions]
  );

  const handleOpenDetail = useCallback(
    (tx: Transaction) => {
      setSelectedTransaction(tx);
      setShowDetailModal(true);
    },
    [setSelectedTransaction]
  );

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading wallet…</Text>
      </View>
    );
  }

  const combinedTransactions = getCombinedTransactions();
  const listItems = groupByDate(combinedTransactions);

  // ── List header ──────────────────────────────────────────────────────────────

  const externalAddr = (profile as any)?.externalWalletAddress as
    | string
    | undefined;

  const ListHeader = (
    <>
      {/* ── Page title ── */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Wallet</Text>
      </View>

      {/* ── Balance card ── */}
      <LinearGradient
        colors={[Colors.surfaceElevated, Colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <Text style={styles.balanceLabel}>Available Balance</Text>

        <View style={styles.balanceRow}>
          {isLoadingBalance || isLoadingOnChainBalance ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.balanceAmount}>
              {tctBalance.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              <Text style={styles.balanceCurrency}> $TCT</Text>
            </Text>
          )}
          {balanceChange !== null && (
            <Animated.View
              style={[styles.changePill, { opacity: changeOpacity }]}
            >
              <Text
                style={[
                  styles.changeText,
                  balanceChange > 0 ? styles.changePos : styles.changeNeg,
                ]}
              >
                {balanceChange > 0 ? "+" : ""}
                {balanceChange.toLocaleString()}
              </Text>
            </Animated.View>
          )}
        </View>

        <Text style={styles.balanceUsd}>
          $
          {usdBalance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>

        {lockedTctBalance > 0 && (
          <View style={styles.lockedChip}>
            <Lock size={11} color={Colors.textSecondary} />
            <Text style={styles.lockedText}>
              {lockedTctBalance.toLocaleString()} TCT in games
            </Text>
          </View>
        )}

        {userWalletAddress && (
          <TouchableOpacity
            style={styles.addressRow}
            onPress={async () => {
              await Clipboard.setStringAsync(userWalletAddress);
              setAddressCopied(true);
              setTimeout(() => setAddressCopied(false), 2000);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addressText}>
              {String(userWalletAddress).slice(0, 6)}…
              {String(userWalletAddress).slice(-4)}
            </Text>
            {addressCopied ? (
              <Check size={12} color={Colors.positive} />
            ) : (
              <Copy size={12} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* ── Error banner ── */}
      {balanceError ? (
        <View style={styles.alertBanner}>
          <AlertCircle size={14} color={Colors.negative} />
          <Text style={[styles.alertText, { color: Colors.negative }]}>
            {balanceError}
          </Text>
          <TouchableOpacity onPress={handleRefresh} hitSlop={8}>
            <Text style={styles.alertAction}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Offline banner ── */}
      {!isOnline ? (
        <View style={[styles.alertBanner, { borderColor: Colors.warning }]}>
          <AlertCircle size={14} color={Colors.warning} />
          <Text style={[styles.alertText, { color: Colors.warning }]}>
            Offline — changes sync when you reconnect
          </Text>
        </View>
      ) : null}

      {/* ── Quick actions ── */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.depositBtn}
          onPress={() => setShowDepositModal(true)}
          activeOpacity={0.85}
        >
          <ArrowDownLeft
            size={17}
            color={Colors.onPrimary}
            strokeWidth={2.5}
          />
          <Text style={styles.depositBtnText}>Deposit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={() => router.push("/withdraw" as any)}
          activeOpacity={0.85}
        >
          <ArrowUpRight size={17} color={Colors.primary} strokeWidth={2.5} />
          <Text style={styles.withdrawBtnText}>Withdraw</Text>
        </TouchableOpacity>
      </View>

      {/* ── Section title ── */}
      {combinedTransactions.length > 0 && (
        <Text style={styles.sectionTitle}>Activity</Text>
      )}
    </>
  );

  // ── Empty state ────────────────────────────────────────────────────────────

  const EmptyState = isLoadingTransactions ? (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  ) : (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Coins size={36} color={Colors.inactive} strokeWidth={1.5} />
      </View>
      <Text style={styles.emptyTitle}>No transactions yet</Text>
      <Text style={styles.emptySubtitle}>
        Make a deposit or win a game to see your activity here.
      </Text>
    </View>
  );

  // ── Row renderer ─────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === "header") {
      return <Text style={styles.dateHeader}>{item.label}</Text>;
    }

    const { tx } = item;
    const positive = txIsPositive(tx.type);
    const pending = tx.status === "pending";
    const label =
      tx.description ||
      TX_LABELS[tx.type] ||
      tx.type.replace(/_/g, " ");
    const amtColor = pending
      ? Colors.warning
      : positive
      ? Colors.positive
      : Colors.negative;
    const prefix = pending ? "" : positive ? "+" : "−";

    return (
      <TouchableOpacity
        style={[styles.txRow, pending && styles.txRowPending]}
        onPress={() => handleOpenDetail(tx)}
        activeOpacity={0.7}
      >
        <View style={styles.txIconWrap}>
          <TxIcon type={tx.type} pending={pending} />
        </View>
        <View style={styles.txInfo}>
          <Text style={styles.txLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.txTime}>
            {new Date(tx.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {pending ? " · Processing" : ""}
          </Text>
        </View>
        <View style={styles.txAmounts}>
          <Text style={[styles.txAmount, { color: amtColor }]}>
            {prefix}
            {tx.tctAmount.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}{" "}
            TCT
          </Text>
          <Text style={styles.txAmountUsd}>
            $
            {tx.amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const ListFooter =
    isLoadingTransactions && combinedTransactions.length > 0 ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    ) : hasMoreTransactions ? (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
        <Text style={styles.loadMoreText}>Load more</Text>
      </TouchableOpacity>
    ) : null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
      />

      <FlatList
        data={listItems}
        keyExtractor={(item) =>
          item.kind === "header" ? item.key : item.tx.id
        }
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyState}
        ListFooterComponent={ListFooter}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      />

      {/* ── Deposit method sheet ─────────────────────────────────────────── */}
      <Modal
        visible={showDepositModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDepositModal(false)}
      >
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            onPress={() => setShowDepositModal(false)}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Add Funds</Text>
              <TouchableOpacity
                onPress={() => setShowDepositModal(false)}
                hitSlop={10}
              >
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Card / Apple Pay — Stripe */}
            <TouchableOpacity
              style={styles.methodRow}
              onPress={() => {
                setShowDepositModal(false);
                router.push("/deposit");
              }}
              activeOpacity={0.7}
            >
              <View style={styles.methodIconWrap}>
                <CreditCard size={20} color="#635BFF" />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodTitle}>Card / Apple Pay</Text>
                <Text style={styles.methodSub}>
                  Visa, Mastercard, Apple Pay · Powered by Stripe
                </Text>
              </View>
            </TouchableOpacity>

            {/* Crypto */}
            <TouchableOpacity
              style={styles.methodRow}
              onPress={() => {
                setShowDepositModal(false);
                setShowCryptoModal(true);
                setCryptoAddressCopied(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.methodIconWrap}>
                <Bitcoin size={20} color={BITCOIN_BRAND_COLOR} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodTitle}>Crypto Wallet</Text>
                <Text style={styles.methodSub}>USDC on {NETWORK_NAME}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Crypto deposit sheet ─────────────────────────────────────────── */}
      <Modal
        visible={showCryptoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCryptoModal(false)}
      >
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            onPress={() => setShowCryptoModal(false)}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Crypto Deposit</Text>
              <TouchableOpacity
                onPress={() => setShowCryptoModal(false)}
                hitSlop={10}
              >
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {!externalAddr && (
              <View style={styles.warnBox}>
                <AlertCircle size={15} color={Colors.warning} />
                <Text style={styles.warnText}>
                  Connect the wallet you'll send from first — unregistered
                  deposits can't be credited.
                </Text>
              </View>
            )}

            <Text style={styles.cryptoInstr}>
              {externalAddr
                ? `Send USDC (${NETWORK_NAME}) from ${externalAddr.slice(0, 6)}…${externalAddr.slice(-4)} to:`
                : `Send USDC on ${NETWORK_NAME} to this address:`}
            </Text>

            <View style={styles.addrBox}>
              <Text
                style={styles.addrText}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {VAULT_ADDRESS}
              </Text>
              <TouchableOpacity
                style={styles.addrCopyBtn}
                onPress={handleCopyVaultAddress}
                activeOpacity={0.8}
              >
                {cryptoAddressCopied ? (
                  <Check size={17} color={Colors.positive} />
                ) : (
                  <Copy size={17} color={Colors.primary} />
                )}
                <Text
                  style={[
                    styles.addrCopyText,
                    {
                      color: cryptoAddressCopied
                        ? Colors.positive
                        : Colors.primary,
                    },
                  ]}
                >
                  {cryptoAddressCopied ? "Copied" : "Copy"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orLabel}>or connect wallet</Text>
              <View style={styles.orLine} />
            </View>

            <TouchableOpacity
              style={styles.connectWalletBtn}
              onPress={() => {
                setShowCryptoModal(false);
                setShowConnectWallet(true);
              }}
              activeOpacity={0.85}
            >
              <Link2 size={20} color={Colors.textPrimary} />
              <View>
                <Text style={styles.connectTitle}>Connect Wallet</Text>
                <Text style={styles.connectSub}>
                  MetaMask, Rainbow, Trust & more
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.cryptoNote}>
              1 USDC = 25 TCT · Credits after 12 confirmations
            </Text>
            <Text style={styles.cryptoWarn}>
              Only send USDC on {NETWORK_NAME}. Other tokens or networks may
              result in permanent loss.
            </Text>
          </View>
        </View>
      </Modal>

      {/* ── Transaction detail sheet ─────────────────────────────────────── */}
      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowDetailModal(false);
          setSelectedTransaction(null);
        }}
      >
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            onPress={() => {
              setShowDetailModal(false);
              setSelectedTransaction(null);
            }}
            activeOpacity={1}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Transaction Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDetailModal(false);
                  setSelectedTransaction(null);
                }}
                hitSlop={10}
              >
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedTransaction && (
              <View style={styles.detailBody}>
                {(() => {
                  const tx = selectedTransaction;
                  const pos = txIsPositive(tx.type);
                  const pend = tx.status === "pending";
                  const amtColor = pend
                    ? Colors.warning
                    : pos
                    ? Colors.positive
                    : Colors.negative;
                  const prefix = pend ? "" : pos ? "+" : "−";
                  return (
                    <>
                      <View
                        style={[
                          styles.detailIconCircle,
                          { backgroundColor: `${amtColor}1A` },
                        ]}
                      >
                        <TxIcon type={tx.type} pending={pend} size={26} />
                      </View>
                      <Text
                        style={[styles.detailAmount, { color: amtColor }]}
                      >
                        {prefix}
                        {tx.tctAmount.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}{" "}
                        TCT
                      </Text>
                      <Text style={styles.detailUsd}>
                        $
                        {tx.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        USD
                      </Text>

                      <View style={styles.detailRows}>
                        <DetailRow
                          label="Type"
                          value={
                            tx.description ||
                            TX_LABELS[tx.type] ||
                            tx.type.replace(/_/g, " ")
                          }
                        />
                        <DetailRow
                          label="Date"
                          value={new Date(tx.createdAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        />
                        <DetailRow
                          label="Status"
                          value={
                            tx.status.charAt(0).toUpperCase() +
                            tx.status.slice(1)
                          }
                        />
                        <DetailRow
                          label="ID"
                          value={`${tx.id.slice(0, 8)}…${tx.id.slice(-6)}`}
                        />
                        {tx.txHash && (
                          <TouchableOpacity
                            onPress={() =>
                              Linking.openURL(
                                `https://basescan.org/tx/${tx.txHash}`
                              )
                            }
                          >
                            <DetailRow
                              label="On-chain TX"
                              value={`${tx.txHash.slice(0, 10)}…${tx.txHash.slice(-8)}`}
                              link
                            />
                          </TouchableOpacity>
                        )}
                        {tx.gameId && (
                          <DetailRow
                            label="Game ID"
                            value={`${tx.gameId.slice(0, 8)}…`}
                          />
                        )}
                      </View>
                    </>
                  );
                })()}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Connect wallet modal ─────────────────────────────────────────── */}
      <ConnectWalletModal
        visible={showConnectWallet}
        onClose={() => setShowConnectWallet(false)}
        onTransactionComplete={handleWalletConnectComplete}
      />
    </View>
  );
}

// ─── Screen export ────────────────────────────────────────────────────────────

export default function WalletScreen() {
  return (
    <AuthGate>
      <WalletContent />
    </AuthGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: Colors.background,
    paddingVertical: Spacing.xxxl,
  },
  loadingText: {
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
    color: Colors.textSecondary,
  },

  listContent: {
    paddingBottom: Spacing.xxl,
  },

  // ── Page header ────────────────────────────────────────────────────────────
  pageHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  pageTitle: {
    fontFamily: FontFamily.quicksandMedium,
    fontSize: 28,
    color: Colors.textPrimary,
  },

  // ── Balance card ──────────────────────────────────────────────────────────
  balanceCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    overflow: "hidden",
    ...Shadows.medium,
  },
  balanceLabel: {
    fontFamily: FontFamily.googleSansFlex,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  balanceAmount: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 36,
    lineHeight: 44,
    color: Colors.primary,
    // @ts-ignore – fontVariant valid on RN Text
    fontVariant: ["tabular-nums"],
  },
  balanceCurrency: {
    fontFamily: FontFamily.spaceGroteskMedium,
    fontSize: 18,
    color: Colors.textSecondary,
  },
  changePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surfaceElevated,
  },
  changeText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },
  changePos: { color: Colors.positive },
  changeNeg: { color: Colors.negative },
  balanceUsd: {
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },
  lockedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    marginBottom: Spacing.sm,
  },
  lockedText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
  },
  addressText: {
    fontFamily: FontFamily.mono,
    fontSize: 12,
    color: Colors.textMuted,
  },

  // ── Alert banners ─────────────────────────────────────────────────────────
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.negative,
  },
  alertText: {
    flex: 1,
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
  },
  alertAction: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
    color: Colors.primary,
  },

  // ── Quick actions ─────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  depositBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingVertical: Spacing.lg,
    ...Shadows.gold,
  },
  depositBtnText: {
    fontFamily: FontFamily.archivoblack,
    fontSize: 15,
    color: Colors.onPrimary,
  },
  withdrawBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.pill,
    paddingVertical: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  withdrawBtnText: {
    fontFamily: FontFamily.archivoblack,
    fontSize: 15,
    color: Colors.primary,
  },

  // ── Section title ─────────────────────────────────────────────────────────
  sectionTitle: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },

  // ── Date header ───────────────────────────────────────────────────────────
  dateHeader: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: Colors.textMuted,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },

  // ── Transaction row ───────────────────────────────────────────────────────
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  txRowPending: {
    opacity: 0.65,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  txInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  txLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  txTime: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  txAmounts: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  txAmount: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 14,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },
  txAmountUsd: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: "center",
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...(Typography.h3 as object),
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: "center",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footerLoader: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  loadMoreText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    color: Colors.primary,
  },

  // ── Bottom sheet shared ───────────────────────────────────────────────────
  sheetContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Colors.overlay,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.border,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 18,
    color: Colors.textPrimary,
  },

  // ── Deposit method rows ───────────────────────────────────────────────────
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  methodIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  methodInfo: { flex: 1 },
  methodTitle: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  methodSub: {
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  // ── Crypto deposit ────────────────────────────────────────────────────────
  warnBox: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: `${Colors.warning}1A`,
    borderWidth: 1,
    borderColor: `${Colors.warning}40`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  warnText: {
    flex: 1,
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.warning,
  },
  cryptoInstr: {
    fontFamily: FontFamily.interRegular,
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  addrBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  addrText: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  addrCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
  },
  addrCopyText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  orLabel: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  connectWalletBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  connectTitle: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  connectSub: {
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  cryptoNote: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  cryptoWarn: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },

  // ── Transaction detail ────────────────────────────────────────────────────
  detailBody: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
  },
  detailIconCircle: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  detailAmount: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 28,
    marginBottom: Spacing.xs,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },
  detailUsd: {
    fontFamily: FontFamily.interRegular,
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    // @ts-ignore
    fontVariant: ["tabular-nums"],
  },
  detailRows: {
    width: "100%",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    color: Colors.textPrimary,
    maxWidth: "60%",
    textAlign: "right",
  },
  detailValueLink: {
    color: Colors.primary,
  },
});
