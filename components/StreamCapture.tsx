/**
 * Stream Capture Component (Expo Go Compatible)
 *
 * Composites the chess board view with camera overlay for livestreaming.
 * Uses expo-camera for video recording and uploads segments to the relay service.
 *
 * Architecture for Expo Go:
 * - Records short video segments (2s) using CameraView.recordAsync()
 * - Uploads segments to stream-relay Edge Function
 * - Server relays to RTMP via Mux/Cloudflare simulcast
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import type {
  StreamResolution,
  CameraOverlayConfig,
} from "@/types/livestream";
import { RESOLUTION_CONFIGS } from "@/types/livestream";

// Segment duration in seconds for Expo Go streaming
const SEGMENT_DURATION_SECONDS = 2;

// ============================================================================
// Types
// ============================================================================

export interface StreamCaptureProps {
  /** Resolution for the stream */
  resolution: StreamResolution;
  /** Camera overlay configuration */
  cameraConfig: CameraOverlayConfig;
  /** Whether camera is enabled */
  cameraEnabled: boolean;
  /** Whether to use front camera */
  useFrontCamera: boolean;
  /** Children to render (chess board, overlays, etc.) */
  children: React.ReactNode;
  /** Called when capture is ready */
  onCaptureReady?: () => void;
  /** Called with each captured frame (for preview) */
  onFrameCaptured?: (frameUri: string) => void;
  /** Called with each recorded video segment (for streaming) */
  onSegmentRecorded?: (videoUri: string) => Promise<void>;
  /** Whether currently streaming (enables segment recording) */
  isStreaming?: boolean;
}

