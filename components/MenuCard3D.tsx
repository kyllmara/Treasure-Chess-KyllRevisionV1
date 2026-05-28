/**
 * MenuCard3D Component
 *
 * Unity-style 3D menu card with floating and press animations.
 * Uses react-native-reanimated for smooth 60fps UI thread animations.
 * Used for main navigation buttons on the home screen.
 */

import React, { useCallback, useEffect, memo } from "react";
import {
  Text,
  StyleSheet,
  View,
  Pressable,
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
  interpolate,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";
import {
  FontFamily,
  Colors,
  AnimationPresets,
} from "@/constants/theme";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ============================================================================
// Types
// ============================================================================

export interface MenuCard3DProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: [string, string];
  onPress: () => void;
  delay?: number;
  featured?: boolean;
}

// ============================================================================
// Spring configs for consistent feel
// ============================================================================

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};

const SPRING_CONFIG_BOUNCE = {
  damping: 8,
  stiffness: 180,
  mass: 0.4,
};

// ============================================================================
// Component
// ============================================================================

function MenuCard3DInner({
  title,
  subtitle,
  icon,
  gradient,
  onPress,
  delay = 0,
  featured = false,
}: MenuCard3DProps) {
  const { playButtonPress } = useSoundAndHaptics();

  // Reanimated shared values - run on UI thread
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const slideY = useSharedValue(50);
  const opacity = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const arrowOpacity = useSharedValue(0);
  const floatY = useSharedValue(0);
  const isReady = useSharedValue(false);

  // Entry animation - wait for interactions to complete
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      isReady.value = true;

      // Slide in with spring
      slideY.value = withDelay(
        delay,
        withSpring(0, {
          damping: 12,
          stiffness: 100,
          mass: 0.8,
        })
      );

      // Fade in
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 400 })
      );

      // Start floating animation for featured card after entry
      if (featured) {
        setTimeout(() => {
          floatY.value = withRepeat(
            withSequence(
              withTiming(-3, {
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
              }),
              withTiming(0, {
                duration: 1500,
                easing: Easing.inOut(Easing.sin),
              })
            ),
            -1, // Infinite repeat
            false
          );
        }, delay + 400);
      }
    });

    return () => handle.cancel();
  }, [delay, featured]);

  // Animated styles - computed on UI thread
  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [
        { translateY: slideY.value + translateY.value + floatY.value },
        { scale: scale.value },
      ],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: iconScale.value }],
    };
  });

  const arrowStyle = useAnimatedStyle(() => {
    return {
      opacity: arrowOpacity.value,
    };
  });

  // Press handlers - animations run on UI thread for 60fps
  const handlePressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(0.97, SPRING_CONFIG);
    translateY.value = withTiming(3, { duration: 100 });
    iconScale.value = withSpring(1.15, SPRING_CONFIG);
    arrowOpacity.value = withTiming(1, { duration: 150 });
  }, []);

  const handlePressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, SPRING_CONFIG_BOUNCE);
    translateY.value = withSpring(0, SPRING_CONFIG);
    iconScale.value = withSpring(1, SPRING_CONFIG);
    arrowOpacity.value = withTiming(0, { duration: 200 });
  }, []);

  const handlePress = useCallback(() => {
    playButtonPress();
    onPress();
  }, [playButtonPress, onPress]);

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.touchable}
      >
        <LinearGradient
          colors={gradient}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Glossy overlay: bg-gradient-to-t from-black/20 to-white/10 */}
          <LinearGradient
            colors={["rgba(255,255,255,0.1)", "rgba(0,0,0,0.2)"]}
            style={styles.glossyOverlay}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
          />

          <View style={styles.content}>
            <Animated.View style={[styles.iconContainer, iconStyle]}>
              {icon}
            </Animated.View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <Animated.View style={arrowStyle}>
              <ChevronRight size={24} color="rgba(255,255,255,0.5)" />
            </Animated.View>
          </View>
        </LinearGradient>
      </AnimatedPressable>
    </Animated.View>
  );
}

export const MenuCard3D = memo(MenuCard3DInner);

// ============================================================================
// Styles - Matching reference CSS
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  touchable: {
    borderRadius: 16, // rounded-2xl
    overflow: "hidden",
  },
  // Matches: btn-3d with box-shadow: 0 4px 0 rgba(0,0,0,0.3)
  gradient: {
    padding: 20,
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  // Matches: bg-gradient-to-t from-black/20 to-white/10
  glossyOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  // Matches: p-3 bg-black/20 backdrop-blur-md rounded-xl shadow-inner border border-white/10
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12, // rounded-xl
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  textContainer: {
    flex: 1,
  },
  // Matches: text-xl font-bold text-white tracking-tight
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  // Matches: text-xs font-medium text-white/70 mt-1 uppercase tracking-wider
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
});

export default MenuCard3D;
