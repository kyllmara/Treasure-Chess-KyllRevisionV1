/**
 * Treasure Chess — Design System Tokens
 *
 * Single source of truth for all visual tokens.
 * Never hardcode hex values or magic numbers in components;
 * always reference the exports from this file.
 *
 * Fonts:
 *   Space Grotesk  → headings, display numbers (balances, scores)
 *   Inter          → body copy, labels, buttons
 *
 * Numeric/financial values should add fontVariant: ["tabular-nums"]
 * at the call site for consistent character widths.
 */

import { Platform, TextStyle } from "react-native";

// ============================================================================
// Colors
// ============================================================================

export const Colors = {
  // ── Backgrounds ────────────────────────────────────────────────────────────
  background:       "#35383D",   // medium-dark charcoal — outer page / screen fill
  surface:          "#2A2D32",   // darker card surface — cards sit darker than background (inset feel)
  surfaceElevated:  "#32353A",   // slightly lighter than surface — nested elements, modals, active rows

  // ── Brand / Interactive ────────────────────────────────────────────────────
  primary:          "#F5C400",   // pure saturated yellow — primary CTAs, active states, highlights
  primaryDark:      "#C49B00",   // pressed / darker yellow
  primaryLight:     "#F9DF67",   // subtle yellow tint backgrounds

  // ── On-primary text ────────────────────────────────────────────────────────
  onPrimary:        "#1A1C1F",   // near-black text/icons placed ON the yellow primary surface

  // ── Semantic ──────────────────────────────────────────────────────────────
  positive:         "#4CAF82",   // muted green — wins, gains, success states
  negative:         "#E05C5C",   // muted coral/red — losses, errors, warnings

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary:      "#FFFFFF",
  textSecondary:    "#8A8D94",   // cool muted gray — subtitles, timestamps, labels
  textMuted:        "#5A5D63",   // disabled, very subtle

  // ── UI States ─────────────────────────────────────────────────────────────
  inactive:         "#5A5D63",   // inactive tab icons, disabled states

  // ── Borders / Dividers ────────────────────────────────────────────────────
  border:           "#3F4248",   // very subtle separator lines — barely visible, not harsh
  borderSubtle:     "#35383D",   // hairlines, barely-there separators

  // ── Overlays ──────────────────────────────────────────────────────────────
  overlay:          "rgba(0, 0, 0, 0.6)",
  overlayLight:     "rgba(255, 255, 255, 0.04)",

  // ── Legacy aliases (kept for backward compat while screens migrate) ────────
  /** @deprecated use Colors.positive */ win:     "#4CAF82",
  /** @deprecated use Colors.negative */ lose:    "#E05C5C",
  /** @deprecated use Colors.primary  */ textGold: "#F5C400",
  /** @deprecated use Colors.primary  */ borderActive: "#F5C400",
  /** @deprecated use Colors.surface  */ backgroundCard: "#2A2D32",
  /** @deprecated use Colors.background */ backgroundLight: "#35383D",
  draw:    "#8A8D94",
  success: "#4CAF82",
  warning: "#F5C400",
  error:   "#E05C5C",
  info:    "#4A90E2",

  // ── Chess board ───────────────────────────────────────────────────────────
  boardLight:  "#FFFFFF",
  boardDark:   "#2A2D32",

  // ── Secondary palette (retained for component compat) ─────────────────────
  secondary:      "#7B6EAB",
  secondaryDark:  "#5B4E8B",
  secondaryLight: "#9B8ECB",
  accent:         "#4CAF82",   // alias → positive
  accentDark:     "#3A9F6E",
  accentLight:    "#7DD4A4",
} as const;

// ============================================================================
// Typography
// ============================================================================

/**
 * Font family names registered via expo-font plugin (app.json).
 * Filename without extension = registered family name.
 */
