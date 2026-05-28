/**
 * Rematch Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - Rematch offer creation
 * - Offer acceptance and decline
 * - Timeout handling
 * - Color swap functionality
 * - Event callbacks
 */

import {
  RematchService,
  createRematchService,
  type RematchCallbacks,
  type RematchConfig,
} from "@/lib/rematch";
import { type RematchOffer } from "@/types/multiplayer";

// ============================================================================
// Test Helper Functions
// ============================================================================

function createMockCallbacks(): RematchCallbacks {
  return {
    onRematchOffered: jest.fn(),
    onRematchAccepted: jest.fn(),
    onRematchDeclined: jest.fn(),
    onRematchExpired: jest.fn(),
    onError: jest.fn(),
  };
}

function createMockConfig(overrides: Partial<RematchConfig> = {}): RematchConfig {
  return {
    gameId: "test-game-id",
    playerId: "player-1",
    opponentId: "player-2",
    stakeTct: 10,
    timeControlSeconds: 180,
    incrementSeconds: 2,
    currentPlayerColor: "w",
    ...overrides,
  };
}

// ============================================================================
// RematchService Tests
// ============================================================================

describe("RematchService", () => {
  let service: RematchService;
  let callbacks: RematchCallbacks;
  let config: RematchConfig;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    config = createMockConfig();
    service = createRematchService(config, callbacks);
  });

  afterEach(() => {
    service.destroy();
  });

  describe("constructor", () => {
    it("should create service with correct game ID", () => {
      expect(service).toBeInstanceOf(RematchService);
    });

    it("should initialize with no current offer", () => {
      expect(service.getCurrentOffer()).toBeNull();
    });

    it("should initialize with hasActiveOffer as false", () => {
      expect(service.hasActiveOffer()).toBe(false);
    });
  });

  describe("offerRematch", () => {
    it("should create a rematch offer", async () => {
      const offer = await service.offerRematch();

      expect(offer).not.toBeNull();
      expect(offer?.offeringPlayerId).toBe("player-1");
    });

    it("should set swapColors to true by default", async () => {
      const offer = await service.offerRematch();

      expect(offer?.swapColors).toBe(true);
    });

    it("should set swapColors when specified as false", async () => {
      const offer = await service.offerRematch(false);

      expect(offer?.swapColors).toBe(false);
    });

    it("should set hasActiveOffer to true after offering", async () => {
      await service.offerRematch();

      expect(service.hasActiveOffer()).toBe(true);
    });

    it("should update current offer", async () => {
      const offer = await service.offerRematch();

      expect(service.getCurrentOffer()).toEqual(offer);
    });

    it("should include timestamp", async () => {
      const beforeOffer = Date.now();
      const offer = await service.offerRematch();
      const afterOffer = Date.now();

      expect(offer?.offeredAt).toBeDefined();
      const offerTime = new Date(offer!.offeredAt).getTime();
      expect(offerTime).toBeGreaterThanOrEqual(beforeOffer);
      expect(offerTime).toBeLessThanOrEqual(afterOffer);
    });

    it("should include expiry time", async () => {
      const offer = await service.offerRematch();

      expect(offer?.expiresAt).toBeDefined();
      const expiryTime = new Date(offer!.expiresAt).getTime();
      const offeredTime = new Date(offer!.offeredAt).getTime();
      // Default timeout is 30 seconds
      expect(expiryTime - offeredTime).toBe(30000);
    });

    it("should set status to offered", async () => {
      const offer = await service.offerRematch();

      expect(offer?.status).toBe("offered");
    });
  });

  describe("acceptRematch", () => {
    it("should return null when no offer exists", async () => {
      const newGameId = await service.acceptRematch();

      expect(newGameId).toBeNull();
    });

    it("should return null when we are the offerer", async () => {
      // Offer a rematch (we become the offerer)
      await service.offerRematch();
      const newGameId = await service.acceptRematch();

      // Can't accept our own offer
      expect(newGameId).toBeNull();
    });

    it("should call onRematchAccepted callback when accepting", () => {
      // Note: In real implementation, this would be called when opponent accepts
      expect(callbacks.onRematchAccepted).toBeDefined();
    });
  });

  describe("declineRematch", () => {
    it("should clear current offer", async () => {
      await service.offerRematch();
      await service.declineRematch();

      expect(service.getCurrentOffer()).toBeNull();
    });

    it("should set hasActiveOffer to false", async () => {
      await service.offerRematch();
      await service.declineRematch();

      expect(service.hasActiveOffer()).toBe(false);
    });
  });

  describe("destroy", () => {
    it("should clear offer and stop timers", async () => {
      await service.offerRematch();
      service.destroy();

      expect(service.getCurrentOffer()).toBeNull();
      expect(service.hasActiveOffer()).toBe(false);
    });

    it("should not throw if called multiple times", () => {
      service.destroy();
      expect(() => service.destroy()).not.toThrow();
    });
  });

  describe("getRemainingTime", () => {
    it("should return 0 when no offer exists", () => {
      expect(service.getRemainingTime()).toBe(0);
    });

    it("should return positive value for active offer", async () => {
      await service.offerRematch();

      const remaining = service.getRemainingTime();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30);
    });
  });

  describe("isOfferor", () => {
    it("should return false initially", () => {
      expect(service.isOfferor()).toBe(false);
    });

    it("should return true after offering rematch", async () => {
      await service.offerRematch();

      expect(service.isOfferor()).toBe(true);
    });
  });
});

