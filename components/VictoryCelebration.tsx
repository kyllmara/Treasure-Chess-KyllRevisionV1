/**
 * VictoryCelebration Component
 *
 * Animated celebration overlay for game results.
 * Uses Unity assets: dragons, rays, and themed backgrounds.
 */

import React, { useEffect, useRef, useMemo } from "react";
import {
  View,
  Image,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from "react-native";

// ============================================================================
// Asset Imports
// ============================================================================

const ASSETS = {
  leftDragon: require("@/assets/images/result-screen/Left_Dragon.png"),
  rightDragon: require("@/assets/images/result-screen/Right_Dragon.png"),
  rays: require("@/assets/images/result-screen/Rays.png"),
  greenBackground: require("@/assets/images/result-screen/green_background.png"),
  redBackground: require("@/assets/images/result-screen/red_background.png"),
  dragon1: require("@/assets/images/result-screen/dragon_1.png"),
  dragon2: require("@/assets/images/result-screen/dragon_2.png"),
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ============================================================================
// Types
// ============================================================================

export type CelebrationResult = "win" | "lose" | "draw";

export interface VictoryCelebrationProps {
  /** The game result */
  result: CelebrationResult;
  /** Whether to show the celebration */
  visible: boolean;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Children to render on top of the celebration */
  children?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

// Confetti particle component for wins
const CONFETTI_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#6366F1", "#FF9F43", "#FFFFFF", "#22C55E"];
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

export function VictoryCelebration({
  result,
  visible,
  onAnimationComplete,
  children,
}: VictoryCelebrationProps) {
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const raysRotation = useRef(new Animated.Value(0)).current;
  const raysScale = useRef(new Animated.Value(0.5)).current;
  const leftDragonX = useRef(new Animated.Value(-200)).current;
  const rightDragonX = useRef(new Animated.Value(200)).current;
  const dragonBounce = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      fadeAnim.setValue(0);
      raysRotation.setValue(0);
      raysScale.setValue(0.5);
      leftDragonX.setValue(-200);
      rightDragonX.setValue(200);
      dragonBounce.setValue(0);
      contentScale.setValue(0);

      // Start animations
      Animated.parallel([
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),

        // Rays rotation (continuous)
        Animated.loop(
          Animated.timing(raysRotation, {
            toValue: 1,
            duration: 10000,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ),

        // Rays scale in
        Animated.spring(raysScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),

        // Dragons slide in
        Animated.sequence([
          Animated.delay(200),
          Animated.parallel([
            Animated.spring(leftDragonX, {
              toValue: 0,
              tension: 60,
              friction: 8,
              useNativeDriver: true,
            }),
            Animated.spring(rightDragonX, {
              toValue: 0,
              tension: 60,
              friction: 8,
              useNativeDriver: true,
            }),
          ]),
        ]),

        // Dragon bounce animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(dragonBounce, {
              toValue: 1,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(dragonBounce, {
              toValue: 0,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ),

        // Content scale in
        Animated.sequence([
          Animated.delay(400),
          Animated.spring(contentScale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        onAnimationComplete?.();
      });
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const raysRotationInterpolate = raysRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const dragonBounceInterpolate = dragonBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const isWin = result === "win";
  const isDraw = result === "draw";

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="none">
      {/* Background color overlay */}
      <View
        style={[
          styles.backgroundOverlay,
          {
            backgroundColor: isWin
              ? "rgba(34, 197, 94, 0.3)"
              : isDraw
              ? "rgba(251, 191, 36, 0.3)"
              : "rgba(239, 68, 68, 0.3)",
          },
        ]}
      />

      {/* Confetti particles (only for win) */}
      {isWin && <ConfettiParticles visible={visible} />}

      {/* Rays animation (only for win) */}
      {isWin && (
        <Animated.Image
          source={ASSETS.rays}
          style={[
            styles.rays,
            {
              transform: [
                { rotate: raysRotationInterpolate },
                { scale: raysScale },
              ],
            },
          ]}
          resizeMode="contain"
        />
      )}

      {/* Left Dragon */}
      <Animated.Image
        source={ASSETS.leftDragon}
        style={[
          styles.leftDragon,
          {
            transform: [
              { translateX: leftDragonX },
              { translateY: dragonBounceInterpolate },
            ],
          },
        ]}
        resizeMode="contain"
      />

      {/* Right Dragon */}
      <Animated.Image
        source={ASSETS.rightDragon}
        style={[
          styles.rightDragon,
          {
            transform: [
              { translateX: rightDragonX },
              { translateY: dragonBounceInterpolate },
            ],
          },
        ]}
        resizeMode="contain"
      />

      {/* Content container */}
      <Animated.View
        style={[
          styles.contentContainer,
          {
            transform: [{ scale: contentScale }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// ============================================================================
// Simpler Dragons Component (for inline use)
// ============================================================================

export interface AnimatedDragonsProps {
  size?: number;
}

export function AnimatedDragons({ size = 80 }: AnimatedDragonsProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const bounceInterpolate = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  return (
    <View style={styles.dragonsRow}>
      <Animated.Image
        source={ASSETS.dragon1}
        style={[
          { width: size, height: size },
          { transform: [{ translateY: bounceInterpolate }] },
        ]}
        resizeMode="contain"
      />
      <Animated.Image
        source={ASSETS.dragon2}
        style={[
          { width: size, height: size },
          { transform: [{ translateY: bounceInterpolate }] },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

// ============================================================================
// Spinning Rays Component (standalone)
// ============================================================================

export interface SpinningRaysProps {
  size?: number;
  tint?: string;
}

export function SpinningRays({ size = 300, tint }: SpinningRaysProps) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 15000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
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
        {
          width: size,
          height: size,
          position: "absolute",
          opacity: 0.3,
        },
        tint && { tintColor: tint },
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
    opacity: 0.4,
  },
  leftDragon: {
    position: "absolute",
    left: -20,
    top: "15%",
    width: 150,
    height: 200,
  },
  rightDragon: {
    position: "absolute",
    right: -20,
    top: "15%",
    width: 150,
    height: 200,
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
