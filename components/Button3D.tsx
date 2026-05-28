/**
 * Button3D Component
 *
 * A 3D-styled animated button matching the Unity chess piece aesthetic.
 * Features press animations, glow effects, and multiple style variants.
 */

import React, { useCallback, useRef } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  FontFamily,
  Colors,
  Button3DStyles,
  TextShadows,
  AnimationPresets,
} from "@/constants/theme";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Types
// ============================================================================

export type Button3DVariant = "primary" | "secondary" | "accent" | "dark";
export type Button3DSize = "small" | "medium" | "large";

export interface Button3DProps {
  title: string;
  onPress: () => void;
  variant?: Button3DVariant;
  size?: Button3DSize;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  loading?: boolean;
}

// ============================================================================
// Size Configs
// ============================================================================

const SIZE_CONFIG = {
  small: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    fontSize: 12,
    borderRadius: 8,
    iconSize: 16,
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    fontSize: 16,
    borderRadius: 12,
    iconSize: 20,
  },
  large: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    fontSize: 18,
    borderRadius: 16,
    iconSize: 24,
  },
};

// ============================================================================
// Gradient Colors
// ============================================================================

const VARIANT_GRADIENTS: Record<Button3DVariant, [string, string]> = {
  primary: ["#FFE44D", "#E6C200"],
  secondary: ["#BB9EE8", "#7B5EA8"],
  accent: ["#6EDDD4", "#3EBDB4"],
  dark: ["rgba(60, 60, 80, 0.9)", "rgba(40, 40, 60, 0.9)"],
};

const VARIANT_TEXT_COLORS: Record<Button3DVariant, string> = {
  primary: "#0F0F1E",
  secondary: "#FFFFFF",
  accent: "#0F0F1E",
  dark: "#FFFFFF",
};

// ============================================================================
// Component
// ============================================================================

export function Button3D({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  textStyle,
  loading = false,
}: Button3DProps) {
  const { playButtonPress } = useSoundAndHaptics();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shadowAnim = useRef(new Animated.Value(1)).current;

  const sizeConfig = SIZE_CONFIG[size];
  const gradientColors = VARIANT_GRADIENTS[variant];
  const textColor = VARIANT_TEXT_COLORS[variant];

  // Handle press in - animate button down
  const handlePressIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        ...AnimationPresets.spring.stiff,
        useNativeDriver: true,
      }),
      Animated.timing(shadowAnim, {
        toValue: 0.5,
        duration: AnimationPresets.duration.fast,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, shadowAnim]);

  // Handle press out - animate button back up
  const handlePressOut = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        ...AnimationPresets.spring.bouncy,
        useNativeDriver: true,
      }),
      Animated.timing(shadowAnim, {
        toValue: 1,
        duration: AnimationPresets.duration.normal,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, shadowAnim]);

  // Handle press
  const handlePress = useCallback(() => {
    if (!disabled && !loading) {
      playButtonPress();
      onPress();
    }
  }, [disabled, loading, playButtonPress, onPress]);

  const buttonStyle = Button3DStyles[variant];

  return (
    <Animated.View
      style={[
        styles.container,
        fullWidth && styles.fullWidth,
        {
          transform: [{ scale: scaleAnim }],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled || loading}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.button,
            {
              paddingVertical: sizeConfig.paddingVertical,
              paddingHorizontal: sizeConfig.paddingHorizontal,
              borderRadius: sizeConfig.borderRadius,
              borderWidth: buttonStyle.borderWidth,
              borderTopColor: buttonStyle.borderTopColor,
              borderLeftColor: buttonStyle.borderLeftColor,
              borderRightColor: buttonStyle.borderRightColor,
              borderBottomColor: buttonStyle.borderBottomColor,
            },
          ]}
        >
          <View style={styles.contentContainer}>
            {icon && iconPosition === "left" && (
              <View style={styles.iconLeft}>{icon}</View>
            )}

            <Text
              style={[
                styles.text,
                {
                  fontSize: sizeConfig.fontSize,
                  color: textColor,
                },
                variant === "primary" && TextShadows.dark,
                textStyle,
              ]}
            >
              {loading ? "Loading..." : title}
            </Text>

            {icon && iconPosition === "right" && (
              <View style={styles.iconRight}>{icon}</View>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Bottom shadow for 3D effect */}
      <Animated.View
        style={[
          styles.shadowLayer,
          {
            borderRadius: sizeConfig.borderRadius,
            opacity: shadowAnim,
          },
        ]}
      />
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  fullWidth: {
    width: "100%",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  contentContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  // Clean styling - no explicit fontFamily, just fontWeight
  text: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  shadowLayer: {
    position: "absolute",
    bottom: -4,
    left: 2,
    right: 2,
    height: 4,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    zIndex: -1,
    borderRadius: 8,
  },
});

export default Button3D;
