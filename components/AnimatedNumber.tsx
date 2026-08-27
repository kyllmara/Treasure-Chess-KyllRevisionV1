/**
 * AnimatedNumber Component
 *
 * Displays a number with smooth animation when the value changes.
 * Shows a +/- change indicator badge horizontally next to the value.
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

export interface ValueChangeEvent {
  field: string;
  oldValue: number;
  newValue: number;
  change: number;
  timestamp: number;
}

interface AnimatedNumberProps {
  animatedValue: Animated.Value;
  style?: any;
  prefix?: string;
  suffix?: string;
  formatter?: (value: number) => string;
  changeIndicator?: ValueChangeEvent | null;
}

export function AnimatedNumber({
  animatedValue,
  style,
  prefix = "",
  suffix = "",
  formatter,
  changeIndicator,
}: AnimatedNumberProps) {
  // Initialize displayValue from the animated value's current internal value
  const getAnimatedValue = () => Math.round((animatedValue as any)._value ?? 0);
  const [displayValue, setDisplayValue] = useState(getAnimatedValue);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const changeOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Set initial value from animated value (in case it changed before mounting)
    setDisplayValue(getAnimatedValue());

    // Add listener for value changes
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue]);

  // Pulse animation when value changes
  useEffect(() => {
    if (changeIndicator) {
      // Pulse the main value
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(pulseAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Show change indicator
      Animated.sequence([
        Animated.timing(changeOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(changeOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [changeIndicator, pulseAnim, changeOpacity]);

  const formattedValue = formatter ? formatter(displayValue) : displayValue.toString();
  const changeAmount = changeIndicator?.change ?? 0;
  const isPositive = changeAmount > 0;

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          style,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        {prefix}{formattedValue}{suffix}
      </Animated.Text>
      {changeIndicator && (
        <Animated.View
          style={[
            styles.changeIndicator,
            { opacity: changeOpacity },
          ]}
        >
          <Text
            style={[
              styles.changeText,
              isPositive ? styles.positiveChange : styles.negativeChange,
            ]}
          >
            {isPositive ? "+" : ""}{changeAmount}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  changeIndicator: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  changeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  positiveChange: {
    color: "#4CAF82",
  },
  negativeChange: {
    color: "#E05C5C",
  },
});

export default AnimatedNumber;
