/**
 * Header3D Component
 *
 * A clean, styled header with back button and gold gradient title.
 * Matches the main title styling from AnimatedTitle component.
 */

import React, { useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Colors,
  AnimationPresets,
} from "@/constants/theme";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// Conditionally import MaskedView only for native platforms
let MaskedView: React.ComponentType<any> | null = null;
if (Platform.OS !== "web") {
  MaskedView = require("@react-native-masked-view/masked-view").default;
}

// Gold gradient colors matching AnimatedTitle
const GOLD_GRADIENT_COLORS = ["#bf953f", "#fcf6ba", "#b38728", "#fbf5b7", "#aa771c"];

// ============================================================================
// Types
// ============================================================================

export interface Header3DProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: React.ReactNode;
  animated?: boolean;
}

// ============================================================================
// Gradient Title Components
// ============================================================================

// Web-specific gradient text using CSS
function WebGradientTitle({ title, style }: { title: string; style: any }) {
  return (
    <Text
      style={[
        style,
        {
          // @ts-ignore - Web-specific CSS properties
          backgroundImage: "linear-gradient(135deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        },
      ]}
    >
      {title}
    </Text>
  );
}

// Native gradient text using MaskedView
function NativeGradientTitle({ title, style }: { title: string; style: any }) {
  if (!MaskedView) {
    return <Text style={[style, { color: "#fcf6ba" }]}>{title}</Text>;
  }

  return (
    <MaskedView maskElement={<Text style={style}>{title}</Text>}>
      <LinearGradient
        colors={GOLD_GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={[style, { opacity: 0 }]}>{title}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

// ============================================================================
// Component
// ============================================================================

export function Header3D({
  title,
  subtitle,
  showBack = true,
  onBack,
  rightContent,
  animated = true,
}: Header3DProps) {
  const router = useRouter();
  const { playButtonPress } = useSoundAndHaptics();

  // Animation values
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const titleSlideAnim = useRef(new Animated.Value(-20)).current;
  const backButtonScale = useRef(new Animated.Value(1)).current;

  // Animate title on mount
  useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.timing(titleFadeAnim, {
          toValue: 1,
          duration: AnimationPresets.duration.slow,
          useNativeDriver: true,
        }),
        Animated.timing(titleSlideAnim, {
          toValue: 0,
          duration: AnimationPresets.duration.slow,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      titleFadeAnim.setValue(1);
      titleSlideAnim.setValue(0);
    }
  }, [animated, titleFadeAnim, titleSlideAnim]);

  // Handle back press
  const handleBack = useCallback(() => {
    playButtonPress();
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }, [onBack, router, playButtonPress]);

  // Back button press animation
  const handleBackPressIn = useCallback(() => {
    Animated.spring(backButtonScale, {
      toValue: 0.9,
      ...AnimationPresets.spring.stiff,
      useNativeDriver: true,
    }).start();
  }, [backButtonScale]);

  const handleBackPressOut = useCallback(() => {
    Animated.spring(backButtonScale, {
      toValue: 1,
      ...AnimationPresets.spring.bouncy,
      useNativeDriver: true,
    }).start();
  }, [backButtonScale]);

  return (
    <View style={styles.container}>
      {/* Back Button */}
      {showBack ? (
        <Animated.View style={{ transform: [{ scale: backButtonScale }] }}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            onPressIn={handleBackPressIn}
            onPressOut={handleBackPressOut}
            activeOpacity={1}
          >
            <ArrowLeft size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={styles.spacer} />
      )}

      {/* Title with Gold Gradient */}
      <Animated.View
        style={[
          styles.titleContainer,
          {
            opacity: titleFadeAnim,
            transform: [{ translateY: titleSlideAnim }],
          },
        ]}
      >
        {Platform.OS === "web" ? (
          <WebGradientTitle title={title} style={styles.title} />
        ) : (
          <NativeGradientTitle title={title} style={styles.title} />
        )}
        {subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </Animated.View>

      {/* Right Content or Spacer */}
      {rightContent || <View style={styles.spacer} />}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  spacer: {
    width: 44,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: Colors.textPrimary,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  // Clean styling - no explicit fontFamily
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

export default Header3D;
