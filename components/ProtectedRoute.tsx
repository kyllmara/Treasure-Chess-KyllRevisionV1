import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect, useSegments } from "expo-router";
import { useAuth } from "@/hooks/useAuth";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

// Set to true to bypass auth checks (login disabled for demo/testing)
const DEV_BYPASS_AUTH = false;

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const segments = useSegments();

  // Bypass all auth checks in development mode
  if (DEV_BYPASS_AUTH) {
    return <>{children}</>;
  }

  // Show loading while auth state is being determined
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  const inAuthGroup = segments[0] === "login";
  const inOnboarding = segments[0] === "onboarding";

  // Not authenticated, redirect to login
  if (!isAuthenticated && !inAuthGroup) {
    return <Redirect href="/login" />;
  }

  // Authenticated but no profile, redirect to onboarding
  if (isAuthenticated && !profile && !inOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  // Authenticated with profile, redirect away from auth pages
  if (isAuthenticated && profile && (inAuthGroup || inOnboarding)) {
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
});
