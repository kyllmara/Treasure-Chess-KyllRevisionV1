/**
 * Livestream Live Screen
 *
 * Active streaming view with controls, viewer count, and chat overlay.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  X,
  Eye,
  Clock,
  Share2,
  MessageSquare,
  MoreVertical,
  AlertTriangle,
} from "lucide-react-native";
import { useLivestream, useViewerCount } from "@/hooks/useLivestream";
import { useLivestreamStore } from "@/stores/livestreamStore";
import { StreamPreview } from "@/components/StreamPreview";
import { StreamControls, ViewerCounter } from "@/components/StreamControls";
import { formatStreamDuration, getQualityColor } from "@/lib/livestream";
import type { StreamConfig } from "@/types/livestream";
import { DEFAULT_CAMERA_CONFIG, DEFAULT_GAME_INFO_CONFIG, DEFAULT_AUDIO_CONFIG } from "@/types/livestream";

// ============================================================================
// Screen
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function LivestreamLiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId?: string }>();

  // Hooks
  const {
    isStreaming,
    session,
    connectionState,
    health,
    viewerCount,
    error,
    isLoading,
    stopStream,
    clearError,
  } = useLivestream();

  // Store
  const { preferences, isCameraMuted, isMicrophoneMuted } = useLivestreamStore();

  // Local state
  const [duration, setDuration] = useState(0);
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const durationRef = useRef<ReturnType<typeof setInterval>>();

  // Duration timer
  useEffect(() => {
    if (isStreaming && session?.startedAt) {
      const startTime = new Date(session.startedAt).getTime();

      const updateDuration = () => {
        const now = Date.now();
        setDuration(Math.floor((now - startTime) / 1000));
      };

      updateDuration();
      durationRef.current = setInterval(updateDuration, 1000);

      return () => {
        if (durationRef.current) {
          clearInterval(durationRef.current);
        }
      };
    }
  }, [isStreaming, session?.startedAt]);

  // Handle back button
  useEffect(() => {
    const backAction = () => {
      if (isStreaming) {
        setShowEndConfirmation(true);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [isStreaming]);

  // Show error alerts
  useEffect(() => {
    if (error) {
      Alert.alert("Stream Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error, clearError]);

  // Handle end stream
  const handleEndStream = useCallback(async () => {
    setShowEndConfirmation(false);
    const result = await stopStream();

    if (result.success) {
      Alert.alert(
        "Stream Ended",
        `Duration: ${formatStreamDuration(result.finalStats?.durationSeconds || duration)}\nPeak Viewers: ${result.finalStats?.peakViewerCount || viewerCount}`,
        [{ text: "OK", onPress: () => router.replace("/livestream") }]
      );
    } else {
      Alert.alert("Error", result.error?.message || "Failed to end stream");
    }
  }, [stopStream, duration, viewerCount, router]);

  // Handle close button press
  const handleClosePress = useCallback(() => {
    if (isStreaming) {
      setShowEndConfirmation(true);
    } else {
      router.back();
    }
  }, [isStreaming, router]);

  // Build preview config from session
  const previewConfig: StreamConfig = session?.config || {
    platform: "custom",
    streamKey: "",
    rtmpUrl: "",
    resolution: preferences.defaultResolution,
    audio: DEFAULT_AUDIO_CONFIG,
    camera: { ...DEFAULT_CAMERA_CONFIG, enabled: !isCameraMuted },
    gameInfo: DEFAULT_GAME_INFO_CONFIG,
    title: "Live Stream",
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClosePress}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Live Badge & Duration */}
          <View style={styles.headerCenter}>
            {isStreaming && (
              <>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.durationBadge}>
                  <Clock size={14} color="#FFFFFF" />
                  <Text style={styles.durationText}>
                    {formatStreamDuration(duration)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* More Options */}
          <TouchableOpacity style={styles.moreButton}>
            <MoreVertical size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Stream Preview */}
        <View style={styles.previewContainer}>
          <StreamPreview
            config={previewConfig}
            isLive={isStreaming}
            gameId={session?.gameId || undefined}
          />
        </View>

        {/* Stats Bar */}
        {isStreaming && (
          <View style={styles.statsBar}>
            {/* Viewer Count */}
            <View style={styles.statItem}>
              <Eye size={18} color="#FFD700" />
              <Text style={styles.statValue}>{viewerCount}</Text>
              <Text style={styles.statLabel}>viewers</Text>
            </View>

            {/* Stream Health */}
            {health && (
              <View style={styles.statItem}>
                <View
                  style={[
                    styles.healthIndicator,
                    { backgroundColor: getQualityColor(health.quality) },
                  ]}
                />
                <Text
                  style={[
                    styles.statValue,
                    { color: getQualityColor(health.quality) },
                  ]}
                >
                  {health.quality}
                </Text>
                <Text style={styles.statLabel}>quality</Text>
              </View>
            )}

            {/* Bitrate */}
            {health && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {(health.bitrate / 1000).toFixed(1)}
                </Text>
                <Text style={styles.statLabel}>Mbps</Text>
              </View>
            )}
          </View>
        )}

        {/* Stream Controls */}
        <View style={styles.controlsContainer}>
          <StreamControls
            isStreaming={isStreaming}
            connectionState={connectionState}
            viewerCount={viewerCount}
            health={health}
            onStart={() => {}}
            onStop={() => setShowEndConfirmation(true)}
            onSettingsPress={() => {}}
            disabled={isLoading}
          />
        </View>

        {/* Action Buttons */}
        {isStreaming && (
          <View style={styles.actionButtons}>
            {/* Share Button */}
            <TouchableOpacity style={styles.actionButton}>
              <Share2 size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>

            {/* Chat Button */}
            <TouchableOpacity style={styles.actionButton}>
              <MessageSquare size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Chat</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* End Stream Confirmation Modal */}
        {showEndConfirmation && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <AlertTriangle size={48} color="#EF4444" />
              <Text style={styles.modalTitle}>End Stream?</Text>
              <Text style={styles.modalMessage}>
                Are you sure you want to end your stream? This will disconnect all viewers.
              </Text>
              <View style={styles.modalStats}>
                <View style={styles.modalStatItem}>
                  <Text style={styles.modalStatValue}>{viewerCount}</Text>
                  <Text style={styles.modalStatLabel}>Viewers</Text>
                </View>
                <View style={styles.modalStatDivider} />
                <View style={styles.modalStatItem}>
                  <Text style={styles.modalStatValue}>
                    {formatStreamDuration(duration)}
                  </Text>
                  <Text style={styles.modalStatLabel}>Duration</Text>
                </View>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowEndConfirmation(false)}
                >
                  <Text style={styles.modalCancelText}>Keep Streaming</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalEndButton}
                  onPress={handleEndStream}
                >
                  <LinearGradient
                    colors={["#EF4444", "#DC2626"]}
                    style={styles.modalEndGradient}
                  >
                    <Text style={styles.modalEndText}>End Stream</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Connection Lost Warning */}
        {connectionState === "reconnecting" && (
          <View style={styles.reconnectingBanner}>
            <AlertTriangle size={18} color="#F59E0B" />
            <Text style={styles.reconnectingText}>
              Connection lost. Reconnecting...
            </Text>
          </View>
        )}
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    gap: 6,
  },
  durationText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewContainer: {
    flex: 1,
    maxHeight: SCREEN_WIDTH / (16 / 9) + 80,
  },
  statsBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 32,
    borderBottomWidth: 1,
    borderBottomColor: "#2D2D44",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    color: "#6B7280",
    fontSize: 12,
  },
  healthIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  controlsContainer: {
    paddingTop: 8,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 16,
    paddingBottom: 32,
  },
  actionButton: {
    alignItems: "center",
    gap: 6,
  },
  actionButtonText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  reconnectingBanner: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 158, 11, 0.9)",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  reconnectingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  // Modal styles
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "#2D2D44",
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  modalMessage: {
    color: "#9CA3AF",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  modalStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 24,
    backgroundColor: "#0F0F1E",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  modalStatItem: {
    alignItems: "center",
    flex: 1,
  },
  modalStatValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  modalStatLabel: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 2,
  },
  modalStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#2D2D44",
    marginHorizontal: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#2D2D44",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  modalEndButton: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  modalEndGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  modalEndText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
