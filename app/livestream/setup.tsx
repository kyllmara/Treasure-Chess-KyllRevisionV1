/**
 * Livestream Setup Screen
 *
 * Configure stream settings, connect platforms, and prepare to go live.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Radio,
  Settings,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Eye,
  Layout,
  Sliders,
  AlertTriangle,
} from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLivestream,
  usePlatformConnections,
  useStreamSettings,
  useMediaPermissions,
} from "@/hooks/useLivestream";
import { useLivestreamStore } from "@/stores/livestreamStore";
import {
  StreamPlatformPicker,
  StreamKeyInput,
  QualitySelector,
} from "@/components/StreamPlatformPicker";
import { StreamPreview } from "@/components/StreamPreview";
import type { StreamPlatform, StreamConfig } from "@/types/livestream";
import { PLATFORM_INFO, DEFAULT_CAMERA_CONFIG, DEFAULT_GAME_INFO_CONFIG } from "@/types/livestream";

// ============================================================================
// Screen
// ============================================================================

export default function LivestreamSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gameId?: string }>();
  const { user } = useAuth();

  // Hooks
  const { startStream, isLoading, error, clearError } = useLivestream({ gameId: params.gameId });
  const { connections, connectPlatform, isLoading: connectionsLoading } = usePlatformConnections();
  const {
    resolution,
    setResolution,
    cameraEnabled,
    setCameraEnabled,
    cameraPosition,
    setCameraPosition,
    audioEnabled,
    setAudioEnabled,
    showPlayerNames,
    setShowPlayerNames,
    showTimer,
    setShowTimer,
    showStakes,
    setShowStakes,
  } = useStreamSettings();
  const {
    hasCameraPermission,
    hasMicrophonePermission,
    requestPermissions,
  } = useMediaPermissions();

  // Store
  const store = useLivestreamStore();
  const { selectedPlatform, setSelectedPlatform, preferences } = useLivestreamStore();

  // Local state
  const [streamKey, setStreamKey] = useState("");
  const [rtmpUrl, setRtmpUrl] = useState("");
  const [streamTitle, setStreamTitle] = useState(preferences.defaultTitleTemplate);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get platform info
  const platformInfo = selectedPlatform ? PLATFORM_INFO[selectedPlatform] : null;
  const requiresManualKey = platformInfo?.requiresManualKey ?? false;
  const isConnected = connections.some(
    (c) => c.platform === selectedPlatform && c.isConnected
  );

  // Check if ready to stream
  const canGoLive =
    selectedPlatform &&
    (requiresManualKey ? streamKey.length >= 10 : isConnected) &&
    hasCameraPermission !== false &&
    hasMicrophonePermission !== false;

  // Load saved stream key
  useEffect(() => {
    if (selectedPlatform && preferences.savedStreamKeys[selectedPlatform]) {
      setStreamKey(preferences.savedStreamKeys[selectedPlatform]!);
    } else {
      setStreamKey("");
    }
    if (selectedPlatform) {
      setRtmpUrl(PLATFORM_INFO[selectedPlatform].rtmpUrl);
    }
  }, [selectedPlatform, preferences.savedStreamKeys]);

  // Handle permission request
  const handleRequestPermissions = useCallback(async () => {
    const result = await requestPermissions();
    if (!result.camera || !result.microphone) {
      Alert.alert(
        "Permissions Required",
        "Camera and microphone access are required for streaming.",
        [{ text: "OK" }]
      );
    }
  }, [requestPermissions]);

  // Handle go live
  const handleGoLive = useCallback(async () => {
    if (!selectedPlatform || !canGoLive) return;

    // Save stream key for next time
    if (requiresManualKey && streamKey) {
      store.saveStreamKey(selectedPlatform, streamKey);
    }

    const config: Partial<StreamConfig> = {
      platform: selectedPlatform,
      streamKey: requiresManualKey ? streamKey : undefined,
      rtmpUrl: selectedPlatform === "custom" ? rtmpUrl : undefined,
      resolution,
      title: streamTitle,
      camera: {
        ...DEFAULT_CAMERA_CONFIG,
        enabled: cameraEnabled,
        position: cameraPosition,
      },
      gameInfo: {
        ...DEFAULT_GAME_INFO_CONFIG,
        showPlayerNames,
        showTimer,
        showStakes,
      },
      audio: {
        enabled: audioEnabled,
        bitrate: 128,
        sampleRate: 44100,
        channels: 2,
      },
    };

    const result = await startStream(config);

    if (result.success && result.session) {
      router.replace({
        pathname: "/livestream/live",
        params: { sessionId: result.session.id },
      });
    } else {
      Alert.alert(
        "Stream Error",
        result.error?.message || "Failed to start stream",
        [{ text: "OK", onPress: clearError }]
      );
    }
  }, [
    selectedPlatform,
    canGoLive,
    requiresManualKey,
    streamKey,
    rtmpUrl,
    resolution,
    streamTitle,
    cameraEnabled,
    cameraPosition,
    audioEnabled,
    showPlayerNames,
    showTimer,
    showStakes,
    startStream,
    store,
    router,
    clearError,
  ]);

  // Build preview config
  const previewConfig: StreamConfig = {
    platform: selectedPlatform || "custom",
    streamKey: "",
    rtmpUrl: "",
    resolution,
    audio: { enabled: audioEnabled, bitrate: 128, sampleRate: 44100, channels: 2 },
    camera: {
      enabled: cameraEnabled,
      position: cameraPosition,
      size: "medium",
      borderRadius: 12,
      borderColor: "#FFD700",
      useFrontCamera: true,
    },
    gameInfo: {
      showPlayerNames,
      showRatings: true,
      showTimer,
      showMoveHistory: false,
      showStakes,
      position: "top",
    },
    title: streamTitle,
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Stream Setup</Text>
          <View style={styles.headerRight} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Permissions Warning */}
            {(hasCameraPermission === false || hasMicrophonePermission === false) && (
              <TouchableOpacity
                style={styles.permissionWarning}
                onPress={handleRequestPermissions}
              >
                <AlertTriangle size={20} color="#F59E0B" />
                <View style={styles.permissionWarningText}>
                  <Text style={styles.permissionWarningTitle}>
                    Permissions Required
                  </Text>
                  <Text style={styles.permissionWarningSubtitle}>
                    Tap to grant camera and microphone access
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Preview */}
            <StreamPreview
              config={previewConfig}
              isLive={false}
              onConfigChange={() => setShowAdvanced(true)}
            />

            {/* Platform Selection */}
            <StreamPlatformPicker
              selectedPlatform={selectedPlatform}
              connections={connections}
              onSelectPlatform={setSelectedPlatform}
              onConnectPlatform={connectPlatform}
              disabled={isLoading}
            />

            {/* Stream Key Input (for manual key platforms) */}
            {selectedPlatform && requiresManualKey && (
              <StreamKeyInput
                platform={selectedPlatform}
                value={streamKey}
                rtmpUrl={selectedPlatform === "custom" ? rtmpUrl : undefined}
                onChange={setStreamKey}
                onRtmpUrlChange={selectedPlatform === "custom" ? setRtmpUrl : undefined}
                showRtmpUrl={selectedPlatform === "custom"}
                disabled={isLoading}
              />
            )}

            {/* Stream Title */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stream Title</Text>
              <TextInput
                style={styles.titleInput}
                value={streamTitle}
                onChangeText={setStreamTitle}
                placeholder="Enter stream title..."
                placeholderTextColor="#6B7280"
                maxLength={140}
              />
              <Text style={styles.charCount}>{streamTitle.length}/140</Text>
            </View>

            {/* Quality Selection */}
            <QualitySelector
              selectedResolution={resolution}
              onSelectResolution={setResolution}
              disabled={isLoading}
            />

            {/* Quick Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stream Settings</Text>

              <View style={styles.quickSettings}>
                {/* Camera Toggle */}
                <TouchableOpacity
                  style={[styles.settingToggle, cameraEnabled && styles.settingToggleActive]}
                  onPress={() => setCameraEnabled(!cameraEnabled)}
                >
                  {cameraEnabled ? (
                    <Video size={20} color="#22C55E" />
                  ) : (
                    <VideoOff size={20} color="#6B7280" />
                  )}
                  <Text style={[styles.settingToggleText, cameraEnabled && styles.settingToggleTextActive]}>
                    Camera
                  </Text>
                </TouchableOpacity>

                {/* Microphone Toggle */}
                <TouchableOpacity
                  style={[styles.settingToggle, audioEnabled && styles.settingToggleActive]}
                  onPress={() => setAudioEnabled(!audioEnabled)}
                >
                  {audioEnabled ? (
                    <Mic size={20} color="#22C55E" />
                  ) : (
                    <MicOff size={20} color="#6B7280" />
                  )}
                  <Text style={[styles.settingToggleText, audioEnabled && styles.settingToggleTextActive]}>
                    Audio
                  </Text>
                </TouchableOpacity>

                {/* Player Names Toggle */}
                <TouchableOpacity
                  style={[styles.settingToggle, showPlayerNames && styles.settingToggleActive]}
                  onPress={() => setShowPlayerNames(!showPlayerNames)}
                >
                  <Eye size={20} color={showPlayerNames ? "#22C55E" : "#6B7280"} />
                  <Text style={[styles.settingToggleText, showPlayerNames && styles.settingToggleTextActive]}>
                    Names
                  </Text>
                </TouchableOpacity>

                {/* Timer Toggle */}
                <TouchableOpacity
                  style={[styles.settingToggle, showTimer && styles.settingToggleActive]}
                  onPress={() => setShowTimer(!showTimer)}
                >
                  <Layout size={20} color={showTimer ? "#22C55E" : "#6B7280"} />
                  <Text style={[styles.settingToggleText, showTimer && styles.settingToggleTextActive]}>
                    Timer
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Advanced Settings Toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Sliders size={18} color="#9CA3AF" />
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
              </Text>
            </TouchableOpacity>

            {/* Advanced Settings */}
            {showAdvanced && (
              <View style={styles.advancedSection}>
                <Text style={styles.sectionTitle}>Camera Position</Text>
                <View style={styles.positionGrid}>
                  {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
                    (position) => (
                      <TouchableOpacity
                        key={position}
                        style={[
                          styles.positionOption,
                          cameraPosition === position && styles.positionOptionSelected,
                        ]}
                        onPress={() => setCameraPosition(position)}
                      >
                        <Text
                          style={[
                            styles.positionOptionText,
                            cameraPosition === position && styles.positionOptionTextSelected,
                          ]}
                        >
                          {position.replace("-", " ")}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>

                <View style={styles.advancedToggles}>
                  <TouchableOpacity
                    style={[styles.advancedToggleItem, showStakes && styles.advancedToggleItemActive]}
                    onPress={() => setShowStakes(!showStakes)}
                  >
                    <Text style={styles.advancedToggleItemText}>Show Stakes</Text>
                    <View
                      style={[
                        styles.advancedToggleIndicator,
                        showStakes && styles.advancedToggleIndicatorActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Spacer for button */}
            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Go Live Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.goLiveButton, !canGoLive && styles.goLiveButtonDisabled]}
            onPress={handleGoLive}
            disabled={!canGoLive || isLoading}
          >
            <LinearGradient
              colors={canGoLive ? ["#EF4444", "#DC2626"] : ["#4B5563", "#374151"]}
              style={styles.goLiveGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Radio size={24} color="#FFFFFF" />
              <Text style={styles.goLiveText}>
                {isLoading ? "Starting..." : "GO LIVE"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {!canGoLive && selectedPlatform && (
            <Text style={styles.goLiveHint}>
              {requiresManualKey && streamKey.length < 10
                ? "Enter a valid stream key to continue"
                : !isConnected && !requiresManualKey
                ? `Connect your ${platformInfo?.name} account to continue`
                : "Complete setup to go live"}
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2D2D44",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  headerRight: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  permissionWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    gap: 12,
  },
  permissionWarningText: {
    flex: 1,
  },
  permissionWarningTitle: {
    color: "#F59E0B",
    fontSize: 14,
    fontWeight: "600",
  },
  permissionWarningSubtitle: {
    color: "#D97706",
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  titleInput: {
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2D2D44",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
  },
  charCount: {
    color: "#6B7280",
    fontSize: 12,
    textAlign: "right",
    marginTop: 4,
  },
  quickSettings: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  settingToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A2E",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D2D44",
    gap: 8,
  },
  settingToggleActive: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  settingToggleText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  settingToggleTextActive: {
    color: "#22C55E",
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  advancedToggleText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  advancedSection: {
    paddingHorizontal: 16,
  },
  positionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  positionOption: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1A1A2E",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D2D44",
    alignItems: "center",
  },
  positionOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  positionOptionText: {
    color: "#9CA3AF",
    fontSize: 12,
    textTransform: "capitalize",
  },
  positionOptionTextSelected: {
    color: "#FFD700",
    fontWeight: "600",
  },
  advancedToggles: {
    gap: 8,
  },
  advancedToggleItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1A2E",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D2D44",
  },
  advancedToggleItemActive: {
    borderColor: "#22C55E",
  },
  advancedToggleItemText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  advancedToggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#374151",
  },
  advancedToggleIndicatorActive: {
    backgroundColor: "#22C55E",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: "rgba(15, 15, 30, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "#2D2D44",
  },
  goLiveButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  goLiveButtonDisabled: {
    opacity: 0.6,
  },
  goLiveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  goLiveText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  goLiveHint: {
    color: "#9CA3AF",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