export const FontFamily = {
  // ── Space Grotesk — headings, display numbers ──────────────────────────────
  spaceGroteskRegular:  "SpaceGrotesk_400Regular",
  spaceGroteskMedium:   "SpaceGrotesk_500Medium",
  spaceGroteskSemiBold: "SpaceGrotesk_600SemiBold",
  spaceGroteskBold:     "SpaceGrotesk_700Bold",

  // ── Inter — body, labels, buttons ─────────────────────────────────────────
  interRegular:  "Inter_400Regular",
  interMedium:   "Inter_500Medium",
  interSemiBold: "Inter_600SemiBold",
  interBold:     "Inter_700Bold",

  // ── Legacy fonts (still bundled; used by gameplay screens until Stage 2) ──
  jakartaRegular:   "PlusJakartaSans-Regular",
  jakartaMedium:    "PlusJakartaSans-Medium",
  jakartaSemiBold:  "PlusJakartaSans-SemiBold",
  jakartaBold:      "PlusJakartaSans-Bold",
  jakartaExtraBold: "PlusJakartaSans-ExtraBold",
  cabinRegular:     "Cabin-Regular",
  cabinMedium:      "Cabin-Medium",
  cabinSemiBold:    "Cabin-SemiBold",
  cabinBold:        "Cabin-Bold",
  barlowRegular:    "BarlowCondensed-Regular",
  barlowMedium:     "BarlowCondensed-Medium",
  barlowBold:       "BarlowCondensed-Bold",
  playfairBold:     "PlayfairDisplay-Bold",
  playfairBlack:    "PlayfairDisplay-Black",

  // ── Archivo Black — bold impact display words ──────────────────────────────
  archivoblack: "ArchivoBlack_400Regular",

  // ── Quicksand — page/tab titles (Medium) and stat numbers (SemiBold) ───────
  quicksandRegular:  "Quicksand_400Regular",
  quicksandMedium:   "Quicksand_500Medium",
  quicksandSemiBold: "Quicksand_600SemiBold",

  // ── Google Sans Flex — ultra-thin descriptor/secondary text ─────────────────
  googleSansFlex: "GoogleSansFlex_100Thin",

  // ── System ────────────────────────────────────────────────────────────────
  mono: Platform.OS === "ios" ? "Menlo" : "monospace",
} as const;

/**
 * Pre-composed text styles.
 * Use fontVariant: ["tabular-nums"] at the call site for any financial/score numbers.
 */
export const Typography: Record<string, TextStyle> = {
  // ── Display (Space Grotesk) — hero numbers, big titles ────────────────────
  displayLarge: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.5,
    color: Colors.textPrimary,
  },
  display: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.3,
    color: Colors.textPrimary,
  },
  displayNumber: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.2,
    color: Colors.primary,
    // Caller adds: fontVariant: ["tabular-nums"]
  },

  // ── Headings (Space Grotesk) ───────────────────────────────────────────────
  h1: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  h2: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.1,
    color: Colors.textPrimary,
  },
  h3: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 18,
    lineHeight: 26,
    color: Colors.textPrimary,
  },
  h4: {
    fontFamily: FontFamily.spaceGroteskMedium,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textPrimary,
  },

  // ── Body (Inter) ──────────────────────────────────────────────────────────
  body: {
    fontFamily: FontFamily.interRegular,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textPrimary,
  },
  bodyMedium: {
    fontFamily: FontFamily.interMedium,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textPrimary,
  },
  bodySemiBold: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textPrimary,
  },

  // ── Labels (Inter) ────────────────────────────────────────────────────────
  label: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  labelSmall: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
    color: Colors.textSecondary,
  },

  // ── Buttons (Inter) ───────────────────────────────────────────────────────
  button: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
    color: Colors.textPrimary,
  },
  buttonSmall: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: Colors.textPrimary,
  },

  // ── Caption (Inter) ───────────────────────────────────────────────────────
  caption: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },
  captionMedium: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textSecondary,
  },

  // ── Numeric display (Space Grotesk, tabular) ──────────────────────────────
  number: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 20,
    lineHeight: 28,
    color: Colors.primary,
  },
  numberLarge: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 32,
    lineHeight: 40,
    color: Colors.primary,
  },
  numberSmall: {
    fontFamily: FontFamily.spaceGroteskMedium,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
  },

  // ── Monospace (addresses, codes) ─────────────────────────────────────────
  mono: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
} as const;

