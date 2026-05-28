/**
 * 3D Chess Board Themes
 *
 * Pre-configured themes for the 3D chess board.
 * Each theme includes board materials, piece styles, colors, and lighting.
 *
 * @module lib/chess3d/themes
 */

import type { Theme3D, BoardMaterial, PieceMaterial } from "./types";

// ============================================================================
// Theme Definitions
// ============================================================================

/** Classic wooden theme - traditional tournament style */
export const THEME_CLASSIC_WOOD: Theme3D = {
  id: "classic-wood",
  name: "Classic Wood",
  description: "Traditional wooden board with classic piece styling",
  boardMaterial: "wood-oak",
  lightSquareColor: "#F0D9B5",
  darkSquareColor: "#B58863",
  whitePieceMaterial: "wood-classic",
  blackPieceMaterial: "wood-classic",
  whitePieceColor: "#FFFAF0",
  blackPieceColor: "#3C2415",
  boardBorderColor: "#5D4037",
  boardBorderWidth: 2,
  ambientLightIntensity: 0.4,
  directionalLightIntensity: 0.8,
  shadowIntensity: 0.5,
  reflectionIntensity: 0.2,
  premium: false,
};

/** Walnut & Maple - rich wood tones */
export const THEME_WALNUT_MAPLE: Theme3D = {
  id: "walnut-maple",
  name: "Walnut & Maple",
  description: "Rich walnut and maple wood combination",
  boardMaterial: "wood-walnut",
  lightSquareColor: "#FFE4C4",
  darkSquareColor: "#8B4513",
  whitePieceMaterial: "wood-classic",
  blackPieceMaterial: "wood-classic",
  whitePieceColor: "#FFF8DC",
  blackPieceColor: "#2F1810",
  boardBorderColor: "#3E2723",
  boardBorderWidth: 3,
  ambientLightIntensity: 0.35,
  directionalLightIntensity: 0.85,
  shadowIntensity: 0.55,
  reflectionIntensity: 0.25,
  premium: false,
};

/** Mahogany Elite - premium dark wood */
export const THEME_MAHOGANY_ELITE: Theme3D = {
  id: "mahogany-elite",
  name: "Mahogany Elite",
  description: "Premium mahogany board with elegant pieces",
  boardMaterial: "wood-mahogany",
  lightSquareColor: "#DEB887",
  darkSquareColor: "#654321",
  whitePieceMaterial: "ivory",
  blackPieceMaterial: "obsidian",
  whitePieceColor: "#FFFFF0",
  blackPieceColor: "#1A1A1A",
  boardBorderColor: "#4A2C2A",
  boardBorderWidth: 4,
  ambientLightIntensity: 0.3,
  directionalLightIntensity: 0.9,
  shadowIntensity: 0.6,
  reflectionIntensity: 0.35,
  premium: true,
};

/** White Marble - elegant stone theme */
export const THEME_WHITE_MARBLE: Theme3D = {
  id: "white-marble",
  name: "White Marble",
  description: "Elegant white marble with veined patterns",
  boardMaterial: "marble-white",
  lightSquareColor: "#FAFAFA",
  darkSquareColor: "#B0BEC5",
  whitePieceMaterial: "marble",
  blackPieceMaterial: "marble",
  whitePieceColor: "#FFFFFF",
  blackPieceColor: "#37474F",
  boardBorderColor: "#90A4AE",
  boardBorderWidth: 2,
  ambientLightIntensity: 0.5,
  directionalLightIntensity: 0.7,
  shadowIntensity: 0.4,
  reflectionIntensity: 0.5,
  premium: true,
};

/** Obsidian & Pearl - dramatic contrast */
export const THEME_OBSIDIAN_PEARL: Theme3D = {
  id: "obsidian-pearl",
  name: "Obsidian & Pearl",
  description: "Dramatic contrast of obsidian and pearl",
  boardMaterial: "marble-black",
  lightSquareColor: "#E8E8E8",
  darkSquareColor: "#1A1A2E",
  whitePieceMaterial: "ivory",
  blackPieceMaterial: "obsidian",
  whitePieceColor: "#FFFEF0",
  blackPieceColor: "#0D0D0D",
  boardBorderColor: "#2D2D44",
  boardBorderWidth: 3,
  ambientLightIntensity: 0.35,
  directionalLightIntensity: 0.95,
  shadowIntensity: 0.7,
  reflectionIntensity: 0.6,
  premium: true,
};

