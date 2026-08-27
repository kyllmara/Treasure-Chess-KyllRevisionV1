import "react-native-get-random-values";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
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
import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black";
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
} from "@expo-google-fonts/quicksand";
import { GoogleSansFlex_100Thin } from "@expo-google-fonts/google-sans-flex";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  },
});

function SplashHider({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading } = useAuth();
  const hidden = React.useRef(false);

  const hide = React.useCallback(() => {
    if (!hidden.current) {
      hidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isLoading && fontsLoaded) hide();
  }, [isLoading, fontsLoaded, hide]);

  useEffect(() => {
    const t = setTimeout(hide, 5000);
    return () => clearTimeout(t);
  }, [hide]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
  const [fontsLoaded] = useFonts({
    ArchivoBlack_400Regular,
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    GoogleSansFlex_100Thin,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary scope="root">
          <AuthProvider>
            <SplashHider fontsLoaded={fontsLoaded ?? false} />
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
