/**
 * GradientText Component
 *
 * Text with multi-stop gradient fill, matching the reference gold-gradient CSS.
 * Uses MaskedView to apply gradient to text.
 */

import React from "react";
import { Text, StyleSheet, TextStyle, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

interface GradientTextProps {
  children: string;
  colors?: string[];
  style?: TextStyle;
}

export function GradientText({
  children,
  colors = ["#bf953f", "#fcf6ba", "#b38728", "#fbf5b7", "#aa771c"],
  style,
}: GradientTextProps) {
  return (
    <MaskedView
      maskElement={
        <Text style={[styles.text, style]}>{children}</Text>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={[styles.text, style, styles.invisible]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 40,
    fontWeight: "900",
    textAlign: "center",
  },
  gradient: {
    flex: 1,
  },
  invisible: {
    opacity: 0,
  },
});

export default GradientText;
