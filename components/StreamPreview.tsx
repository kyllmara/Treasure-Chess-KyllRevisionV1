/**
 * StreamPreview Component
 *
 * Displays a preview of the stream layout with the chess board,
 * camera overlay, and game info overlay.
 */

import React, { memo, useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  Text,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Settings,
  Maximize2,
  Minimize2,
} from "lucide-react-native";
import { useStreamControls, useStreamPreferences } from "@/stores/livestreamStore";
import type {
  StreamConfig,
  CameraPosition,
  StreamPreviewProps,
} from "@/types/livestream";

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PREVIEW_ASPECT_RATIO = 16 / 9;
const PREVIEW_WIDTH = SCREEN_WIDTH - 32;
const PREVIEW_HEIGHT = PREVIEW_WIDTH / PREVIEW_ASPECT_RATIO;

const CAMERA_SIZES = {
  small: 0.15,
  medium: 0.2,
  large: 0.25,
};

// ============================================================================
// Component
// ============================================================================

export const StreamPreview = memo(function StreamPreview({
  gameId,
  config,
  isLive,
  onConfigChange,
}: StreamPreviewProps) {
  const {
    isCameraMuted,
    isMicrophoneMuted,
    toggleCameraMuted,
    toggleMicrophoneMuted,
  } = useStreamControls();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for live indicator
  useEffect(() => {
    if (isLive) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isLive, pulseAnim]);

  const getCameraStyle = useCallback(() => {
    const size = CAMERA_SIZES[config.camera.size];
    const width = PREVIEW_WIDTH * size;
    const height = width * (4 / 3); // 4:3 aspect ratio for camera
    const padding = 8;

    const positions: Record<CameraPosition, { top?: number; bottom?: number; left?: number; right?: number }> = {
      "top-left": { top: padding, left: padding },
      "top-right": { top: padding, right: padding },
      "bottom-left": { bottom: padding, left: padding },
      "bottom-right": { bottom: padding, right: padding },
    };

    return {
      ...positions[config.camera.position],
      width,
      height,
      borderRadius: config.camera.borderRadius,
      borderColor: config.camera.borderColor,
    };
  }, [config.camera]);

  const cameraStyle = getCameraStyle();

  return (
    <View style={[styles.container, isFullscreen && styles.fullscreen]}>
      {/* Preview Frame */}
      <View style={styles.previewFrame}>
        {/* Live Indicator */}
        {isLive && (
          <Animated.View
            style={[
              styles.liveIndicator,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </Animated.View>
        )}

        {/* Chess Board Area (Placeholder) */}
        <View style={styles.boardPlaceholder}>
          <LinearGradient
            colors={["#1A1A2E", "#16213E"]}
            style={styles.boardGradient}
          >
            {/* Chess board grid lines for visual reference */}
            <View style={styles.boardGrid}>
              {Array.from({ length: 8 }).map((_, row) => (
                <View key={row} style={styles.boardRow}>
                  {Array.from({ length: 8 }).map((_, col) => (
                    <View
                      key={col}
                      style={[
                        styles.boardSquare,
                        (row + col) % 2 === 0
                          ? styles.lightSquare
                          : styles.darkSquare,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
            <Text style={styles.boardPlaceholderText}>Chess Board</Text>
          </LinearGradient>
        </View>

        {/* Camera Overlay */}
        {config.camera.enabled && !isCameraMuted && (
          <View
            style={[
              styles.cameraOverlay,
              {
                width: cameraStyle.width,
                height: cameraStyle.height,
                borderRadius: cameraStyle.borderRadius,
                borderColor: cameraStyle.borderColor,
                top: cameraStyle.top,
                bottom: cameraStyle.bottom,
                left: cameraStyle.left,
                right: cameraStyle.right,
              },
            ]}
          >
            <LinearGradient
              colors={["#2D2D44", "#1A1A2E"]}
              style={styles.cameraPlaceholder}
            >
              <Video size={24} color="#FFD700" />
              <Text style={styles.cameraText}>Camera</Text>
            </LinearGradient>
          </View>
        )}

        {/* Game Info Overlay */}
        {config.gameInfo.showPlayerNames && (
          <View
            style={[
              styles.gameInfoOverlay,
              config.gameInfo.position === "top"
                ? styles.gameInfoTop
                : config.gameInfo.position === "bottom"
                ? styles.gameInfoBottom
                : styles.gameInfoSide,
            ]}
          >
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>Player 1</Text>
              {config.gameInfo.showRatings && (
                <Text style={styles.playerRating}>1500</Text>
              )}
              {config.gameInfo.showTimer && (
                <Text style={styles.playerTimer}>5:00</Text>
              )}
            </View>
            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>Player 2</Text>
              {config.gameInfo.showRatings && (
                <Text style={styles.playerRating}>1500</Text>
              )}
              {config.gameInfo.showTimer && (
                <Text style={styles.playerTimer}>5:00</Text>
              )}
            </View>
          </View>
        )}

        {/* Muted Indicators */}
        {isCameraMuted && config.camera.enabled && (
          <View style={[styles.mutedIndicator, styles.cameraMutedIndicator]}>
            <VideoOff size={20} color="#EF4444" />
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Audio Toggle */}
        <TouchableOpacity
          style={[styles.controlButton, isMicrophoneMuted && styles.controlButtonMuted]}
          onPress={toggleMicrophoneMuted}
        >
          {isMicrophoneMuted ? (
            <MicOff size={20} color="#EF4444" />
          ) : (
            <Mic size={20} color="#22C55E" />
          )}
        </TouchableOpacity>

        {/* Camera Toggle */}
        {config.camera.enabled && (
          <TouchableOpacity
            style={[styles.controlButton, isCameraMuted && styles.controlButtonMuted]}
            onPress={toggleCameraMuted}
          >
            {isCameraMuted ? (
              <VideoOff size={20} color="#EF4444" />
            ) : (
              <Video size={20} color="#22C55E" />
            )}
          </TouchableOpacity>
        )}

        {/* Fullscreen Toggle */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? (
            <Minimize2 size={20} color="#FFFFFF" />
          ) : (
            <Maximize2 size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>

        {/* Settings */}
        {onConfigChange && (
          <TouchableOpacity style={styles.controlButton}>
            <Settings size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Quality Badge */}
      <View style={styles.qualityBadge}>
        <Text style={styles.qualityText}>{config.resolution}</Text>
      </View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
  },
  fullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: "#000000",
    marginVertical: 0,
    justifyContent: "center",
  },
  previewFrame: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F0F1E",
    borderWidth: 2,
    borderColor: "#2D2D44",
    position: "relative",
  },
  boardPlaceholder: {
    flex: 1,
  },
  boardGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  boardGrid: {
    position: "absolute",
    top: "10%",
    left: "10%",
    right: "10%",
    bottom: "10%",
    opacity: 0.3,
  },
  boardRow: {
    flex: 1,
    flexDirection: "row",
  },
  boardSquare: {
    flex: 1,
  },
  lightSquare: {
    backgroundColor: "#4A4A6A",
  },
  darkSquare: {
    backgroundColor: "#2D2D44",
  },
  boardPlaceholderText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
  cameraOverlay: {
    position: "absolute",
    borderWidth: 3,
    overflow: "hidden",
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraText: {
    color: "#9CA3AF",
    fontSize: 10,
    marginTop: 4,
  },
  gameInfoOverlay: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gameInfoTop: {
    top: 8,
    left: "50%",
    transform: [{ translateX: -100 }],
    width: 200,
    justifyContent: "center",
  },
  gameInfoBottom: {
    bottom: 8,
    left: "50%",
    transform: [{ translateX: -100 }],
    width: 200,
    justifyContent: "center",
  },
  gameInfoSide: {
    top: 8,
    right: 8,
    flexDirection: "column",
  },
  playerInfo: {
    alignItems: "center",
    flex: 1,
  },
  playerName: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  playerRating: {
    color: "#FFD700",
    fontSize: 9,
  },
  playerTimer: {
    color: "#22C55E",
    fontSize: 10,
    fontWeight: "700",
  },
  vsContainer: {
    paddingHorizontal: 8,
  },
  vsText: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "600",
  },
  liveIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 10,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    marginRight: 4,
  },
  liveText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  mutedIndicator: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 6,
    borderRadius: 20,
  },
  cameraMutedIndicator: {
    bottom: 8,
    right: 8,
  },
  controls: {
    flexDirection: "row",
    marginTop: 12,
    gap: 12,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2D2D44",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3D3D5C",
  },
  controlButtonMuted: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "#EF4444",
  },
  qualityBadge: {
    position: "absolute",
    top: 8,
    right: 24,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  qualityText: {
    color: "#FFD700",
    fontSize: 10,
    fontWeight: "600",
  },
});

export default StreamPreview;
