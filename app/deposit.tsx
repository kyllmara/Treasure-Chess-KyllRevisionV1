/**
 * Deposit Screen
 *
 * Elite-standard deposit interface featuring:
 * - MoonPay/Transak fiat on-ramp (credit card, bank transfer, Apple Pay)
 * - Crypto (USDC on Base) via Privy embedded wallet QR code
 * - Automatic provider selection based on user region
 * - Pending deposit tracking with confirmations
 * - Real-time balance updates
 */

import React, { useCallback, useState, useMemo, useEffect } from "react";
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
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import {
  ArrowLeft,
  CreditCard,
  Bitcoin,
  Copy,
  Check,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Wallet,
  RefreshCw,
  Info,
  Globe,
  Shield,
} from "lucide-react-native";
import { useUserStore } from "@/stores/userStore";
import { useWalletStore } from "@/stores/walletStore";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getVaultAddress, getVaultStatus, type VaultStatus } from "@/lib/vault";
import { FiatRampCheckout } from "@/components/FiatRampCheckout";
import {
  getFiatRampService,
  usdToTct,
  type FiatCurrency,
  type FiatRampProvider,
  type ProviderAvailability,
  SUPPORTED_FIAT_CURRENCIES,
} from "@/lib/fiat-ramp";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Constants
const TCT_TO_USD_RATE = 0.04; // 1 TCT = $0.04 (25 TCT = $1)
const USDC_TO_TCT = 25; // 1 USDC = 25 TCT
const PRESET_AMOUNTS_USD = [10, 25, 50, 100];
const REQUIRED_CONFIRMATIONS = 12;

// Chain info - Base mainnet
const USDC_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_USDC_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK_NAME = "Base";
const BLOCK_EXPLORER = "https://basescan.org";

type DepositMethod = "fiat" | "crypto";
type DepositStep = "select" | "amount" | "fiat-confirm" | "crypto-address" | "pending";

// Revolut payment link - replace with your actual Revolut.me link
const REVOLUT_PAYMENT_LINK = "https://revolut.me/treasurechess";

interface FiatDepositRequest {
  id: string;
  reference_code: string;
  amount_usd: number;
  amount_tct: number;
  status: string;
  created_at: string;
}

function generateReferenceCode(userId: string): string {
  const short = userId.replace(/-/g, "").substring(0, 6).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `TC-${short}-${ts}`;
}

