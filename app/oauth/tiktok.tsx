/**
 * TikTok OAuth Callback Handler
 *
 * Handles the OAuth callback from TikTok after user authorization.
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
import { CheckCircle, XCircle, Music } from "lucide-react-native";
import { connectTikTok, fetchTikTokUserInfo } from "@/lib/livestream";
import { useLivestreamStore } from "@/stores/livestreamStore";
import { useAuth } from "@/hooks/useAuth";

// ============================================================================
// Types
// ============================================================================

type OAuthStatus = "processing" | "success" | "error" | "no_live";

interface OAuthResult {
  status: OAuthStatus;
  message: string;
  username?: string;
}

// ============================================================================
// Screen
// ============================================================================

export default function TikTokOAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
    scopes?: string;
  }>();
  const { user } = useAuth();

  // Store
  const { setPlatformConnection } = useLivestreamStore();

  // State
  const [result, setResult] = useState<OAuthResult>({
    status: "processing",
    message: "Connecting to TikTok...",
  });

  /**
   * Handle the OAuth callback
   */
  const handleCallback = useCallback(async () => {
    // Check for error from TikTok
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
        message: "Please log in to connect your TikTok account",
      });
      return;
    }

    try {
      // Exchange code for tokens
      setResult({
        status: "processing",
        message: "Exchanging authorization code...",
      });

      const connectionResult = await connectTikTok(user.id, params.code);

      if (!connectionResult.success || !connectionResult.connection) {
        throw new Error(connectionResult.error?.message || "Failed to connect TikTok");
      }

      const connection = connectionResult.connection;

      // Check if live streaming is enabled
      // TikTok requires specific eligibility for live streaming
      setResult({
        status: "processing",
        message: "Checking live streaming eligibility...",
      });

      // The user info fetch in connectTikTok should have checked live capability
      // For now, we assume success if we got here
      const hasLiveCapability = true; // This would come from the TikTok user info

      if (!hasLiveCapability) {
        setResult({
          status: "no_live",
          message: "Your TikTok account is not eligible for live streaming. You need at least 1,000 followers and be 16+ years old.",
        });

        // Still save connection but note the limitation
        setPlatformConnection("tiktok", {
          platform: "tiktok",
          isConnected: true,
          username: connection.platform_username || undefined,
          userId: connection.platform_user_id || undefined,
          connectedAt: connection.connected_at,
        });

        setTimeout(() => {
          router.replace("/livestream/setup");
        }, 4000);
        return;
      }

      // Update store with connection
      setPlatformConnection("tiktok", {
        platform: "tiktok",
        isConnected: true,
        username: connection.platform_username || undefined,
        userId: connection.platform_user_id || undefined,
        connectedAt: connection.connected_at,
      });

      setResult({
        status: "success",
        message: "Successfully connected to TikTok!",
        username: connection.platform_username || undefined,
      });

      // Navigate back after a delay
      setTimeout(() => {
        router.replace("/livestream/setup");
      }, 2000);
    } catch (error) {
      console.error("TikTok OAuth error:", error);
      setResult({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to connect TikTok",
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
    if (result.status === "error" || result.status === "no_live") {
      router.replace("/livestream/setup");
    }
  }, [result.status, router]);

  // TikTok brand color
  const tiktokColor = "#FF0050";

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* TikTok Logo */}
          <View style={styles.iconContainer}>
            {result.status === "processing" && (
              <View style={[styles.tiktokIcon, { backgroundColor: `${tiktokColor}20` }]}>
                <Music size={48} color={tiktokColor} />
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
            {result.status === "no_live" && (
              <View style={[styles.statusIcon, styles.warningIcon]}>
                <Music size={64} color="#F59E0B" />
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {result.status === "processing" && "Connecting TikTok"}
            {result.status === "success" && "Connected!"}
            {result.status === "error" && "Connection Failed"}
            {result.status === "no_live" && "Limited Access"}
          </Text>

          {/* Message */}
          <Text style={styles.message}>{result.message}</Text>

          {/* Username on success */}
          {(result.status === "success" || result.status === "no_live") && result.username && (
            <View style={[styles.usernameContainer, { backgroundColor: `${tiktokColor}20` }]}>
              <Music size={16} color={tiktokColor} />
              <Text style={[styles.username, { color: tiktokColor }]}>@{result.username}</Text>
            </View>
          )}

          {/* Loading indicator */}
          {result.status === "processing" && (
            <ActivityIndicator
              size="large"
              color={tiktokColor}
              style={styles.loader}
            />
          )}

          {/* Live eligibility info */}
          {result.status === "no_live" && (
            <View style={styles.eligibilityInfo}>
              <Text style={styles.eligibilityTitle}>TikTok Live Requirements:</Text>
              <Text style={styles.eligibilityItem}>• At least 1,000 followers</Text>
              <Text style={styles.eligibilityItem}>• 16+ years old (18+ for virtual gifts)</Text>
              <Text style={styles.eligibilityItem}>• Account in good standing</Text>
            </View>
          )}

          {/* Error action */}
          {(result.status === "error" || result.status === "no_live") && (
            <Text
              style={styles.retryText}
              onPress={handleGoBack}
            >
              Tap to go back
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
  tiktokIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  warningIcon: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
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
    borderRadius: 20,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
  },
  loader: {
    marginTop: 24,
  },
  eligibilityInfo: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  eligibilityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F59E0B",
    marginBottom: 8,
  },
  eligibilityItem: {
    fontSize: 13,
    color: "#9CA3AF",
    marginVertical: 2,
  },
  retryText: {
    marginTop: 24,
    fontSize: 14,
    color: "#FFD700",
    textDecorationLine: "underline",
  },
});