/** Royal Gold - luxurious gold and silver */
export const THEME_ROYAL_GOLD: Theme3D = {
  id: "royal-gold",
  name: "Royal Gold",
  description: "Luxurious gold and silver pieces on dark board",
  boardMaterial: "metal-gold",
  lightSquareColor: "#D4AF37",
  darkSquareColor: "#1C1C1C",
  whitePieceMaterial: "metal-gold",
  blackPieceMaterial: "metal-silver",
  whitePieceColor: "#FFD700",
  blackPieceColor: "#C0C0C0",
  boardBorderColor: "#B8860B",
  boardBorderWidth: 4,
  ambientLightIntensity: 0.4,
  directionalLightIntensity: 1.0,
  shadowIntensity: 0.6,
  reflectionIntensity: 0.8,
  premium: true,
};

/** Crystal Clear - transparent glass theme */
export const THEME_CRYSTAL: Theme3D = {
  id: "crystal",
  name: "Crystal Clear",
  description: "Elegant transparent crystal pieces",
  boardMaterial: "glass",
  lightSquareColor: "rgba(255, 255, 255, 0.9)",
  darkSquareColor: "rgba(100, 100, 120, 0.7)",
  whitePieceMaterial: "crystal",
  blackPieceMaterial: "crystal",
  whitePieceColor: "rgba(255, 255, 255, 0.95)",
  blackPieceColor: "rgba(50, 50, 70, 0.85)",
  boardBorderColor: "#9B7EC8",
  boardBorderWidth: 2,
  ambientLightIntensity: 0.6,
  directionalLightIntensity: 0.8,
  shadowIntensity: 0.3,
  reflectionIntensity: 0.9,
  premium: true,
};

/** Treasure Purple - app brand theme */
export const THEME_TREASURE_PURPLE: Theme3D = {
  id: "treasure-purple",
  name: "Treasure Purple",
  description: "Signature Treasure Chess purple and gold",
  boardMaterial: "wood-walnut",
  lightSquareColor: "#FFFFFF",
  darkSquareColor: "#9B7EC8",
  whitePieceMaterial: "metal-gold",
  blackPieceMaterial: "obsidian",
  whitePieceColor: "#FFD700",
  blackPieceColor: "#2C2C2C",
  boardBorderColor: "#6B4E9E",
  boardBorderWidth: 3,
  ambientLightIntensity: 0.4,
  directionalLightIntensity: 0.85,
  shadowIntensity: 0.5,
  reflectionIntensity: 0.4,
  premium: false,
};

/** Eco Green - nature inspired */
export const THEME_ECO_GREEN: Theme3D = {
  id: "eco-green",
  name: "Eco Green",
  description: "Nature-inspired green and brown tones",
  boardMaterial: "wood-oak",
  lightSquareColor: "#EEEED2",
  darkSquareColor: "#769656",
  whitePieceMaterial: "wood-classic",
  blackPieceMaterial: "wood-classic",
  whitePieceColor: "#F5F5DC",
  blackPieceColor: "#2D4A2A",
  boardBorderColor: "#4A5D23",
  boardBorderWidth: 2,
  ambientLightIntensity: 0.45,
  directionalLightIntensity: 0.75,
  shadowIntensity: 0.45,
  reflectionIntensity: 0.2,
  premium: false,
};

/** Midnight Blue - sleek modern theme */
export const THEME_MIDNIGHT_BLUE: Theme3D = {
  id: "midnight-blue",
  name: "Midnight Blue",
  description: "Sleek midnight blue with silver accents",
  boardMaterial: "metal-silver",
  lightSquareColor: "#4A5568",
  darkSquareColor: "#1A202C",
  whitePieceMaterial: "metal-silver",
  blackPieceMaterial: "obsidian",
  whitePieceColor: "#E2E8F0",
  blackPieceColor: "#0F1419",
  boardBorderColor: "#2D3748",
  boardBorderWidth: 3,
  ambientLightIntensity: 0.35,
  directionalLightIntensity: 0.9,
  shadowIntensity: 0.6,
  reflectionIntensity: 0.5,
  premium: true,
};

