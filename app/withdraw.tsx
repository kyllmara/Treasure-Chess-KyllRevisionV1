/**
 * Withdrawal Screen
 *
 * Three withdrawal methods:
 * - Base Wallet: Direct USDC transfer on Base (platform vault pays gas)
 * - Bridge to Other Chain: Cross-chain USDC via LI.FI
 * - Bank Transfer: Manual bank transfer processed by admin
 *
 * Flat $10 minimum (250 TCT) across all methods.
 * 1% platform fee on all methods.
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Dimensions,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Wallet,
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Info,
  Shield,
  Building2,
  Send,
  Globe,
  ChevronDown,
} from "lucide-react-native";
import { useUserStore } from "@/stores/userStore";
import { useWalletStore } from "@/stores/walletStore";
import { useWallet } from "@/hooks/useWallet";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  SUPPORTED_CHAINS,
  SOURCE_CHAIN_ID,
  getChainById,
  validateAddress,
  getExplorerTxUrl,
  type ChainDefinition,
} from "@/lib/chains";
import {
  getQuote,
  extractFees,
  waitForBridgeCompletion,
  type LiFiQuote,
  type QuoteFeeBreakdown,
} from "@/lib/lifi";
import { tctToUsd, tctToUsdc } from "@/lib/fiat-ramp";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Constants
const TCT_TO_USD_RATE = 0.04; // 1 TCT = $0.04 (25 TCT = $1)
const USDC_TO_TCT = 25; // 1 USDC = 25 TCT
const MIN_WITHDRAWAL_TCT = 250; // Flat $10 minimum across all methods
const WITHDRAWAL_FEE_PERCENT = 1; // 1% platform fee

type WithdrawalMethod = "base" | "bridge" | "bank";
type WithdrawalStep =
  | "select"
  | "chain-select"
  | "amount"
  | "address"
  | "bank-details"
  | "bridge-quote"
  | "confirm"
  | "bridge-progress"
  | "complete";
type WithdrawalStatus = "pending" | "processing" | "completed" | "failed";

interface PendingWithdrawal {
  id: string;
  type: WithdrawalMethod;
  amountTct: number;
  amountUsd: number;
  status: WithdrawalStatus;
  txHash?: string;
  chainId?: number;
  createdAt: string;
}

interface BankDetails {
  accountName: string;
  accountNumber: string;
  sortCode: string;
  iban: string;
  bic: string;
}

// Helper functions
function formatTCT(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatUSD(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateAddress(address: string, start = 8, end = 6): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)} min`;
  return `~${(seconds / 3600).toFixed(1)} hr`;
}

// ============================================================================
// Method Selection Card
// ============================================================================
function MethodCard({
  title,
  subtitle,
  icon: Icon,
  gradientColors,
  onPress,
  badge,
  disabled,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<any>;
  gradientColors: [string, string];
  onPress: () => void;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.methodCard, disabled && styles.methodCardDisabled]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.85}
      disabled={disabled}
    >
      <LinearGradient
        colors={disabled ? ["#333", "#222"] : gradientColors}
        style={styles.methodCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.methodCardContent}>
          <View style={styles.methodIconContainer}>
            <Icon size={32} color={disabled ? "#666" : "#FFFFFF"} />
          </View>
          <View style={styles.methodTextContainer}>
            <Text style={[styles.methodTitle, disabled && styles.methodTitleDisabled]}>{title}</Text>
            <Text style={[styles.methodSubtitle, disabled && styles.methodSubtitleDisabled]}>{subtitle}</Text>
          </View>
          <ChevronRight size={24} color={disabled ? "rgba(102, 102, 102, 0.5)" : "rgba(255,255,255,0.7)"} />
        </View>
        {badge && (
          <View style={styles.methodBadge}>
            <Text style={styles.methodBadgeText}>{badge}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// Pending Withdrawal Item
// ============================================================================
function PendingWithdrawalItem({ withdrawal }: { withdrawal: PendingWithdrawal }) {
  const explorerChainId = withdrawal.chainId || SOURCE_CHAIN_ID;
  const chain = getChainById(explorerChainId);

  const methodLabel = (() => {
    if (withdrawal.type === "base") return "USDC on Base";
    if (withdrawal.type === "bridge") {
      const destChain = withdrawal.chainId ? getChainById(withdrawal.chainId) : null;
      return destChain ? `Bridge to ${destChain.name}` : "Cross-chain bridge";
    }
    return "Bank transfer";
  })();

  return (
    <View style={styles.pendingItem}>
      <View style={styles.pendingIconContainer}>
        {withdrawal.status === "completed" ? (
          <CheckCircle size={24} color="#4ECDC4" />
        ) : withdrawal.status === "failed" ? (
          <AlertCircle size={24} color="#F5576C" />
        ) : (
          <Clock size={24} color="#FFD700" />
        )}
      </View>

      <View style={styles.pendingDetails}>
        <Text style={styles.pendingAmount}>-{formatTCT(withdrawal.amountTct)} TCT</Text>
        <Text style={styles.pendingStatus}>
          {withdrawal.status === "completed"
            ? "Completed"
            : withdrawal.status === "failed"
            ? "Failed"
            : withdrawal.status === "processing"
            ? "Processing..."
            : "Pending"}
        </Text>
        <Text style={styles.pendingMethod}>{methodLabel}</Text>
      </View>

      {withdrawal.txHash && (
        <TouchableOpacity
          style={styles.pendingTxLink}
          onPress={() => {
            const url = getExplorerTxUrl(withdrawal.txHash!, explorerChainId);
            if (url) Linking.openURL(url);
          }}
        >
          <ExternalLink size={16} color="#A0A0A0" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================================================
// Main Withdrawal Screen
// ============================================================================
export default function WithdrawScreen() {
  const router = useRouter();
  const { profile, refreshBalance } = useUserStore();
  const { pendingWithdrawals, refreshTransactions } = useWalletStore();
  const {
    address: walletAddress,
    refreshBalance: refreshWalletBalance,
    availableTCT: onChainAvailableTct,
    lockedTCT: onChainLockedTct,
  } = useWallet();

  // Local state
  const [step, setStep] = useState<WithdrawalStep>("select");
  const [method, setMethod] = useState<WithdrawalMethod | null>(null);
  const [amount, setAmountRaw] = useState(0);
  const [amountText, setAmountText] = useState("");

  // Helper to keep numeric amount and text input in sync
  const setAmount = useCallback((val: number) => {
    setAmountRaw(val);
    setAmountText(val > 0 ? String(val) : "");
  }, []);
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationChain, setDestinationChain] = useState<ChainDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingWithdrawalsList, setPendingWithdrawalsList] = useState<PendingWithdrawal[]>([]);
  const [withdrawalResult, setWithdrawalResult] = useState<{
    success: boolean;
    txHash?: string;
    message?: string;
    chainId?: number;
  } | null>(null);

  // Bank details state
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    accountName: "",
    accountNumber: "",
    sortCode: "",
    iban: "",
    bic: "",
  });

  // Bridge state
  const [bridgeQuote, setBridgeQuote] = useState<LiFiQuote | null>(null);
  const [bridgeFees, setBridgeFees] = useState<QuoteFeeBreakdown | null>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<string>("Initiating bridge...");
  const [bridgeTxHash, setBridgeTxHash] = useState<string | null>(null);

  // Ref for amount input to focus programmatically
  const amountInputRef = useRef<TextInput>(null);

  // Use on-chain USDC balance for withdrawals (user's actual wallet balance)
  // The new withdrawal flow transfers directly from user's wallet
  const availableBalance = onChainAvailableTct;
  const lockedBalance = onChainLockedTct;

  // Get wallet address
  const cryptoAddress = walletAddress || profile?.embeddedWalletAddress || null;

  // Destination chains (exclude Base for bridge, since Base is the source)
  const bridgeChains = useMemo(() => {
    return SUPPORTED_CHAINS.filter((c) => c.chainId !== SOURCE_CHAIN_ID);
  }, []);

  // Calculate fee and net amount
  const withdrawalFee = useMemo(() => {
    return Math.ceil(amount * (WITHDRAWAL_FEE_PERCENT / 100));
  }, [amount]);

  const netAmount = useMemo(() => {
    return Math.max(0, amount - withdrawalFee);
  }, [amount, withdrawalFee]);

  const netAmountUsd = useMemo(() => {
    return tctToUsd(netAmount);
  }, [netAmount]);

  const netAmountUsdc = useMemo(() => {
    return tctToUsdc(netAmount);
  }, [netAmount]);

  // Min/max for slider
  const minWithdrawal = MIN_WITHDRAWAL_TCT;

  const maxWithdrawal = useMemo(() => {
    return Math.max(0, availableBalance);
  }, [availableBalance]);

  // Validate withdrawal amount
  const isValidAmount = useMemo(() => {
    if (amount < minWithdrawal) return false;
    if (amount > availableBalance) return false;
    return true;
  }, [amount, minWithdrawal, availableBalance]);

  // Validate address for current method
  const isValidAddress = useMemo(() => {
    if (!destinationAddress) return false;
    if (method === "base") {
      return validateAddress(destinationAddress, SOURCE_CHAIN_ID);
    }
    if (method === "bridge" && destinationChain) {
      return validateAddress(destinationAddress, destinationChain.chainId);
    }
    return false;
  }, [destinationAddress, method, destinationChain]);

  // Bank details validation
  const isValidBankDetails = useMemo(() => {
    const { accountName, accountNumber, sortCode } = bankDetails;
    if (!accountName.trim()) return false;
    if (!accountNumber.trim() || accountNumber.length < 8) return false;
    if (!sortCode.trim() || sortCode.replace(/-/g, "").length !== 6) return false;
    return true;
  }, [bankDetails]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSelectMethod = useCallback(
    (selectedMethod: WithdrawalMethod) => {
      setMethod(selectedMethod);
      setDestinationAddress("");
      setDestinationChain(null);
      setBridgeQuote(null);
      setBridgeFees(null);
      setAmount(Math.min(MIN_WITHDRAWAL_TCT, availableBalance));

      if (selectedMethod === "bridge") {
        setStep("chain-select");
      } else {
        setStep("amount");
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [availableBalance]
  );

  const handleSelectChain = useCallback(
    (chain: ChainDefinition) => {
      setDestinationChain(chain);
      setDestinationAddress("");
      setAmount(Math.min(MIN_WITHDRAWAL_TCT, availableBalance));
      setStep("amount");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [availableBalance]
  );

  const handleContinueFromAmount = useCallback(() => {
    if (!isValidAmount) {
      Alert.alert(
        "Invalid Amount",
        `Please enter a valid amount between ${formatTCT(minWithdrawal)} and ${formatTCT(maxWithdrawal)} TCT`
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (method === "bank") {
      setStep("bank-details");
    } else {
      setStep("address");
    }
  }, [isValidAmount, method, minWithdrawal, maxWithdrawal]);

  const handleContinueFromAddress = useCallback(async () => {
    if (!isValidAddress) {
      Alert.alert("Invalid Address", "Please enter a valid wallet address for the selected network.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (method === "base") {
      setStep("confirm");
    } else if (method === "bridge" && destinationChain && cryptoAddress) {
      // Fetch LI.FI quote
      setIsFetchingQuote(true);
      try {
        const usdcAmount = tctToUsdc(netAmount).toFixed(2);
        const quote = await getQuote(
          destinationChain.chainId,
          destinationChain.usdcAddress,
          usdcAmount,
          cryptoAddress,
          destinationAddress
        );
        const fees = extractFees(quote);
        setBridgeQuote(quote);
        setBridgeFees(fees);
        setStep("bridge-quote");
      } catch (error) {
        console.error("Failed to get bridge quote:", error);
        const msg = error instanceof Error ? error.message : "Failed to get bridge quote";
        Alert.alert("Quote Error", msg);
      } finally {
        setIsFetchingQuote(false);
      }
    }
  }, [isValidAddress, method, destinationChain, cryptoAddress, netAmount, destinationAddress]);

  const handleContinueFromBankDetails = useCallback(() => {
    if (!isValidBankDetails) {
      Alert.alert("Invalid Details", "Please fill in all required bank details.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("confirm");
  }, [isValidBankDetails]);

  // Base wallet withdrawal — locks TCT and queues a USDC transfer from vault
  const handleBaseWithdrawal = useCallback(async () => {
    if (!profile?.id) {
      Alert.alert("Error", "You must be logged in to withdraw.");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!isSupabaseConfigured) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setWithdrawalResult({
          success: true,
          message: "Withdrawal submitted! USDC will arrive in your wallet shortly.",
          chainId: SOURCE_CHAIN_ID,
        });
        setStep("complete");
        return;
      }

      const idempotencyKey = `withdraw_${profile.id}_${Date.now()}`;

      const { data, error } = await supabase.rpc("request_withdrawal", {
        p_user_id: profile.id,
        p_amount_tct: amount,
        p_to_address: destinationAddress,
        p_idempotency_key: idempotencyKey,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        throw new Error(row?.error_message || "Withdrawal request failed");
      }

      setWithdrawalResult({
        success: true,
        message: `Withdrawal submitted! ${netAmountUsdc.toFixed(2)} USDC will be sent to ${destinationAddress.slice(0, 10)}... within 15 minutes.`,
        chainId: SOURCE_CHAIN_ID,
      });

      await Promise.all([refreshBalance()]);
      if (profile?.id) {
        await refreshTransactions(profile.id);
      }

      setStep("complete");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Withdrawal failed";
      Alert.alert("Withdrawal Failed", errorMessage);
      setWithdrawalResult({ success: false, message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id, amount, destinationAddress, netAmountUsdc, refreshBalance, refreshTransactions]);

  // Bridge withdrawal
  const handleBridgeWithdrawal = useCallback(async () => {
    if (!profile?.id || !destinationChain) {
      Alert.alert("Error", "Missing required information. Please try again.");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!isSupabaseConfigured) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const fakeTxHash = `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
        setBridgeTxHash(fakeTxHash);
        setStep("bridge-progress");
        setBridgeStatus("Bridge in progress...");

        // Simulate bridge completion
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setWithdrawalResult({
          success: true,
          txHash: fakeTxHash,
          message: `Successfully bridged ${netAmountUsdc.toFixed(2)} USDC to ${destinationChain.name}`,
          chainId: destinationChain.chainId,
        });
        setStep("complete");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("process-withdrawals", {
        body: {
          userId: profile.id,
          amountTct: amount,
          type: "bridge",
          destinationAddress,
          destinationChainId: destinationChain.chainId,
          destinationChainName: destinationChain.name,
        },
      });

      if (error) {
        throw new Error(error.message || "Bridge withdrawal failed");
      }

      const txHash = data?.txHash;
      if (txHash) {
        setBridgeTxHash(txHash);
        setStep("bridge-progress");
        setBridgeStatus("Bridge transaction submitted. Waiting for confirmation...");

        try {
          const finalStatus = await waitForBridgeCompletion(
            txHash,
            destinationChain.chainId,
            (status) => {
              if (status.status === "PENDING") {
                setBridgeStatus(
                  status.substatusMessage || "Bridge in progress..."
                );
              }
            }
          );

          if (finalStatus.status === "DONE") {
            setWithdrawalResult({
              success: true,
              txHash: finalStatus.receiving?.txHash || txHash,
              message: `Successfully bridged ${netAmountUsdc.toFixed(2)} USDC to ${destinationChain.name}`,
              chainId: destinationChain.chainId,
            });
          } else {
            setWithdrawalResult({
              success: false,
              txHash,
              message: `Bridge failed: ${finalStatus.substatusMessage || "Unknown error"}`,
              chainId: SOURCE_CHAIN_ID,
            });
          }
        } catch (pollError) {
          console.error("Bridge polling error:", pollError);
          setWithdrawalResult({
            success: false,
            txHash,
            message: "Bridge status polling timed out. Check your wallet later.",
            chainId: SOURCE_CHAIN_ID,
          });
        }
      } else {
        setWithdrawalResult({
          success: true,
          message: `Bridge withdrawal submitted to ${destinationChain.name}. It may take a few minutes to complete.`,
          chainId: destinationChain.chainId,
        });
      }

      await Promise.all([refreshWalletBalance(), refreshBalance()]);
      if (profile?.id) {
        await refreshTransactions(profile.id);
      }

      setStep("complete");
    } catch (error) {
      console.error("Bridge withdrawal error:", error);
      const errorMessage = error instanceof Error ? error.message : "Bridge withdrawal failed";
      Alert.alert("Withdrawal Failed", errorMessage);
      setWithdrawalResult({ success: false, message: errorMessage });
      setStep("complete");
    } finally {
      setIsLoading(false);
    }
  }, [
    profile?.id,
    destinationChain,
    amount,
    destinationAddress,
    netAmountUsdc,
    refreshWalletBalance,
    refreshBalance,
    refreshTransactions,
  ]);

  // Bank withdrawal
  const handleBankWithdrawal = useCallback(async () => {
    if (!profile?.id) {
      Alert.alert("Error", "Please log in to continue.");
      return;
    }

    if (!isValidBankDetails) {
      Alert.alert("Invalid Details", "Please fill in all required bank details.");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!isSupabaseConfigured) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setWithdrawalResult({
          success: true,
          message: "Bank withdrawal request submitted! Funds will arrive in 2-3 business days.",
        });
        setStep("complete");
        return;
      }

      const { data, error } = await supabase.functions.invoke("process-withdrawals", {
        body: {
          userId: profile.id,
          amountTct: amount,
          type: "bank",
          bankDetails: {
            accountName: bankDetails.accountName,
            accountNumber: bankDetails.accountNumber,
            sortCode: bankDetails.sortCode.replace(/-/g, ""),
            iban: bankDetails.iban || undefined,
            bic: bankDetails.bic || undefined,
          },
        },
      });

      if (error) {
        throw new Error(error.message || "Withdrawal failed");
      }

      setWithdrawalResult({
        success: true,
        message: "Bank withdrawal request submitted! Funds will arrive in 2-3 business days.",
      });

      await Promise.all([refreshWalletBalance(), refreshBalance()]);
      if (profile?.id) {
        await refreshTransactions(profile.id);
      }

      setStep("complete");
    } catch (error) {
      console.error("Bank withdrawal error:", error);
      const errorMessage = error instanceof Error ? error.message : "Withdrawal failed";
      Alert.alert("Withdrawal Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id, amount, bankDetails, isValidBankDetails, refreshWalletBalance, refreshBalance, refreshTransactions]);

  // Handle confirm step submit
  const handleConfirmSubmit = useCallback(() => {
    if (method === "base") {
      handleBaseWithdrawal();
    } else if (method === "bridge") {
      handleBridgeWithdrawal();
    } else if (method === "bank") {
      handleBankWithdrawal();
    }
  }, [method, handleBaseWithdrawal, handleBridgeWithdrawal, handleBankWithdrawal]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshWalletBalance(),
        refreshBalance(),
        profile?.id ? refreshTransactions(profile.id) : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshWalletBalance, refreshBalance, refreshTransactions, profile?.id]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    switch (step) {
      case "select":
      case "complete":
        router.back();
        break;
      case "chain-select":
        setStep("select");
        setMethod(null);
        break;
      case "amount":
        if (method === "bridge") {
          setStep("chain-select");
        } else {
          setStep("select");
          setMethod(null);
        }
        break;
      case "address":
        setStep("amount");
        break;
      case "bank-details":
        setStep("amount");
        break;
      case "bridge-quote":
        setStep("address");
        break;
      case "confirm":
        if (method === "base") {
          setStep("address");
        } else if (method === "bank") {
          setStep("bank-details");
        } else {
          setStep("address");
        }
        break;
      case "bridge-progress":
        // Don't allow going back during bridge progress
        break;
      default:
        setStep("select");
        setMethod(null);
    }
  }, [step, method, router]);

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderSelectStep = () => {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Withdraw Funds</Text>
        <Text style={styles.stepSubtitle}>Choose how you'd like to receive your funds</Text>

        <View style={styles.methodsContainer}>
          <MethodCard
            title="Base Wallet"
            subtitle="USDC to any Base address"
            icon={Send}
            gradientColors={["#0052FF", "#003DC4"]}
            onPress={() => handleSelectMethod("base")}
            badge="~15 min"
            disabled={availableBalance < MIN_WITHDRAWAL_TCT}
          />

        </View>

        {pendingWithdrawalsList.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>Recent Withdrawals</Text>
            {pendingWithdrawalsList.map((withdrawal) => (
              <PendingWithdrawalItem key={withdrawal.id} withdrawal={withdrawal} />
            ))}
          </View>
        )}

        <View style={styles.infoBox}>
          <Info size={16} color="#A0A0A0" />
          <Text style={styles.infoText}>
            Minimum withdrawal: {formatTCT(MIN_WITHDRAWAL_TCT)} TCT (${formatUSD(tctToUsd(MIN_WITHDRAWAL_TCT))}). 1% platform fee on all withdrawals.
          </Text>
        </View>
      </View>
    );
  };

  const renderChainSelectStep = () => {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Select Destination Chain</Text>
        <Text style={styles.stepSubtitle}>Choose where to receive your USDC</Text>

        <View style={styles.chainList}>
          {bridgeChains.map((chain) => (
            <TouchableOpacity
              key={chain.chainId}
              style={styles.chainItem}
              onPress={() => handleSelectChain(chain)}
              activeOpacity={0.7}
            >
              <View style={[styles.chainDot, { backgroundColor: chain.color }]} />
              <View style={styles.chainInfo}>
                <Text style={styles.chainName}>{chain.name}</Text>
                <Text style={styles.chainNative}>{chain.nativeToken} network</Text>
              </View>
              <ChevronRight size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderAmountStep = () => {
    const methodLabel =
      method === "base"
        ? "Withdraw to Base Wallet"
        : method === "bridge"
        ? `Bridge to ${destinationChain?.name || "Other Chain"}`
        : "Withdraw to Bank";

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{methodLabel}</Text>
        <Text style={styles.stepSubtitle}>Enter withdrawal amount</Text>

        {/* Amount Input */}
        <View style={styles.amountDisplayCard}>
          <TouchableOpacity
            style={styles.amountInputTouchable}
            activeOpacity={0.8}
            onPress={() => {
              amountInputRef.current?.focus();
            }}
          >
            <View style={styles.amountInputRow}>
              <TextInput
                ref={amountInputRef}
                style={styles.amountInput}
                value={amountText}
                onChangeText={(text) => {
                  // Allow only digits
                  const cleaned = text.replace(/[^0-9]/g, "");
                  setAmountText(cleaned);
                  const parsed = parseInt(cleaned, 10);
                  setAmountRaw(isNaN(parsed) ? 0 : parsed);
                }}
                placeholder="0"
                placeholderTextColor="rgba(255, 215, 0, 0.3)"
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={10}
                selectTextOnFocus
              />
              <Text style={styles.amountSuffix}>TCT</Text>
            </View>
            <View style={styles.amountInputUnderline} />
          </TouchableOpacity>
          <Text style={styles.amountUsd}>${formatUSD(tctToUsd(amount))}</Text>
          <Text style={styles.amountHint}>Tap amount to edit</Text>
          <Text style={styles.amountRange}>
            Min {formatTCT(minWithdrawal)} · Max {formatTCT(maxWithdrawal)} TCT
          </Text>
        </View>

        {/* Quick Amount Buttons */}
        <View style={styles.quickAmounts}>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() =>
              setAmount(Math.min(Math.max(minWithdrawal, Math.floor(availableBalance * 0.25)), maxWithdrawal))
            }
          >
            <Text style={styles.quickAmountText}>25%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() =>
              setAmount(Math.min(Math.max(minWithdrawal, Math.floor(availableBalance * 0.5)), maxWithdrawal))
            }
          >
            <Text style={styles.quickAmountText}>50%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() =>
              setAmount(Math.min(Math.max(minWithdrawal, Math.floor(availableBalance * 0.75)), maxWithdrawal))
            }
          >
            <Text style={styles.quickAmountText}>75%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() => setAmount(maxWithdrawal)}
          >
            <Text style={styles.quickAmountText}>MAX</Text>
          </TouchableOpacity>
        </View>

        {/* Fee Breakdown */}
        <View style={styles.feeBreakdown}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Withdrawal Amount</Text>
            <Text style={styles.feeValue}>{formatTCT(amount)} TCT</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Platform Fee ({WITHDRAWAL_FEE_PERCENT}%)</Text>
            <Text style={styles.feeValue}>-{formatTCT(withdrawalFee)} TCT</Text>
          </View>
          <View style={[styles.feeRow, styles.feeRowTotal]}>
            <Text style={styles.feeLabelTotal}>You'll Receive</Text>
            <View style={styles.feeValueTotal}>
              <Text style={styles.feeTctTotal}>{formatTCT(netAmount)} TCT</Text>
              {(method === "base" || method === "bridge") && (
                <Text style={styles.feeUsdcTotal}>{"\u2248"} {netAmountUsdc.toFixed(2)} USDC</Text>
              )}
              {method === "bank" && (
                <Text style={styles.feeUsdcTotal}>{"\u2248"} ${formatUSD(netAmountUsd)}</Text>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, !isValidAmount && styles.continueButtonDisabled]}
          onPress={handleContinueFromAmount}
          disabled={!isValidAmount}
        >
          <LinearGradient
            colors={isValidAmount ? ["#4ECDC4", "#44A08D"] : ["#444", "#333"]}
            style={styles.continueButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderAddressStep = () => {
    const chainForValidation =
      method === "base" ? getChainById(SOURCE_CHAIN_ID) : destinationChain;
    const placeholder = chainForValidation?.addressPlaceholder || "0x...";
    const networkName =
      method === "base" ? "Base" : destinationChain?.name || "destination chain";

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Enter Wallet Address</Text>
        <Text style={styles.stepSubtitle}>
          USDC will be sent to this address on {networkName}
        </Text>

        {/* Network Info Box */}
        <View style={styles.networkInfoBox}>
          <View style={styles.networkInfoHeader}>
            <Globe size={20} color="#4ECDC4" />
            <Text style={styles.networkInfoTitle}>Network: {networkName}</Text>
          </View>
          <Text style={styles.networkInfoText}>
            Make sure your destination wallet supports USDC on the {networkName} network.
            Using the wrong network will result in permanent loss of funds.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Wallet Address</Text>
          <TextInput
            style={[
              styles.textInput,
              !isValidAddress && destinationAddress.length > 0 && styles.textInputError,
            ]}
            value={destinationAddress}
            onChangeText={setDestinationAddress}
            placeholder={placeholder}
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!isValidAddress && destinationAddress.length > 0 && (
            <Text style={styles.inputError}>
              Please enter a valid {networkName} wallet address
            </Text>
          )}
        </View>

        {/* Warning Box - Critical */}
        <View style={styles.criticalWarningBox}>
          <AlertCircle size={20} color="#F5576C" />
          <View style={styles.criticalWarningContent}>
            <Text style={styles.criticalWarningTitle}>Before You Continue</Text>
            <Text style={styles.criticalWarningText}>
              {"\u2022"} Verify the address is correct - transactions cannot be reversed{"\n"}
              {"\u2022"} Ensure the wallet supports {networkName} USDC{"\n"}
              {"\u2022"} Do NOT send to exchange deposit addresses that don't support {networkName}{"\n"}
              {"\u2022"} Funds sent to wrong addresses are permanently lost
            </Text>
          </View>
        </View>

        {/* Helpful Tips */}
        <View style={styles.tipsBox}>
          <Info size={16} color="#A0A0A0" />
          <Text style={styles.tipsText}>
            Tip: If withdrawing to an exchange, check that they support USDC deposits on {networkName}.
            Popular options include Coinbase, Kraken, and Binance.
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.continueButton,
            (!isValidAddress || isFetchingQuote) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinueFromAddress}
          disabled={!isValidAddress || isFetchingQuote}
        >
          <LinearGradient
            colors={isValidAddress && !isFetchingQuote ? ["#4ECDC4", "#44A08D"] : ["#444", "#333"]}
            style={styles.continueButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isFetchingQuote ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.continueButtonText}>Fetching Quote...</Text>
              </>
            ) : (
              <>
                <Text style={styles.continueButtonText}>Continue</Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBankDetailsStep = () => {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Bank Details</Text>
        <Text style={styles.stepSubtitle}>
          Enter your bank account information for the transfer
        </Text>

        <View style={styles.bankForm}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Account Name *</Text>
            <TextInput
              style={styles.textInput}
              value={bankDetails.accountName}
              onChangeText={(v) => setBankDetails((prev) => ({ ...prev, accountName: v }))}
              placeholder="John Smith"
              placeholderTextColor="#666"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Account Number *</Text>
            <TextInput
              style={styles.textInput}
              value={bankDetails.accountNumber}
              onChangeText={(v) => setBankDetails((prev) => ({ ...prev, accountNumber: v }))}
              placeholder="12345678"
              placeholderTextColor="#666"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sort Code *</Text>
            <TextInput
              style={styles.textInput}
              value={bankDetails.sortCode}
              onChangeText={(v) => setBankDetails((prev) => ({ ...prev, sortCode: v }))}
              placeholder="12-34-56"
              placeholderTextColor="#666"
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.optionalDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.optionalText}>Optional</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>IBAN</Text>
            <TextInput
              style={styles.textInput}
              value={bankDetails.iban}
              onChangeText={(v) => setBankDetails((prev) => ({ ...prev, iban: v }))}
              placeholder="GB29 NWBK 6016 1331 9268 19"
              placeholderTextColor="#666"
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BIC / SWIFT</Text>
            <TextInput
              style={styles.textInput}
              value={bankDetails.bic}
              onChangeText={(v) => setBankDetails((prev) => ({ ...prev, bic: v }))}
              placeholder="NWBKGB2L"
              placeholderTextColor="#666"
              autoCapitalize="characters"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, !isValidBankDetails && styles.continueButtonDisabled]}
          onPress={handleContinueFromBankDetails}
          disabled={!isValidBankDetails}
        >
          <LinearGradient
            colors={isValidBankDetails ? ["#4ECDC4", "#44A08D"] : ["#444", "#333"]}
            style={styles.continueButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <ChevronRight size={20} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBridgeQuoteStep = () => {
    if (!bridgeFees || !destinationChain) return null;

    const platformFeeUsdc = netAmountUsdc * 0; // Platform fee already deducted from TCT
    const platformFeeTct = withdrawalFee;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Bridge Quote</Text>
        <Text style={styles.stepSubtitle}>
          Review fees before bridging to {destinationChain.name}
        </Text>

        <View style={styles.confirmCard}>
          <View style={styles.confirmHeader}>
            <View style={[styles.confirmIconContainer, { backgroundColor: `${destinationChain.color}20` }]}>
              <Globe size={32} color={destinationChain.color} />
            </View>
            <Text style={styles.confirmAmount}>{formatTCT(amount)} TCT</Text>
            <Text style={styles.confirmUsdc}>{"\u2248"} {tctToUsdc(amount).toFixed(2)} USDC</Text>
          </View>

          <View style={styles.confirmDetails}>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Platform Fee (1%)</Text>
              <Text style={styles.confirmValue}>{formatTCT(platformFeeTct)} TCT</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Bridge Fee</Text>
              <Text style={styles.confirmValue}>${bridgeFees.bridgeFeeUsd.toFixed(2)}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Gas Fee</Text>
              <Text style={styles.confirmValue}>${bridgeFees.gasFeeUsd.toFixed(2)}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Total Bridge + Gas</Text>
              <Text style={styles.confirmValue}>
                ${bridgeFees.totalBridgeAndGasFeeUsd.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.confirmRow, { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 12, marginTop: 4 }]}>
              <Text style={[styles.confirmLabel, { color: "#4ECDC4", fontWeight: "600" }]}>
                Est. Receive
              </Text>
              <Text style={[styles.confirmValue, { color: "#4ECDC4" }]}>
                {bridgeFees.estimatedReceiveAmount} USDC
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Min. Receive</Text>
              <Text style={styles.confirmValue}>
                {bridgeFees.estimatedReceiveAmountMin} USDC
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Est. Time</Text>
              <Text style={styles.confirmValue}>
                {formatDuration(bridgeFees.estimatedDurationSeconds)}
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Destination</Text>
              <Text style={styles.confirmValue}>{destinationChain.name}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>To Address</Text>
              <Text style={styles.confirmValue}>{truncateAddress(destinationAddress, 10, 8)}</Text>
            </View>
          </View>

          <View style={styles.signatureNote}>
            <Info size={16} color="#4ECDC4" />
            <Text style={styles.signatureNoteText}>
              Bridge fees are paid from the transferred USDC. The platform vault covers Base gas.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
          onPress={handleBridgeWithdrawal}
          disabled={isLoading}
        >
          <LinearGradient
            colors={!isLoading ? [destinationChain.color, "#333"] : ["#444", "#333"]}
            style={styles.continueButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.continueButtonText}>Submitting...</Text>
              </>
            ) : (
              <>
                <Globe size={20} color="#FFFFFF" />
                <Text style={styles.continueButtonText}>Confirm Bridge</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderConfirmStep = () => {
    const isBase = method === "base";
    const isBank = method === "bank";

    const iconColor = isBase ? "#0052FF" : isBank ? "#0075EB" : "#FFD700";
    const ConfirmIcon = isBase ? Send : isBank ? Building2 : ArrowUpRight;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Confirm Withdrawal</Text>
        <Text style={styles.stepSubtitle}>
          {isBank ? "Review your bank withdrawal" : "Review your withdrawal details"}
        </Text>

        <View style={styles.confirmCard}>
          <View style={styles.confirmHeader}>
            <View style={[styles.confirmIconContainer, { backgroundColor: `${iconColor}20` }]}>
              <ConfirmIcon size={32} color={iconColor} />
            </View>
            <Text style={styles.confirmAmount}>{formatTCT(netAmount)} TCT</Text>
            {isBank ? (
              <Text style={styles.confirmUsdc}>{"\u2248"} ${formatUSD(netAmountUsd)}</Text>
            ) : (
              <Text style={styles.confirmUsdc}>{"\u2248"} {netAmountUsdc.toFixed(2)} USDC</Text>
            )}
          </View>

          <View style={styles.confirmDetails}>
            {isBase && (
              <>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>To</Text>
                  <Text style={styles.confirmValue}>{truncateAddress(destinationAddress, 10, 8)}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Network</Text>
                  <Text style={styles.confirmValue}>Base</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Token</Text>
                  <Text style={styles.confirmValue}>USDC</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Processing Time</Text>
                  <Text style={[styles.confirmValue, { color: "#4ECDC4" }]}>~15 minutes</Text>
                </View>
              </>
            )}

            {isBank && (
              <>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Account Name</Text>
                  <Text style={styles.confirmValue}>{bankDetails.accountName}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Account Number</Text>
                  <Text style={styles.confirmValue}>****{bankDetails.accountNumber.slice(-4)}</Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Sort Code</Text>
                  <Text style={styles.confirmValue}>{bankDetails.sortCode}</Text>
                </View>
                {bankDetails.iban ? (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>IBAN</Text>
                    <Text style={styles.confirmValue}>{bankDetails.iban}</Text>
                  </View>
                ) : null}
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Processing Time</Text>
                  <Text style={styles.confirmValue}>2-3 business days</Text>
                </View>
              </>
            )}

            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>Platform Fee</Text>
              <Text style={styles.confirmValue}>
                {formatTCT(withdrawalFee)} TCT ({WITHDRAWAL_FEE_PERCENT}%)
              </Text>
            </View>
          </View>

          <View style={styles.signatureNote}>
            <Shield size={16} color={iconColor} />
            <Text style={[styles.signatureNoteText, { color: iconColor }]}>
              {isBank
                ? "Your bank details are stored securely. An admin will process the transfer."
                : "Your TCT is locked and USDC will be sent from the platform vault to your address."}
            </Text>
          </View>
        </View>

        {/* Final Warning for Crypto */}
        {isBase && (
          <View style={styles.finalWarningBox}>
            <AlertCircle size={18} color="#F5576C" />
            <Text style={styles.finalWarningText}>
              This action is irreversible. Please confirm the address is correct before proceeding.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, isLoading && styles.continueButtonDisabled]}
          onPress={handleConfirmSubmit}
          disabled={isLoading}
        >
          <LinearGradient
            colors={!isLoading ? ["#FFD700", "#FFA500"] : ["#444", "#333"]}
            style={styles.continueButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.continueButtonText}>
                  {isBank ? "Submitting..." : "Processing..."}
                </Text>
              </>
            ) : (
              <>
                <Shield size={20} color="#000" />
                <Text style={[styles.continueButtonText, { color: "#000" }]}>
                  {isBank ? "Submit Withdrawal" : "Confirm Withdrawal"}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBridgeProgressStep = () => {
    return (
      <View style={styles.stepContent}>
        <View style={styles.completeCard}>
          <View style={styles.completeIconContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
          </View>

          <Text style={styles.completeTitle}>Bridging in Progress</Text>
          <Text style={styles.completeMessage}>{bridgeStatus}</Text>

          {bridgeTxHash && (
            <TouchableOpacity
              style={styles.txHashButton}
              onPress={() => {
                const url = getExplorerTxUrl(bridgeTxHash, SOURCE_CHAIN_ID);
                if (url) Linking.openURL(url);
              }}
            >
              <ExternalLink size={16} color="#FFD700" />
              <Text style={styles.txHashText}>View Source TX on BaseScan</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bridgeProgressInfo}>
            <Info size={14} color="#A0A0A0" />
            <Text style={styles.bridgeProgressInfoText}>
              This may take a few minutes. You can close this screen and check back later.
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCompleteStep = () => {
    const resultChainId = withdrawalResult?.chainId || SOURCE_CHAIN_ID;
    const chain = getChainById(resultChainId);
    const explorerName = chain?.name || "Explorer";

    return (
      <View style={styles.stepContent}>
        <View style={styles.completeCard}>
          <View style={styles.completeIconContainer}>
            {withdrawalResult?.success ? (
              <CheckCircle size={64} color="#4ECDC4" />
            ) : (
              <AlertCircle size={64} color="#F5576C" />
            )}
          </View>

          <Text style={styles.completeTitle}>
            {withdrawalResult?.success ? "Withdrawal Submitted!" : "Withdrawal Failed"}
          </Text>

          <Text style={styles.completeMessage}>
            {withdrawalResult?.message || "Your withdrawal is being processed."}
          </Text>

          {withdrawalResult?.txHash && (
            <TouchableOpacity
              style={styles.txHashButton}
              onPress={() => {
                const url = getExplorerTxUrl(withdrawalResult.txHash!, resultChainId);
                if (url) Linking.openURL(url);
              }}
            >
              <ExternalLink size={16} color="#FFD700" />
              <Text style={styles.txHashText}>View on {explorerName}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <LinearGradient
              colors={["#4ECDC4", "#44A08D"]}
              style={styles.doneButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  const renderContent = () => {
    switch (step) {
      case "select":
        return renderSelectStep();
      case "chain-select":
        return renderChainSelectStep();
      case "amount":
        return renderAmountStep();
      case "address":
        return renderAddressStep();
      case "bank-details":
        return renderBankDetailsStep();
      case "bridge-quote":
        return renderBridgeQuoteStep();
      case "confirm":
        return renderConfirmStep();
      case "bridge-progress":
        return renderBridgeProgressStep();
      case "complete":
        return renderCompleteStep();
      default:
        return null;
    }
  };

  return (
    <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton} disabled={isRefreshing}>
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#FFD700" />
          ) : (
            <RefreshCw size={20} color="#FFD700" />
          )}
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>{formatTCT(availableBalance)} TCT</Text>
            <Text style={styles.balanceUsd}>${formatUSD(tctToUsd(availableBalance))}</Text>
          </View>
          {lockedBalance > 0 && (
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>Locked</Text>
              <Text style={styles.balanceLocked}>{formatTCT(lockedBalance)} TCT</Text>
              <Text style={styles.balanceUsdLocked}>(in games)</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && step === "select"}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
            colors={["#FFD700"]}
          />
        }
      >
        {renderContent()}
      </ScrollView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
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
    alignItems: "center",
    justifyContent: "center",
  },

  // Balance Card
  balanceCard: {
    marginHorizontal: 16,
    padding: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  balanceSection: {
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFD700",
    marginBottom: 2,
  },
  balanceLocked: {
    fontSize: 20,
    fontWeight: "700",
    color: "#A0A0A0",
    marginBottom: 2,
  },
  balanceUsd: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  balanceUsdLocked: {
    fontSize: 12,
    color: "#666",
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Step Content
  stepContent: {
    marginTop: 8,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: "#A0A0A0",
    marginBottom: 24,
  },

  // Method Cards
  methodsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  methodCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  methodCardDisabled: {
    opacity: 0.5,
  },
  methodCardGradient: {
    padding: 20,
    position: "relative",
  },
  methodCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  methodIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  methodTextContainer: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  methodTitleDisabled: {
    color: "#666",
  },
  methodSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
  },
  methodSubtitleDisabled: {
    color: "#555",
  },
  methodBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  methodBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Chain Select
  chainList: {
    gap: 8,
    marginBottom: 24,
  },
  chainItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  chainDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 14,
  },
  chainInfo: {
    flex: 1,
  },
  chainName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  chainNative: {
    fontSize: 13,
    color: "#A0A0A0",
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
  },
  infoText: {
    fontSize: 13,
    color: "#A0A0A0",
    flex: 1,
  },

  // Amount Input
  amountDisplayCard: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.15)",
  },
  amountInputTouchable: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountInput: {
    fontSize: 42,
    fontWeight: "800",
    color: "#FFD700",
    textAlign: "center",
    minWidth: 80,
    padding: 0,
  },
  amountInputUnderline: {
    width: "100%",
    height: 2,
    backgroundColor: "rgba(255, 215, 0, 0.3)",
    marginTop: 4,
    borderRadius: 1,
  },
  amountSuffix: {
    fontSize: 24,
    fontWeight: "700",
    color: "rgba(255, 215, 0, 0.5)",
  },
  amountUsd: {
    fontSize: 18,
    color: "#A0A0A0",
    marginTop: 8,
  },
  amountHint: {
    fontSize: 12,
    color: "rgba(255, 215, 0, 0.5)",
    marginTop: 6,
  },
  amountRange: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },

  // Quick Amounts
  quickAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 24,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },

  // Fee Breakdown
  feeBreakdown: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeRowTotal: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 12,
    marginTop: 4,
  },
  feeLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  feeValue: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  feeLabelTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  feeValueTotal: {
    alignItems: "flex-end",
  },
  feeTctTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFD700",
  },
  feeUsdcTotal: {
    fontSize: 13,
    color: "#A0A0A0",
    marginTop: 2,
  },

  // Continue Button
  continueButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Bank Form
  bankForm: {
    gap: 16,
    marginBottom: 24,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  textInputError: {
    borderColor: "#F5576C",
  },
  inputError: {
    fontSize: 12,
    color: "#F5576C",
    marginTop: 8,
  },
  externalWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  externalWarningText: {
    fontSize: 13,
    color: "#FFD700",
    flex: 1,
    lineHeight: 18,
  },

  // Network Info Box
  networkInfoBox: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  networkInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  networkInfoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  networkInfoText: {
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 18,
  },

  // Critical Warning Box
  criticalWarningBox: {
    flexDirection: "row",
    backgroundColor: "rgba(245, 87, 108, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 87, 108, 0.3)",
    gap: 12,
  },
  criticalWarningContent: {
    flex: 1,
  },
  criticalWarningTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F5576C",
    marginBottom: 8,
  },
  criticalWarningText: {
    fontSize: 13,
    color: "#F5576C",
    lineHeight: 20,
  },

  // Tips Box
  tipsBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 24,
  },
  tipsText: {
    fontSize: 12,
    color: "#888",
    flex: 1,
    lineHeight: 18,
  },

  // Final Warning Box (on confirm screen)
  finalWarningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(245, 87, 108, 0.1)",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(245, 87, 108, 0.2)",
  },
  finalWarningText: {
    fontSize: 13,
    color: "#F5576C",
    flex: 1,
    lineHeight: 18,
    fontWeight: "500",
  },

  optionalDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  optionalText: {
    fontSize: 12,
    color: "#666",
  },

  // Summary Card
  summaryCard: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  summaryValueHighlight: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4ECDC4",
  },

  // Confirm Card
  confirmCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  confirmHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  confirmIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  confirmAmount: {
    fontSize: 36,
    fontWeight: "800",
    color: "#FFD700",
  },
  confirmUsdc: {
    fontSize: 18,
    color: "#A0A0A0",
    marginTop: 4,
  },
  confirmDetails: {
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confirmLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  signatureNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    padding: 12,
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 8,
  },
  signatureNoteText: {
    fontSize: 13,
    color: "#4ECDC4",
    flex: 1,
  },

  // Complete Card
  completeCard: {
    alignItems: "center",
    padding: 32,
  },
  completeIconContainer: {
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  completeMessage: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  txHashButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    marginBottom: 32,
  },
  txHashText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },
  doneButton: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  doneButtonGradient: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Bridge Progress
  bridgeProgressInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginTop: 16,
    width: "100%",
  },
  bridgeProgressInfoText: {
    fontSize: 13,
    color: "#A0A0A0",
    flex: 1,
    lineHeight: 18,
  },

  // Pending Section
  pendingSection: {
    marginBottom: 24,
  },
  pendingSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  pendingItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  pendingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pendingDetails: {
    flex: 1,
  },
  pendingAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F5576C",
    marginBottom: 2,
  },
  pendingStatus: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  pendingMethod: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  pendingTxLink: {
    padding: 8,
  },
});
