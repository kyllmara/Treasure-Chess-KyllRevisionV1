/**
 * Theme Constants
 *
 * Centralized theme configuration using Unity assets.
 * Apply these fonts and colors throughout the app for consistency.
 */

import { Platform, TextStyle } from "react-native";

// ============================================================================
// Colors - Unity Theme Palette
// ============================================================================

export const Colors = {
  // Primary colors - Gold from reference
  primary: "#FFD700", // Gold
  primaryDark: "#B38728",
  primaryLight: "#FCF6BA",

  // Secondary colors
  secondary: "#9B7EC8", // Purple
  secondaryDark: "#7B5EA8",
  secondaryLight: "#BB9EE8",

  // Accent colors
  accent: "#4ECDC4", // Teal
  accentDark: "#3EBDB4",
  accentLight: "#6EDDD4",

  // Background colors - Matching #05060f from reference
  background: "#05060f",
  backgroundLight: "#0F0F1E",
  backgroundCard: "rgba(255, 255, 255, 0.03)",
  backgroundCardHover: "rgba(255, 255, 255, 0.05)",

  // Text colors
  textPrimary: "#FFFFFF",
  textSecondary: "#71717a", // zinc-500
  textMuted: "#52525b", // zinc-600
  textGold: "#FFD700",

  // Status colors
  success: "#4CAF50",
  warning: "#FFC107",
  error: "#FF4444",
  info: "#2196F3",

  // Game colors
  win: "#4CAF50",
  lose: "#FF4444",
  draw: "#FFC107",

  // Board theme - purple (default Unity theme)
  boardLight: "#FFFFFF",
  boardDark: "#9B7EC8",

  // Border colors
  border: "rgba(255, 255, 255, 0.1)",
  borderActive: "#FFD700",

  // Transparent colors
  overlay: "rgba(0, 0, 0, 0.5)",
  overlayLight: "rgba(255, 255, 255, 0.05)",
} as const;

// ============================================================================
// Typography - Unity Fonts
// ============================================================================

/**
 * Font family names as registered via expo-font plugin
 * These match the font files in assets/fonts/
 */
export const FontFamily = {
  // Plus Jakarta Sans - Primary UI font (matches reference exactly)
  jakartaRegular: "PlusJakartaSans-Regular",
  jakartaMedium: "PlusJakartaSans-Medium",
  jakartaSemiBold: "PlusJakartaSans-SemiBold",
  jakartaBold: "PlusJakartaSans-Bold",
  jakartaExtraBold: "PlusJakartaSans-ExtraBold",

  // Cabin - Original Unity font family
  cabinRegular: "Cabin-Regular",
  cabinMedium: "Cabin-Medium",
  cabinSemiBold: "Cabin-SemiBold",
  cabinBold: "Cabin-Bold",
  cabinItalic: "Cabin-Italic",
  cabinMediumItalic: "Cabin-MediumItalic",
  cabinSemiBoldItalic: "Cabin-SemiBoldItalic",
  cabinBoldItalic: "Cabin-BoldItalic",

  // Barlow Condensed - Display font for titles/headers
  barlowRegular: "BarlowCondensed-Regular",
  barlowMedium: "BarlowCondensed-Medium",
  barlowBold: "BarlowCondensed-Bold",

  // Playfair Display - Serif font for main branding (matches reference)
  playfairBold: "PlayfairDisplay-Bold",
  playfairBlack: "PlayfairDisplay-Black",

  // System fallback for monospace
  mono: Platform.OS === "ios" ? "Menlo" : "monospace",
} as const;

/**
 * Pre-defined text styles using Unity fonts
 */
