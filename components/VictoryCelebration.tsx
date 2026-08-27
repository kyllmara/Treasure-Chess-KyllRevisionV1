/**
 * VictoryCelebration Component
 *
 * Animated celebration overlay for game results.
 * Uses abstract geometric shapes and particle effects.
 */

import React, { useEffect, useRef, useMemo } from "react";
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
  Text,
} from "react-native";
import { Colors, FontFamily } from "@/constants/theme";

// ============================================================================
// Asset Imports (non-mascot only)
// ============================================================================

const ASSETS = {
  rays: require("@/assets/images/result-screen/Rays.png"),
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ============================================================================
// Types
// ============================================================================

export type CelebrationResult = "win" | "lose" | "draw";

export interface VictoryCelebrationProps {
  result: CelebrationResult;
  visible: boolean;
  onAnimationComplete?: () => void;
  children?: React.ReactNode;
}

// ============================================================================
// Confetti particles (wins)
// ============================================================================

const CONFETTI_COLORS = [Colors.primary, Colors.primaryLight, Colors.positive, "#FFFFFF", Colors.primaryDark];
const NUM_CONFETTI = 30;

function ConfettiParticles({ visible }: { visible: boolean }) {
  const particles = useMemo(() => {
    return Array.from({ length: NUM_CONFETTI }, (_, i) => ({
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 1500,
      duration: 2500 + Math.random() * 2000,
      swayAmount: 30 + Math.random() * 60,
    }));
  }, []);

  const anims = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;
    const animations = particles.map((p, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(anims[i], {
            toValue: 1,
            duration: p.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(anims[i], {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )
    );
    Animated.parallel(animations).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {particles.map((p, i) => {
        const translateY = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [-20, SCREEN_HEIGHT + 20],
        });
        const translateX = anims[i].interpolate({
          inputRange: [0, 0.25, 0.5, 0.75, 1],
          outputRange: [0, p.swayAmount, 0, -p.swayAmount, 0],
        });
        const rotate = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${360 + Math.random() * 360}deg`],
        });
        const opacity = anims[i].interpolate({
          inputRange: [0, 0.1, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });

        return (
          <Animated.View
            key={p.id}
            style={{
              position: "absolute",
              left: p.x,
              top: 0,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: 2,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </>
  );
}

// ============================================================================
// Abstract side accent — replaces dragon silhouettes
// ============================================================================

function SideAccent({ side, translateX, translateY }: { side: "left" | "right"; translateX: Animated.Value; translateY: Animated.Value }) {
  return (
    <Animated.View
      style={[
        styles.sideAccent,
        side === "left" ? styles.sideAccentLeft : styles.sideAccentRight,
        { transform: [{ translateX }, { translateY }] },
      ]}
    >
      <View style={styles.accentRing} />
      <View style={styles.accentCoin}>
        <Text style={styles.accentCoinText}>TC</Text>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// VictoryCelebration
// ============================================================================

export function VictoryCelebration({
  result,
  visible,
  onAnimationComplete,
  children,
}: VictoryCelebrationProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const raysRotation = useRef(new Animated.Value(0)).current;
  const raysScale = useRef(new Animated.Value(0.5)).current;
  const leftAccentX = useRef(new Animated.Value(-200)).current;
  const rightAccentX = useRef(new Animated.Value(200)).current;
  const accentBounce = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      raysRotation.setValue(0);
      raysScale.setValue(0.5);
      leftAccentX.setValue(-200);
      rightAccentX.setValue(200);
      accentBounce.setValue(0);
      contentScale.setValue(0);

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.loop(
          Animated.timing(raysRotation, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true })
        ),
        Animated.spring(raysScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(200),
          Animated.parallel([
            Animated.spring(leftAccentX, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
            Animated.spring(rightAccentX, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
          ]),
        ]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(accentBounce, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(accentBounce, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ])
        ),
        Animated.sequence([
          Animated.delay(400),
          Animated.spring(contentScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        ]),
      ]).start(() => { onAnimationComplete?.(); });
    }
  }, [visible]);

  if (!visible) return null;

  const raysRotationInterpolate = raysRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const accentBounceInterpolate = accentBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const isWin = result === "win";
  const isDraw = result === "draw";

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="none">
      <View
        style={[
          styles.backgroundOverlay,
          {
            backgroundColor: isWin
              ? "rgba(41, 196, 160, 0.2)"
              : isDraw
              ? `${Colors.primary}30`
              : "rgba(255, 107, 107, 0.2)",
          },
        ]}
      />

      {isWin && <ConfettiParticles visible={visible} />}

      {isWin && (
        <Animated.Image
          source={ASSETS.rays}
          style={[
            styles.rays,
            { transform: [{ rotate: raysRotationInterpolate }, { scale: raysScale }] },
          ]}
          resizeMode="contain"
        />
      )}

      <SideAccent side="left" translateX={leftAccentX} translateY={accentBounceInterpolate} />
      <SideAccent side="right" translateX={rightAccentX} translateY={accentBounceInterpolate} />

      <Animated.View style={[styles.contentContainer, { transform: [{ scale: contentScale }] }]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================================
// AnimatedParticles — abstract gold coin accent (replaces AnimatedDragons)
// ============================================================================

export interface AnimatedDragonsProps {
  size?: number;
}

export function AnimatedDragons({ size = 80 }: AnimatedDragonsProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const bounceInterpolate = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const coinStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: Colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  };

  return (
    <View style={styles.dragonsRow}>
      {[0, 1].map((idx) => (
        <Animated.View
          key={idx}
          style={[coinStyle, { transform: [{ translateY: bounceInterpolate }] }]}
        >
          <Text style={{ fontFamily: FontFamily.spaceGroteskBold, fontSize: size * 0.28, color: Colors.background }}>
            TC
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ============================================================================
// SpinningRays (unchanged — rays are abstract, not RPG-themed)
// ============================================================================

export interface SpinningRaysProps {
  size?: number;
  tint?: string;
}

export function SpinningRays({ size = 300, tint }: SpinningRaysProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, { toValue: 1, duration: 15000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.Image
      source={ASSETS.rays}
      style={[
        { width: size, height: size, position: "absolute", opacity: 0.3 },
        tint ? { tintColor: tint } : {},
        { transform: [{ rotate: rotateInterpolate }] },
      ]}
      resizeMode="contain"
    />
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  rays: {
    position: "absolute",
    width: SCREEN_WIDTH * 1.5,
    height: SCREEN_WIDTH * 1.5,
    opacity: 0.35,
    tintColor: Colors.primary,
  },
  sideAccent: {
    position: "absolute",
    top: "18%",
    alignItems: "center",
    justifyContent: "center",
    width: 100,
    height: 120,
  },
  sideAccentLeft: { left: -14 },
  sideAccentRight: { right: -14 },
  accentRing: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: `${Colors.primary}60`,
  },
  accentCoin: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  accentCoinText: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 20,
    color: Colors.background,
    letterSpacing: -0.5,
  },
  contentContainer: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dragonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
});

export default VictoryCelebration;
