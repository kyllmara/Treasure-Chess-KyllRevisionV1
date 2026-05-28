/**
 * TournamentCountdown Component
 *
 * Displays a countdown timer to tournament start time.
 * Shows days, hours, minutes, and seconds with visual styling.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Clock, Play, CheckCircle } from "lucide-react-native";
import { useTournamentCountdown } from "@/hooks/useTournament";

// ============================================================================
// Types
// ============================================================================

export interface TournamentCountdownProps {
  startTime: string | Date;
  status?: "registration" | "starting" | "active" | "completed";
  variant?: "default" | "compact" | "inline";
  showLabel?: boolean;
}

// ============================================================================
// Time Unit Component
// ============================================================================

function TimeUnit({
  value,
  label,
  isLast = false,
}: {
  value: number;
  label: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timeUnit}>
      <View style={styles.timeValueContainer}>
        <Text style={styles.timeValue}>
          {value.toString().padStart(2, "0")}
        </Text>
      </View>
      <Text style={styles.timeLabel}>{label}</Text>
      {!isLast && <Text style={styles.timeSeparator}>:</Text>}
    </View>
  );
}

// ============================================================================
// Compact Time Unit
// ============================================================================

function CompactTimeUnit({
  value,
  unit,
}: {
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.compactUnit}>
      <Text style={styles.compactValue}>{value}</Text>
      <Text style={styles.compactLabel}>{unit}</Text>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function TournamentCountdown({
  startTime,
  status = "registration",
  variant = "default",
  showLabel = true,
}: TournamentCountdownProps) {
  const { days, hours, minutes, seconds, isExpired, formatted } =
    useTournamentCountdown(startTime);

  // Already started or completed
  if (isExpired || status === "active" || status === "completed") {
    if (variant === "inline") {
      return (
        <View style={styles.inlineContainer}>
          {status === "active" ? (
            <>
              <Play size={14} color="#4ECDC4" />
              <Text style={styles.inlineTextActive}>In Progress</Text>
            </>
          ) : status === "completed" ? (
            <>
              <CheckCircle size={14} color="#A0A0A0" />
              <Text style={styles.inlineTextCompleted}>Completed</Text>
            </>
          ) : (
            <>
              <Clock size={14} color="#FFB347" />
              <Text style={styles.inlineTextStarting}>Starting Soon</Text>
            </>
          )}
        </View>
      );
    }

    return (
      <View style={styles.statusContainer}>
        <LinearGradient
          colors={
            status === "active"
              ? ["#4ECDC4", "#44A08D"]
              : status === "completed"
              ? ["#666", "#444"]
              : ["#FFB347", "#FF8E8E"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.statusGradient}
        >
          {status === "active" ? (
            <>
              <Play size={20} color="#FFF" />
              <Text style={styles.statusText}>Tournament In Progress</Text>
            </>
          ) : status === "completed" ? (
            <>
              <CheckCircle size={20} color="#FFF" />
              <Text style={styles.statusText}>Tournament Completed</Text>
            </>
          ) : (
            <>
              <Clock size={20} color="#FFF" />
              <Text style={styles.statusText}>Starting Soon</Text>
            </>
          )}
        </LinearGradient>
      </View>
    );
  }

  // Inline variant
  if (variant === "inline") {
    return (
      <View style={styles.inlineContainer}>
        <Clock size={14} color="#FFB347" />
        <Text style={styles.inlineText}>{formatted}</Text>
      </View>
    );
  }

  // Compact variant
  if (variant === "compact") {
    return (
      <View style={styles.compactContainer}>
        {showLabel && (
          <View style={styles.compactHeader}>
            <Clock size={16} color="#FFB347" />
            <Text style={styles.compactHeaderText}>Starts In</Text>
          </View>
        )}
        <View style={styles.compactTimeRow}>
          {days > 0 && <CompactTimeUnit value={days} unit="d" />}
          <CompactTimeUnit value={hours} unit="h" />
          <CompactTimeUnit value={minutes} unit="m" />
          {days === 0 && <CompactTimeUnit value={seconds} unit="s" />}
        </View>
      </View>
    );
  }

  // Default variant - large countdown
  return (
    <View style={styles.container}>
      {showLabel && (
        <View style={styles.header}>
          <Clock size={20} color="#FFB347" />
          <Text style={styles.headerText}>Tournament Starts In</Text>
        </View>
      )}

      <LinearGradient
        colors={["#1a1a2e", "#16213e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.countdownContainer}
      >
        <View style={styles.timeRow}>
          {days > 0 && (
            <TimeUnit value={days} label="Days" />
          )}
          <TimeUnit value={hours} label="Hours" />
          <TimeUnit value={minutes} label="Mins" />
          <TimeUnit value={seconds} label="Secs" isLast />
        </View>
      </LinearGradient>

      {/* Urgency indicator */}
      {days === 0 && hours < 1 && (
        <View style={styles.urgentBanner}>
          <Text style={styles.urgentText}>Starting very soon!</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Default variant
  container: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerText: {
    color: "#FFB347",
    fontSize: 16,
    fontWeight: "600",
  },
  countdownContainer: {
    borderRadius: 16,
    padding: 20,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 8,
  },
  timeUnit: {
    alignItems: "center",
    position: "relative",
    paddingRight: 16,
  },
  timeValueContainer: {
    backgroundColor: "rgba(255, 179, 71, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 64,
  },
  timeValue: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  timeLabel: {
    color: "#A0A0A0",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textTransform: "uppercase",
  },
  timeSeparator: {
    color: "#FFB347",
    fontSize: 24,
    fontWeight: "700",
    position: "absolute",
    right: 0,
    top: 14,
  },
  urgentBanner: {
    backgroundColor: "rgba(255, 107, 107, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  urgentText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontWeight: "600",
  },

  // Compact variant
  compactContainer: {
    gap: 8,
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  compactHeaderText: {
    color: "#FFB347",
    fontSize: 13,
    fontWeight: "600",
  },
  compactTimeRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  compactUnit: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  compactValue: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  compactLabel: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "500",
    marginRight: 4,
  },

  // Inline variant
  inlineContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineText: {
    color: "#FFB347",
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  inlineTextActive: {
    color: "#4ECDC4",
    fontSize: 13,
    fontWeight: "600",
  },
  inlineTextCompleted: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "600",
  },
  inlineTextStarting: {
    color: "#FFB347",
    fontSize: 13,
    fontWeight: "600",
  },

  // Status display
  statusContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  statusGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  statusText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default TournamentCountdown;