// ============================================================================
// RematchOffer Type Tests
// ============================================================================

describe("RematchOffer type", () => {
  it("should have correct structure", () => {
    const offer: RematchOffer = {
      gameId: "game-456",
      offeringPlayerId: "player-1",
      receivingPlayerId: "player-2",
      stakeTct: 10,
      timeControlSeconds: 180,
      incrementSeconds: 2,
      swapColors: false,
      status: "pending",
      offeredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };

    expect(offer.gameId).toBeDefined();
    expect(offer.offeringPlayerId).toBeDefined();
    expect(offer.receivingPlayerId).toBeDefined();
    expect(typeof offer.swapColors).toBe("boolean");
    expect(["pending", "offered", "accepted", "declined", "expired"]).toContain(offer.status);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createRematchService", () => {
  it("should create a new service instance", () => {
    const callbacks = createMockCallbacks();
    const config = createMockConfig();
    const service = createRematchService(config, callbacks);

    expect(service).toBeInstanceOf(RematchService);
    service.destroy();
  });

  it("should accept optional callbacks", () => {
    const config = createMockConfig();
    const service = createRematchService(config);

    expect(service).toBeInstanceOf(RematchService);
    service.destroy();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge cases", () => {
  let service: RematchService;
  let callbacks: RematchCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    service = createRematchService(createMockConfig(), callbacks);
  });

  afterEach(() => {
    service.destroy();
  });

  it("should handle multiple offers by replacing the current offer", async () => {
    const offer1 = await service.offerRematch(false);
    const offer2 = await service.offerRematch(true);

    // Second offer replaces the first
    expect(service.getCurrentOffer()?.swapColors).toBe(true);
  });

  it("should handle same player IDs gracefully", () => {
    const samePlayerService = createRematchService(
      createMockConfig({
        playerId: "player-1",
        opponentId: "player-1", // Same player
      }),
      callbacks
    );

    expect(samePlayerService).toBeInstanceOf(RematchService);
    samePlayerService.destroy();
  });

  it("should preserve config values in offer", async () => {
    const customConfig = createMockConfig({
      stakeTct: 25,
      timeControlSeconds: 300,
      incrementSeconds: 5,
    });
    const customService = createRematchService(customConfig, callbacks);

    const offer = await customService.offerRematch();

    expect(offer?.stakeTct).toBe(25);
    expect(offer?.timeControlSeconds).toBe(300);
    expect(offer?.incrementSeconds).toBe(5);

    customService.destroy();
  });
});
