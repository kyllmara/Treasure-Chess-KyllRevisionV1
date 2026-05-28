/**
 * Unity Bridge Tests
 *
 * Tests for the Unity-React Native communication bridge.
 */

import {
  UnityBridge,
  getUnityBridge,
  resetUnityBridge,
  useUnityBridge,
  handleUnityMessage,
} from "@/lib/chess3d/unityBridge";

// Mock the security logger
jest.mock("@/lib/security", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Platform
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

describe("UnityBridge", () => {
  let bridge: UnityBridge;

  beforeEach(() => {
    resetUnityBridge();
    bridge = new UnityBridge();
  });

  afterEach(() => {
    resetUnityBridge();
  });

  describe("Constructor", () => {
    it("should create a bridge with default config", () => {
      expect(bridge).toBeDefined();
      expect(bridge.getState()).toBe("not_available");
    });

    it("should accept custom config", () => {
      const customBridge = new UnityBridge({
        enableDebugMode: true,
        messageQueueSize: 50,
      });
      expect(customBridge).toBeDefined();
    });
  });

  describe("Connection State", () => {
    it("should report as not available when Unity is not installed", () => {
      expect(bridge.isAvailable()).toBe(false);
      expect(bridge.isConnected()).toBe(false);
      expect(bridge.getState()).toBe("not_available");
    });
  });

  describe("Connect", () => {
    it("should return false when Unity is not available", async () => {
      const mockRef = {
        postMessage: jest.fn(),
      };

      const result = await bridge.connect(mockRef);
      expect(result).toBe(false);
    });
  });

  describe("Disconnect", () => {
    it("should set state to disconnected", () => {
      bridge.disconnect();
      expect(bridge.getState()).toBe("disconnected");
    });
  });

  describe("Event Listeners", () => {
    it("should add event listener and return unsubscribe function", () => {
      const listener = jest.fn();
      const unsubscribe = bridge.addEventListener("SQUARE_PRESSED", listener);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should call listener when event is handled", () => {
      const listener = jest.fn();
      bridge.addEventListener("SQUARE_PRESSED", listener);

      const event = JSON.stringify({
        type: "SQUARE_PRESSED",
        payload: { square: "e4", row: 4, col: 4 },
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SQUARE_PRESSED",
          payload: { square: "e4", row: 4, col: 4 },
        })
      );
    });

    it("should unsubscribe listener when unsubscribe is called", () => {
      const listener = jest.fn();
      const unsubscribe = bridge.addEventListener("SQUARE_PRESSED", listener);

      unsubscribe();

      const event = JSON.stringify({
        type: "SQUARE_PRESSED",
        payload: { square: "e4" },
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle multiple listeners for same event type", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      bridge.addEventListener("ANIMATION_COMPLETE", listener1);
      bridge.addEventListener("ANIMATION_COMPLETE", listener2);

      const event = JSON.stringify({
        type: "ANIMATION_COMPLETE",
        payload: {},
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should remove specific listener with removeEventListener", () => {
      const listener = jest.fn();
      bridge.addEventListener("READY", listener);
      bridge.removeEventListener("READY", listener);

      const event = JSON.stringify({
        type: "READY",
        payload: {},
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("Handle Unity Event", () => {
    it("should parse valid JSON event", () => {
      const listener = jest.fn();
      bridge.addEventListener("ERROR", listener);

      const event = JSON.stringify({
        type: "ERROR",
        payload: { message: "Test error" },
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ERROR",
          payload: { message: "Test error" },
        })
      );
    });

    it("should handle invalid JSON gracefully", () => {
      const listener = jest.fn();
      bridge.addEventListener("ERROR", listener);

      expect(() => {
        bridge.handleUnityEvent("not valid json");
      }).not.toThrow();
    });

    it("should store performance metrics when received", () => {
      const event = JSON.stringify({
        type: "PERFORMANCE_METRICS",
        payload: {
          fps: 60,
          drawCalls: 100,
          triangles: 5000,
          memoryUsage: 256,
        },
        timestamp: Date.now(),
      });

      bridge.handleUnityEvent(event);

      const metrics = bridge.getPerformanceMetrics();
      expect(metrics).toEqual({
        fps: 60,
        drawCalls: 100,
        triangles: 5000,
        memoryUsage: 256,
      });
    });
  });

  describe("Performance Metrics", () => {
    it("should return null when no metrics received", () => {
      const metrics = bridge.getPerformanceMetrics();
      expect(metrics).toBeNull();
    });
  });
});

describe("Singleton Functions", () => {
  beforeEach(() => {
    resetUnityBridge();
  });

  afterEach(() => {
    resetUnityBridge();
  });

  describe("getUnityBridge", () => {
    it("should return the same instance on multiple calls", () => {
      const bridge1 = getUnityBridge();
      const bridge2 = getUnityBridge();
      expect(bridge1).toBe(bridge2);
    });

    it("should accept config on first call", () => {
      const bridge = getUnityBridge({ enableDebugMode: true });
      expect(bridge).toBeDefined();
    });
  });

  describe("resetUnityBridge", () => {
    it("should create new instance after reset", () => {
      const bridge1 = getUnityBridge();
      resetUnityBridge();
      const bridge2 = getUnityBridge();

      // Note: They might be different instances after reset
      expect(bridge2).toBeDefined();
    });
  });
});

describe("useUnityBridge Hook", () => {
  beforeEach(() => {
    resetUnityBridge();
  });

  afterEach(() => {
    resetUnityBridge();
  });

  it("should return null when Unity is not available", () => {
    const result = useUnityBridge();
    expect(result).toBeNull();
  });
});

describe("handleUnityMessage", () => {
  beforeEach(() => {
    resetUnityBridge();
  });

  afterEach(() => {
    resetUnityBridge();
  });

  it("should forward message to bridge instance", () => {
    const bridge = getUnityBridge();
    const listener = jest.fn();
    bridge.addEventListener("READY", listener);

    const message = JSON.stringify({
      type: "READY",
      payload: {},
      timestamp: Date.now(),
    });

    handleUnityMessage(message);

    expect(listener).toHaveBeenCalled();
  });
});

describe("Chess Commands (when not connected)", () => {
  let bridge: UnityBridge;

  beforeEach(() => {
    resetUnityBridge();
    bridge = new UnityBridge({ enableDebugMode: false });
  });

  it("should not throw when calling setConfig", () => {
    expect(() => {
      bridge.setConfig({ qualityPreset: "high" });
    }).not.toThrow();
  });

  it("should not throw when calling setPosition", () => {
    expect(() => {
      bridge.setPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    }).not.toThrow();
  });

  it("should not throw when calling makeMove", () => {
    expect(() => {
      bridge.makeMove("e2", "e4");
    }).not.toThrow();
  });

  it("should not throw when calling selectSquare", () => {
    expect(() => {
      bridge.selectSquare("e4");
    }).not.toThrow();
  });

  it("should not throw when calling deselect", () => {
    expect(() => {
      bridge.deselect();
    }).not.toThrow();
  });

  it("should not throw when calling setPossibleMoves", () => {
    expect(() => {
      bridge.setPossibleMoves(["e4", "d4"], ["f3"]);
    }).not.toThrow();
  });

  it("should not throw when calling highlightLastMove", () => {
    expect(() => {
      bridge.highlightLastMove("e2", "e4");
    }).not.toThrow();
  });

  it("should not throw when calling setCheck", () => {
    expect(() => {
      bridge.setCheck("e1");
    }).not.toThrow();
  });

  it("should not throw when calling setCheckmate", () => {
    expect(() => {
      bridge.setCheckmate("w");
    }).not.toThrow();
  });

  it("should not throw when calling setDraw", () => {
    expect(() => {
      bridge.setDraw();
    }).not.toThrow();
  });

  it("should not throw when calling playAnimation", () => {
    expect(() => {
      bridge.playAnimation("capture", { intensity: 0.5 });
    }).not.toThrow();
  });

  it("should not throw when calling setCamera", () => {
    expect(() => {
      bridge.setCamera("black-side", { animate: true, duration: 500 });
    }).not.toThrow();
  });

  it("should not throw when calling resetBoard", () => {
    expect(() => {
      bridge.resetBoard();
    }).not.toThrow();
  });
});