export const Typography: Record<string, TextStyle> = {
  // Headers
  h1: {
    fontFamily: FontFamily.barlowBold,
    fontSize: 32,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  h2: {
    fontFamily: FontFamily.barlowBold,
    fontSize: 24,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  h3: {
    fontFamily: FontFamily.barlowMedium,
    fontSize: 20,
    fontWeight: "600",
    color: Colors.textPrimary,
    letterSpacing: 0.25,
  },
  h4: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.textPrimary,
  },

  // Body text - clean styling without explicit fontFamily
  // Uses system default or Plus Jakarta Sans via CSS/native font loading
  body: {
    fontSize: 16,
    fontWeight: "400",
    color: Colors.textPrimary,
  },
  bodyMedium: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.textPrimary,
  },
  bodySemiBold: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textPrimary,
  },

  // Small text
  caption: {
    fontSize: 12,
    fontWeight: "400",
    color: Colors.textSecondary,
  },
  captionMedium: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
  },

  // Labels
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Buttons
  button: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  buttonSmall: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
  },

  // Numbers (for amounts, timers, etc.)
  number: {
    fontFamily: FontFamily.barlowBold,
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textGold,
  },
  numberLarge: {
    fontFamily: FontFamily.barlowBold,
    fontSize: 32,
    fontWeight: "700",
    color: Colors.textGold,
  },
  numberSmall: {
    fontFamily: FontFamily.barlowMedium,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
  },

  // Monospace (for codes, addresses)
  mono: {
    fontFamily: FontFamily.mono,
    fontSize: 14,
    color: Colors.textSecondary,
  },
} as const;

// ============================================================================
// Spacing
// ============================================================================

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  round: 9999,
} as const;

// ============================================================================
// Shadows
// ============================================================================

export const Shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  gold: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// ============================================================================
// 3D Text Shadows - For that Unity-like depth effect
// ============================================================================

// No glowing text - clean styling per user preference
export const TextShadows = {
  // Subtle dark shadow only for depth, no glow
  subtle: {
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Empty object for compatibility - no glow effects
  gold: {},
  goldStrong: {},
  purple: {},
  dark: {},
  glow: {},
} as const;

// ============================================================================
// 3D Button Styles - Matching Unity aesthetic
// ============================================================================

// 3D Button styles matching reference btn-3d CSS
export const Button3DStyles = {
  // Matches btn-3d with box-shadow: 0 4px 0 rgba(0,0,0,0.3)
  primary: {
    backgroundColor: Colors.primary,
    borderRadius: 16, // rounded-2xl
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  amber: {
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  teal: {
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  purple: {
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  rose: {
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  dark: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
} as const;

// ============================================================================
// Card 3D Styles
// ============================================================================

// Glass card styles matching reference CSS
export const Card3DStyles = {
  // Glass card from reference: rgba(255, 255, 255, 0.03) with blur
  glass: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 32, // rounded-[2rem]
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 8,
  },
  default: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  gold: {
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  purple: {
    backgroundColor: "rgba(155, 126, 200, 0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(155, 126, 200, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ============================================================================
// Animation Presets
// ============================================================================

export const AnimationPresets = {
  // Duration in milliseconds
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
    extraSlow: 800,
  },
  // Spring config for React Native Animated
  spring: {
    gentle: { tension: 50, friction: 7 },
    bouncy: { tension: 100, friction: 5 },
    stiff: { tension: 200, friction: 20 },
  },
} as const;

// ============================================================================
// Gradient Presets
// ============================================================================

export const Gradients = {
  background: ["#05060f", "#0F0F1E"] as [string, string],
  backgroundReverse: ["#0F0F1E", "#05060f"] as [string, string],
  gold: ["#bf953f", "#fcf6ba", "#b38728"] as [string, string, string],
  goldSimple: ["#FFD700", "#B38728"] as [string, string],
  purple: ["#9B7EC8", "#7B5EA8"] as [string, string],
  success: ["#4CAF50", "#388E3C"] as [string, string],
  error: ["#FF4444", "#CC0000"] as [string, string],
  // Menu button gradients from reference
  amber: ["#f59e0b", "#d97706"] as [string, string],
  teal: ["#2dd4bf", "#0d9488"] as [string, string],
  violet: ["#a855f7", "#7c3aed"] as [string, string],
  rose: ["#f43f5e", "#be123c"] as [string, string],
} as const;

// ============================================================================
// Default Export
// ============================================================================

export default {
  Colors,
  FontFamily,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  TextShadows,
  Button3DStyles,
  Card3DStyles,
  AnimationPresets,
  Gradients,
};
