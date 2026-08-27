import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Lock,
  ChevronLeft,
  Gamepad2,
  Trophy,
  Wallet,
  Users,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import { Colors, FontFamily, Spacing, BorderRadius } from "@/constants/theme";

interface AuthGateProps {
  children: React.ReactNode;
  featureName?: string;
  message?: string;
}

export function AuthGate({ children, featureName = "this feature", message }: AuthGateProps) {
  const router = useRouter();
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  if (DEV_BYPASS_AUTH) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isAuthenticated && !isGuest) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Lock size={48} color={Colors.primary} />
          </View>

          <Text style={styles.title}>Sign In Required</Text>

          <Text style={styles.description}>
            {message ||
              `You need to sign in to access ${featureName}. Create an account to play against other players, join tournaments, and compete for real rewards.`}
          </Text>

          <View style={styles.featuresList}>
            <FeatureItem Icon={Gamepad2} text="Play against real opponents" />
            <FeatureItem Icon={Trophy} text="Join tournaments & win prizes" />
            <FeatureItem Icon={Wallet} text="Manage your wallet & earnings" />
            <FeatureItem Icon={Users} text="Challenge friends" />
          </View>

          <TouchableOpacity style={styles.signInButton} onPress={() => router.push("/login")}>
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.practiceButton} onPress={() => router.push("/practice")}>
            <Text style={styles.practiceButtonText}>Or continue practicing against AI</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

function FeatureItem({ Icon, text }: { Icon: React.ComponentType<any>; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Icon size={20} color={Colors.textSecondary} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: Spacing.lg,
    left: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 28,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  description: {
    fontFamily: FontFamily.inter,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  featuresList: {
    width: "100%",
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureText: {
    fontFamily: FontFamily.inter,
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  signInButton: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  signInButtonText: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 16,
    color: Colors.background,
  },
  practiceButton: {
    paddingVertical: Spacing.md,
  },
  practiceButtonText: {
    fontFamily: FontFamily.inter,
    fontSize: 14,
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
});

export default AuthGate;
