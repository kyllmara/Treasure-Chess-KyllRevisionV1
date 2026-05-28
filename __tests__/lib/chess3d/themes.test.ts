/**
 * 3D Chess Board Themes Tests
 *
 * Tests for theme definitions and utilities.
 */

import {
  THEMES_3D,
  FREE_THEMES,
  PREMIUM_THEMES,
  DEFAULT_THEME_ID,
  getTheme,
  isThemePremium,
  getAvailableThemes,
  map2DThemeTo3D,
  getThemePreviewGradient,
  getThemeColors,
  THEME_CLASSIC_WOOD,
  THEME_TREASURE_PURPLE,
  THEME_ROYAL_GOLD,
} from "@/lib/chess3d/themes";

describe("Theme Constants", () => {
  describe("THEMES_3D", () => {
    it("should contain all expected themes", () => {
      expect(Object.keys(THEMES_3D)).toHaveLength(11);
      expect(THEMES_3D["classic-wood"]).toBeDefined();
      expect(THEMES_3D["treasure-purple"]).toBeDefined();
      expect(THEMES_3D["royal-gold"]).toBeDefined();
      expect(THEMES_3D["crystal"]).toBeDefined();
    });

    it("should have valid theme structures", () => {
      Object.entries(THEMES_3D).forEach(([id, theme]) => {
        expect(theme.id).toBe(id);
        expect(theme.name).toBeDefined();
        expect(theme.description).toBeDefined();
        expect(theme.boardMaterial).toBeDefined();
        expect(theme.lightSquareColor).toBeDefined();
        expect(theme.darkSquareColor).toBeDefined();
        expect(theme.whitePieceMaterial).toBeDefined();
        expect(theme.blackPieceMaterial).toBeDefined();
        expect(theme.whitePieceColor).toBeDefined();
        expect(theme.blackPieceColor).toBeDefined();
        expect(theme.boardBorderColor).toBeDefined();
        expect(typeof theme.boardBorderWidth).toBe("number");
        expect(typeof theme.ambientLightIntensity).toBe("number");
        expect(typeof theme.directionalLightIntensity).toBe("number");
        expect(typeof theme.shadowIntensity).toBe("number");
        expect(typeof theme.reflectionIntensity).toBe("number");
        expect(typeof theme.premium).toBe("boolean");
      });
    });

    it("should have color values in valid hex format", () => {
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
      const rgbaRegex = /^rgba?\(/;

      Object.values(THEMES_3D).forEach((theme) => {
        // Light and dark square colors can be hex or rgba
        const isValidLightSquare =
          hexColorRegex.test(theme.lightSquareColor) ||
          rgbaRegex.test(theme.lightSquareColor);
        const isValidDarkSquare =
          hexColorRegex.test(theme.darkSquareColor) ||
          rgbaRegex.test(theme.darkSquareColor);

        expect(isValidLightSquare).toBe(true);
        expect(isValidDarkSquare).toBe(true);
      });
    });

    it("should have valid intensity values between 0 and 1", () => {
      Object.values(THEMES_3D).forEach((theme) => {
        expect(theme.ambientLightIntensity).toBeGreaterThanOrEqual(0);
        expect(theme.ambientLightIntensity).toBeLessThanOrEqual(1);
        expect(theme.directionalLightIntensity).toBeGreaterThanOrEqual(0);
        expect(theme.directionalLightIntensity).toBeLessThanOrEqual(1.5);
        expect(theme.shadowIntensity).toBeGreaterThanOrEqual(0);
        expect(theme.shadowIntensity).toBeLessThanOrEqual(1);
        expect(theme.reflectionIntensity).toBeGreaterThanOrEqual(0);
        expect(theme.reflectionIntensity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("FREE_THEMES", () => {
    it("should contain 5 free themes", () => {
      expect(FREE_THEMES).toHaveLength(5);
    });

    it("should contain valid theme IDs", () => {
      FREE_THEMES.forEach((id) => {
        expect(THEMES_3D[id]).toBeDefined();
      });
    });

    it("should only include non-premium themes", () => {
      FREE_THEMES.forEach((id) => {
        expect(THEMES_3D[id].premium).toBe(false);
      });
    });

    it("should include treasure-purple as default", () => {
      expect(FREE_THEMES).toContain("treasure-purple");
    });
  });

  describe("PREMIUM_THEMES", () => {
    it("should contain 6 premium themes", () => {
      expect(PREMIUM_THEMES).toHaveLength(6);
    });

    it("should contain valid theme IDs", () => {
      PREMIUM_THEMES.forEach((id) => {
        expect(THEMES_3D[id]).toBeDefined();
      });
    });

    it("should only include premium themes", () => {
      PREMIUM_THEMES.forEach((id) => {
        expect(THEMES_3D[id].premium).toBe(true);
      });
    });

    it("should not overlap with free themes", () => {
      PREMIUM_THEMES.forEach((id) => {
        expect(FREE_THEMES).not.toContain(id);
      });
    });
  });

  describe("DEFAULT_THEME_ID", () => {
    it("should be treasure-purple", () => {
      expect(DEFAULT_THEME_ID).toBe("treasure-purple");
    });

    it("should be a free theme", () => {
      expect(FREE_THEMES).toContain(DEFAULT_THEME_ID);
    });

    it("should exist in THEMES_3D", () => {
      expect(THEMES_3D[DEFAULT_THEME_ID]).toBeDefined();
    });
  });
});

describe("Individual Themes", () => {
  describe("THEME_CLASSIC_WOOD", () => {
    it("should have correct properties", () => {
      expect(THEME_CLASSIC_WOOD.id).toBe("classic-wood");
      expect(THEME_CLASSIC_WOOD.name).toBe("Classic Wood");
      expect(THEME_CLASSIC_WOOD.premium).toBe(false);
      expect(THEME_CLASSIC_WOOD.boardMaterial).toBe("wood-oak");
    });
  });

  describe("THEME_TREASURE_PURPLE", () => {
    it("should have correct properties", () => {
      expect(THEME_TREASURE_PURPLE.id).toBe("treasure-purple");
      expect(THEME_TREASURE_PURPLE.name).toBe("Treasure Purple");
      expect(THEME_TREASURE_PURPLE.premium).toBe(false);
      expect(THEME_TREASURE_PURPLE.darkSquareColor).toBe("#9B7EC8");
    });
  });

  describe("THEME_ROYAL_GOLD", () => {
    it("should be a premium theme", () => {
      expect(THEME_ROYAL_GOLD.premium).toBe(true);
      expect(THEME_ROYAL_GOLD.whitePieceMaterial).toBe("metal-gold");
    });
  });
});

describe("Theme Utilities", () => {
  describe("getTheme", () => {
    it("should return the correct theme for valid ID", () => {
      const theme = getTheme("classic-wood");
      expect(theme.id).toBe("classic-wood");
      expect(theme.name).toBe("Classic Wood");
    });

    it("should return default theme for invalid ID", () => {
      const theme = getTheme("non-existent-theme");
      expect(theme.id).toBe(DEFAULT_THEME_ID);
    });

    it("should return default theme for empty string", () => {
      const theme = getTheme("");
      expect(theme.id).toBe(DEFAULT_THEME_ID);
    });

    it("should return all theme properties", () => {
      const theme = getTheme("treasure-purple");
      expect(theme).toHaveProperty("id");
      expect(theme).toHaveProperty("name");
      expect(theme).toHaveProperty("description");
      expect(theme).toHaveProperty("boardMaterial");
      expect(theme).toHaveProperty("lightSquareColor");
      expect(theme).toHaveProperty("darkSquareColor");
    });
  });

  describe("isThemePremium", () => {
    it("should return false for free themes", () => {
      FREE_THEMES.forEach((id) => {
        expect(isThemePremium(id)).toBe(false);
      });
    });

    it("should return true for premium themes", () => {
      PREMIUM_THEMES.forEach((id) => {
        expect(isThemePremium(id)).toBe(true);
      });
    });

    it("should return false for invalid theme ID", () => {
      expect(isThemePremium("non-existent")).toBe(false);
    });
  });

  describe("getAvailableThemes", () => {
    it("should return only free themes when hasPremium is false", () => {
      const themes = getAvailableThemes(false);
      expect(themes).toHaveLength(FREE_THEMES.length);
      themes.forEach((theme) => {
        expect(theme.premium).toBe(false);
      });
    });

    it("should return all themes when hasPremium is true", () => {
      const themes = getAvailableThemes(true);
      expect(themes).toHaveLength(Object.keys(THEMES_3D).length);
    });

    it("should return valid theme objects", () => {
      const themes = getAvailableThemes(true);
      themes.forEach((theme) => {
        expect(theme.id).toBeDefined();
        expect(theme.name).toBeDefined();
      });
    });
  });

  describe("map2DThemeTo3D", () => {
    it("should map purple to treasure-purple", () => {
      expect(map2DThemeTo3D("purple")).toBe("treasure-purple");
    });

    it("should map classic to classic-wood", () => {
      expect(map2DThemeTo3D("classic")).toBe("classic-wood");
    });

    it("should map eco to eco-green", () => {
      expect(map2DThemeTo3D("eco")).toBe("eco-green");
    });

    it("should map retro to retro", () => {
      expect(map2DThemeTo3D("retro")).toBe("retro");
    });
  });

  describe("getThemePreviewGradient", () => {
    it("should return a valid CSS gradient string", () => {
      const theme = getTheme("classic-wood");
      const gradient = getThemePreviewGradient(theme);

      expect(gradient).toContain("linear-gradient");
      expect(gradient).toContain(theme.lightSquareColor);
      expect(gradient).toContain(theme.darkSquareColor);
    });

    it("should work for all themes", () => {
      Object.values(THEMES_3D).forEach((theme) => {
        const gradient = getThemePreviewGradient(theme);
        expect(gradient).toContain("linear-gradient");
      });
    });
  });

  describe("getThemeColors", () => {
    it("should return correct color object", () => {
      const theme = getTheme("treasure-purple");
      const colors = getThemeColors(theme);

      expect(colors.lightSquare).toBe(theme.lightSquareColor);
      expect(colors.darkSquare).toBe(theme.darkSquareColor);
      expect(colors.whitePiece).toBe(theme.whitePieceColor);
      expect(colors.blackPiece).toBe(theme.blackPieceColor);
      expect(colors.border).toBe(theme.boardBorderColor);
      expect(colors.highlight).toBe("#FFD700");
      expect(colors.check).toBe("#FF0000");
    });

    it("should return all required keys", () => {
      const theme = getTheme("classic-wood");
      const colors = getThemeColors(theme);

      expect(colors).toHaveProperty("lightSquare");
      expect(colors).toHaveProperty("darkSquare");
      expect(colors).toHaveProperty("whitePiece");
      expect(colors).toHaveProperty("blackPiece");
      expect(colors).toHaveProperty("border");
      expect(colors).toHaveProperty("highlight");
      expect(colors).toHaveProperty("check");
    });
  });
});
