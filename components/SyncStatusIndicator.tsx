/**
 * Sync Status Indicator Component
 *
 * Displays the current sync status with visual feedback:
 * - Last synced timestamp
 * - Sync-in-progress spinner
 * - Error state with retry button
 * - Offline indicator with pending changes count
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from "react-native";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  AlertCircle,
  Check,
  Upload,
} from "lucide-react-native";
import { useSyncStatus } from "@/hooks/useProfileSync";
import { Colors } from "@/constants/theme";

// ============================================================================
// Types
// ============================================================================

export interface SyncStatusIndicatorProps {
  /** Compact mode for inline display */
  compact?: boolean;
  /** Show timestamp in expanded mode */
  showTimestamp?: boolean;
  /** Custom style */
  style?: object;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatLastSynced(timestamp: string | null): string {
  if (!timestamp) return "Never synced";

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

// ============================================================================
// Main Component
// ============================================================================

export function SyncStatusIndicator({
  compact = false,
  showTimestamp = true,
  style,
}: SyncStatusIndicatorProps) {
  const {
    isSyncing,
    isOnline,
    lastSyncedAt,
    pendingChanges,
    hasError,
    errorMessage,
    retry,
  } = useSyncStatus();

  // Animation for syncing indicator
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Spin animation for syncing
  useEffect(() => {
    if (isSyncing) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isSyncing, spinAnim]);

  // Pulse animation for pending changes
  useEffect(() => {
    if (pendingChanges > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pendingChanges, pulseAnim]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  // -------------------------------------------------------------------------
  // Render Helpers
  // -------------------------------------------------------------------------

  const renderIcon = () => {
    if (isSyncing) {
      return (
        <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
          <RefreshCw size={compact ? 14 : 16} color={Colors.secondary} />
        </Animated.View>
      );
    }

    if (!isOnline) {
      return <CloudOff size={compact ? 14 : 16} color="#FF9800" />;
    }

    if (hasError) {
      return <AlertCircle size={compact ? 14 : 16} color="#F44336" />;
    }

    if (pendingChanges > 0) {
      return (
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Upload size={compact ? 14 : 16} color="#FF9800" />
        </Animated.View>
      );
    }

    return <Check size={compact ? 14 : 16} color="#4CAF50" />;
  };

  const renderStatus = () => {
    if (isSyncing) {
      return "Syncing...";
    }

    if (!isOnline) {
      return pendingChanges > 0
        ? `Offline (${pendingChanges} pending)`
        : "Offline";
    }

    if (hasError) {
      return "Sync error";
    }

    if (pendingChanges > 0) {
      return `${pendingChanges} change${pendingChanges > 1 ? "s" : ""} pending`;
    }

    return showTimestamp ? formatLastSynced(lastSyncedAt) : "Synced";
  };

  const getStatusColor = () => {
    if (isSyncing) return Colors.secondary;
    if (!isOnline || pendingChanges > 0) return "#FF9800";
    if (hasError) return "#F44336";
    return "#4CAF50";
  };

  // -------------------------------------------------------------------------
  // Compact Mode
  // -------------------------------------------------------------------------

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, style]}
        onPress={hasError || pendingChanges > 0 ? retry : undefined}
        disabled={isSyncing}
      >
        {renderIcon()}
        {pendingChanges > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingChanges}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // -------------------------------------------------------------------------
  // Full Mode
  // -------------------------------------------------------------------------

  return (
    <View style={[styles.container, style]}>
      <View style={styles.statusRow}>
        <View style={styles.iconContainer}>{renderIcon()}</View>

        <View style={styles.textContainer}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {renderStatus()}
          </Text>

          {hasError && errorMessage && (
            <Text style={styles.errorText} numberOfLines={1}>
              {errorMessage}
            </Text>
          )}
        </View>

        {(hasError || (pendingChanges > 0 && isOnline)) && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={retry}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={Colors.secondary} />
            ) : (
              <RefreshCw size={16} color={Colors.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// ELO Change Animation Component
// ============================================================================

export interface EloChangeAnimationProps {
  previousElo: number;
  newElo: number;
  change: number;
  onAnimationComplete?: () => void;
}

export function EloChangeAnimation({
  previousElo,
  newElo,
  change,
  onAnimationComplete,
}: EloChangeAnimationProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Exit animation after delay
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onAnimationComplete?.();
      });
    }, 2500);

    return () => clearTimeout(timeout);
  }, [fadeAnim, slideAnim, scaleAnim, onAnimationComplete]);

  const isPositive = change > 0;
  const changeColor = isPositive ? "#4CAF50" : change < 0 ? "#F44336" : "#9E9E9E";
  const changeText = isPositive ? `+${change}` : `${change}`;

  return (
    <Animated.View
      style={[
        styles.eloChangeContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
    >
      <View style={[styles.eloChangeBadge, { backgroundColor: changeColor }]}>
        <Text style={styles.eloChangeText}>{changeText}</Text>
      </View>
      <Text style={styles.eloNewText}>{newElo} ELO</Text>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 11,
    color: "#F44336",
    marginTop: 2,
  },
  retryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF9800",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ELO Change Animation
  eloChangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -60 }, { translateY: -20 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  eloChangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eloChangeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  eloNewText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default SyncStatusIndicator;
