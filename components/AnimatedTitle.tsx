/**
 * AnimatedTitle Component
 *
 * Unity-style animated title with multi-stop gold gradient and shimmer effect.
 * Uses react-native-reanimated for smooth 60fps UI thread animations.
 * Matches reference: gold-gradient with Playfair Display serif font.
 * Uses CSS gradient for web, MaskedView for native platforms.
 * Now includes optional animated logo from Unity export.
 */

import React, { useEffect, useState, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  InteractionManager,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { FontFamily } from "@/constants/theme";
import { LogoAnimation, StaticLogo } from "./LogoAnimation";

// Conditionally import MaskedView only for native platforms
let MaskedView: React.ComponentType<any> | null = null;
if (Platform.OS !== "web") {
  MaskedView = require("@react-native-masked-view/masked-view").default;
}

interface AnimatedTitleProps {
  title: string;
  subtitle?: string;
  /** Show the animated logo above the title */
  showLogo?: boolean;
  /** Whether to play the logo animation (if false, shows static logo) */
  animateLogo?: boolean;
  /** Logo animation size */
  logoSize?: { width: number; height: number };
}

// Gold gradient colors from reference CSS:
// background: linear-gradient(135deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c);
const GOLD_GRADIENT_COLORS = ["#bf953f", "#fcf6ba", "#b38728", "#fbf5b7", "#aa771c"] as const;

// Web-specific gradient text component using CSS
function WebGradientText({ title }: { title: string }) {
  // Web-only CSS properties for gradient text
  const webStyles = {
    backgroundImage: "linear-gradient(135deg, #bf953f, #fcf6ba, #b38728, #fbf5b7, #aa771c)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  } as const;

  return (
    <Text style={[styles.title, webStyles as any]}>
      {title}
    </Text>
  );
}

// Native gradient text using MaskedView
function NativeGradientText({ title }: { title: string }) {
  if (!MaskedView) {
    return <Text style={[styles.title, { color: "#fcf6ba" }]}>{title}</Text>;
  }

  return (
    <MaskedView maskElement={<Text style={styles.title}>{title}</Text>}>
      <LinearGradient
        colors={GOLD_GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={[styles.title, styles.invisible]}>{title}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function AnimatedTitleInner({
  title,
  subtitle,
  showLogo = true,
  animateLogo = true,
  logoSize = { width: 200, height: 153 },
}: AnimatedTitleProps) {
  // Reanimated shared values
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);
  const [logoAnimationComplete, setLogoAnimationComplete] = useState(!animateLogo);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for screen interactions before animating
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);

      // Entry animation with spring
      opacity.value = withTiming(1, { duration: 600 });
      scale.value = withSpring(1, {
        damping: 12,
        stiffness: 80,
      });

      // Subtitle fade in with delay
      subtitleOpacity.value = withDelay(
        400,
        withTiming(1, { duration: 400 })
      );
    });

    return () => handle.cancel();
  }, []);

  const handleLogoComplete = () => {
    setLogoAnimationComplete(true);
  };

  const titleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Animated Logo from Unity */}
      {showLogo && (
        <View style={styles.logoContainer}>
          {animateLogo && !logoAnimationComplete ? (
            <LogoAnimation
              width={logoSize.width}
              height={logoSize.height}
              fps={30}
              loop={false}
              autoPlay={isReady}
              onComplete={handleLogoComplete}
            />
          ) : (
            <StaticLogo
              width={logoSize.width}
              height={logoSize.height}
            />
          )}
        </View>
      )}

      <Animated.View style={[styles.titleWrapper, titleStyle]}>
        {/* Multi-stop gold gradient text - platform specific */}
        {Platform.OS === "web" ? (
          <WebGradientText title={title} />
        ) : (
          <NativeGradientText title={title} />
        )}
      </Animated.View>

      {subtitle && (
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {subtitle}
        </Animated.Text>
      )}
    </View>
  );
}

export const AnimatedTitle = memo(AnimatedTitleInner);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  titleWrapper: {
    position: "relative",
    overflow: "hidden",
  },
  // Matches: text-5xl serif font-black tracking-widest uppercase
  title: {
    fontSize: 40,
    fontFamily: FontFamily.playfairBlack,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  invisible: {
    opacity: 0,
  },
  // Matches: text-[10px] tracking-[0.3em] uppercase text-zinc-500 font-bold
  // Clean styling - no explicit fontFamily
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#71717a", // zinc-500
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 3, // 0.3em equivalent
  },
});

export default AnimatedTitle;
