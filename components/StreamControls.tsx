/**
 * StreamControls Component
 *
 * Control panel for livestream with start/stop, settings,
 * and status indicators.
 */

import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Radio,
  Square,
  Settings,
  Eye,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  RefreshCw,
} from "lucide-react-native";
import type { StreamControlsProps, StreamConnectionState } from "@/types/livestream";
import { formatViewerCount, getQualityColor } from "@/lib/livestream";

// ============================================================================
// Component
// ============================================================================

export const StreamControls = memo(function StreamControls({
  isStreaming,
  connectionState,
  viewerCount,
  health,
  onStart,
  onStop,
  onSettingsPress,
  disabled = false,
}: StreamControlsProps) {
  const getStatusInfo = useCallback((): {
    icon: React.ReactNode;
    text: string;
    color: string;
  } => {
    switch (connectionState) {
      case "idle":
        return {
          icon: <WifiOff size={14} color="#6B7280" />,
          text: "Ready",
          color: "#6B7280",
        };
      case "initializing":
        return {
          icon: <ActivityIndicator size={14} color="#3B82F6" />,
          text: "Initializing...",
          color: "#3B82F6",
        };
      case "connecting":
        return {
          icon: <ActivityIndicator size={14} color="#F59E0B" />,
          text: "Connecting...",
          color: "#F59E0B",
        };
      case "connected":
        return {
          icon: <CheckCircle size={14} color="#22C55E" />,
          text: "Connected",
          color: "#22C55E",
        };
      case "streaming":
        return {
          icon: <Wifi size={14} color="#22C55E" />,
          text: "Live",
          color: "#22C55E",
        };
      case "reconnecting":
        return {
          icon: <RefreshCw size={14} color="#F59E0B" />,
          text: "Reconnecting...",
          color: "#F59E0B",
        };
      case "paused":
        return {
          icon: <AlertCircle size={14} color="#F59E0B" />,
          text: "Paused",
          color: "#F59E0B",
        };
      case "stopping":
        return {
          icon: <ActivityIndicator size={14} color="#6B7280" />,
          text: "Stopping...",
          color: "#6B7280",
        };
      case "stopped":
        return {
          icon: <Square size={14} color="#6B7280" />,
          text: "Ended",
          color: "#6B7280",
        };
      case "error":
        return {
          icon: <AlertCircle size={14} color="#EF4444" />,
          text: "Error",
          color: "#EF4444",
        };
      default:
        return {
          icon: <WifiOff size={14} color="#6B7280" />,
          text: "Unknown",
          color: "#6B7280",
        };
    }
  }, [connectionState]);

  const statusInfo = getStatusInfo();
  const isLoading = ["initializing", "connecting", "stopping", "reconnecting"].includes(connectionState);
  const canStart = connectionState === "idle" || connectionState === "stopped" || connectionState === "error";
  const canStop = ["streaming", "connected", "paused"].includes(connectionState);

  return (
    <View style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        {/* Connection Status */}
        <View style={styles.statusItem}>
          {statusInfo.icon}
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.text}
          </Text>
        </View>

        {/* Viewer Count (when streaming) */}
        {isStreaming && (
          <View style={styles.statusItem}>
            <Eye size={14} color="#FFD700" />
            <Text style={styles.viewerCount}>{formatViewerCount(viewerCount)}</Text>
          </View>
        )}

        {/* Health Indicator (when streaming) */}
        {isStreaming && health && (
          <View style={styles.statusItem}>
            <View
              style={[
                styles.healthDot,
                { backgroundColor: getQualityColor(health.quality) },
              ]}
            />
            <Text style={[styles.healthText, { color: getQualityColor(health.quality) }]}>
              {health.quality}
            </Text>
          </View>
        )}
      </View>

      {/* Main Controls */}
      <View style={styles.mainControls}>
        {/* Settings Button */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={onSettingsPress}
          disabled={disabled || isStreaming}
        >
          <Settings size={24} color={isStreaming ? "#4B5563" : "#FFFFFF"} />
        </TouchableOpacity>

        {/* Start/Stop Button */}
        {canStart ? (
          <TouchableOpacity
            style={[styles.startButton, disabled && styles.buttonDisabled]}
            onPress={onStart}
            disabled={disabled || isLoading}
          >
            <LinearGradient
              colors={disabled ? ["#4B5563", "#374151"] : ["#EF4444", "#DC2626"]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {isLoading ? (
                <ActivityIndicator size={24} color="#FFFFFF" />
              ) : (
                <>
                  <Radio size={24} color="#FFFFFF" />
                  <Text style={styles.buttonText}>GO LIVE</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : canStop ? (
          <TouchableOpacity
            style={[styles.stopButton, disabled && styles.buttonDisabled]}
            onPress={onStop}
            disabled={disabled || isLoading}
          >
            <LinearGradient
              colors={["#374151", "#1F2937"]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {isLoading ? (
                <ActivityIndicator size={24} color="#FFFFFF" />
              ) : (
                <>
                  <Square size={24} color="#EF4444" />
                  <Text style={[styles.buttonText, { color: "#EF4444" }]}>END STREAM</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={[styles.startButton, styles.buttonDisabled]}>
            <LinearGradient
              colors={["#4B5563", "#374151"]}
              style={styles.buttonGradient}
            >
              <ActivityIndicator size={24} color="#9CA3AF" />
            </LinearGradient>
          </View>
        )}
      </View>

      {/* Health Details (when streaming) */}
      {isStreaming && health && (
        <View style={styles.healthDetails}>
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Bitrate</Text>
            <Text style={styles.healthValue}>{(health.bitrate / 1000).toFixed(1)} Mbps</Text>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>FPS</Text>
            <Text style={styles.healthValue}>{health.fps.toFixed(0)}</Text>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Dropped</Text>
            <Text style={styles.healthValue}>{health.droppedFrames}</Text>
          </View>
          <View style={styles.healthDivider} />
          <View style={styles.healthItem}>
            <Text style={styles.healthLabel}>Latency</Text>
            <Text style={styles.healthValue}>{health.latency}ms</Text>
          </View>
        </View>
      )}
    </View>
  );
});

// ============================================================================
// ViewerCounter Component
// ============================================================================

interface ViewerCounterProps {
  count: number;
  showLabel?: boolean;
  size?: "small" | "medium" | "large";
  animated?: boolean;
}

export const ViewerCounter = memo(function ViewerCounter({
  count,
  showLabel = true,
  size = "medium",
}: ViewerCounterProps) {
  const sizes = {
    small: { icon: 14, text: 12 },
    medium: { icon: 18, text: 14 },
    large: { icon: 24, text: 18 },
  };

  const { icon, text } = sizes[size];

  return (
    <View style={viewerStyles.container}>
      <Eye size={icon} color="#FFD700" />
      <Text style={[viewerStyles.count, { fontSize: text }]}>
        {formatViewerCount(count)}
      </Text>
      {showLabel && <Text style={viewerStyles.label}>viewers</Text>}
    </View>
  );
});

const viewerStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  count: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  label: {
    color: "#9CA3AF",
    fontSize: 12,
  },
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 24,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  viewerCount: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  mainControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  settingsButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2D2D44",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3D3D5C",
  },
  startButton: {
    borderRadius: 32,
    overflow: "hidden",
  },
  stopButton: {
    borderRadius: 32,
    overflow: "hidden",
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  healthDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    backgroundColor: "#1A1A2E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  healthItem: {
    alignItems: "center",
    flex: 1,
  },
  healthLabel: {
    color: "#6B7280",
    fontSize: 10,
    marginBottom: 2,
  },
  healthValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  healthDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#2D2D44",
  },
});

export default StreamControls;
