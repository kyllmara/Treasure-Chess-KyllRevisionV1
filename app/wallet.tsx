import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Linking,
  SafeAreaView,
  StatusBar,
  Platform,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Animated,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Slider from "@/components/shims/Slider";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, TrendingDown, Wallet as WalletIcon, CreditCard, Building2, Bitcoin, X, Copy, Check, History, ArrowLeft, RefreshCw, Clock, AlertCircle, Link2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import { AuthGate } from "@/components/AuthGate";
import { useWalletStore, type Transaction, type TransactionFilter } from "@/stores/walletStore";
import { useUserStore } from "@/stores/userStore";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/hooks/useWallet";
import { requestWithdrawal, type WithdrawalRequest } from "@/lib/wallet";
import { supabase } from "@/lib/supabase";
import NetInfo from "@react-native-community/netinfo";
import { ConnectWalletModal } from "@/components/ConnectWalletModal";

const PRESET_AMOUNTS = [10, 25, 50, 100];
const TCT_TO_USD = 0.04;
// Network configuration
const NETWORK_NAME = "Base";
const USDC_CONTRACT = process.env.EXPO_PUBLIC_USDC_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function usdToTCT(usd: number): number {
  return usd / TCT_TO_USD;
}

function WalletContent() {
  const router = useRouter();

  // Use Zustand stores and Auth context
  const profile = useUserStore((state) => state.profile);
  const { user } = useAuth();

  // Use the useWallet hook for on-chain balance
  const {
    address: walletAddress,
    availableTCT: onChainTctBalance,
    availableUSDC: onChainUsdcBalance,
    lockedTCT: onChainLockedTct,
    isLoading: isLoadingOnChainBalance,
    refreshBalance: refreshOnChainBalance,
  } = useWallet();

  // Track balance changes for +/- indicator (only for real-time changes)
  const [balanceChange, setBalanceChange] = useState<number | null>(null);
  const changeOpacity = React.useRef(new Animated.Value(0)).current;
  const prevBalanceRef = React.useRef<number | null>(null);
  const canTrackChangesRef = React.useRef(false);

  // Start tracking changes only after 2 seconds on the screen (after initial load settles)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Store current balance as baseline after initial load period
      if (onChainTctBalance !== undefined && onChainTctBalance !== null && onChainTctBalance > 0) {
        prevBalanceRef.current = onChainTctBalance;
      }
      canTrackChangesRef.current = true;
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Detect balance changes - only after the initial 2 second window
  useEffect(() => {
    if (!canTrackChangesRef.current) return;
    if (onChainTctBalance === undefined || onChainTctBalance === null) return;

    if (prevBalanceRef.current !== null && prevBalanceRef.current !== onChainTctBalance) {
      const change = onChainTctBalance - prevBalanceRef.current;
      if (change !== 0) {
        setBalanceChange(change);
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
  }, [onChainTctBalance]);

  // Auto-refresh balance every 10 seconds to detect deposits in real-time
  useEffect(() => {
    const interval = setInterval(() => {
      if (refreshOnChainBalance) {
        refreshOnChainBalance();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [refreshOnChainBalance]);

  // Get wallet address from useWallet hook, auth, or profile
  const userWalletAddress = walletAddress || user?.walletAddress || profile?.embeddedWalletAddress || "";
  const {
    lockedTctBalance,
    transactions,
    isLoadingBalance,
    isLoadingTransactions,
    isRefreshing,
    balanceError,
    transactionError,
    hasMoreTransactions,
    pendingCryptoWithdrawals,
    lastBalanceSyncAt,
    selectedTransaction,
    isOnline,
    offlineQueue,
    initializeWallet,
    refreshBalance,
    refreshTransactions,
    loadMoreTransactions,
    tctToUsd,
    applyOptimisticWithdrawal,
    rollbackOptimisticUpdate,
    confirmOptimisticUpdate,
    setOnlineStatus,
    addToOfflineQueue,
    processOfflineQueue,
    setSelectedTransaction,
    getCombinedTransactions,
  } = useWalletStore();

  // TCT balance from wallet store
  const tctBalance = onChainTctBalance;

  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState<string>("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [withdrawSliderValue, setWithdrawSliderValue] = useState<number>(10);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState<boolean>(false);
  const [showCryptoModal, setShowCryptoModal] = useState<boolean>(false);
  const [showBankDetailsModal, setShowBankDetailsModal] = useState<boolean>(false);
  const [bankDetails, setBankDetails] = useState<{
    fullName: string;
    accountNumber: string;
    sortCode: string;
    iban: string;
  }>({
    fullName: "",
    accountNumber: "",
    sortCode: "",
    iban: "",
  });
  const [withdrawalWalletAddress, setWithdrawalWalletAddress] = useState<string>("");
  const [addressCopied, setAddressCopied] = useState<boolean>(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState<boolean>(false);
  const [showTransactionDetail, setShowTransactionDetail] = useState<boolean>(false);
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>("all");
  const [isSubmittingWithdrawal, setIsSubmittingWithdrawal] = useState<boolean>(false);
  const [showConnectWalletModal, setShowConnectWalletModal] = useState<boolean>(false);

  // Get combined transactions (includes pending withdrawals)
  const combinedTransactions = getCombinedTransactions();

  // Calculate USD balance from TCT
  const usdBalance = tctToUsd(tctBalance);
  const lockedUsdBalance = tctToUsd(lockedTctBalance);

  // Initialize wallet on mount
  useEffect(() => {
    if (profile?.id) {
      initializeWallet(profile.id);
    }
  }, [profile?.id, initializeWallet]);

  // Monitor network status for offline queue
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected ?? true;
      setOnlineStatus(online);

      // Process offline queue when coming back online
      if (online && profile?.id) {
        processOfflineQueue(profile.id);
      }
    });

    return () => unsubscribe();
  }, [profile?.id, setOnlineStatus, processOfflineQueue]);

  // Handle pull to refresh
  const handleRefresh = useCallback(async () => {
    // Refresh on-chain balance
    await refreshOnChainBalance();

    if (profile?.id) {
      await Promise.all([
        refreshBalance(profile.id),
        refreshTransactions(profile.id),
      ]);
    }
  }, [profile?.id, refreshBalance, refreshTransactions, refreshOnChainBalance]);

  // Load more transactions for infinite scroll
  const handleLoadMoreTransactions = useCallback(() => {
    if (profile?.id && hasMoreTransactions && !isLoadingTransactions) {
      loadMoreTransactions(profile.id, transactionFilter);
    }
  }, [profile?.id, hasMoreTransactions, isLoadingTransactions, loadMoreTransactions, transactionFilter]);

  // Safety check - if user profile is not loaded, show loading state
  if (!profile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0F0F1E' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={{ color: '#FFFFFF', fontSize: 16, marginTop: 16 }}>Loading wallet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handlePresetSelect = (value: number) => {
    setSelectedPreset(value);
    setAmount(value.toString());
  };

  const handleWithdrawSliderChange = (value: number) => {
    const roundedValue = Math.round(value);
    setWithdrawSliderValue(roundedValue);
    setAmount(roundedValue.toString());
  };

  const handleDeposit = () => {
    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    setShowPaymentMethodModal(true);
  };

  const handleCryptoDeposit = () => {
    setShowPaymentMethodModal(false);
    setShowCryptoModal(true);
    setAddressCopied(false);
  };

  const handleConnectWallet = () => {
    setShowCryptoModal(false);
    setShowConnectWalletModal(true);
  };

  const handleWalletConnectTransactionComplete = (txHash: string, usdAmount: number) => {
    // When a WalletConnect transfer completes, we should notify the user
    // The actual TCT credit will happen via the deposit monitor edge function
    const tctAmount = usdToTCT(usdAmount);
    console.log(`WalletConnect deposit complete: ${usdAmount} USDC = ${tctAmount} TCT, tx: ${txHash}`);

    // Refresh balance after a short delay to allow backend processing
    setTimeout(() => {
      if (profile?.id) {
        refreshBalance(profile.id);
        refreshTransactions(profile.id);
      }
    }, 5000);
  };

  const handleCryptoWithdraw = () => {
    setShowPaymentMethodModal(false);
    setShowCryptoModal(true);
  };

  const handleBankTransferWithdraw = () => {
    setShowPaymentMethodModal(false);
    setShowBankDetailsModal(true);
  };

  const submitBankDetails = async () => {
    if (!bankDetails.fullName || !bankDetails.accountNumber || !bankDetails.sortCode) {
      Alert.alert("Missing Information", "Please fill in all required fields");
      return;
    }

    if (!profile?.id) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    const withdrawAmountUsd = parseFloat(amount);
    const withdrawAmountTct = usdToTCT(withdrawAmountUsd);

    // Validate against available balance
    if (withdrawAmountTct > tctBalance) {
      Alert.alert("Insufficient Funds", "You don't have enough available balance");
      return;
    }

    setIsSubmittingWithdrawal(true);

    // Apply optimistic update immediately
    const snapshotId = applyOptimisticWithdrawal(withdrawAmountTct);

    const withdrawalRequest: WithdrawalRequest = {
      userId: profile.id,
      amountTct: withdrawAmountTct,
      type: "bank",
      bankDetails: {
        accountName: bankDetails.fullName,
        accountNumber: bankDetails.accountNumber,
        sortCode: bankDetails.sortCode,
        iban: bankDetails.iban || undefined,
      },
    };

    // If offline, queue the operation
    if (!isOnline) {
      addToOfflineQueue({
        type: "withdrawal",
        data: withdrawalRequest,
        maxRetries: 3,
      });

      Alert.alert(
        "Queued for Processing",
        "You're offline. Your withdrawal will be processed when you're back online."
      );
      setShowBankDetailsModal(false);
      setBankDetails({ fullName: "", accountNumber: "", sortCode: "", iban: "" });
      setAmount("");
      setSelectedPreset(null);
      setIsSubmittingWithdrawal(false);
      confirmOptimisticUpdate(snapshotId);
      return;
    }

    try {
      const result = await requestWithdrawal(withdrawalRequest);

      if (result.success) {
        // Confirm the optimistic update
        confirmOptimisticUpdate(snapshotId);

        Alert.alert(
          "Withdrawal Requested",
          `${withdrawAmountTct.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($${withdrawAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) will be withdrawn to your bank account\n\nProcessing time: 1-3 business days`
        );
        setShowBankDetailsModal(false);
        setBankDetails({
          fullName: "",
          accountNumber: "",
          sortCode: "",
          iban: "",
        });
        setAmount("");
        setSelectedPreset(null);

        // Refresh balance and transactions
        if (profile?.id) {
          refreshBalance(profile.id);
          refreshTransactions(profile.id);
        }
      } else {
        // Rollback on failure
        rollbackOptimisticUpdate(snapshotId);
        Alert.alert("Error", result.error?.message || "Failed to request withdrawal");
      }
    } catch (error) {
      // Rollback on error
      rollbackOptimisticUpdate(snapshotId);
      Alert.alert("Error", "Failed to request withdrawal. Please try again.");
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const submitCryptoWithdrawal = async () => {
    if (!withdrawalWalletAddress) {
      Alert.alert("Missing Information", "Please enter your wallet address");
      return;
    }

    if (!profile?.id) {
      Alert.alert("Error", "User not authenticated");
      return;
    }

    const withdrawAmountUsd = parseFloat(amount);
    const withdrawAmountTct = usdToTCT(withdrawAmountUsd);

    // Validate against available balance
    if (withdrawAmountTct > tctBalance) {
      Alert.alert("Insufficient Funds", "You don't have enough available balance");
      return;
    }

    setIsSubmittingWithdrawal(true);

    // Apply optimistic update immediately
    const snapshotId = applyOptimisticWithdrawal(withdrawAmountTct);

    const withdrawalRequest: WithdrawalRequest = {
      userId: profile.id,
      amountTct: withdrawAmountTct,
      type: "crypto",
      destinationAddress: withdrawalWalletAddress,
    };

    // If offline, queue the operation
    if (!isOnline) {
      addToOfflineQueue({
        type: "withdrawal",
        data: withdrawalRequest,
        maxRetries: 3,
      });

      Alert.alert(
        "Queued for Processing",
        "You're offline. Your withdrawal will be processed when you're back online."
      );
      setShowCryptoModal(false);
      setWithdrawalWalletAddress("");
      setAmount("");
      setSelectedPreset(null);
      setIsSubmittingWithdrawal(false);
      confirmOptimisticUpdate(snapshotId);
      return;
    }

    try {
      const result = await requestWithdrawal(withdrawalRequest);

      if (result.success) {
        // Confirm the optimistic update
        confirmOptimisticUpdate(snapshotId);

        Alert.alert(
          "Withdrawal Requested",
          `${withdrawAmountTct.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($${withdrawAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) USDC will be sent to:\n${withdrawalWalletAddress.substring(0, 10)}...${withdrawalWalletAddress.substring(withdrawalWalletAddress.length - 8)}`
        );
        setShowCryptoModal(false);
        setWithdrawalWalletAddress("");
        setAmount("");
        setSelectedPreset(null);

        // Refresh balance and transactions
        if (profile?.id) {
          refreshBalance(profile.id);
          refreshTransactions(profile.id);
        }
      } else {
        // Rollback on failure
        rollbackOptimisticUpdate(snapshotId);
        Alert.alert("Error", result.error?.message || "Failed to request withdrawal");
      }
    } catch (error) {
      // Rollback on error
      rollbackOptimisticUpdate(snapshotId);
      Alert.alert("Error", "Failed to request withdrawal. Please try again.");
    } finally {
      setIsSubmittingWithdrawal(false);
    }
  };

  const processDeposit = async (paymentMethod: string) => {
    const depositAmount = parseFloat(amount);

    if (paymentMethod === "Crypto Wallet") {
      handleCryptoDeposit();
      return;
    }

    if (paymentMethod === "Revolut / Apple / BACS") {
      let checkoutUrl = "";

      if (depositAmount === 10) {
        checkoutUrl = "https://checkout.revolut.com/pay/7b37b870-94ab-485e-a282-6d680bbeca1f";
      } else if (depositAmount === 25) {
        checkoutUrl = "https://checkout.revolut.com/pay/587390b1-6dab-4bfe-b625-f659b760b826";
      } else if (depositAmount === 50) {
        checkoutUrl = "https://checkout.revolut.com/pay/f521e2e4-7f16-44f9-952f-8b0929b8270e";
      } else if (depositAmount === 100) {
        checkoutUrl = "https://checkout.revolut.com/pay/9bd243d1-6c13-4ee4-bd14-503414151add";
      } else {
        checkoutUrl = "https://checkout.revolut.com/pay/6da7da05-4a8f-4a95-a1df-81705f86f0ef";
      }

      if (checkoutUrl) {
        try {
          const supported = await Linking.canOpenURL(checkoutUrl);
          if (supported) {
            await Linking.openURL(checkoutUrl);
            setShowPaymentMethodModal(false);
            // Note: Balance will be updated via Supabase real-time subscription
            // when the payment webhook processes the deposit
            Alert.alert(
              "Payment Started",
              "Complete the payment in your browser. Your balance will update automatically once the payment is confirmed."
            );
            setAmount("");
            setSelectedPreset(null);
          } else {
            Alert.alert("Error", "Cannot open Revolut checkout");
          }
        } catch {
          Alert.alert("Error", "Failed to open Revolut checkout");
        }
        return;
      }
    }

    // For other payment methods - show info that balance updates automatically
    Alert.alert(
      "Deposit Instructions",
      `Complete the deposit via ${paymentMethod}. Your balance will update automatically once the deposit is confirmed.`
    );
    setShowPaymentMethodModal(false);
  };

  const handleWithdraw = () => {
    const withdrawAmountUsd = parseFloat(amount);
    if (!withdrawAmountUsd || withdrawAmountUsd <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    const withdrawAmountTct = usdToTCT(withdrawAmountUsd);
    if (withdrawAmountTct > tctBalance) {
      Alert.alert("Insufficient Funds", "You don't have enough available balance");
      return;
    }

    setShowPaymentMethodModal(true);
  };

  const processWithdraw = (paymentMethod: string) => {
    if (paymentMethod === "Crypto Wallet") {
      handleCryptoWithdraw();
      return;
    }

    if (paymentMethod === "Direct Bank Transfer") {
      handleBankTransferWithdraw();
      return;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1E" />
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradientContainer}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Wallet</Text>
            <TouchableOpacity onPress={() => setShowTransactionHistory(true)} style={styles.historyButton}>
              <History size={24} color="#FFD700" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFD700"
                colors={["#FFD700"]}
              />
            }
          >
            <View style={styles.content}>
              {/* Balance Card */}
              <View style={styles.balanceCard}>
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  style={styles.balanceGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {(isLoadingBalance || isLoadingOnChainBalance) ? (
                    <ActivityIndicator size="small" color="#0F0F1E" />
                  ) : (
                    <WalletIcon size={32} color="#0F0F1E" />
                  )}
                  <Text style={styles.balanceLabel}>Available Balance</Text>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceTCT}>
                      {tctBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT
                    </Text>
                    {balanceChange !== null && (
                      <Animated.View style={[styles.balanceChangeIndicator, { opacity: changeOpacity }]}>
                        <Text style={[
                          styles.balanceChangeText,
                          balanceChange > 0 ? styles.balanceChangePositive : styles.balanceChangeNegative
                        ]}>
                          {balanceChange > 0 ? "+" : ""}{balanceChange.toLocaleString()}
                        </Text>
                      </Animated.View>
                    )}
                  </View>
                  <Text style={styles.balanceValue}>
                    ${usdBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  {/* Wallet Address - Copyable */}
                  {userWalletAddress && (
                    <TouchableOpacity
                      style={styles.walletAddressContainer}
                      onPress={async () => {
                        await Clipboard.setStringAsync(userWalletAddress);
                        setAddressCopied(true);
                        setTimeout(() => setAddressCopied(false), 2000);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.walletAddressLabel}>Wallet Address</Text>
                      <View style={styles.walletAddressRow}>
                        <Text style={styles.walletAddressText}>
                          {userWalletAddress.substring(0, 6)}...{userWalletAddress.substring(userWalletAddress.length - 4)}
                        </Text>
                        {addressCopied ? (
                          <Check size={14} color="#0F0F1E" />
                        ) : (
                          <Copy size={14} color="#0F0F1E" />
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  {lockedTctBalance > 0 && (
                    <Text style={styles.lockedBalance}>
                      + {lockedTctBalance.toLocaleString()} TCT locked in games
                    </Text>
                  )}
                  {lastBalanceSyncAt && (
                    <Text style={styles.syncTimestamp}>
                      Last synced: {new Date(lastBalanceSyncAt).toLocaleTimeString()}
                    </Text>
                  )}
                </LinearGradient>
              </View>

              {/* Balance Error Banner */}
              {balanceError && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={16} color="#FF6B6B" />
                  <Text style={styles.errorBannerText}>{balanceError}</Text>
                  <TouchableOpacity onPress={handleRefresh}>
                    <RefreshCw size={16} color="#FFD700" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === "deposit" && styles.tabActive]}
                  onPress={() => {
                    setActiveTab("deposit");
                    setAmount("");
                    setSelectedPreset(null);
                  }}
                >
                  <TrendingUp
                    size={20}
                    color={activeTab === "deposit" ? "#FFD700" : "#666"}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === "deposit" && styles.tabTextActive,
                    ]}
                  >
                    Deposit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === "withdraw" && styles.tabActive]}
                  onPress={() => {
                    setActiveTab("withdraw");
                    setAmount("");
                    setSelectedPreset(null);
                    // Set initial slider value to minimum or current balance
                    setWithdrawSliderValue(Math.min(10, usdBalance));
                  }}
                >
                  <TrendingDown
                    size={20}
                    color={activeTab === "withdraw" ? "#FFD700" : "#666"}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === "withdraw" && styles.tabTextActive,
                    ]}
                  >
                    Withdraw
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === "deposit" ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Amount</Text>
                  <View style={styles.presetGrid}>
                    {PRESET_AMOUNTS.map((preset) => (
                      <TouchableOpacity
                        key={preset}
                        style={[
                          styles.presetButtonFull,
                          selectedPreset === preset && styles.presetButtonActive,
                        ]}
                        onPress={() => handlePresetSelect(preset)}
                      >
                        <Text
                          style={[
                            styles.presetText,
                            selectedPreset === preset && styles.presetTextActive,
                          ]}
                        >
                          ${preset}
                        </Text>
                        <Text
                          style={[
                            styles.presetTCTText,
                            selectedPreset === preset && styles.presetTCTTextActive,
                          ]}
                        >
                          {usdToTCT(preset).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TCT
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      !amount && styles.actionButtonDisabled,
                    ]}
                    onPress={handleDeposit}
                    disabled={!amount}
                  >
                    <LinearGradient
                      colors={amount ? ["#FFD700", "#FFA500"] : ["#333", "#222"]}
                      style={styles.actionButtonGradient}
                    >
                      <Text style={styles.actionButtonText}>
                        Deposit {amount ? `$${amount}` : ""}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Withdraw Funds</Text>
                  <Text style={styles.withdrawDescription}>
                    Withdraw USDC to your Base wallet.
                  </Text>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => router.push("/withdraw")}
                  >
                    <LinearGradient
                      colors={["#FFD700", "#FFA500"]}
                      style={styles.actionButtonGradient}
                    >
                      <Text style={styles.actionButtonText}>
                        Withdraw Funds
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

      {/* Payment Method Modal */}
      <Modal
        visible={showPaymentMethodModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentMethodModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === "deposit" ? "Select Payment Method" : "Select Withdrawal Method"}
              </Text>
              <TouchableOpacity onPress={() => setShowPaymentMethodModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {activeTab === "deposit" ? (
              <>
                <TouchableOpacity
                  style={styles.paymentMethodButton}
                  onPress={() => processDeposit("Revolut / Apple / BACS")}
                >
                  <CreditCard size={24} color="#FFD700" />
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodTitle}>Revolut / Apple / BACS</Text>
                    <Text style={styles.paymentMethodSubtitle}>Instant deposit</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.paymentMethodButton}
                  onPress={() => processDeposit("Crypto Wallet")}
                >
                  <Bitcoin size={24} color="#F7931A" />
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodTitle}>Crypto Wallet</Text>
                    <Text style={styles.paymentMethodSubtitle}>USDC on {NETWORK_NAME}</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.paymentMethodButton}
                  onPress={() => processWithdraw("Direct Bank Transfer")}
                >
                  <Building2 size={24} color="#FFD700" />
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodTitle}>Direct Bank Transfer</Text>
                    <Text style={styles.paymentMethodSubtitle}>1-3 business days</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.paymentMethodButton}
                  onPress={() => processWithdraw("Crypto Wallet")}
                >
                  <Bitcoin size={24} color="#F7931A" />
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodTitle}>Crypto Wallet</Text>
                    <Text style={styles.paymentMethodSubtitle}>USDC on {NETWORK_NAME}</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Crypto Modal */}
      <Modal
        visible={showCryptoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCryptoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === "deposit" ? "Crypto Deposit" : "Crypto Withdrawal"}
              </Text>
              <TouchableOpacity onPress={() => setShowCryptoModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {activeTab === "deposit" ? (
              <View style={styles.cryptoDepositContent}>
                {/* User's Wallet Address Section */}
                <Text style={styles.cryptoSectionTitle}>Your Wallet Address</Text>
                <Text style={styles.cryptoInstructions}>
                  Send USDC from MetaMask, Phantom, or any wallet to your Treasure Chess wallet:
                </Text>
                <View style={styles.addressContainer}>
                  <View style={styles.addressBox}>
                    <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                      {userWalletAddress || "Sign in to view your wallet address"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={async () => {
                      if (userWalletAddress) {
                        await Clipboard.setStringAsync(userWalletAddress);
                        setAddressCopied(true);
                        setTimeout(() => setAddressCopied(false), 2000);
                      }
                    }}
                    disabled={!userWalletAddress}
                  >
                    <LinearGradient
                      colors={addressCopied ? ["#4ECDC4", "#44A08D"] : ["#FFD700", "#FFA500"]}
                      style={styles.copyButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {addressCopied ? (
                        <Check size={20} color="#0F0F1E" />
                      ) : (
                        <Copy size={20} color="#0F0F1E" />
                      )}
                      <Text style={[styles.copyButtonText, { color: "#0F0F1E" }]}>
                        {addressCopied ? "Copied!" : "Copy"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or connect wallet to transfer</Text>
                  <View style={styles.orLine} />
                </View>

                {/* Connect Wallet Options */}
                <TouchableOpacity
                  style={styles.connectWalletButton}
                  onPress={handleConnectWallet}
                >
                  <LinearGradient
                    colors={["#3B99FC", "#1A6FDB"]}
                    style={styles.connectWalletGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Link2 size={24} color="#FFFFFF" />
                    <View style={styles.connectWalletTextContainer}>
                      <Text style={[styles.connectWalletTitle, { color: "#FFFFFF" }]}>Connect Wallet</Text>
                      <Text style={[styles.connectWalletSubtitle, { color: "rgba(255,255,255,0.7)" }]}>
                        MetaMask, Rainbow, Trust & more
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.conversionInfo}>
                  1 USDC = 25 TCT • Credits after 12 confirmations
                </Text>
                <Text style={styles.cryptoWarning}>
                  Only send USDC on {NETWORK_NAME}. Sending other tokens or using other networks may result in permanent loss.
                </Text>
              </View>
            ) : (
              <View style={styles.cryptoWithdrawContent}>
                <Text style={styles.cryptoInstructions}>
                  Enter your wallet address to receive USDC:
                </Text>
                <TextInput
                  style={styles.walletInput}
                  placeholder="0x..."
                  placeholderTextColor="#666"
                  value={withdrawalWalletAddress}
                  onChangeText={setWithdrawalWalletAddress}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    !withdrawalWalletAddress && styles.actionButtonDisabled,
                  ]}
                  onPress={submitCryptoWithdrawal}
                  disabled={!withdrawalWalletAddress}
                >
                  <LinearGradient
                    colors={withdrawalWalletAddress ? ["#FFD700", "#FFA500"] : ["#333", "#222"]}
                    style={styles.actionButtonGradient}
                  >
                    <Text style={styles.actionButtonText}>Confirm Withdrawal</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Bank Details Modal */}
      <Modal
        visible={showBankDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBankDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bank Transfer Details</Text>
              <TouchableOpacity onPress={() => setShowBankDetailsModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.bankDetailsForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="John Smith"
                  placeholderTextColor="#666"
                  value={bankDetails.fullName}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, fullName: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account Number *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="12345678"
                  placeholderTextColor="#666"
                  value={bankDetails.accountNumber}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, accountNumber: text })}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Sort Code *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="00-00-00"
                  placeholderTextColor="#666"
                  value={bankDetails.sortCode}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, sortCode: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>IBAN (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="GB00XXXX00000000000000"
                  placeholderTextColor="#666"
                  value={bankDetails.iban}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, iban: text })}
                  autoCapitalize="characters"
                />
              </View>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={submitBankDetails}
              >
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  style={styles.actionButtonGradient}
                >
                  <Text style={styles.actionButtonText}>
                    Withdraw ${withdrawSliderValue}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal
        visible={showTransactionDetail}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowTransactionDetail(false);
          setSelectedTransaction(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction Details</Text>
              <TouchableOpacity onPress={() => {
                setShowTransactionDetail(false);
                setSelectedTransaction(null);
              }}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {selectedTransaction && (
              <View style={styles.transactionDetailContent}>
                {/* Transaction Type Icon */}
                <View style={styles.detailIconContainer}>
                  {selectedTransaction.status === 'pending' ? (
                    <Clock size={32} color="#FFA500" />
                  ) : ['deposit', 'wager_unlock', 'win_payout', 'refund', 'reward'].includes(selectedTransaction.type) ? (
                    <TrendingUp size={32} color="#4ECDC4" />
                  ) : (
                    <TrendingDown size={32} color="#FF6B6B" />
                  )}
                </View>

                {/* Transaction Amount */}
                <Text style={[
                  styles.detailAmount,
                  selectedTransaction.status === 'pending' ? styles.pendingAmount :
                  ['deposit', 'wager_unlock', 'win_payout', 'refund', 'reward'].includes(selectedTransaction.type) ? styles.positiveAmount : styles.negativeAmount
                ]}>
                  {['deposit', 'wager_unlock', 'win_payout', 'refund', 'reward'].includes(selectedTransaction.type) ? '+' : '-'}
                  {selectedTransaction.tctAmount.toLocaleString()} TCT
                </Text>
                <Text style={styles.detailAmountUsd}>
                  ${selectedTransaction.amount.toFixed(2)} USD
                </Text>

                {/* Status Badge */}
                <View style={[
                  styles.statusBadge,
                  selectedTransaction.status === 'confirmed' && styles.statusBadgeConfirmed,
                  selectedTransaction.status === 'pending' && styles.statusBadgePending,
                  selectedTransaction.status === 'failed' && styles.statusBadgeFailed,
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {selectedTransaction.status.charAt(0).toUpperCase() + selectedTransaction.status.slice(1)}
                  </Text>
                </View>

                {/* Transaction Details */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>
                    {selectedTransaction.description || getTransactionTypeLabel(selectedTransaction.type)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedTransaction.createdAt).toLocaleDateString()} at {new Date(selectedTransaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Transaction ID</Text>
                  <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                    {selectedTransaction.id}
                  </Text>
                </View>

                {selectedTransaction.txHash && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Blockchain TX</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const txUrl = `https://basescan.org/tx/${selectedTransaction.txHash}`;
                        Linking.openURL(txUrl);
                      }}
                    >
                      <Text style={[styles.detailValue, styles.detailValueLink]} numberOfLines={1} ellipsizeMode="middle">
                        {selectedTransaction.txHash.substring(0, 10)}...{selectedTransaction.txHash.substring(selectedTransaction.txHash.length - 8)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedTransaction.gameId && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Game ID</Text>
                    <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                      {selectedTransaction.gameId}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Connect Wallet Modal */}
      <ConnectWalletModal
        visible={showConnectWalletModal}
        onClose={() => setShowConnectWalletModal(false)}
        depositAmount={parseFloat(amount) || undefined}
        onTransactionComplete={handleWalletConnectTransactionComplete}
      />

      {/* Transaction History Modal */}
      <Modal
        visible={showTransactionHistory}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTransactionHistory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transaction History</Text>
              <TouchableOpacity onPress={() => setShowTransactionHistory(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Transaction Filter Tabs */}
            <View style={styles.filterContainer}>
              {(['all', 'deposits', 'withdrawals', 'wagers'] as TransactionFilter[]).map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterTab, transactionFilter === filter && styles.filterTabActive]}
                  onPress={() => {
                    setTransactionFilter(filter);
                    if (profile?.id) {
                      refreshTransactions(profile.id);
                    }
                  }}
                >
                  <Text style={[styles.filterTabText, transactionFilter === filter && styles.filterTabTextActive]}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isLoadingTransactions && transactions.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
              </View>
            ) : combinedTransactions && combinedTransactions.length > 0 ? (
              <FlatList
                data={combinedTransactions}
                keyExtractor={(item) => item.id}
                style={styles.transactionList}
                onEndReached={handleLoadMoreTransactions}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                  isLoadingTransactions ? (
                    <View style={styles.loadMoreContainer}>
                      <ActivityIndicator size="small" color="#FFD700" />
                    </View>
                  ) : hasMoreTransactions ? (
                    <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMoreTransactions}>
                      <Text style={styles.loadMoreText}>Load More</Text>
                    </TouchableOpacity>
                  ) : null
                }
                renderItem={({ item: tx }) => {
                  const isPositive = ['deposit', 'wager_unlock', 'win_payout', 'refund', 'reward'].includes(tx.type);
                  const isPending = tx.status === 'pending';
                  return (
                    <TouchableOpacity
                      style={[styles.transactionItem, isPending && styles.transactionItemPending]}
                      onPress={() => {
                        setSelectedTransaction(tx);
                        setShowTransactionDetail(true);
                      }}
                    >
                      <View style={styles.transactionIcon}>
                        {isPending ? (
                          <Clock size={20} color="#FFA500" />
                        ) : isPositive ? (
                          <TrendingUp size={20} color="#4ECDC4" />
                        ) : (
                          <TrendingDown size={20} color="#FF6B6B" />
                        )}
                      </View>
                      <View style={styles.transactionInfo}>
                        <Text style={styles.transactionType}>
                          {tx.description || getTransactionTypeLabel(tx.type)}
                        </Text>
                        <Text style={styles.transactionDate}>
                          {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {isPending && (
                          <Text style={styles.pendingLabel}>Processing...</Text>
                        )}
                      </View>
                      <View style={styles.transactionAmounts}>
                        <Text style={[styles.transactionAmount, isPending ? styles.pendingAmount : isPositive ? styles.positiveAmount : styles.negativeAmount]}>
                          {isPositive ? '+' : '-'}{tx.tctAmount.toLocaleString()} TCT
                        </Text>
                        <Text style={styles.transactionAmountUsd}>
                          ${tx.amount.toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <View style={styles.emptyTransactions}>
                <History size={48} color="#666" />
                <Text style={styles.emptyTransactionsText}>No transactions yet</Text>
                <Text style={styles.emptyTransactionsSubtext}>Your transaction history will appear here</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Helper function to get transaction type label
function getTransactionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    wager_lock: 'Wager Locked',
    wager_unlock: 'Wager Unlocked',
    win_payout: 'Game Won',
    loss_deduct: 'Game Lost',
    commission: 'Commission',
    refund: 'Refund',
    reward: 'Reward',
    wager_placed: 'Wager Placed',
    wager_won: 'Wager Won',
    wager_lost: 'Wager Lost',
  };
  return labels[type] || type;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  historyButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  balanceCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  balanceGradient: {
    padding: 24,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#0F0F1E',
    marginTop: 8,
    opacity: 0.7,
  },
  balanceTCT: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0F0F1E',
    marginTop: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceChangeIndicator: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  balanceChangeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  balanceChangePositive: {
    color: '#4ECDC4',
  },
  balanceChangeNegative: {
    color: '#FF6B6B',
  },
  balanceValue: {
    fontSize: 18,
    color: '#0F0F1E',
    opacity: 0.8,
  },
  walletAddressContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(15, 15, 30, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  walletAddressLabel: {
    fontSize: 10,
    color: '#0F0F1E',
    opacity: 0.6,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletAddressText: {
    fontSize: 13,
    color: '#0F0F1E',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  tabTextActive: {
    color: '#FFD700',
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  withdrawDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
    lineHeight: 20,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  presetButtonFull: {
    width: '47%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetButtonActive: {
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  presetText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  presetTextActive: {
    color: '#FFD700',
  },
  presetTCTText: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  presetTCTTextActive: {
    color: '#FFD700',
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F1E',
  },
  sliderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  sliderValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
  },
  sliderTCTValue: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 16,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  paymentMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  paymentMethodSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  cryptoDepositContent: {
    alignItems: 'center',
  },
  cryptoWithdrawContent: {
    alignItems: 'stretch',
  },
  cryptoInstructions: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  addressContainer: {
    width: '100%',
    marginBottom: 20,
  },
  addressBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  copyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  copyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  conversionInfo: {
    fontSize: 14,
    color: '#4ECDC4',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  cryptoWarning: {
    fontSize: 12,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 12,
  },
  walletInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  bankDetailsForm: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  transactionList: {
    maxHeight: 400,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  transactionDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  positiveAmount: {
    color: '#4ECDC4',
  },
  negativeAmount: {
    color: '#FF6B6B',
  },
  emptyTransactions: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTransactionsText: {
    fontSize: 16,
    color: '#888',
    marginTop: 12,
  },
  emptyTransactionsSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  // New styles for enhanced wallet UI
  lockedBalance: {
    fontSize: 12,
    color: '#0F0F1E',
    opacity: 0.7,
    marginTop: 4,
  },
  syncTimestamp: {
    fontSize: 10,
    color: '#0F0F1E',
    opacity: 0.5,
    marginTop: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#FF6B6B',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterTabActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
  },
  filterTabText: {
    fontSize: 12,
    color: '#888',
  },
  filterTabTextActive: {
    color: '#FFD700',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreContainer: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreButton: {
    padding: 12,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#FFD700',
  },
  transactionAmounts: {
    alignItems: 'flex-end',
  },
  transactionAmountUsd: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  // Pending transaction styles
  transactionItemPending: {
    opacity: 0.8,
    backgroundColor: 'rgba(255, 165, 0, 0.05)',
  },
  pendingLabel: {
    fontSize: 11,
    color: '#FFA500',
    marginTop: 2,
    fontStyle: 'italic',
  },
  pendingAmount: {
    color: '#FFA500',
  },
  // Transaction detail modal styles
  transactionDetailContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  detailIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  detailAmountUsd: {
    fontSize: 16,
    color: '#888',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 24,
  },
  statusBadgeConfirmed: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
  },
  statusBadgeFailed: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailLabel: {
    fontSize: 14,
    color: '#888',
  },
  detailValue: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  detailValueLink: {
    color: '#FFD700',
    textDecorationLine: 'underline',
  },
  // Connect Wallet Button styles
  connectWalletButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  connectWalletGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  connectWalletTextContainer: {
    flex: 1,
  },
  connectWalletTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F0F1E',
  },
  connectWalletSubtitle: {
    fontSize: 12,
    color: '#0F0F1E',
    opacity: 0.7,
  },
  // Or divider styles
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  orText: {
    fontSize: 12,
    color: '#888',
    paddingHorizontal: 12,
  },
  // Crypto section title
  cryptoSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  // Claim stuck escrow funds banner
  claimBanner: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  claimBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  claimBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimBannerContent: {
    flex: 1,
  },
  claimBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ECDC4',
  },
  claimBannerAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  claimBannerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  claimBannerArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimBannerArrowText: {
    fontSize: 18,
    color: '#4ECDC4',
    fontWeight: '700',
  },
});

// Wrap with AuthGate to require authentication
export default function WalletScreen() {
  return (
    <AuthGate featureName="Wallet">
      <WalletContent />
    </AuthGate>
  );
}
