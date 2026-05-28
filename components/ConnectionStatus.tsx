/**
 * Connection Status Indicator Component
 *
 * Displays real-time connection status with visual feedback
 * for connected, reconnecting, and disconnected states.
 */

import React, { useEffect, useRef, memo } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { ConnectionState } from "@/lib/realtime";

export interface ConnectionStatusProps {
  state: ConnectionState;
  showWhenConnected?: boolean;
  compact?: boolean;
  style?: object;
}

const stateConfig: Record<
  ConnectionState,
  { color: string; label: string; icon: string; pulse: boolean }
> = {
  connected: {
    color: "#34C759",
    label: "Connected",
    icon: "●",
    pulse: false,
  },
  connecting: {
    color: "#FF9500",
    label: "Connecting...",
    icon: "◐",
    pulse: true,
  },
  reconnecting: {
    color: "#FF9500",
    label: "Reconnecting...",
    icon: "◐",
    pulse: true,
  },
  disconnected: {
    color: "#FF3B30",
    label: "Disconnected",
    icon: "○",
    pulse: false,
  },
  error: {
    color: "#FF3B30",
    label: "Connection Error",
    icon: "✕",
    pulse: false,
  },
};

export const ConnectionStatus = memo(function ConnectionStatus({
  state,
  showWhenConnected = false,
  compact = false,
  style,
}: ConnectionStatusProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const config = stateConfig[state];

  // Pulse animation for connecting/reconnecting states
  useEffect(() => {
    if (config.pulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [config.pulse, pulseAnim]);

  // Don't render if connected and showWhenConnected is false
  if (state === "connected" && !showWhenConnected) {
    return null;
  }

  if (compact) {
    return (
      <Animated.View
        style={[
          styles.compactContainer,
          { backgroundColor: config.color, opacity: pulseAnim },
          style,
        ]}
      />
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: `${config.color}20`, borderColor: config.color },
        { opacity: config.pulse ? pulseAnim : 1 },
        style,
      ]}
    >
      <Text style={[styles.icon, { color: config.color }]}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  compactContainer: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  icon: {
    fontSize: 10,
    ...Platform.select({
      web: { lineHeight: 10 },
      default: {},
    }),
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default ConnectionStatus;
