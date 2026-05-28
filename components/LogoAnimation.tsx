/**
 * LogoAnimation Component
 *
 * Animated logo using frame sequence from Unity export.
 * Plays a smooth animation of the Treasure Chess logo.
 */

import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import { View, Image, StyleSheet, Animated, ViewStyle, InteractionManager } from "react-native";

// ============================================================================
// Frame Imports
// ============================================================================

// Import all 61 animation frames
const FRAMES = [
  require("@/assets/images/logo-animation/frame_000.png"),
  require("@/assets/images/logo-animation/frame_001.png"),
  require("@/assets/images/logo-animation/frame_002.png"),
  require("@/assets/images/logo-animation/frame_003.png"),
  require("@/assets/images/logo-animation/frame_004.png"),
  require("@/assets/images/logo-animation/frame_005.png"),
  require("@/assets/images/logo-animation/frame_006.png"),
  require("@/assets/images/logo-animation/frame_007.png"),
  require("@/assets/images/logo-animation/frame_008.png"),
  require("@/assets/images/logo-animation/frame_009.png"),
  require("@/assets/images/logo-animation/frame_010.png"),
  require("@/assets/images/logo-animation/frame_011.png"),
  require("@/assets/images/logo-animation/frame_012.png"),
  require("@/assets/images/logo-animation/frame_013.png"),
  require("@/assets/images/logo-animation/frame_014.png"),
  require("@/assets/images/logo-animation/frame_015.png"),
  require("@/assets/images/logo-animation/frame_016.png"),
  require("@/assets/images/logo-animation/frame_017.png"),
  require("@/assets/images/logo-animation/frame_018.png"),
  require("@/assets/images/logo-animation/frame_019.png"),
  require("@/assets/images/logo-animation/frame_020.png"),
  require("@/assets/images/logo-animation/frame_021.png"),
  require("@/assets/images/logo-animation/frame_022.png"),
  require("@/assets/images/logo-animation/frame_023.png"),
  require("@/assets/images/logo-animation/frame_024.png"),
  require("@/assets/images/logo-animation/frame_025.png"),
  require("@/assets/images/logo-animation/frame_026.png"),
  require("@/assets/images/logo-animation/frame_027.png"),
  require("@/assets/images/logo-animation/frame_028.png"),
  require("@/assets/images/logo-animation/frame_029.png"),
  require("@/assets/images/logo-animation/frame_030.png"),
  require("@/assets/images/logo-animation/frame_031.png"),
  require("@/assets/images/logo-animation/frame_032.png"),
  require("@/assets/images/logo-animation/frame_033.png"),
  require("@/assets/images/logo-animation/frame_034.png"),
  require("@/assets/images/logo-animation/frame_035.png"),
  require("@/assets/images/logo-animation/frame_036.png"),
  require("@/assets/images/logo-animation/frame_037.png"),
  require("@/assets/images/logo-animation/frame_038.png"),
  require("@/assets/images/logo-animation/frame_039.png"),
  require("@/assets/images/logo-animation/frame_040.png"),
  require("@/assets/images/logo-animation/frame_041.png"),
  require("@/assets/images/logo-animation/frame_042.png"),
  require("@/assets/images/logo-animation/frame_043.png"),
  require("@/assets/images/logo-animation/frame_044.png"),
  require("@/assets/images/logo-animation/frame_045.png"),
  require("@/assets/images/logo-animation/frame_046.png"),
  require("@/assets/images/logo-animation/frame_047.png"),
  require("@/assets/images/logo-animation/frame_048.png"),
  require("@/assets/images/logo-animation/frame_049.png"),
  require("@/assets/images/logo-animation/frame_050.png"),
  require("@/assets/images/logo-animation/frame_051.png"),
  require("@/assets/images/logo-animation/frame_052.png"),
  require("@/assets/images/logo-animation/frame_053.png"),
  require("@/assets/images/logo-animation/frame_054.png"),
  require("@/assets/images/logo-animation/frame_055.png"),
  require("@/assets/images/logo-animation/frame_056.png"),
  require("@/assets/images/logo-animation/frame_057.png"),
  require("@/assets/images/logo-animation/frame_058.png"),
  require("@/assets/images/logo-animation/frame_059.png"),
  require("@/assets/images/logo-animation/frame_060.png"),
];

