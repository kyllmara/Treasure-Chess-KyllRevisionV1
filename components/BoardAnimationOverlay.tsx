import React, { useLayoutEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { ChessPieceComponent } from "./ChessPieces";
import type { Square } from "chess.js";
import type { PieceStyle } from "@/types";
import { type GlideState, squareToCell } from "@/hooks/useMoveAnimations";

const GLIDE_DURATION = 400; // ms — in 350–450 range

// Pre-computed particle configs: varied angle, spread distance, size, stagger delay, duration.
// All durations in 500–600ms range as required.
const PARTICLE_CFG = [
  { angle: 0,     dist: 1.0, size: 12, color: "rgba(255,120,20,0.95)", delay: 0,  dur: 520 },
  { angle: 0.785, dist: 1.3, size: 9,  color: "rgba(255,185,40,0.90)", delay: 20, dur: 560 },
  { angle: 1.571, dist: 0.9, size: 14, color: "rgba(255,75,0,0.95)",   delay: 10, dur: 500 },
  { angle: 2.356, dist: 1.2, size: 10, color: "rgba(255,150,30,0.90)", delay: 30, dur: 580 },
  { angle: 3.142, dist: 0.85,size: 13, color: "rgba(255,200,55,0.85)", delay: 5,  dur: 540 },
  { angle: 3.927, dist: 1.1, size: 11, color: "rgba(255,100,10,0.95)", delay: 25, dur: 510 },
  { angle: 4.712, dist: 1.4, size: 9,  color: "rgba(240,65,0,0.90)",   delay: 15, dur: 565 },
  { angle: 5.497, dist: 1.0, size: 15, color: "rgba(255,160,50,0.85)", delay: 8,  dur: 530 },
] as const;

interface Props {
  boardSize: number;
  squareSize: number;
  isFlipped?: boolean;
  glideState: GlideState | null;
  pieceStyle: PieceStyle;
  captureSquare: Square | null;
  onGlideComplete: () => void;
  onCaptureComplete: () => void;
}

export function BoardAnimationOverlay({
  squareSize,
  isFlipped = false,
  glideState,
  pieceStyle,
  captureSquare,
  onGlideComplete,
  onCaptureComplete,
}: Props) {
  const pieceSize = squareSize * 0.85;

  // Keep latest callbacks in refs so worklet closures are never stale.
  const onGlideCompleteRef = useRef(onGlideComplete);
  const onCaptureCompleteRef = useRef(onCaptureComplete);
  onGlideCompleteRef.current = onGlideComplete;
  onCaptureCompleteRef.current = onCaptureComplete;

  // ── Glide animation (internal shared values) ──────────────────────────
  const glideX = useSharedValue(0);
  const glideY = useSharedValue(0);
  const glideOpacity = useSharedValue(0); // controls visibility independently of React state

  const glideStyle = useAnimatedStyle(() => ({
    opacity: glideOpacity.value,
    transform: [{ translateX: glideX.value }, { translateY: glideY.value }],
  }));

  // useLayoutEffect fires synchronously after commit, before native paint.
  // This guarantees the ghost piece View is in the tree before we start withTiming,
  // which fixes the "piece teleports" bug where the animation completed before mount.
  useLayoutEffect(() => {
    if (!glideState) {
      glideOpacity.value = 0;
      cancelAnimation(glideX);
      cancelAnimation(glideY);
      return;
    }

    glideX.value = glideState.startX;
    glideY.value = glideState.startY;
    glideOpacity.value = 1;

    const easeOut = Easing.out(Easing.cubic);
    glideX.value = withTiming(glideState.endX, { duration: GLIDE_DURATION, easing: easeOut });
    glideY.value = withTiming(glideState.endY, { duration: GLIDE_DURATION, easing: easeOut },
      (finished) => {
        "worklet";
        if (finished) {
          glideOpacity.value = withTiming(0, { duration: 60 });
          runOnJS(onGlideCompleteRef.current)();
        }
      }
    );

    return () => {
      cancelAnimation(glideX);
      cancelAnimation(glideY);
    };
  }, [glideState]);

  // ── Capture particles (per-particle shared values) ────────────────────
  // Each particle has its own x/y position for independent trajectory.
  // Shared opacity so they all fade as one cohesive puff.
  const px0 = useSharedValue(0); const py0 = useSharedValue(0);
  const px1 = useSharedValue(0); const py1 = useSharedValue(0);
  const px2 = useSharedValue(0); const py2 = useSharedValue(0);
  const px3 = useSharedValue(0); const py3 = useSharedValue(0);
  const px4 = useSharedValue(0); const py4 = useSharedValue(0);
  const px5 = useSharedValue(0); const py5 = useSharedValue(0);
  const px6 = useSharedValue(0); const py6 = useSharedValue(0);
  const px7 = useSharedValue(0); const py7 = useSharedValue(0);
  const pOpacity = useSharedValue(0);

  const pXVals = [px0, px1, px2, px3, px4, px5, px6, px7];
  const pYVals = [py0, py1, py2, py3, py4, py5, py6, py7];

  // Opacity and transform only — position/top/left are static styles in JSX below
  const p0Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px0.value }, { translateY: py0.value }] }));
  const p1Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px1.value }, { translateY: py1.value }] }));
  const p2Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px2.value }, { translateY: py2.value }] }));
  const p3Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px3.value }, { translateY: py3.value }] }));
  const p4Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px4.value }, { translateY: py4.value }] }));
  const p5Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px5.value }, { translateY: py5.value }] }));
  const p6Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px6.value }, { translateY: py6.value }] }));
  const p7Style = useAnimatedStyle(() => ({ opacity: pOpacity.value, transform: [{ translateX: px7.value }, { translateY: py7.value }] }));
  const pStyles = [p0Style, p1Style, p2Style, p3Style, p4Style, p5Style, p6Style, p7Style];

  useLayoutEffect(() => {
    if (!captureSquare) {
      pOpacity.value = 0;
      return;
    }

    const { x: cx, y: cy } = squareToCell(captureSquare, squareSize, isFlipped);
    const centerX = cx + squareSize / 2;
    const centerY = cy + squareSize / 2;
    const easeOut = Easing.out(Easing.cubic);

    PARTICLE_CFG.forEach((cfg, i) => {
      const halfSize = cfg.size / 2;
      const startX = centerX - halfSize;
      const startY = centerY - halfSize;
      const destX = centerX + Math.cos(cfg.angle) * squareSize * 0.52 * cfg.dist - halfSize;
      const destY = centerY + Math.sin(cfg.angle) * squareSize * 0.52 * cfg.dist - halfSize;

      pXVals[i].value = startX;
      pYVals[i].value = startY;

      pXVals[i].value = withDelay(cfg.delay, withTiming(destX, { duration: cfg.dur, easing: easeOut }));
      pYVals[i].value = withDelay(cfg.delay, withTiming(destY, { duration: cfg.dur, easing: easeOut }));
    });

    // All particles start fully visible and fade together over the burst duration.
    pOpacity.value = 1;
    const maxDur = Math.max(...PARTICLE_CFG.map((c) => c.dur + c.delay));
    pOpacity.value = withTiming(0, { duration: maxDur * 0.75, easing: Easing.in(Easing.ease) },
      (finished) => {
        "worklet";
        if (finished) runOnJS(onCaptureCompleteRef.current)();
      }
    );

    return () => {
      pXVals.forEach((v) => cancelAnimation(v));
      pYVals.forEach((v) => cancelAnimation(v));
      cancelAnimation(pOpacity);
    };
  }, [captureSquare]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Ghost piece — always mounted so useLayoutEffect has a target before paint */}
      <Animated.View
        style={[
          styles.ghostPiece,
          { width: squareSize, height: squareSize },
          glideStyle,
        ]}
      >
        {glideState && (
          <ChessPieceComponent
            type={glideState.piece.type as any}
            color={glideState.piece.color as any}
            size={pieceSize}
            style={pieceStyle}
          />
        )}
      </Animated.View>

      {/* Capture particle burst — 8 independently animated circles */}
      {captureSquare &&
        PARTICLE_CFG.map((cfg, i) => (
          <Animated.View key={i} style={[styles.particleAnchor, pStyles[i]]}>
            {/* Outer soft halo */}
            <View
              style={[
                styles.particleHalo,
                {
                  width: cfg.size * 2.2,
                  height: cfg.size * 2.2,
                  borderRadius: cfg.size * 1.1,
                  backgroundColor: cfg.color.replace("0.9", "0.25").replace("0.95", "0.25").replace("0.85", "0.20"),
                  top: -cfg.size * 0.6,
                  left: -cfg.size * 0.6,
                },
              ]}
            />
            {/* Inner solid circle */}
            <View
              style={[
                styles.particleCore,
                {
                  width: cfg.size,
                  height: cfg.size,
                  borderRadius: cfg.size / 2,
                  backgroundColor: cfg.color,
                },
              ]}
            />
          </Animated.View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ghostPiece: {
    position: "absolute",
    top: 0,
    left: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  particleAnchor: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 25,
  },
  particleHalo: {
    position: "absolute",
  },
  particleCore: {
    position: "relative",
  },
});
