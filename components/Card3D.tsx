/**
 * Card3D Component
 *
 * Reusable 3D card with gradient background and glossy overlay effect.
 * Matches the MenuCard3D styling for consistent app-wide appearance.
 */

import React, { useCallback, useRef } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
  ViewStyle,
  StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, AnimationPresets } from "@/constants/theme";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Preset Gradients
// ============================================================================

export const CardGradients = {
  // Primary teal/cyan
  primary: ["#4ECDC4", "#2C9E96"] as [string, string],
  // Secondary purple
  secondary: ["#667eea", "#764ba2"] as [string, string],
  // Gold/amber
  gold: ["#f59e0b", "#d97706"] as [string, string],
  // Success green
  success: ["#10b981", "#059669"] as [string, string],
  // Warning orange
  warning: ["#f97316", "#ea580c"] as [string, string],
  // Danger red
  danger: ["#ef4444", "#dc2626"] as [string, string],
  // Info blue
  info: ["#3b82f6", "#2563eb"] as [string, string],
  // Dark
  dark: ["#374151", "#1f2937"] as [string, string],
  // Subtle dark (for modals/overlays)
  subtle: ["#1A1A2E", "#16162A"] as [string, string],
};

// ============================================================================
// Types
// ============================================================================

export type Card3DVariant = "default" | "gold" | "purple";

export interface Card3DProps {
  children: React.ReactNode;
  gradient?: [string, string];
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
  animated?: boolean;
  variant?: Card3DVariant;
}

// ============================================================================
// Component
// ============================================================================

export function Card3D({
  children,
  gradient = CardGradients.primary,
  onPress,
  disabled = false,
  style,
  contentStyle,
  padding = 16,
  borderRadius = 16,
  animated = true,
  variant,
}: Card3DProps) {
  const { playButtonPress } = useSoundAndHaptics();

  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  // Determine gradient based on variant or explicit gradient
  const cardGradient = variant
    ? variant === "gold"
      ? CardGradients.gold
      : variant === "purple"
      ? CardGradients.secondary
      : gradient
    : gradient;

  // Press handlers with 3D effect
  const handlePressIn = useCallback(() => {
    if (!animated || disabled) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 3,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animated, disabled]);

  const handlePressOut = useCallback(() => {
    if (!animated || disabled) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animated, disabled]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    playButtonPress();
    onPress?.();
  }, [playButtonPress, onPress, disabled]);

  const cardContent = (
    <LinearGradient
      colors={cardGradient}
      style={[
        styles.gradient,
        { padding, borderRadius },
        disabled && styles.disabled,
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Glossy overlay */}
      <LinearGradient
        colors={["rgba(255,255,255,0.1)", "rgba(0,0,0,0.2)"]}
        style={[styles.glossyOverlay, { borderRadius }]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      <View style={contentStyle}>{children}</View>
    </LinearGradient>
  );

  // If no onPress, render as static card
  if (!onPress) {
    return (
      <View style={[styles.container, style]}>
        {cardContent}
      </View>
    );
  }

  // Interactive card with animations
  return (
    <Animated.View
      style={[
        styles.container,
        style,
        animated && {
          transform: [
            { translateY: translateYAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[styles.touchable, { borderRadius }]}
      >
        {cardContent}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Glass Card variant (semi-transparent dark with border)
// ============================================================================

export interface GlassCard3DProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padding?: number;
  borderRadius?: number;
}

export function GlassCard3D({
  children,
  onPress,
  disabled = false,
  style,
  contentStyle,
  padding = 16,
  borderRadius = 16,
}: GlassCard3DProps) {
  const { playButtonPress } = useSoundAndHaptics();

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = useCallback(() => {
    if (disabled || !onPress) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        tension: 300,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 3,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [disabled, onPress]);

  const handlePressOut = useCallback(() => {
    if (disabled || !onPress) return;
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        tension: 200,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [disabled, onPress]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    playButtonPress();
    onPress?.();
  }, [playButtonPress, onPress, disabled]);

  const cardContent = (
    <View
      style={[
        styles.glassCard,
        { padding, borderRadius },
        disabled && styles.disabled,
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) {
    return <View style={[styles.container, style]}>{cardContent}</View>;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          transform: [
            { translateY: translateYAnim },
            { scale: scaleAnim },
          ],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        style={[styles.touchable, { borderRadius }]}
      >
        {cardContent}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  touchable: {
    overflow: "hidden",
  },
  gradient: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  glossyOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  glassCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Card3D;