const FRAME_COUNT = FRAMES.length;
const DEFAULT_FPS = 30;

// ============================================================================
// Types
// ============================================================================

export interface LogoAnimationProps {
  /** Width of the animation container */
  width?: number;
  /** Height of the animation container */
  height?: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Whether to loop the animation (default: false) */
  loop?: boolean;
  /** Whether to autoplay on mount (default: true) */
  autoPlay?: boolean;
  /** Callback when animation completes (if not looping) */
  onComplete?: () => void;
  /** Additional container styles */
  style?: ViewStyle;
}

// ============================================================================
// Component
// ============================================================================

function LogoAnimationInner({
  width = 300,
  height = 230,
  fps = DEFAULT_FPS,
  loop = false,
  autoPlay = true,
  onComplete,
  style,
}: LogoAnimationProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // Start false, wait for interactions
  const [isReady, setIsReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastFrameTimeRef = useRef<number>(0);
  const animationIdRef = useRef<number | null>(null);
  const frameDurationRef = useRef(1000 / fps);

  // Wait for interaction manager before starting animation
  useEffect(() => {
    if (!autoPlay) {
      setIsReady(true);
      return;
    }

    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
      setIsPlaying(true);
    });

    return () => handle.cancel();
  }, [autoPlay]);

  // Fade in on mount - wait until ready
  useEffect(() => {
    if (!isReady) return;

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, isReady]);

  // Animation loop using requestAnimationFrame for smoother 60fps
  useEffect(() => {
    if (!isPlaying || !isReady) {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
      return;
    }

    frameDurationRef.current = 1000 / fps;
    lastFrameTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - lastFrameTimeRef.current;

      if (elapsed >= frameDurationRef.current) {
        lastFrameTimeRef.current = currentTime - (elapsed % frameDurationRef.current);

        setCurrentFrame((prev) => {
          const nextFrame = prev + 1;

          if (nextFrame >= FRAME_COUNT) {
            if (loop) {
              return 0;
            } else {
              setIsPlaying(false);
              // Schedule callback after current render
              setTimeout(() => onComplete?.(), 0);
              return prev;
            }
          }

          return nextFrame;
        });
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = null;
      }
    };
  }, [isPlaying, isReady, fps, loop, onComplete]);

  // Public methods via ref (if needed in future)
  const play = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    setIsPlaying(true);
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width,
          height,
          opacity: fadeAnim,
        },
        style,
      ]}
    >
      <Image
        source={FRAMES[currentFrame]}
        style={[styles.frame, { width, height }]}
        resizeMode="contain"
        // Use faster decode hint on iOS
        fadeDuration={0}
      />
    </Animated.View>
  );
}

export const LogoAnimation = memo(LogoAnimationInner);

// ============================================================================
// Static Logo Component (for when animation isn't needed)
// ============================================================================

export interface StaticLogoProps {
  /** Width of the logo */
  width?: number;
  /** Height of the logo */
  height?: number;
  /** Which frame to show (default: last frame) */
  frame?: number;
  /** Additional container styles */
  style?: ViewStyle;
}

function StaticLogoInner({
  width = 300,
  height = 230,
  frame = FRAME_COUNT - 1,
  style,
}: StaticLogoProps) {
  const safeFrame = Math.min(Math.max(0, frame), FRAME_COUNT - 1);

  return (
    <View style={[styles.container, { width, height }, style]}>
      <Image
        source={FRAMES[safeFrame]}
        style={[styles.frame, { width, height }]}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  );
}

export const StaticLogo = memo(StaticLogoInner);

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  frame: {
    position: "absolute",
  },
});

export default LogoAnimation;
