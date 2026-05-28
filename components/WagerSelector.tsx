/**
 * WagerSelector Component
 *
 * A reusable component for selecting wager amounts in chess games.
 * Features:
 * - Preset wager amounts (25, 50, 100, 250, 500 TCT)
 * - Free play option (0 TCT)
 * - Balance validation with insufficient funds indication
 * - USD value display (1 TCT = $0.04)
 * - Potential winnings preview with 10% commission deduction
 * - Haptic feedback on selection
 */

import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Coins, Trophy, AlertCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";

// ============================================================================
// Types
// ============================================================================

export type WagerPreset = 0 | 25 | 50 | 100 | 250 | 500;

export interface WagerSelectorProps {
  /** Currently selected wager amount in TCT */
  selectedWager: number;
  /** Callback when wager is selected */
  onWagerSelect: (amount: WagerPreset) => void;
  /** User's available TCT balance */
  availableBalance: number;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Show potential winnings preview */
  showWinnings?: boolean;
  /** Custom preset amounts (default: [0, 25, 50, 100, 250, 500]) */
  presets?: WagerPreset[];
  /** Commission rate for winnings calculation (default: 0.10) */
  commissionRate?: number;
  /** Show balance info section */
  showBalance?: boolean;
  /** Compact mode for smaller screens */
  compact?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PRESETS: WagerPreset[] = [0, 25, 50, 100, 250, 500];
const TCT_TO_USD = 0.04; // 1 TCT = $0.04 (25 TCT = $1)
const DEFAULT_COMMISSION = 0.10;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert TCT to USD
 */
export function tctToUsd(tct: number): number {
  return tct * TCT_TO_USD;
}

/**
 * Format USD for display
 */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/**
 * Format TCT for display
 */
export function formatTct(tct: number): string {
  if (tct === 0) return "Free";
  return `${tct} TCT`;
}

/**
 * Calculate potential winnings after commission
 */
export function calculateWinnings(wager: number, commissionRate: number): number {
  if (wager === 0) return 0;
  const totalPool = wager * 2;
  const commission = wager * commissionRate; // Commission on opponent's wager
  return totalPool - commission;
}

// ============================================================================
// Component
// ============================================================================

export function WagerSelector({
  selectedWager,
  onWagerSelect,
  availableBalance,
  disabled = false,
  showWinnings = true,
  presets = DEFAULT_PRESETS,
  commissionRate = DEFAULT_COMMISSION,
  showBalance = true,
  compact = false,
}: WagerSelectorProps) {
  // Determine if user can afford each preset
  const affordablePresets = useMemo(() => {
    return new Set(presets.filter((p) => p === 0 || availableBalance >= p));
  }, [presets, availableBalance]);

  // Calculate winnings for selected wager
  const potentialWinnings = useMemo(() => {
    return calculateWinnings(selectedWager, commissionRate);
  }, [selectedWager, commissionRate]);

  // Handle wager selection
  const handleSelect = useCallback(
    (amount: WagerPreset) => {
      if (disabled) return;
      if (amount > 0 && availableBalance < amount) return;

      Haptics.selectionAsync();
      onWagerSelect(amount);
    },
    [disabled, availableBalance, onWagerSelect]
  );

  // Render a single wager option
  const renderWagerOption = (amount: WagerPreset) => {
    const isSelected = selectedWager === amount;
    const canAfford = affordablePresets.has(amount);
    const isDisabled = disabled || (!canAfford && amount > 0);

    return (
      <TouchableOpacity
        key={amount}
        style={[
          styles.wagerOption,
          compact && styles.wagerOptionCompact,
          isSelected && styles.wagerOptionSelected,
          isDisabled && styles.wagerOptionDisabled,
        ]}
        onPress={() => handleSelect(amount)}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        {isSelected ? (
          <LinearGradient
            colors={["#FFD700", "#FFA500"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.wagerOptionGradient, compact && styles.wagerOptionGradientCompact]}
          >
            <Text style={[styles.wagerAmountSelected, compact && styles.wagerAmountCompact]}>
              {formatTct(amount)}
            </Text>
            {amount > 0 && (
              <Text style={[styles.wagerUsdSelected, compact && styles.wagerUsdCompact]}>
                {formatUsd(tctToUsd(amount))}
              </Text>
            )}
          </LinearGradient>
        ) : (
          <View style={[styles.wagerOptionInner, compact && styles.wagerOptionInnerCompact]}>
            <Text
              style={[
                styles.wagerAmount,
                compact && styles.wagerAmountCompact,
                isDisabled && styles.wagerAmountDisabled,
              ]}
            >
              {formatTct(amount)}
            </Text>
            {amount > 0 && (
              <Text
                style={[
                  styles.wagerUsd,
                  compact && styles.wagerUsdCompact,
                  isDisabled && styles.wagerUsdDisabled,
                ]}
              >
                {formatUsd(tctToUsd(amount))}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Balance Info */}
      {showBalance && (
        <View style={styles.balanceSection}>
          <View style={styles.balanceHeader}>
            <Coins size={18} color="#FFD700" />
            <Text style={styles.balanceLabel}>Your Balance</Text>
          </View>
          <View style={styles.balanceValues}>
            <Text style={styles.balanceTct}>{availableBalance.toLocaleString()} TCT</Text>
            <Text style={styles.balanceUsd}>
              {formatUsd(tctToUsd(availableBalance))}
            </Text>
          </View>
          {availableBalance < 25 && (
            <View style={styles.lowBalanceWarning}>
              <AlertCircle size={14} color="#FF6B6B" />
              <Text style={styles.lowBalanceText}>
                Deposit funds to play wager games
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Wager Options Grid */}
      <View style={[styles.wagerGrid, compact && styles.wagerGridCompact]}>
        {presets.map(renderWagerOption)}
      </View>

      {/* Potential Winnings Preview */}
      {showWinnings && selectedWager > 0 && (
        <View style={styles.winningsPreview}>
          <View style={styles.winningsHeader}>
            <Trophy size={16} color="#4ECDC4" />
            <Text style={styles.winningsLabel}>If You Win</Text>
          </View>
          <View style={styles.winningsBreakdown}>
            <View style={styles.winningsRow}>
              <Text style={styles.winningsRowLabel}>Your stake</Text>
              <Text style={styles.winningsRowValue}>{formatTct(selectedWager)}</Text>
            </View>
            <View style={styles.winningsRow}>
              <Text style={styles.winningsRowLabel}>Opponent's stake</Text>
              <Text style={styles.winningsRowValue}>{formatTct(selectedWager)}</Text>
            </View>
            <View style={styles.winningsRow}>
              <Text style={styles.winningsRowLabel}>Platform fee (10%)</Text>
              <Text style={styles.winningsRowValueNegative}>
                -{formatTct(Math.round(selectedWager * commissionRate))}
              </Text>
            </View>
            <View style={styles.winningsDivider} />
            <View style={styles.winningsTotalRow}>
              <Text style={styles.winningsTotalLabel}>You receive</Text>
              <View style={styles.winningsTotalValues}>
                <Text style={styles.winningsTotalTct}>
                  {formatTct(Math.round(potentialWinnings))}
                </Text>
                <Text style={styles.winningsTotalUsd}>
                  ({formatUsd(tctToUsd(potentialWinnings))})
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Free Game Info */}
      {selectedWager === 0 && (
        <View style={styles.freeGameInfo}>
          <Text style={styles.freeGameText}>
            Play for free - no TCT required. Rating changes still apply.
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  // Balance Section
  balanceSection: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  balanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  balanceValues: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  balanceTct: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFD700",
  },
  balanceUsd: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  lowBalanceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 107, 107, 0.3)",
  },
  lowBalanceText: {
    fontSize: 12,
    color: "#FF6B6B",
  },

  // Wager Grid
  wagerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  wagerGridCompact: {
    gap: 8,
  },

  // Wager Options
  wagerOption: {
    width: (SCREEN_WIDTH - 52) / 3, // 3 columns with gaps
    aspectRatio: 1.4,
    borderRadius: 12,
    overflow: "hidden",
  },
  wagerOptionCompact: {
    width: (SCREEN_WIDTH - 56) / 3,
    aspectRatio: 1.6,
  },
  wagerOptionSelected: {
    transform: [{ scale: 1.02 }],
  },
  wagerOptionDisabled: {
    opacity: 0.4,
  },
  wagerOptionGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  wagerOptionGradientCompact: {
    padding: 8,
  },
  wagerOptionInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e1e2e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 10,
  },
  wagerOptionInnerCompact: {
    padding: 8,
  },

  // Wager Text
  wagerAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  wagerAmountCompact: {
    fontSize: 14,
  },
  wagerAmountSelected: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F0F1E",
  },
  wagerAmountDisabled: {
    color: "#666",
  },
  wagerUsd: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A0A0A0",
    marginTop: 4,
  },
  wagerUsdCompact: {
    fontSize: 10,
    marginTop: 2,
  },
  wagerUsdSelected: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F0F1E",
    opacity: 0.7,
    marginTop: 4,
  },
  wagerUsdDisabled: {
    color: "#555",
  },

  // Winnings Preview
  winningsPreview: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  winningsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  winningsLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  winningsBreakdown: {
    gap: 6,
  },
  winningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  winningsRowLabel: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  winningsRowValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  winningsRowValueNegative: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF6B6B",
  },
  winningsDivider: {
    height: 1,
    backgroundColor: "rgba(78, 205, 196, 0.3)",
    marginVertical: 8,
  },
  winningsTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  winningsTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  winningsTotalValues: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  winningsTotalTct: {
    fontSize: 18,
    fontWeight: "800",
    color: "#4ECDC4",
  },
  winningsTotalUsd: {
    fontSize: 12,
    color: "#A0A0A0",
  },

  // Free Game Info
  freeGameInfo: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 12,
  },
  freeGameText: {
    fontSize: 12,
    color: "#A0A0A0",
    textAlign: "center",
    lineHeight: 18,
  },
});

// ============================================================================
// Exports
// ============================================================================

export default WagerSelector;
