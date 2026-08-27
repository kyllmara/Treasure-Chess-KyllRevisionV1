/**
 * GameWagerBanner Component
 *
 * Displays wager information during an active game.
 * Shows:
 * - Total pool size
 * - Potential winnings
 * - Your stake
 * - Commission info
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Coins, Trophy, Percent } from "lucide-react-native";

// ============================================================================
// Types
// ============================================================================

export interface GameWagerBannerProps {
  /** Wager amount in TCT (per player) */
  wagerTct: number;
  /** Commission rate (default: 0.10 = 10%) */
  commissionRate?: number;
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Whether to show potential winnings */
  showWinnings?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TCT_TO_USD = 0.04;

// ============================================================================
// Helper Functions
// ============================================================================

function formatTct(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatUsd(amount: number): string {
  return `$${(amount * TCT_TO_USD).toFixed(2)}`;
}

// ============================================================================
// Component
// ============================================================================

export function GameWagerBanner({
  wagerTct,
  commissionRate = 0.10,
  compact = false,
  showWinnings = true,
}: GameWagerBannerProps) {
  // Don't render for free games
  if (wagerTct === 0) {
    return null;
  }

  const totalPool = wagerTct * 2;
  const commission = wagerTct * commissionRate;
  const potentialWinnings = totalPool - commission;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <Coins size={14} color="#FFD700" />
          <Text style={styles.compactLabel}>Pool:</Text>
          <Text style={styles.compactValue}>{formatTct(totalPool)} TCT</Text>
        </View>
        {showWinnings && (
          <View style={styles.compactRow}>
            <Trophy size={14} color="#4CAF82" />
            <Text style={styles.compactLabel}>Win:</Text>
            <Text style={styles.compactValueWin}>{formatTct(potentialWinnings)} TCT</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["rgba(255, 215, 0, 0.15)", "rgba(255, 165, 0, 0.1)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.mainSection}>
        {/* Total Pool */}
        <View style={styles.poolSection}>
          <View style={styles.iconLabel}>
            <Coins size={18} color="#FFD700" />
            <Text style={styles.label}>Total Pool</Text>
          </View>
          <Text style={styles.poolValue}>{formatTct(totalPool)} TCT</Text>
          <Text style={styles.poolUsd}>{formatUsd(totalPool)}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Potential Winnings */}
        {showWinnings && (
          <View style={styles.winningsSection}>
            <View style={styles.iconLabel}>
              <Trophy size={18} color="#4CAF82" />
              <Text style={styles.label}>If You Win</Text>
            </View>
            <Text style={styles.winningsValue}>{formatTct(potentialWinnings)} TCT</Text>
            <Text style={styles.winningsUsd}>{formatUsd(potentialWinnings)}</Text>
          </View>
        )}
      </View>

      {/* Commission Note */}
      <View style={styles.commissionNote}>
        <Percent size={12} color="#9CA3AF" />
        <Text style={styles.commissionText}>
          {Math.round(commissionRate * 100)}% platform fee on winnings
        </Text>
      </View>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    padding: 14,
    marginVertical: 8,
  },
  mainSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  poolSection: {
    flex: 1,
    alignItems: "center",
  },
  winningsSection: {
    flex: 1,
    alignItems: "center",
  },
  iconLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  poolValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFD700",
  },
  poolUsd: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFD700",
    opacity: 0.7,
    marginTop: 2,
  },
  winningsValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#4CAF82",
  },
  winningsUsd: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF82",
    opacity: 0.7,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: "rgba(255, 215, 0, 0.3)",
    marginHorizontal: 16,
  },
  commissionNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  commissionText: {
    fontSize: 10,
    color: "#6B7280",
  },

  // Compact styles
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactLabel: {
    fontSize: 11,
    color: "#A0A0A0",
    fontWeight: "600",
  },
  compactValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFD700",
  },
  compactValueWin: {
    fontSize: 13,
    fontWeight: "800",
    color: "#4CAF82",
  },
});

// ============================================================================
// Exports
// ============================================================================

export default GameWagerBanner;