interface PendingDeposit {
  id: string;
  txHash: string;
  amountUsdc: number;
  amountTct: number;
  confirmations: number;
  requiredConfirmations: number;
  status: "pending" | "confirming" | "confirmed" | "failed";
  createdAt: string;
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

// Method Selection Card
function MethodCard({
  title,
  subtitle,
  icon: Icon,
  gradientColors,
  onPress,
  badge,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<any>;
  gradientColors: [string, string];
  onPress: () => void;
  badge?: string;
}) {
  return (
    <TouchableOpacity style={styles.methodCard} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={gradientColors}
        style={styles.methodCardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.methodCardContent}>
          <View style={styles.methodIconContainer}>
            <Icon size={32} color="#FFFFFF" />
          </View>
          <View style={styles.methodTextContainer}>
            <Text style={styles.methodTitle}>{title}</Text>
            <Text style={styles.methodSubtitle}>{subtitle}</Text>
          </View>
          <ChevronRight size={24} color="rgba(255,255,255,0.7)" />
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

// Amount Preset Button
function PresetButton({
  amountUsd,
  isSelected,
  onPress,
}: {
  amountUsd: number;
  isSelected: boolean;
  onPress: () => void;
}) {
  const tctAmount = usdToTct(amountUsd);

  return (
    <TouchableOpacity
      style={[styles.presetButton, isSelected && styles.presetButtonActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.presetTCT, isSelected && styles.presetTextActive]}>
        {formatTCT(tctAmount)} TCT
      </Text>
      <Text style={[styles.presetUSD, isSelected && styles.presetTextActive]}>${amountUsd}</Text>
    </TouchableOpacity>
  );
}

// Pending Deposit Item
function PendingDepositItem({ deposit }: { deposit: PendingDeposit }) {
  const progress = Math.min(deposit.confirmations / deposit.requiredConfirmations, 1);

  return (
    <View style={styles.pendingItem}>
      <View style={styles.pendingIconContainer}>
        {deposit.status === "confirmed" ? (
          <CheckCircle size={24} color="#4ECDC4" />
        ) : deposit.status === "failed" ? (
          <AlertCircle size={24} color="#F5576C" />
        ) : (
          <Clock size={24} color="#FFD700" />
        )}
      </View>

      <View style={styles.pendingDetails}>
        <Text style={styles.pendingAmount}>+{formatTCT(deposit.amountTct)} TCT</Text>
        <Text style={styles.pendingStatus}>
          {deposit.status === "confirmed"
            ? "Confirmed"
            : deposit.status === "failed"
            ? "Failed"
            : `${deposit.confirmations}/${deposit.requiredConfirmations} confirmations`}
        </Text>
        {deposit.status === "pending" || deposit.status === "confirming" ? (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.pendingTxLink}
        onPress={() => Linking.openURL(`${BLOCK_EXPLORER}/tx/${deposit.txHash}`)}
      >
        <ExternalLink size={16} color="#A0A0A0" />
      </TouchableOpacity>
    </View>
  );
}

// Crypto Address Display with QR
function CryptoAddressCard({
  address,
  onCopy,
  copied,
}: {
  address: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <View style={styles.cryptoAddressCard}>
      <View style={styles.qrContainer}>
        <View style={styles.qrWrapper}>
          <QRCode
            value={`ethereum:${address}`}
            size={180}
            backgroundColor="#FFFFFF"
            color="#000000"
          />
        </View>
      </View>

      <View style={styles.addressInfo}>
        <Text style={styles.addressLabel}>Platform USDC Deposit Address ({NETWORK_NAME})</Text>
        <TouchableOpacity style={styles.addressRow} onPress={onCopy} activeOpacity={0.7}>
          <Text style={styles.addressText}>{truncateAddress(address, 12, 10)}</Text>
          {copied ? (
            <Check size={18} color="#4ECDC4" />
          ) : (
            <Copy size={18} color="#FFD700" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.cryptoInstructions}>
        <View style={styles.instructionRow}>
          <Info size={14} color="#A0A0A0" />
          <Text style={styles.instructionText}>
            Send USDC on {NETWORK_NAME} only
          </Text>
        </View>
        <View style={styles.instructionRow}>
          <Info size={14} color="#A0A0A0" />
          <Text style={styles.instructionText}>
            1 USDC = 25 TCT (credited after {REQUIRED_CONFIRMATIONS} confirmations)
          </Text>
        </View>
        <View style={styles.instructionRow}>
          <AlertCircle size={14} color="#F5576C" />
          <Text style={[styles.instructionText, styles.warningText]}>
            Do NOT send other tokens - only USDC on {NETWORK_NAME}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Main Deposit Screen
export default function DepositScreen() {
  const router = useRouter();
  const { profile, refreshBalance } = useUserStore();
  const { refreshTransactions } = useWalletStore();
  const { address: walletAddress, refreshBalance: refreshWalletBalance } = useWallet();
  const { profile: authProfile } = useAuth();

  // Local state
  const [step, setStep] = useState<DepositStep>("select");
  const [method, setMethod] = useState<DepositMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState<PendingDeposit[]>([]);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [fiatReferenceCode, setFiatReferenceCode] = useState<string | null>(null);
  const [fiatDepositRequests, setFiatDepositRequests] = useState<FiatDepositRequest[]>([]);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [isSubmittingFiat, setIsSubmittingFiat] = useState(false);

  // Fiat ramp state
  const [showFiatRampCheckout, setShowFiatRampCheckout] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<FiatCurrency>("USD");
  const [providerAvailability, setProviderAvailability] = useState<ProviderAvailability | null>(null);
  const [regionRestriction, setRegionRestriction] = useState<string | null>(null);

  // Initialize fiat ramp service
  useEffect(() => {
    async function initFiatRamp() {
      try {
        const service = getFiatRampService();
        await service.initialize();
        const availability = await service.getAvailability();
        setProviderAvailability(availability);
        setRegionRestriction(service.getRestrictionMessage());
      } catch (error) {
        console.error("Failed to initialize fiat ramp:", error);
      }
    }
    initFiatRamp();
  }, []);

  // Fetch vault address on mount
  useEffect(() => {
    async function fetchVaultAddress() {
      const address = await getVaultAddress();
      setVaultAddress(address);
      const status = await getVaultStatus();
      setVaultStatus(status);
    }
    fetchVaultAddress();
  }, []);

  // Use vault address for deposits (platform custody model)
  const depositAddress = vaultAddress;

  // Load user's pending fiat deposits
  useEffect(() => {
    async function loadFiatDeposits() {
      if (!authProfile?.id) return;
      const { data } = await supabase
        .from("pending_fiat_deposits")
        .select("*")
        .eq("user_id", authProfile.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setFiatDepositRequests(data);
    }
    loadFiatDeposits();
  }, [authProfile?.id]);

  // Handle method selection
  const handleSelectMethod = useCallback((selectedMethod: DepositMethod) => {
    setMethod(selectedMethod);
    if (selectedMethod === "crypto") {
      setStep("crypto-address");
    } else {
      setStep("amount");
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Handle fiat deposit - generate reference and show confirmation
  const handleFiatRampContinue = useCallback(() => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < 10) {
      Alert.alert("Invalid Amount", "Minimum deposit is $10");
      return;
    }
    if (!authProfile?.id) {
      Alert.alert("Error", "You must be logged in to deposit");
      return;
    }
    const refCode = generateReferenceCode(authProfile.id);
    setFiatReferenceCode(refCode);
    setStep("fiat-confirm");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [amount, authProfile?.id]);

  // Submit fiat deposit request to DB and open Revolut
  const handleSubmitFiatDeposit = useCallback(async () => {
    if (!authProfile?.id || !fiatReferenceCode) return;
    const numAmount = parseFloat(amount);
    const tctAmt = usdToTct(numAmount);

    setIsSubmittingFiat(true);
    try {
      const { data, error } = await supabase
        .from("pending_fiat_deposits")
        .insert({
          user_id: authProfile.id,
          reference_code: fiatReferenceCode,
          amount_usd: numAmount,
          amount_tct: tctAmt,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local list
      setFiatDepositRequests((prev) => [data, ...prev]);

      // Copy reference to clipboard
      await Clipboard.setStringAsync(fiatReferenceCode);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Open Revolut payment link
      const revolutUrl = `${REVOLUT_PAYMENT_LINK}`;
      const canOpen = await Linking.canOpenURL(revolutUrl);
      if (canOpen) {
        await Linking.openURL(revolutUrl);
      }

      Alert.alert(
        "Deposit Request Created",
        `Your reference code ${fiatReferenceCode} has been copied to your clipboard.\n\nIMPORTANT: Paste this code in the payment note/reference field when sending your payment of $${numAmount.toFixed(2)} via Revolut.\n\nYour TCT will be credited once an admin confirms receipt.`,
        [
          {
            text: "OK",
            onPress: () => {
              setStep("select");
              setAmount("");
              setSelectedPreset(null);
              setFiatReferenceCode(null);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Failed to create fiat deposit:", error);
      Alert.alert("Error", "Failed to create deposit request. Please try again.");
    } finally {
      setIsSubmittingFiat(false);
    }
  }, [authProfile?.id, fiatReferenceCode, amount]);

  // Handle fiat ramp checkout completion
  const handleFiatRampComplete = useCallback(
    (success: boolean, orderId?: string) => {
      setShowFiatRampCheckout(false);

      if (success) {
        Alert.alert(
          "Deposit Initiated",
          `Your deposit is being processed. TCT will be credited once the payment is confirmed.${
            orderId ? `\n\nOrder ID: ${orderId.substring(0, 12)}...` : ""
          }`,
          [
            {
              text: "OK",
              onPress: () => {
                setStep("select");
                setAmount("");
                setSelectedPreset(null);
                refreshBalance();
                if (profile?.id) {
                  refreshTransactions(profile.id);
                }
              },
            },
          ]
        );
      }
    },
    [refreshBalance, refreshTransactions, profile?.id]
  );

  // Handle preset selection
  const handlePresetSelect = useCallback((preset: number) => {
    setSelectedPreset(preset);
    setAmount(preset.toString());
  }, []);

  // Handle custom amount change
  const handleAmountChange = useCallback((text: string) => {
    setAmount(text);
    setSelectedPreset(null);
  }, []);

  // Handle copy address
  const handleCopyAddress = useCallback(async () => {
    if (depositAddress) {
      await Clipboard.setStringAsync(depositAddress);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    }
  }, [depositAddress]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        refreshBalance(),
        profile?.id ? refreshTransactions(profile.id) : Promise.resolve(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalance, refreshTransactions, profile?.id]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === "select") {
      router.back();
    } else {
      setStep("select");
      setMethod(null);
      setAmount("");
      setSelectedPreset(null);
    }
  }, [step, router]);

  // Render step content
  const renderContent = () => {
    switch (step) {
      case "select":
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Choose Deposit Method</Text>
            <Text style={styles.stepSubtitle}>
              Add funds to your Treasure Chess wallet
            </Text>

            <View style={styles.methodsContainer}>
              <MethodCard
                title="Card / Bank"
                subtitle="Revolut, Apple Pay, BACS"
                icon={CreditCard}
                gradientColors={["#0075EB", "#005BB5"]}
                onPress={() => handleSelectMethod("fiat")}
                badge="Instant"
              />

              <MethodCard
                title="Crypto (USDC)"
                subtitle={`Send USDC on ${NETWORK_NAME}`}
                icon={Bitcoin}
                gradientColors={["#F7931A", "#E87D0D"]}
                onPress={() => handleSelectMethod("crypto")}
              />
            </View>

            {pendingDeposits.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingSectionTitle}>Pending Crypto Deposits</Text>
                {pendingDeposits.map((deposit) => (
                  <PendingDepositItem key={deposit.id} deposit={deposit} />
                ))}
              </View>
            )}

            {fiatDepositRequests.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingSectionTitle}>Fiat Deposit Requests</Text>
                {fiatDepositRequests.map((req) => (
                  <View key={req.id} style={styles.pendingItem}>
                    <View style={styles.pendingIconContainer}>
                      {req.status === "approved" ? (
                        <CheckCircle size={24} color="#4ECDC4" />
                      ) : req.status === "rejected" ? (
                        <AlertCircle size={24} color="#F5576C" />
                      ) : (
                        <Clock size={24} color="#FFD700" />
                      )}
                    </View>
                    <View style={styles.pendingDetails}>
                      <Text style={styles.pendingAmount}>+{formatTCT(req.amount_tct)} TCT</Text>
                      <Text style={styles.pendingStatus}>
                        ${req.amount_usd.toFixed(2)} · {req.reference_code} · {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.conversionInfo}>
              <Wallet size={16} color="#FFD700" />
              <Text style={styles.conversionText}>25 TCT = $1 USD</Text>
            </View>
          </View>
        );

      case "amount":
        const numAmount = parseFloat(amount) || 0;
        const tctAmount = usdToTct(numAmount);
        const isValidAmount = numAmount >= 10;
        const provider = providerAvailability?.recommendedProvider;
        const providerName = provider === "moonpay" ? "MoonPay" : provider === "transak" ? "Transak" : null;

        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Select Amount</Text>
            <Text style={styles.stepSubtitle}>
              Choose a preset or enter custom amount
            </Text>

            <View style={styles.presetGrid}>
              {PRESET_AMOUNTS_USD.map((preset) => (
                <PresetButton
                  key={preset}
                  amountUsd={preset}
                  isSelected={selectedPreset === preset}
                  onPress={() => handlePresetSelect(preset)}
                />
              ))}
            </View>

            <Text style={styles.orText}>or enter custom amount</Text>

            <View style={styles.customAmountContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
              />
            </View>

            {numAmount > 0 && (
              <View style={styles.conversionPreview}>
                <Text style={styles.conversionPreviewText}>
                  = {formatTCT(tctAmount)} TCT
                </Text>
              </View>
            )}

            {/* Provider info */}
            {providerName && (
              <View style={styles.providerInfo}>
                <Shield size={16} color="#4ECDC4" />
                <Text style={styles.providerInfoText}>
                  Secure payment via {providerName}
                </Text>
              </View>
            )}

            {/* Region restriction warning */}
            {regionRestriction && (
              <View style={styles.regionWarning}>
                <Globe size={14} color="#FFD700" />
                <Text style={styles.regionWarningText}>{regionRestriction}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.continueButton,
                !isValidAmount && styles.continueButtonDisabled,
              ]}
              onPress={handleFiatRampContinue}
              disabled={!isValidAmount || isLoading}
            >
              <LinearGradient
                colors={isValidAmount ? ["#4ECDC4", "#44A08D"] : ["#444", "#333"]}
                style={styles.continueButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CreditCard size={20} color="#FFFFFF" />
                    <Text style={styles.continueButtonText}>
                      {isValidAmount ? `Pay $${numAmount.toFixed(2)}` : "Minimum $10"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Payment methods badge */}
            <View style={styles.paymentMethods}>
              <Text style={styles.paymentMethodsLabel}>Accepts:</Text>
              <Text style={styles.paymentMethodsText}>
                Credit/Debit Card, Apple Pay, Google Pay, Bank Transfer
              </Text>
            </View>
          </View>
        );

      case "fiat-confirm":
        const confirmAmount = parseFloat(amount) || 0;
        const confirmTct = usdToTct(confirmAmount);

        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Payment Instructions</Text>
            <Text style={styles.stepSubtitle}>
              Send your payment via Revolut with the reference code below
            </Text>

            <View style={styles.fiatConfirmCard}>
              <View style={styles.fiatAmountRow}>
                <Text style={styles.fiatAmountLabel}>Amount to Send</Text>
                <Text style={styles.fiatAmountValue}>${confirmAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.fiatAmountRow}>
                <Text style={styles.fiatAmountLabel}>You'll Receive</Text>
                <Text style={styles.fiatTctValue}>{formatTCT(confirmTct)} TCT</Text>
              </View>
            </View>

            <View style={styles.referenceCard}>
              <Text style={styles.referenceLabel}>YOUR REFERENCE CODE</Text>
              <TouchableOpacity
                style={styles.referenceRow}
                onPress={async () => {
                  if (fiatReferenceCode) {
                    await Clipboard.setStringAsync(fiatReferenceCode);
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setReferenceCopied(true);
                    setTimeout(() => setReferenceCopied(false), 2000);
                  }
                }}
              >
                <Text style={styles.referenceCode}>{fiatReferenceCode}</Text>
                {referenceCopied ? (
                  <Check size={18} color="#4ECDC4" />
                ) : (
                  <Copy size={18} color="#FFD700" />
                )}
              </TouchableOpacity>
              <Text style={styles.referenceHint}>
                You MUST include this code in the payment note/reference
              </Text>
            </View>

            <View style={styles.fiatInstructions}>
              <View style={styles.fiatStep}>
                <View style={styles.fiatStepNumber}><Text style={styles.fiatStepNumberText}>1</Text></View>
                <Text style={styles.fiatStepText}>Tap "Pay via Revolut" below</Text>
              </View>
              <View style={styles.fiatStep}>
                <View style={styles.fiatStepNumber}><Text style={styles.fiatStepNumberText}>2</Text></View>
                <Text style={styles.fiatStepText}>Send exactly ${confirmAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.fiatStep}>
                <View style={styles.fiatStepNumber}><Text style={styles.fiatStepNumberText}>3</Text></View>
                <Text style={styles.fiatStepText}>Paste the reference code in the payment note</Text>
              </View>
              <View style={styles.fiatStep}>
                <View style={styles.fiatStepNumber}><Text style={styles.fiatStepNumberText}>4</Text></View>
                <Text style={styles.fiatStepText}>Your TCT will be credited once payment is confirmed</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.revolutButton}
              onPress={handleSubmitFiatDeposit}
              disabled={isSubmittingFiat}
            >
              <LinearGradient
                colors={["#0075EB", "#005BB5"]}
                style={styles.continueButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isSubmittingFiat ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CreditCard size={20} color="#FFFFFF" />
                    <Text style={styles.continueButtonText}>Pay via Revolut</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );

      case "crypto-address":
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Deposit USDC</Text>
            <Text style={styles.stepSubtitle}>
              Send USDC on {NETWORK_NAME} to the address below
            </Text>

            {depositAddress ? (
              <CryptoAddressCard
                address={depositAddress}
                onCopy={handleCopyAddress}
                copied={addressCopied}
              />
            ) : (
              <View style={styles.noWalletCard}>
                <AlertCircle size={48} color="#F5576C" />
                <Text style={styles.noWalletTitle}>Wallet Not Ready</Text>
                <Text style={styles.noWalletText}>
                  Your embedded wallet is still being set up. Please wait a moment and try again.
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw size={16} color="#FFD700" />
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {pendingDeposits.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingSectionTitle}>Pending Deposits</Text>
                {pendingDeposits.map((deposit) => (
                  <PendingDepositItem key={deposit.id} deposit={deposit} />
                ))}
              </View>
            )}
          </View>
        );

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
        <Text style={styles.headerTitle}>Deposit</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFD700" />
          ) : (
            <RefreshCw size={20} color="#FFD700" />
          )}
        </TouchableOpacity>
      </View>

      {/* Current Balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceValue}>
          {formatTCT(profile?.availableTct ?? 0)} TCT
        </Text>
        <Text style={styles.balanceUsd}>
          ${formatUSD((profile?.availableTct ?? 0) * TCT_TO_USD_RATE)}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
            colors={["#FFD700"]}
          />
        }
      >
        {renderContent()}
      </ScrollView>

      {/* Fiat Ramp Checkout Modal */}
      <FiatRampCheckout
        visible={showFiatRampCheckout}
        onClose={() => setShowFiatRampCheckout(false)}
        onComplete={handleFiatRampComplete}
        userId={profile?.id || ""}
        walletAddress={depositAddress || walletAddress || profile?.embeddedWalletAddress || ""}
        orderType="buy"
        fiatAmount={parseFloat(amount) || 0}
        fiatCurrency={selectedCurrency}
        tctAmount={usdToTct(parseFloat(amount) || 0)}
        email={profile?.email || undefined}
        preferredProvider={providerAvailability?.recommendedProvider || undefined}
      />
    </LinearGradient>
  );
}

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
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFD700",
    marginBottom: 2,
  },
  balanceUsd: {
    fontSize: 16,
    color: "#A0A0A0",
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
  methodSubtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
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

  // Conversion Info
  conversionInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 12,
  },
  conversionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },

  // Preset Grid
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  presetButton: {
    width: (SCREEN_WIDTH - 56) / 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  presetButtonActive: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "#FFD700",
  },
  presetTCT: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  presetUSD: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  presetTextActive: {
    color: "#FFD700",
  },

  // Or Text
  orText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },

  // Custom Amount
  customAmountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFD700",
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Conversion Preview
  conversionPreview: {
    alignItems: "center",
    marginBottom: 24,
  },
  conversionPreviewText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFD700",
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

  // Crypto Address Card
  cryptoAddressCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  addressInfo: {
    marginBottom: 20,
  },
  addressLabel: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 8,
    textAlign: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    padding: 12,
    borderRadius: 8,
  },
  addressText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  cryptoInstructions: {
    gap: 8,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  instructionText: {
    fontSize: 13,
    color: "#A0A0A0",
    flex: 1,
  },
  warningText: {
    color: "#F5576C",
  },

  // No Wallet Card
  noWalletCard: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  noWalletTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F5576C",
  },
  noWalletText: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },

  // Pending Section
  pendingSection: {
    marginTop: 24,
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
    color: "#FFD700",
    marginBottom: 2,
  },
  pendingStatus: {
    fontSize: 13,
    color: "#A0A0A0",
    marginBottom: 6,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFD700",
    borderRadius: 2,
  },
  pendingTxLink: {
    padding: 8,
  },

  // Provider Info
  providerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 8,
    marginBottom: 16,
  },
  providerInfoText: {
    fontSize: 14,
    color: "#4ECDC4",
    flex: 1,
  },

  // Region Warning
  regionWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    marginBottom: 16,
  },
  regionWarningText: {
    fontSize: 13,
    color: "#FFD700",
    flex: 1,
  },

  // Payment Methods
  paymentMethods: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    alignItems: "center",
  },
  paymentMethodsLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  paymentMethodsText: {
    fontSize: 13,
    color: "#A0A0A0",
    textAlign: "center",
  },

  // Fiat Confirm
  fiatConfirmCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  fiatAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  fiatAmountLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  fiatAmountValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  fiatTctValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFD700",
  },
  referenceCard: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    alignItems: "center",
  },
  referenceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    letterSpacing: 1,
    marginBottom: 10,
  },
  referenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  referenceCode: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  referenceHint: {
    fontSize: 12,
    color: "#F5576C",
    fontWeight: "600",
    textAlign: "center",
  },
  fiatInstructions: {
    gap: 14,
    marginBottom: 24,
  },
  fiatStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fiatStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  fiatStepNumberText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  fiatStepText: {
    fontSize: 14,
    color: "#FFFFFF",
    flex: 1,
  },
  revolutButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
});
