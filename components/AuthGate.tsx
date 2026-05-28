import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";

interface AuthGateProps {
  children: React.ReactNode;
  /** Screen title to show in the auth prompt */
  featureName?: string;
  /** Optional custom message */
  message?: string;
}

/**
 * AuthGate component that wraps screens requiring authentication.
 * Shows a login prompt if user is not authenticated, otherwise renders children.
 *
 * Usage:
 * ```tsx
 * export default function MatchmakingScreen() {
 *   return (
 *     <AuthGate featureName="Matchmaking">
 *       <YourScreenContent />
 *     </AuthGate>
 *   );
 * }
 * ```
 */
export function AuthGate({ children, featureName = "this feature", message }: AuthGateProps) {
  const router = useRouter();
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
          <ActivityIndicator size="large" color="#FFD700" />
        </LinearGradient>
      </View>
    );
  }

  // If authenticated, render the protected content
  if (isAuthenticated && !isGuest) {
    return <>{children}</>;
  }

  // Show login prompt for unauthenticated users
  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.content}>
            {/* Lock Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed" size={64} color="#FFD700" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Sign In Required</Text>

            {/* Description */}
            <Text style={styles.description}>
              {message || `You need to sign in to access ${featureName}. Create an account to play against other players, join tournaments, and compete for real rewards.`}
            </Text>

            {/* Features List */}
            <View style={styles.featuresList}>
              <FeatureItem icon="game-controller" text="Play against real opponents" />
              <FeatureItem icon="trophy" text="Join tournaments & win prizes" />
              <FeatureItem icon="wallet" text="Manage your wallet & earnings" />
              <FeatureItem icon="people" text="Challenge friends" />
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.push("/login")}
            >
              <LinearGradient
                colors={["#FFD700", "#FFA500"]}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Practice Mode Link */}
            <TouchableOpacity
              style={styles.practiceButton}
              onPress={() => router.push("/practice")}
            >
              <Text style={styles.practiceButtonText}>
                Or continue practicing against AI
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon as any} size={20} color="#4ECDC4" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  featuresList: {
    width: "100%",
    marginBottom: 32,
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  featureText: {
    fontSize: 15,
    color: "#FFFFFF",
    flex: 1,
  },
  signInButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: "center",
  },
  signInButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  practiceButton: {
    paddingVertical: 12,
  },
  practiceButtonText: {
    fontSize: 14,
    color: "#4ECDC4",
    textDecorationLine: "underline",
  },
});

export default AuthGate;
