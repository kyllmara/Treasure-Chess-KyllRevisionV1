/**
 * AnimatedStats Component
 *
 * Unity-style animated stats box with pulse and count-up effects.
 * Uses react-native-reanimated for smooth 60fps UI thread animations.
 */

import React, { useEffect, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  InteractionManager,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  useDerivedValue,
  useAnimatedProps,
  runOnJS,
} from "react-native-reanimated";
import { FontFamily, Colors } from "@/constants/theme";

interface StatItemProps {
  label: string;
  value: number | string;
  isAccent?: boolean;
  prefix?: string;
  delay?: number;
  isReady: boolean;
}

// Helper component to display animated text value
const AnimatedStatValue = memo(({
  displayValue,
  prefix,
  isAccent
}: {
  displayValue: number;
  prefix: string;
  isAccent?: boolean;
}) => {
  const formattedValue = prefix + displayValue.toLocaleString("en-US");
  return (
    <Text style={[styles.statValue, isAccent && styles.statValueAccent]}>
      {formattedValue}
    </Text>
  );
});

function AnimatedStatItemInner({
  label,
  value,
  isAccent,
  prefix = "",
  delay = 0,
  isReady,
}: StatItemProps) {
  // Reanimated shared values
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(1);
  const animatedValue = useSharedValue(0);
  const [displayValue, setDisplayValue] = React.useState(0);

  // Parse target value
  const targetValue = typeof value === "number"
    ? value
    : parseInt(value.toString().replace(/[^0-9]/g, "")) || 0;

  useEffect(() => {
    if (!isReady) return;

    // Entry animation with delay
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 12, stiffness: 80 })
    );

    // Count-up animation
    animatedValue.value = withDelay(
      delay,
      withTiming(targetValue, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          // Pulse effect when complete
          pulse.value = withSequence(
            withTiming(1.15, { duration: 150 }),
            withSpring(1, { damping: 8, stiffness: 200 })
          );
        }
      })
    );
  }, [isReady, targetValue, delay]);

  // Update display value from shared value
  useDerivedValue(() => {
    runOnJS(setDisplayValue)(Math.floor(animatedValue.value));
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value * pulse.value }],
  }));

  return (
    <Animated.View style={[styles.statItem, containerStyle]}>
      <AnimatedStatValue
        displayValue={displayValue}
        prefix={prefix}
        isAccent={isAccent}
      />
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

const AnimatedStatItem = memo(AnimatedStatItemInner);

interface AnimatedStatsProps {
  wins: number;
  losses: number;
  earnings: number;
  winsLabel: string;
  lossesLabel: string;
  earningsLabel: string;
}

function AnimatedStatsInner({
  wins,
  losses,
  earnings,
  winsLabel,
  lossesLabel,
  earningsLabel,
}: AnimatedStatsProps) {
  const [isReady, setIsReady] = React.useState(false);

  // Reanimated shared values
  const containerOpacity = useSharedValue(0);
  const containerSlide = useSharedValue(30);
  const glowOpacity = useSharedValue(0.03);

  useEffect(() => {
    // Wait for screen interactions to complete before animating
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);

      // Container entry animation
      containerOpacity.value = withDelay(
        300,
        withTiming(1, { duration: 500 })
      );

      containerSlide.value = withDelay(
        300,
        withSpring(0, { damping: 12, stiffness: 100 })
      );

      // Start ambient glow after animations complete
      setTimeout(() => {
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.08, {
              duration: 2000,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(0.03, {
              duration: 2000,
              easing: Easing.inOut(Easing.sin),
            })
          ),
          -1, // Infinite repeat
          false
        );
      }, 1200);
    });

    return () => handle.cancel();
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ translateY: containerSlide.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Ambient glow background */}
      <Animated.View
        style={[styles.glowBackground, glowStyle]}
        pointerEvents="none"
      />

      <AnimatedStatItem
        label={winsLabel}
        value={wins}
        delay={200}
        isReady={isReady}
      />
      <View style={styles.statDivider} />
      <AnimatedStatItem
        label={lossesLabel}
        value={losses}
        delay={350}
        isReady={isReady}
      />
      <View style={styles.statDivider} />
      <AnimatedStatItem
        label={earningsLabel}
        value={earnings}
        prefix="$"
        isAccent
        delay={500}
        isReady={isReady}
      />
    </Animated.View>
  );
}

export const AnimatedStats = memo(AnimatedStatsInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 32,
    padding: 24,
    justifyContent: "space-around",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 8,
    overflow: "hidden",
  },
  glowBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#f59e0b",
    borderRadius: 32,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  // Clean styling - no explicit fontFamily, just fontWeight
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.textPrimary,
  },
  // Matches: text-[10px] uppercase font-bold tracking-widest text-zinc-500
  // tracking-widest = 0.1em = 1px at 10px font
  // Clean styling - no explicit fontFamily
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#71717a",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValueAccent: {
    color: "#f59e0b",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
});

export default AnimatedStats;
