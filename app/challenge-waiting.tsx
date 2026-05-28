import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Swords, Clock, X, Home } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/contexts/AppContext";

const TCT_TO_USD = 0.04;

function usdToTCT(usd: number): number {
  return usd / TCT_TO_USD;
}

const MAX_WAIT_TIME = 300;

export default function ChallengeWaitingScreen() {
  const router = useRouter();
  const { exitCustomChallengeMatchmaking, customChallengeMatchmaking } = useApp();
  const [waitTime, setWaitTime] = useState<number>(0);

  const challengeData = customChallengeMatchmaking.challengeData || {};
  const stake = challengeData.wager || 0;
  const timer = challengeData.timer || 90;

  const handleTimeout = useCallback(() => {
    Alert.alert(
      "Challenge Expired",
      "No players joined your challenge. Please try again.",
      [
        {
          text: "OK",
          onPress: () => {
            exitCustomChallengeMatchmaking();
            router.back();
          },
        },
      ]
    );
  }, [router, exitCustomChallengeMatchmaking]);

  const handleCancelChallenge = useCallback(() => {
    Alert.alert(
      "Cancel Challenge",
      "Are you sure you want to cancel this challenge?",
      [
        {
          text: "No",
          style: "cancel",
        },
        {
          text: "Yes",
          style: "destructive",
          onPress: () => {
            exitCustomChallengeMatchmaking();
            router.back();
          },
        },
      ]
    );
  }, [router, exitCustomChallengeMatchmaking]);

  const handleBrowseApp = useCallback(() => {
    router.push("/" as any);
  }, [router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setWaitTime(prev => {
        if (prev >= MAX_WAIT_TIME) {
          clearInterval(interval);
          handleTimeout();
          return MAX_WAIT_TIME;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [handleTimeout]);

  const formatTime = (seconds: number): string => {
    const remainingSeconds = MAX_WAIT_TIME - seconds;
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimerColor = (): string => {
    const remainingSeconds = MAX_WAIT_TIME - waitTime;
    if (remainingSeconds <= 60) return "#EF4444";
    if (remainingSeconds <= 120) return "#F59E0B";
    return "#FFD700";
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={handleCancelChallenge}
      >
        <X size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
        <View style={styles.header}>
          <Swords size={64} color="#FFD700" />
          <Text style={styles.title}>Waiting for Online Players</Text>
          <Text style={styles.subtitle}>Your challenge is now on the board</Text>
        </View>

        <View style={styles.timerCard}>
          <View style={styles.timerContainer}>
            <Clock size={32} color={getTimerColor()} />
            <Text style={[styles.timerText, { color: getTimerColor() }]}>
              {formatTime(waitTime)}
            </Text>
          </View>
          <Text style={styles.timerLabel}>Time Remaining</Text>
          <ActivityIndicator
            size="large"
            color="#FFD700"
            style={styles.spinner}
          />
        </View>

        <View style={styles.matchDetailsCard}>
          <Text style={styles.detailsTitle}>Match Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stake Amount:</Text>
            <Text style={styles.detailValue}>
              {usdToTCT(stake).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Game Timer:</Text>
            <Text style={styles.detailValue}>
              {timer < 60 ? `${timer} seconds` : `${timer / 60} minutes`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Prize Pool:</Text>
            <Text style={styles.detailValue}>
              {usdToTCT(stake * 2 * 0.9).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            • Your challenge is now visible on the board{'\n'}
            • Other players can accept and join{'\n'}
            • You&apos;ll be notified when someone accepts{'\n'}
            • You can browse the app while waiting
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={handleBrowseApp}
          >
            <Home size={20} color="#0F0F1E" />
            <Text style={styles.browseButtonText}>Browse App</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelChallenge}
          >
            <Text style={styles.cancelButtonText}>Cancel Challenge</Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 100,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
  },

  timerCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 48,
    fontWeight: "800" as const,
  },
  timerLabel: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 20,
  },
  spinner: {
    marginTop: 8,
  },
  matchDetailsCard: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 24,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  infoCard: {
    width: "100%",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: "#A0A0A0",
    lineHeight: 22,
  },
  actionButtons: {
    width: "100%",
    gap: 12,
  },
  browseButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
  },
  browseButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  cancelButton: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EF4444",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#EF4444",
  },
});
