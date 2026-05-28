/**
 * AdminGate Component
 *
 * Wraps admin screens to ensure only admins can access them.
 * Shows an unauthorized screen for non-admins.
 */

import React, { useEffect, useState } from "react";
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
import { useAdmin } from "@/hooks/useAdmin";

interface AdminGateProps {
  children: React.ReactNode;
  /** Require super admin access */
  requireSuperAdmin?: boolean;
  /** Feature name for the unauthorized screen */
  featureName?: string;
}

/**
 * AdminGate component that wraps admin screens.
 * Ensures only admins (or super admins) can access protected content.
 *
 * Usage:
 * ```tsx
 * export default function AdminDashboard() {
 *   return (
 *     <AdminGate featureName="Admin Dashboard">
 *       <YourAdminContent />
 *     </AdminGate>
 *   );
 * }
 * ```
 */
export function AdminGate({
  children,
  requireSuperAdmin = false,
  featureName = "Admin Panel",
}: AdminGateProps) {
  const router = useRouter();
  const { isAuthenticated, isGuest, isLoading: authLoading } = useAuth();
  const {
    isAdmin,
    isSuperAdmin,
    isLoading: adminLoading,
    checkAdminStatus,
    error,
  } = useAdmin();

  const [hasCheckedStatus, setHasCheckedStatus] = useState(false);

  // Check admin status on mount
  useEffect(() => {
    if (isAuthenticated && !isGuest && !hasCheckedStatus) {
      checkAdminStatus().then(() => setHasCheckedStatus(true));
    }
  }, [isAuthenticated, isGuest, hasCheckedStatus, checkAdminStatus]);

  // Show loading state while checking auth/admin status
  if (authLoading || adminLoading || !hasCheckedStatus) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Verifying admin access...</Text>
        </LinearGradient>
      </View>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || isGuest) {
    return (
      <UnauthorizedScreen
        router={router}
        title="Authentication Required"
        message="You must be signed in to access admin features."
        showLoginButton
      />
    );
  }

  // Check admin status
  if (!isAdmin) {
    return (
      <UnauthorizedScreen
        router={router}
        title="Access Denied"
        message="You do not have administrator privileges. This area is restricted to authorized personnel only."
        icon="shield-checkmark"
      />
    );
  }

  // Check super admin if required
  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <UnauthorizedScreen
        router={router}
        title="Super Admin Required"
        message="This feature requires super administrator privileges. Please contact a super admin if you need access."
        icon="key"
      />
    );
  }

  // All checks passed, render children
  return <>{children}</>;
}

// ============================================================================
// Unauthorized Screen Component
// ============================================================================

interface UnauthorizedScreenProps {
  router: ReturnType<typeof useRouter>;
  title: string;
  message: string;
  icon?: string;
  showLoginButton?: boolean;
}

function UnauthorizedScreen({
  router,
  title,
  message,
  icon = "close-circle",
  showLoginButton = false,
}: UnauthorizedScreenProps) {
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
            {/* Icon */}
            <View style={[styles.iconContainer, styles.iconContainerDanger]}>
              <Ionicons name={icon as any} size={64} color="#FF453A" />
            </View>

            {/* Title */}
            <Text style={styles.title}>{title}</Text>

            {/* Description */}
            <Text style={styles.description}>{message}</Text>

            {/* Actions */}
            {showLoginButton ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.push("/login")}
              >
                <LinearGradient
                  colors={["#FFD700", "#FFA500"]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/")}
            >
              <Text style={styles.secondaryButtonText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}


// ============================================================================
// Styles
// ============================================================================

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
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: "#A0A0A0",
  },
  safeArea: {
    flex: 1,
    width: "100%",
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
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  iconContainerDanger: {
    backgroundColor: "rgba(255, 69, 58, 0.15)",
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
  primaryButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  secondaryButton: {
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: "#4ECDC4",
    textDecorationLine: "underline",
  },
});

export default AdminGate;
