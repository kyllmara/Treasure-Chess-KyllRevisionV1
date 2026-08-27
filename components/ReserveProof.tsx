/**
 * ReserveProof Component
 *
 * Displays proof of reserves for the platform vault.
 * Shows users that the platform has sufficient USDC to back all TCT balances.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Lock,
  Users,
  Coins,
} from "lucide-react-native";
import { getVaultStatus, type VaultStatus } from "@/lib/vault";

// ============================================================================
// Types
// ============================================================================

export interface ReserveProofProps {
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Callback when status is fetched */
  onStatusFetched?: (status: VaultStatus | null) => void;
}

// ============================================================================
// Constants
// ============================================================================

const BASE_EXPLORER_URL = "https://basescan.org/address";

// ============================================================================
// Component
// ============================================================================

export function ReserveProof({ compact = false, onStatusFetched }: ReserveProofProps) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const vaultStatus = await getVaultStatus();
      setStatus(vaultStatus);
      onStatusFetched?.(vaultStatus);
    } catch (err) {
      setError("Failed to fetch vault status");
      console.error("Vault status error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [onStatusFetched]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleViewOnExplorer = useCallback(() => {
    if (status?.vaultAddress) {
      Linking.openURL(`${BASE_EXPLORER_URL}/${status.vaultAddress}`);
    }
  }, [status?.vaultAddress]);

  if (isLoading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <ActivityIndicator size="small" color="#4CAF82" />
        <Text style={styles.loadingText}>Verifying reserves...</Text>
      </View>
    );
  }

  if (error || !status) {
    return (
      <View style={[styles.container, styles.containerError, compact && styles.containerCompact]}>
        <AlertTriangle size={20} color="#E05C5C" />
        <Text style={styles.errorText}>{error || "Unable to verify reserves"}</Text>
        <TouchableOpacity onPress={fetchStatus} style={styles.retryButton}>
          <RefreshCw size={14} color="#A0A0A0" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Calculate backing ratio
  const expectedUsdc = status.totalTctIssued / 25;
  const backingRatio = status.totalUsdcValue > 0
    ? (status.totalUsdcValue / expectedUsdc) * 100
    : 100;
  const isFullyBacked = backingRatio >= 100;

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.containerCompact, isFullyBacked ? styles.containerHealthy : styles.containerWarning]}
        onPress={handleViewOnExplorer}
      >
        {isFullyBacked ? (
          <CheckCircle size={16} color="#4CAF82" />
        ) : (
          <AlertTriangle size={16} color="#FFD700" />
        )}
        <Text style={[styles.compactText, isFullyBacked ? styles.compactTextHealthy : styles.compactTextWarning]}>
          {isFullyBacked ? "Fully Backed" : `${backingRatio.toFixed(0)}% Backed`}
        </Text>
        <ExternalLink size={14} color="#A0A0A0" />
      </TouchableOpacity>
    );
  }

  return (
    <LinearGradient
      colors={isFullyBacked ? ["rgba(78, 205, 196, 0.1)", "rgba(78, 205, 196, 0.05)"] : ["rgba(255, 215, 0, 0.1)", "rgba(255, 215, 0, 0.05)"]}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield size={24} color={isFullyBacked ? "#4CAF82" : "#FFD700"} />
          <View>
            <Text style={styles.title}>Proof of Reserves</Text>
            <Text style={styles.subtitle}>
              {isFullyBacked ? "All funds are fully backed" : "Reserves verification"}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={fetchStatus} style={styles.refreshButton}>
          <RefreshCw size={18} color="#A0A0A0" />
        </TouchableOpacity>
      </View>

      {/* Status Badge */}
      <View style={[styles.statusBadge, isFullyBacked ? styles.statusBadgeHealthy : styles.statusBadgeWarning]}>
        {isFullyBacked ? (
          <CheckCircle size={18} color="#4CAF82" />
        ) : (
          <AlertTriangle size={18} color="#FFD700" />
        )}
        <Text style={[styles.statusText, isFullyBacked ? styles.statusTextHealthy : styles.statusTextWarning]}>
          {isFullyBacked ? "100% Backed" : `${backingRatio.toFixed(1)}% Backed`}
        </Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Lock size={16} color="#FFD700" />
          </View>
          <Text style={styles.statLabel}>Vault Balance</Text>
          <Text style={styles.statValue}>${status.totalUsdcValue.toFixed(2)}</Text>
          <Text style={styles.statSubvalue}>USDC</Text>
        </View>

        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Coins size={16} color="#4CAF82" />
          </View>
          <Text style={styles.statLabel}>TCT Issued</Text>
          <Text style={styles.statValue}>{status.totalTctIssued.toLocaleString()}</Text>
          <Text style={styles.statSubvalue}>TCT</Text>
        </View>

        <View style={styles.statItem}>
          <View style={styles.statIcon}>
            <Users size={16} color="#A0A0A0" />
          </View>
          <Text style={styles.statLabel}>Active Users</Text>
          <Text style={styles.statValue}>{status.activeUsers.toLocaleString()}</Text>
          <Text style={styles.statSubvalue}>users</Text>
        </View>
      </View>

      {/* Vault Address */}
      <TouchableOpacity style={styles.vaultAddressRow} onPress={handleViewOnExplorer}>
        <Text style={styles.vaultAddressLabel}>Vault Address</Text>
        <View style={styles.vaultAddressValue}>
          <Text style={styles.vaultAddressText}>
            {status.vaultAddress.slice(0, 6)}...{status.vaultAddress.slice(-4)}
          </Text>
          <ExternalLink size={14} color="#4CAF82" />
        </View>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Verify on-chain balance at any time on BaseScan
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
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  containerCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  containerHealthy: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  containerWarning: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  containerError: {
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderColor: "rgba(255, 107, 107, 0.2)",
    gap: 8,
  },

  // Compact styles
  compactText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  compactTextHealthy: {
    color: "#4CAF82",
  },
  compactTextWarning: {
    color: "#FFD700",
  },

  // Loading/Error
  loadingText: {
    fontSize: 13,
    color: "#A0A0A0",
    marginLeft: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#E05C5C",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  retryText: {
    fontSize: 12,
    color: "#A0A0A0",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Status Badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  statusBadgeHealthy: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  statusBadgeWarning: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
  },
  statusText: {
    fontSize: 16,
    fontWeight: "700",
  },
  statusTextHealthy: {
    color: "#4CAF82",
  },
  statusTextWarning: {
    color: "#FFD700",
  },

  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 11,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statSubvalue: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },

  // Vault Address
  vaultAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  vaultAddressLabel: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  vaultAddressValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vaultAddressText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF82",
    fontFamily: "monospace",
  },

  // Footer
  footer: {
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
  },
});

// ============================================================================
// Exports
// ============================================================================

export default ReserveProof;
