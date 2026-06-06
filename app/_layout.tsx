import "react-native-get-random-values";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import { SyncStatusProvider } from "@/contexts/SyncStatusContext";
import { ToastProvider } from "@/components/ToastNotification";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import { WalletInitializer } from "@/components/WalletInitializer";
import { ChallengeNotificationListener } from "@/components/ChallengeNotificationListener";
import { TournamentMatchListener } from "@/components/TournamentMatchListener";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/hooks/useAuth";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

// Hides the splash screen once auth has finished its initial check.
// Sits inside AuthProvider so it can read auth state.
function SplashHider() {
  const { isLoading } = useAuth();
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);
  useEffect(() => {
    // Safety net: never hang on splash longer than 5 seconds
    const t = setTimeout(() => SplashScreen.hideAsync(), 5000);
    return () => clearTimeout(t);
  }, []);
  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings", headerShown: false }} />
      <Stack.Screen name="wallet" options={{ title: "Wallet", headerShown: false }} />
      <Stack.Screen name="game" options={{ headerShown: false }} />
      <Stack.Screen name="practice" options={{ headerShown: false }} />
      <Stack.Screen name="challenge-board" options={{ title: "Challenge Board", headerShown: false }} />
      <Stack.Screen name="leaderboard" options={{ title: "Leaderboard", headerShown: false }} />
      <Stack.Screen name="custom-match" options={{ headerShown: false }} />
      <Stack.Screen name="livestream" options={{ title: "Livestream", headerShown: false }} />
      <Stack.Screen name="matchmaking" options={{ headerShown: false }} />
      <Stack.Screen name="create-challenge" options={{ headerShown: false }} />
      <Stack.Screen name="join-challenge" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="deposit" options={{ headerShown: false }} />
      <Stack.Screen name="withdraw" options={{ headerShown: false }} />
      <Stack.Screen name="game-result" options={{ headerShown: false }} />
      <Stack.Screen name="game-detail" options={{ headerShown: false }} />
      <Stack.Screen name="game-settings" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="rewards" options={{ headerShown: false }} />
      <Stack.Screen name="tournaments" options={{ headerShown: false }} />
      <Stack.Screen name="tournament" options={{ headerShown: false }} />
      <Stack.Screen name="challenge-player" options={{ headerShown: false, animation: 'fade', animationDuration: 100 }} />
      <Stack.Screen name="challenge-waiting" options={{ headerShown: false }} />
      <Stack.Screen name="play-now" options={{ headerShown: false }} />
      <Stack.Screen name="online-game" options={{ headerShown: false }} />
      <Stack.Screen name="house-challenge-game" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary scope="root">
          <AuthProvider>
            <SplashHider />
            <WalletInitializer>
              <AppProvider>
                <SyncStatusProvider>
                  <ToastProvider>
                    <RootLayoutNav />
                    <NetworkStatusIndicator />
                    <ChallengeNotificationListener />
                    <TournamentMatchListener />
                  </ToastProvider>
                </SyncStatusProvider>
              </AppProvider>
            </WalletInitializer>
          </AuthProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
