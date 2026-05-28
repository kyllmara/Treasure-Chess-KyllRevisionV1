/**
 * ChallengeCountdown Component
 *
 * Displays a countdown timer for challenge expiration.
 * Features:
 * - Real-time countdown updates
 * - Color coding based on urgency (normal, warning, critical)
 * - Compact and expanded display modes
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Clock, AlertTriangle } from "lucide-react-native";
import { getChallengeCountdown } from "@/lib/challenges";

interface ChallengeCountdownProps {
  expiresAt: string;
  compact?: boolean;
  showIcon?: boolean;
  onExpired?: () => void;
}

export function ChallengeCountdown({
  expiresAt,
  compact = false,
  showIcon = true,
  onExpired,
}: ChallengeCountdownProps) {
  const [countdown, setCountdown] = useState(() =>
    getChallengeCountdown(expiresAt)
  );

  const updateCountdown = useCallback(() => {
    const newCountdown = getChallengeCountdown(expiresAt);
    setCountdown(newCountdown);

    if (newCountdown.isExpired && onExpired) {
      onExpired();
    }

    return !newCountdown.isExpired;
  }, [expiresAt, onExpired]);

  useEffect(() => {
    // Initial update
    updateCountdown();

    // Set up interval
    const interval = setInterval(() => {
      const shouldContinue = updateCountdown();
      if (!shouldContinue) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [updateCountdown]);

  const getUrgencyColor = () => {
    switch (countdown.urgency) {
      case "critical":
        return "#EF4444"; // Red
      case "warning":
        return "#FCD34D"; // Yellow
      default:
        return "#4ADE80"; // Green
    }
  };

  const getUrgencyBackgroundColor = () => {
    switch (countdown.urgency) {
      case "critical":
        return "rgba(239, 68, 68, 0.15)";
      case "warning":
        return "rgba(252, 211, 77, 0.15)";
      default:
        return "rgba(74, 222, 128, 0.15)";
    }
  };

  const color = getUrgencyColor();
  const backgroundColor = getUrgencyBackgroundColor();

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor }]}>
        {showIcon && (
          countdown.urgency === "critical" ? (
            <AlertTriangle size={12} color={color} />
          ) : (
            <Clock size={12} color={color} />
          )
        )}
        <Text style={[styles.compactText, { color }]}>
          {countdown.shortFormatted}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor, borderColor: color }]}>
      <View style={styles.header}>
        {showIcon && (
          countdown.urgency === "critical" ? (
            <AlertTriangle size={16} color={color} />
          ) : (
            <Clock size={16} color={color} />
          )
        )}
        <Text style={[styles.label, { color }]}>
          {countdown.isExpired ? "Expired" : "Expires in"}
        </Text>
      </View>

      {!countdown.isExpired && (
        <View style={styles.timeContainer}>
          {countdown.hours > 0 && (
            <View style={styles.timeUnit}>
              <Text style={[styles.timeValue, { color }]}>
                {countdown.hours.toString().padStart(2, "0")}
              </Text>
              <Text style={styles.timeLabel}>h</Text>
            </View>
          )}
          <View style={styles.timeUnit}>
            <Text style={[styles.timeValue, { color }]}>
              {countdown.minutes.toString().padStart(2, "0")}
            </Text>
            <Text style={styles.timeLabel}>m</Text>
          </View>
          <View style={styles.timeUnit}>
            <Text style={[styles.timeValue, { color }]}>
              {countdown.seconds.toString().padStart(2, "0")}
            </Text>
            <Text style={styles.timeLabel}>s</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  timeUnit: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  timeValue: {
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  timeLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginLeft: 2,
    marginRight: 8,
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});

export default ChallengeCountdown;
