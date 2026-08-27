import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect, useSegments } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import { Colors } from "@/constants/theme";

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const segments = useSegments();

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

  const inAuthGroup = segments[0] === "login";
  const inOnboarding = segments[0] === "onboarding";

  if (!isAuthenticated && !inAuthGroup) {
    return <Redirect href="/login" />;
  }

  if (isAuthenticated && !profile && !inOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (isAuthenticated && profile && (inAuthGroup || inOnboarding)) {
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
