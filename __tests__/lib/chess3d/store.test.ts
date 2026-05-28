/**
 * 3D Chess Board Store Tests
 *
 * Tests for the Zustand store managing 3D chess board configuration.
 * Uses direct store access instead of hooks due to test environment limitations.
 */

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

// Reset modules before importing to clear any cached state
beforeEach(() => {
  jest.resetModules();
});

describe("Chess3DStore", () => {
  // Import fresh store for each test - use direct state access
  const getStore = async () => {
    const { useChess3DStore } = await import("@/lib/chess3d/store");
    return useChess3DStore;
  };

  describe("Initial State", () => {
    it("should have correct default values", async () => {
      const useChess3DStore = await getStore();
      const state = useChess3DStore.getState();

      expect(state.enable3D).toBe(true);
      expect(state.enableUnity).toBe(false);
      expect(state.qualityPreset).toBe("medium");
      expect(state.themeId).toBe("treasure-purple");
      expect(state.cameraPreset).toBe("white-side");
      expect(state.autoDetectQuality).toBe(true);
      expect(state.reduceMotion).toBe(false);
    });

    it("should have default animation config", async () => {
      const useChess3DStore = await getStore();
      const state = useChess3DStore.getState();

      expect(state.animations.moveType).toBe("arc");
      expect(state.animations.captureType).toBe("fade");
      expect(state.animations.moveDuration).toBe(300);
      expect(state.animations.enableParticles).toBe(true);
    });

    it("should have default visual effects", async () => {
      const useChess3DStore = await getStore();
      const state = useChess3DStore.getState();

      expect(state.effects.selectionGlow).toBe(true);
      expect(state.effects.enableShadows).toBe(true);
      expect(state.effects.enableBloom).toBe(true);
      expect(state.effects.lastMoveHighlight).toBe(true);
    });
  });

  describe("Actions", () => {
    it("should toggle 3D mode", async () => {
      const useChess3DStore = await getStore();

      expect(useChess3DStore.getState().enable3D).toBe(true);

      useChess3DStore.getState().setEnable3D(false);
      expect(useChess3DStore.getState().enable3D).toBe(false);

      useChess3DStore.getState().setEnable3D(true);
      expect(useChess3DStore.getState().enable3D).toBe(true);
    });

    it("should change quality preset", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setQualityPreset("high");
      expect(useChess3DStore.getState().qualityPreset).toBe("high");

      useChess3DStore.getState().setQualityPreset("low");
      expect(useChess3DStore.getState().qualityPreset).toBe("low");
    });

    it("should change theme", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setTheme("classic-wood");
      expect(useChess3DStore.getState().themeId).toBe("classic-wood");
    });

    it("should not change theme for invalid theme ID", async () => {
      const useChess3DStore = await getStore();

      const originalTheme = useChess3DStore.getState().themeId;
      useChess3DStore.getState().setTheme("non-existent-theme");
      expect(useChess3DStore.getState().themeId).toBe(originalTheme);
    });

    it("should change camera preset", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setCameraPreset("black-side");
      expect(useChess3DStore.getState().cameraPreset).toBe("black-side");
    });

    it("should update animation settings", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setAnimations({
        moveDuration: 500,
        enableParticles: false,
      });

      expect(useChess3DStore.getState().animations.moveDuration).toBe(500);
      expect(useChess3DStore.getState().animations.enableParticles).toBe(false);
      // Other values should remain unchanged
      expect(useChess3DStore.getState().animations.moveType).toBe("arc");
    });

    it("should update visual effects", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setEffects({
        selectionGlow: false,
        enableBloom: false,
      });

      expect(useChess3DStore.getState().effects.selectionGlow).toBe(false);
      expect(useChess3DStore.getState().effects.enableBloom).toBe(false);
      // Other values should remain unchanged
      expect(useChess3DStore.getState().effects.enableShadows).toBe(true);
    });

    it("should enable reduce motion and adjust settings", async () => {
      const useChess3DStore = await getStore();

      useChess3DStore.getState().setReduceMotion(true);

      expect(useChess3DStore.getState().reduceMotion).toBe(true);
      expect(useChess3DStore.getState().animations.enableParticles).toBe(false);
      expect(useChess3DStore.getState().animations.moveDuration).toBe(150);
      expect(useChess3DStore.getState().effects.checkmateParticles).toBe(false);
      expect(useChess3DStore.getState().effects.enableBloom).toBe(false);
    });

    it("should reset to defaults", async () => {
      const useChess3DStore = await getStore();

      // Change various settings
      useChess3DStore.getState().setEnable3D(false);
      useChess3DStore.getState().setQualityPreset("ultra");
      useChess3DStore.getState().setTheme("classic-wood");

      // Verify changes
      expect(useChess3DStore.getState().enable3D).toBe(false);
      expect(useChess3DStore.getState().qualityPreset).toBe("ultra");

      // Reset to defaults
      useChess3DStore.getState().resetToDefaults();

      // Verify defaults restored
      expect(useChess3DStore.getState().enable3D).toBe(true);
      expect(useChess3DStore.getState().qualityPreset).toBe("medium");
      expect(useChess3DStore.getState().themeId).toBe("treasure-purple");
      expect(useChess3DStore.getState().reduceMotion).toBe(false);
    });
  });

  describe("Computed Config", () => {
    it("should compute full config correctly", async () => {
      const useChess3DStore = await getStore();
      useChess3DStore.getState().resetToDefaults();

      const config = useChess3DStore.getState().config;

      expect(config).toBeDefined();
      expect(config.renderingMode).toBe("3d-native");
      expect(config.qualityPreset).toBe("medium");
      expect(config.targetFPS).toBe(60);
      expect(config.enableAntialiasing).toBe(true);
      expect(config.theme).toBeDefined();
      expect(config.camera).toBeDefined();
      expect(config.animations).toBeDefined();
      expect(config.effects).toBeDefined();
    });

    it("should set quality preset to low", async () => {
      const useChess3DStore = await getStore();

      // Set quality to low
      useChess3DStore.getState().setQualityPreset("low");

      // Verify quality preset was set
      expect(useChess3DStore.getState().qualityPreset).toBe("low");
    });

    it("should compute theme correctly", async () => {
      const useChess3DStore = await getStore();
      useChess3DStore.getState().resetToDefaults();

      const theme = useChess3DStore.getState().theme;

      expect(theme).toBeDefined();
      expect(theme.id).toBe("treasure-purple");
      expect(theme.name).toBe("Treasure Purple");
    });
  });
});

