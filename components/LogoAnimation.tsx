import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  InteractionManager,
  ViewStyle,
} from "react-native";
import { Colors, FontFamily } from "@/constants/theme";

// ============================================================================
// Types
// ============================================================================

export interface LogoAnimationProps {
  width?: number;
  height?: number;
  fps?: number;
  loop?: boolean;
  autoPlay?: boolean;
  onComplete?: () => void;
  style?: ViewStyle;
}

export interface StaticLogoProps {
  width?: number;
  height?: number;
  frame?: number;
  style?: ViewStyle;
}

// ============================================================================
// Animated abstract TC coin logo
// ============================================================================

function LogoAnimationInner({
  width = 300,
  height = 230,
  loop = false,
  autoPlay = true,
  onComplete,
  style,
}: LogoAnimationProps) {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!autoPlay) { setIsReady(true); return; }
    const handle = InteractionManager.runAfterInteractions(() => setIsReady(true));
    return () => handle.cancel();
  }, [autoPlay]);

  useEffect(() => {
    if (!isReady) return;

    const ringPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ringAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ringPulse,
    ]).start();

    const timeout = loop ? undefined : setTimeout(() => {
      Animated.timing(opacityAnim, { toValue: 0, duration: 300, delay: 800, useNativeDriver: true }).start(() => {
        onComplete?.();
      });
    }, 1400);

    return () => { if (timeout) clearTimeout(timeout); };
  }, [isReady]);

  const coinSize = Math.min(width, height) * 0.46;
  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] });

  return (
    <Animated.View style={[styles.container, { width, height, opacity: opacityAnim, transform: [{ scale: scaleAnim }] }, style]}>
      <Animated.View style={[styles.ring, { width: coinSize * 1.6, height: coinSize * 1.6, borderRadius: coinSize * 0.8, opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <View style={[styles.coin, { width: coinSize, height: coinSize, borderRadius: coinSize / 2 }]}>
        <Text style={[styles.coinText, { fontSize: coinSize * 0.32 }]}>TC</Text>
      </View>
    </Animated.View>
  );
}

export const LogoAnimation = memo(LogoAnimationInner);

// ============================================================================
// StaticLogo — plain coin
// ============================================================================

function StaticLogoInner({ width = 300, height = 230, style }: StaticLogoProps) {
  const coinSize = Math.min(width, height) * 0.46;
  return (
    <View style={[styles.container, { width, height }, style]}>
      <View style={[styles.coin, { width: coinSize, height: coinSize, borderRadius: coinSize / 2 }]}>
        <Text style={[styles.coinText, { fontSize: coinSize * 0.32 }]}>TC</Text>
      </View>
    </View>
  );
}

export const StaticLogo = memo(StaticLogoInner);

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  coin: {
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  coinText: {
    fontFamily: FontFamily.spaceGroteskBold,
    color: Colors.background,
    letterSpacing: -0.5,
  },
});

export default LogoAnimation;