/** Retro Brown - vintage style */
export const THEME_RETRO: Theme3D = {
  id: "retro",
  name: "Retro Brown",
  description: "Vintage retro-styled chess set",
  boardMaterial: "wood-mahogany",
  lightSquareColor: "#E8D7B8",
  darkSquareColor: "#A67C52",
  whitePieceMaterial: "ivory",
  blackPieceMaterial: "wood-classic",
  whitePieceColor: "#FFF8E7",
  blackPieceColor: "#4A3728",
  boardBorderColor: "#8B6914",
  boardBorderWidth: 3,
  ambientLightIntensity: 0.4,
  directionalLightIntensity: 0.8,
  shadowIntensity: 0.5,
  reflectionIntensity: 0.3,
  premium: false,
};

// ============================================================================
// Theme Registry
// ============================================================================

/** All available 3D themes */
export const THEMES_3D: Record<string, Theme3D> = {
  "classic-wood": THEME_CLASSIC_WOOD,
  "walnut-maple": THEME_WALNUT_MAPLE,
  "mahogany-elite": THEME_MAHOGANY_ELITE,
  "white-marble": THEME_WHITE_MARBLE,
  "obsidian-pearl": THEME_OBSIDIAN_PEARL,
  "royal-gold": THEME_ROYAL_GOLD,
  "crystal": THEME_CRYSTAL,
  "treasure-purple": THEME_TREASURE_PURPLE,
  "eco-green": THEME_ECO_GREEN,
  "midnight-blue": THEME_MIDNIGHT_BLUE,
  "retro": THEME_RETRO,
};

/** Free themes available to all users */
export const FREE_THEMES = [
  "classic-wood",
  "walnut-maple",
  "treasure-purple",
  "eco-green",
  "retro",
];

/** Premium themes requiring unlock/purchase */
export const PREMIUM_THEMES = [
  "mahogany-elite",
  "white-marble",
  "obsidian-pearl",
  "royal-gold",
  "crystal",
  "midnight-blue",
];

/** Default theme ID */
export const DEFAULT_THEME_ID = "treasure-purple";

// ============================================================================
// Theme Utilities
// ============================================================================

/**
 * Get a theme by ID
 */
export function getTheme(themeId: string): Theme3D {
  return THEMES_3D[themeId] || THEMES_3D[DEFAULT_THEME_ID];
}

/**
 * Check if a theme is premium
 */
export function isThemePremium(themeId: string): boolean {
  const theme = THEMES_3D[themeId];
  return theme?.premium ?? false;
}

/**
 * Get all available themes for a user
 */
export function getAvailableThemes(hasPremium: boolean): Theme3D[] {
  if (hasPremium) {
    return Object.values(THEMES_3D);
  }
  return FREE_THEMES.map((id) => THEMES_3D[id]);
}

/**
 * Map 2D BoardTheme to 3D theme
 */
export function map2DThemeTo3D(boardTheme: "purple" | "classic" | "eco" | "retro"): string {
  const mapping: Record<string, string> = {
    purple: "treasure-purple",
    classic: "classic-wood",
    eco: "eco-green",
    retro: "retro",
  };
  return mapping[boardTheme] || DEFAULT_THEME_ID;
}

/**
 * Generate CSS gradient for theme preview
 */
export function getThemePreviewGradient(theme: Theme3D): string {
  return `linear-gradient(135deg, ${theme.lightSquareColor} 0%, ${theme.lightSquareColor} 25%, ${theme.darkSquareColor} 25%, ${theme.darkSquareColor} 50%, ${theme.lightSquareColor} 50%, ${theme.lightSquareColor} 75%, ${theme.darkSquareColor} 75%, ${theme.darkSquareColor} 100%)`;
}

/**
 * Get theme colors for React Native styles
 */
export function getThemeColors(theme: Theme3D): {
  lightSquare: string;
  darkSquare: string;
  whitePiece: string;
  blackPiece: string;
  border: string;
  highlight: string;
  check: string;
} {
  return {
    lightSquare: theme.lightSquareColor,
    darkSquare: theme.darkSquareColor,
    whitePiece: theme.whitePieceColor,
    blackPiece: theme.blackPieceColor,
    border: theme.boardBorderColor,
    highlight: "#FFD700",
    check: "#FF0000",
  };
}