export interface StreamCaptureRef {
  /** Start capturing frames (preview) */
  startCapture: () => void;
  /** Stop capturing frames */
  stopCapture: () => void;
  /** Capture a single frame */
  captureFrame: () => Promise<string | null>;
  /** Get the view ref for external capture */
  getViewRef: () => React.RefObject<View>;
  /** Start recording video segments (Expo Go streaming) */
  startSegmentRecording: () => void;
  /** Stop recording video segments */
  stopSegmentRecording: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Camera size multipliers
const CAMERA_SIZE_MULTIPLIERS = {
  small: 0.15,
  medium: 0.2,
  large: 0.25,
};

// ============================================================================
// Component
// ============================================================================

export const StreamCapture = forwardRef<StreamCaptureRef, StreamCaptureProps>(
  function StreamCapture(
    {
      resolution,
      cameraConfig,
      cameraEnabled,
      useFrontCamera,
      children,
      onCaptureReady,
      onFrameCaptured,
      onSegmentRecorded,
      isStreaming = false,
    },
    ref
  ) {
    // Refs
    const captureViewRef = useRef<View>(null);
    const cameraRef = useRef<CameraView>(null);
    const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isRecordingRef = useRef(false);
    const shouldContinueRecordingRef = useRef(false);

    // State
    const [isCapturing, setIsCapturing] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [isRecordingSegment, setIsRecordingSegment] = useState(false);

    // Permissions
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

    // Calculate dimensions based on resolution
    const resolutionConfig = RESOLUTION_CONFIGS[resolution];
    const aspectRatio = resolutionConfig.width / resolutionConfig.height;
    const containerWidth = Math.min(SCREEN_WIDTH - 32, resolutionConfig.width);
    const containerHeight = containerWidth / aspectRatio;

    // Camera overlay dimensions
    const cameraWidth = containerWidth * CAMERA_SIZE_MULTIPLIERS[cameraConfig.size];
    const cameraHeight = cameraWidth * (4 / 3); // 4:3 aspect ratio for camera

    // Camera position
    const getCameraPosition = useCallback(() => {
      const padding = 12;
      switch (cameraConfig.position) {
        case "top-left":
          return { top: padding, left: padding };
        case "top-right":
          return { top: padding, right: padding };
        case "bottom-left":
          return { bottom: padding, left: padding };
        case "bottom-right":
        default:
          return { bottom: padding, right: padding };
      }
    }, [cameraConfig.position]);

    // Request permissions on mount
    useEffect(() => {
      const requestPermissions = async () => {
        if (cameraEnabled) {
          if (!cameraPermission?.granted) {
            await requestCameraPermission();
          }
          if (!microphonePermission?.granted) {
            await requestMicrophonePermission();
          }
        }
      };
      requestPermissions();
    }, [cameraEnabled, cameraPermission, microphonePermission]);

    // Notify when capture is ready
    useEffect(() => {
      if (!cameraEnabled || (cameraEnabled && cameraReady)) {
        onCaptureReady?.();
      }
    }, [cameraEnabled, cameraReady, onCaptureReady]);

    // Capture a single frame
    const captureFrame = useCallback(async (): Promise<string | null> => {
      if (!captureViewRef.current) return null;

      try {
        // Try to use react-native-view-shot if available
        if (Platform.OS !== "web") {
          try {
            const ViewShot = require("react-native-view-shot");
            const uri = await ViewShot.captureRef(captureViewRef.current, {
              format: "jpg",
              quality: 0.85,
              result: "tmpfile",
            });
            onFrameCaptured?.(uri);
            return uri;
          } catch (e) {
            // ViewShot not available, return null
            console.warn("react-native-view-shot not available");
            return null;
          }
        }

        // Web fallback - would use canvas capture
        return null;
      } catch (error) {
        console.error("Frame capture failed:", error);
        return null;
      }
    }, [onFrameCaptured]);

    // Start continuous capture
    const startCapture = useCallback(() => {
      if (isCapturing) return;
      setIsCapturing(true);

      // Capture at ~30fps
      captureIntervalRef.current = setInterval(() => {
        captureFrame();
      }, 33);
    }, [isCapturing, captureFrame]);

    // Stop capture
    const stopCapture = useCallback(() => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      setIsCapturing(false);
    }, []);

    /**
     * Record a single video segment and upload it
     * This is the Expo Go compatible streaming approach
     */
    const recordSegment = useCallback(async () => {
      if (!cameraRef.current || !cameraReady || isRecordingRef.current) {
        return;
      }

      isRecordingRef.current = true;
      setIsRecordingSegment(true);

      try {
        // Record a short segment
        const video = await cameraRef.current.recordAsync({
          maxDuration: SEGMENT_DURATION_SECONDS,
        });

        if (video?.uri && onSegmentRecorded) {
          // Upload segment to relay service
          await onSegmentRecorded(video.uri);
        }
      } catch (error) {
        // Recording may have been stopped, which is expected
        if (!(error instanceof Error) || !error.message.includes("stop")) {
          console.error("Segment recording error:", error);
        }
      } finally {
        isRecordingRef.current = false;
        setIsRecordingSegment(false);

        // Continue recording if still streaming
        if (shouldContinueRecordingRef.current) {
          // Small delay between segments
          setTimeout(() => {
            if (shouldContinueRecordingRef.current) {
              recordSegment();
            }
          }, 100);
        }
      }
    }, [cameraReady, onSegmentRecorded]);

    /**
     * Start continuous segment recording for streaming
     */
    const startSegmentRecording = useCallback(() => {
      if (!cameraEnabled || !cameraReady) {
        console.warn("Cannot start segment recording: camera not ready");
        return;
      }

      shouldContinueRecordingRef.current = true;
      recordSegment();
    }, [cameraEnabled, cameraReady, recordSegment]);

    /**
     * Stop segment recording
     */
    const stopSegmentRecording = useCallback(async () => {
      shouldContinueRecordingRef.current = false;

      // Stop any in-progress recording
      if (cameraRef.current && isRecordingRef.current) {
        try {
          await cameraRef.current.stopRecording();
        } catch (error) {
          // Ignore - recording may have already stopped
        }
      }
    }, []);

    // Auto-start/stop segment recording based on isStreaming prop
    useEffect(() => {
      if (isStreaming && cameraEnabled && cameraReady && onSegmentRecorded) {
        startSegmentRecording();
      } else {
        stopSegmentRecording();
      }
    }, [isStreaming, cameraEnabled, cameraReady, onSegmentRecorded, startSegmentRecording, stopSegmentRecording]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopCapture();
        stopSegmentRecording();
      };
    }, [stopCapture, stopSegmentRecording]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        startCapture,
        stopCapture,
        captureFrame,
        getViewRef: () => captureViewRef,
        startSegmentRecording,
        stopSegmentRecording,
      }),
      [startCapture, stopCapture, captureFrame, startSegmentRecording, stopSegmentRecording]
    );

    const cameraPosition = getCameraPosition();
    const hasCameraPermission = cameraPermission?.granted;

    return (
      <View
        ref={captureViewRef}
        style={[
          styles.container,
          {
            width: containerWidth,
            height: containerHeight,
          },
        ]}
        collapsable={false}
      >
        {/* Main content (chess board, overlays, etc.) */}
        <View style={styles.content}>{children}</View>

        {/* Camera overlay */}
        {cameraEnabled && hasCameraPermission && (
          <View
            style={[
              styles.cameraOverlay,
              cameraPosition,
              {
                width: cameraWidth,
                height: cameraHeight,
                borderColor: cameraConfig.borderColor,
              },
            ]}
          >
            <CameraView
              style={styles.camera}
              facing={useFrontCamera ? "front" : "back"}
              onCameraReady={() => setCameraReady(true)}
            />
          </View>
        )}
      </View>
    );
  }
);

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    borderRadius: 8,
    overflow: "hidden",
  },
  content: {
    flex: 1,
  },
  cameraOverlay: {
    position: "absolute",
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  camera: {
    flex: 1,
  },
});

export default StreamCapture;
