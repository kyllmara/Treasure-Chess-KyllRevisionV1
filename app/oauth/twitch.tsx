/**
 * Twitch OAuth Callback Handler
 *
 * Handles the OAuth callback from Twitch after user authorization.
 * Exchanges the authorization code for tokens and stores the connection.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CheckCircle, XCircle, Twitch } from "lucide-react-native";
import { connectTwitch, fetchTwitchUserInfo } from "@/lib/livestream";
import { useLivestreamStore } from "@/stores/livestreamStore";
import { useAuth } from "@/hooks/useAuth";

// ============================================================================
// Types
// ============================================================================

type OAuthStatus = "processing" | "success" | "error";

interface OAuthResult {
  status: OAuthStatus;
  message: string;
  username?: string;
}

// ============================================================================
// Screen
// ============================================================================

export default function TwitchOAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>();
  const { user } = useAuth();

  // Store
  const { setPlatformConnection } = useLivestreamStore();

  // State
  const [result, setResult] = useState<OAuthResult>({
    status: "processing",
    message: "Connecting to Twitch...",
  });

  /**
   * Handle the OAuth callback
   */
  const handleCallback = useCallback(async () => {
    // Check for error from Twitch
    if (params.error) {
      setResult({
        status: "error",
        message: params.error_description || params.error || "Authorization failed",
      });
      return;
    }

    // Check for authorization code
    if (!params.code) {
      setResult({
        status: "error",
        message: "No authorization code received",
      });
      return;
    }

    // Check for user
    if (!user?.id) {
      setResult({
        status: "error",
        message: "Please log in to connect your Twitch account",
      });
      return;
    }

    try {
      // Exchange code for tokens
      setResult({
        status: "processing",
        message: "Exchanging authorization code...",
      });

      const connectionResult = await connectTwitch(user.id, params.code);

      if (!connectionResult.success || !connectionResult.connection) {
        throw new Error(connectionResult.error?.message || "Failed to connect Twitch");
      }

      // Fetch user info
      setResult({
        status: "processing",
        message: "Fetching Twitch profile...",
      });

      // Get the access token from the connection (would need to decrypt in production)
      // For now, we'll use the connection data
      const connection = connectionResult.connection;

      // Update store with connection
      setPlatformConnection("twitch", {
        platform: "twitch",
        isConnected: true,
        username: connection.platform_username || undefined,
        userId: connection.platform_user_id || undefined,
        connectedAt: connection.connected_at,
      });

      setResult({
        status: "success",
        message: "Successfully connected to Twitch!",
        username: connection.platform_username || undefined,
      });

      // Navigate back after a delay
      setTimeout(() => {
        router.replace("/livestream/setup");
      }, 2000);
    } catch (error) {
      console.error("Twitch OAuth error:", error);
      setResult({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to connect Twitch",
      });
    }
  }, [params.code, params.error, params.error_description, user?.id, setPlatformConnection, router]);

  // Process callback on mount
  useEffect(() => {
    handleCallback();
  }, [handleCallback]);

  /**
   * Handle navigation back
   */
  const handleGoBack = useCallback(() => {
    if (result.status === "error") {
      router.replace("/livestream/setup");
    }
  }, [result.status, router]);

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* Twitch Logo */}
          <View style={styles.iconContainer}>
            {result.status === "processing" && (
              <View style={styles.twitchIcon}>
                <Twitch size={48} color="#9146FF" />
              </View>
            )}
            {result.status === "success" && (
              <View style={[styles.statusIcon, styles.successIcon]}>
                <CheckCircle size={64} color="#22C55E" />
              </View>
            )}
            {result.status === "error" && (
              <View style={[styles.statusIcon, styles.errorIcon]}>
                <XCircle size={64} color="#EF4444" />
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {result.status === "processing" && "Connecting Twitch"}
            {result.status === "success" && "Connected!"}
            {result.status === "error" && "Connection Failed"}
          </Text>

          {/* Message */}
          <Text style={styles.message}>{result.message}</Text>

          {/* Username on success */}
          {result.status === "success" && result.username && (
            <View style={styles.usernameContainer}>
              <Twitch size={16} color="#9146FF" />
              <Text style={styles.username}>{result.username}</Text>
            </View>
          )}

          {/* Loading indicator */}
          {result.status === "processing" && (
            <ActivityIndicator
              size="large"
              color="#9146FF"
              style={styles.loader}
            />
          )}

          {/* Error action */}
          {result.status === "error" && (
            <Text
              style={styles.retryText}
              onPress={handleGoBack}
            >
              Tap to go back and try again
            </Text>
          )}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    maxWidth: 320,
  },
  iconContainer: {
    marginBottom: 24,
  },
  twitchIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(145, 70, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  statusIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  successIcon: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  errorIcon: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 24,
  },
  usernameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(145, 70, 255, 0.1)",
    borderRadius: 20,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
    color: "#9146FF",
  },
  loader: {
    marginTop: 24,
  },
  retryText: {
    marginTop: 24,
    fontSize: 14,
    color: "#FFD700",
    textDecorationLine: "underline",
  },
});
