import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Clock } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useApp } from "@/contexts/AppContext";

export function MatchmakingBanner() {
  const router = useRouter();
  const { customChallengeMatchmaking } = useApp();

  if (!customChallengeMatchmaking.isWaiting) {
    return null;
  }

  const handleBannerPress = () => {
    router.push("/challenge-waiting" as any);
  };

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={handleBannerPress}
      activeOpacity={0.8}
    >
      <View style={styles.bannerContent}>
        <Clock size={18} color="#FFD700" />
        <Text style={styles.bannerText}>
          Waiting for online players to join private match
        </Text>
      </View>
      <View style={styles.pulseIndicator} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderBottomWidth: 1,
    borderBottomColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  pulseIndicator: {
    position: "absolute",
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD700",
  },
});
