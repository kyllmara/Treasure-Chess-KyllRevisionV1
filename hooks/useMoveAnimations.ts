import { useState, useCallback, useRef } from "react";
import {
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { useChess3DStore } from "@/lib/chess3d";
import type { Square } from "chess.js";

export type GlideState = {
  from: Square;
  to: Square;
  piece: { type: string; color: string };
  captureAt?: Square;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

const FILES = "abcdefgh";

export function squareToCell(sq: Square, squareSize: number, isFlipped: boolean) {
  const col = FILES.indexOf(sq[0]);
  const row = 8 - parseInt(sq[1]);
  return {
    x: (isFlipped ? 7 - col : col) * squareSize,
    y: (isFlipped ? 7 - row : row) * squareSize,
  };
}

export function useMoveAnimations() {
  const animations = useChess3DStore((s) => s.animations);
  const reduceMotion = useChess3DStore((s) => s.reduceMotion);
  const enabled = animations.enableMoveAnimations !== false && !reduceMotion;

  const legalGlowAlpha = useSharedValue(0);

  const [glideState, setGlideState] = useState<GlideState | null>(null);
  const glideStateRef = useRef<GlideState | null>(null);
  glideStateRef.current = glideState;

  const [illegalSquare, setIllegalSquare] = useState<Square | null>(null);
  const illegalAlpha = useSharedValue(0);
  const illegalShakeX = useSharedValue(0);

  const [captureSquare, setCaptureSquare] = useState<Square | null>(null);

  const startLegalGlow = useCallback(() => {
    if (!enabled) return;
    legalGlowAlpha.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 420, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 420, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [enabled, legalGlowAlpha]);

  const stopLegalGlow = useCallback(() => {
    cancelAnimation(legalGlowAlpha);
    legalGlowAlpha.value = 0;
  }, [legalGlowAlpha]);

  // triggerGlide only sets React state — animation is started in BoardAnimationOverlay's
  // useLayoutEffect, which fires after the ghost piece is committed to the native view tree.
  // This fixes the teleporting bug where withTiming was starting before the overlay mounted.
  const triggerGlide = useCallback(
    (
      from: Square,
      to: Square,
      piece: GlideState["piece"],
      squareSize: number,
      isFlipped: boolean,
      captureAt?: Square
    ) => {
      if (!enabled) return;
      const start = squareToCell(from, squareSize, isFlipped);
      const end = squareToCell(to, squareSize, isFlipped);
      setGlideState({
        from,
        to,
        piece,
        captureAt,
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
      });
    },
    [enabled]
  );

  // Called by BoardAnimationOverlay when glide animation completes.
  // Stable reference — uses ref to avoid stale closure on glideState.
  const handleGlideComplete = useCallback(() => {
    const captureAt = glideStateRef.current?.captureAt;
    setGlideState(null);
    if (captureAt) {
      setCaptureSquare(captureAt);
    }
  }, []);

  const handleCaptureComplete = useCallback(() => {
    setCaptureSquare(null);
  }, []);

  const triggerIllegalMove = useCallback(
    (square: Square) => {
      if (reduceMotion) return;
      setIllegalSquare(square);
      illegalAlpha.value = 0;
      illegalShakeX.value = 0;
      illegalAlpha.value = withSequence(
        withTiming(0.55, { duration: 35 }),
        withTiming(0, { duration: 35 }),
        withTiming(0.55, { duration: 35 }),
        withTiming(0, { duration: 40 }, () => runOnJS(setIllegalSquare)(null))
      );
      illegalShakeX.value = withSequence(
        withTiming(-8, { duration: 25 }),
        withTiming(8, { duration: 25 }),
        withTiming(-5, { duration: 25 }),
        withTiming(5, { duration: 25 }),
        withTiming(0, { duration: 25 })
      );
    },
    [reduceMotion, illegalAlpha, illegalShakeX]
  );

  return {
    legalGlowAlpha,
    startLegalGlow,
    stopLegalGlow,
    glideState,
    triggerGlide,
    handleGlideComplete,
    illegalSquare,
    illegalAlpha,
    illegalShakeX,
    triggerIllegalMove,
    captureSquare,
    handleCaptureComplete,
    enabled,
  };
}