describe("Selectors", () => {
  it("should select 3D config", async () => {
    const { useChess3DStore, select3DConfig } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const config = select3DConfig(state);

    expect(config).toBeDefined();
    expect(config.renderingMode).toBeDefined();
  });

  it("should select theme", async () => {
    const { useChess3DStore, selectTheme } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const theme = selectTheme(state);

    expect(theme).toBeDefined();
    expect(theme.id).toBeDefined();
  });

  it("should select animations", async () => {
    const { useChess3DStore, selectAnimations } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const animations = selectAnimations(state);

    expect(animations).toBeDefined();
    expect(animations.moveType).toBeDefined();
  });

  it("should select effects", async () => {
    const { useChess3DStore, selectEffects } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const effects = selectEffects(state);

    expect(effects).toBeDefined();
    expect(effects.selectionGlow).toBeDefined();
  });

  it("should select rendering mode", async () => {
    const { useChess3DStore, selectRenderingMode } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const mode = selectRenderingMode(state);

    expect(mode).toBe("3d-native");
  });

  it("should select 3D enabled status", async () => {
    const { useChess3DStore, selectIs3DEnabled } = await import("@/lib/chess3d/store");
    const state = useChess3DStore.getState();
    const enabled = selectIs3DEnabled(state);

    expect(enabled).toBe(true);
  });
});

describe("Quality Detection", () => {
  it("should detect recommended quality", async () => {
    const { detectRecommendedQuality } = await import("@/lib/chess3d/store");
    const quality = detectRecommendedQuality();

    expect(["low", "medium", "high", "ultra"]).toContain(quality);
  });

  it("should apply auto-detected quality when enabled", async () => {
    const { useChess3DStore, applyAutoDetectedQuality } = await import("@/lib/chess3d/store");

    // Ensure auto-detect is enabled
    useChess3DStore.getState().setAutoDetectQuality(true);

    // Apply auto-detected quality
    applyAutoDetectedQuality();

    // Quality should be set (to "medium" in current implementation)
    const state = useChess3DStore.getState();
    expect(["low", "medium", "high", "ultra"]).toContain(state.qualityPreset);
  });
});