// ============================================================================
// Spacing
// ============================================================================

/** All layout spacing in the app should use these values. */
export const Spacing = {
  xs:   4,
  sm:   8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
  xxxl: 48,  // kept for compat; prefer composing xl + xxl
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const BorderRadius = {
  sm:   8,    // small elements, quality/theme option tiles
  md:   12,   // default card radius, icon wraps, inputs
  lg:   16,   // larger cards, sheets
  pill: 999,  // primary CTA buttons, tags, chips
  // Legacy aliases
  /** @deprecated use BorderRadius.sm  */ xs: 4,
  /** @deprecated use BorderRadius.lg  */ xl: 16,
  /** @deprecated use BorderRadius.pill */ round: 999,
} as const;

// ============================================================================
// Shadows
// ============================================================================

export const Shadows = {
  small: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  gold: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  positive: {
    shadowColor: Colors.positive,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
} as const;

// ============================================================================
// TextShadows (kept minimal — no glow)
// ============================================================================

export const TextShadows = {
  subtle: {
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gold: {},
  goldStrong: {},
  purple: {},
  dark: {},
  glow: {},
} as const;

// ============================================================================
// Button Styles (3D / primary)
// ============================================================================

export const Button3DStyles = {
  primary: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 0,
    elevation: 4,
  },
  positive: {
    backgroundColor: Colors.positive,
    borderRadius: BorderRadius.pill,
    shadowColor: "#2D8B5E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 0,
    elevation: 4,
  },
  surface: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  // Legacy variants (kept for compat)
  amber: { borderRadius: BorderRadius.pill },
  teal:  { borderRadius: BorderRadius.pill },
  purple:{ borderRadius: BorderRadius.pill },
  rose:  { borderRadius: BorderRadius.pill },
  dark: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.pill,
    borderColor: Colors.border,
    borderWidth: 1,
  },
} as const;

// ============================================================================
// Card Styles
// ============================================================================

export const Card3DStyles = {
  default: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    ...Shadows.medium,
  },
  elevated: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    ...Shadows.large,
  },
  gold: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
    ...Shadows.gold,
  },
  glass: {
    backgroundColor: "rgba(42, 45, 50, 0.85)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.large,
  },
  // Legacy
  purple: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    ...Shadows.medium,
  },
} as const;

// ============================================================================
// Gradients
// ============================================================================

export const Gradients = {
  background:        [Colors.background, "#1E2124"] as [string, string],
  backgroundReverse: ["#1E2124", Colors.background] as [string, string],
  surface:           [Colors.surface, Colors.surfaceElevated] as [string, string],
  gold:              [Colors.primaryLight, Colors.primary, Colors.primaryDark] as [string, string, string],
  goldSimple:        [Colors.primary, Colors.primaryDark] as [string, string],
  positive:          [Colors.positive, "#2D8B5E"] as [string, string],
  negative:          [Colors.negative, "#B84444"] as [string, string],
  // Kept for menu card compat:
  amber:  [Colors.primary, Colors.primaryDark] as [string, string],
  teal:   [Colors.positive, "#2D8B5E"] as [string, string],
  violet: ["#A855F7", "#7C3AED"] as [string, string],
  rose:   ["#E05C5C", "#B84444"] as [string, string],
  purple: ["#7B6EAB", "#5B4E8B"] as [string, string],
  success: [Colors.positive, "#2D8B5E"] as [string, string],
  error:   ["#E05C5C", "#B84444"] as [string, string],
} as const;

// ============================================================================
// Animation Presets
// ============================================================================

export const AnimationPresets = {
  duration: {
    fast:      150,
    normal:    300,
    slow:      500,
    extraSlow: 800,
  },
  spring: {
    gentle: { tension: 50, friction: 7 },
    bouncy: { tension: 100, friction: 5 },
    stiff:  { tension: 200, friction: 20 },
  },
} as const;

// ============================================================================
// Default export
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
  Gradients,
  AnimationPresets,
};
