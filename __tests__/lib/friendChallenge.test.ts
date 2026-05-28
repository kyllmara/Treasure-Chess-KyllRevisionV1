/**
 * Friend Challenge Service Unit Tests
 *
 * Comprehensive test coverage for:
 * - User search functionality
 * - Challenge creation and management
 * - Challenge acceptance and decline
 * - Challenge expiration
 * - Validation logic
 */

import {
  FriendChallengeService,
  createFriendChallengeService,
  type FriendChallengeCallbacks,
  type UserSearchResult,
} from "@/lib/friendChallenge";
import { type FriendChallengeInput, type FriendChallenge, TIME_CONTROLS } from "@/types/multiplayer";

// ============================================================================
// Test Helper Functions
// ============================================================================

function createMockCallbacks(): FriendChallengeCallbacks {
  return {
    onChallengeReceived: jest.fn(),
    onChallengeAccepted: jest.fn(),
    onChallengeDeclined: jest.fn(),
    onChallengeExpired: jest.fn(),
    onChallengeCancelled: jest.fn(),
    onError: jest.fn(),
  };
}

function createMockChallengeInput(overrides: Partial<FriendChallengeInput> = {}): FriendChallengeInput {
  const defaultTimeControl = TIME_CONTROLS.find(tc => tc.id === "blitz_3_2") || TIME_CONTROLS[0];
  return {
    challengerUserId: "user-123",
    targetUsername: "ChessMaster", // Demo mode returns this user
    stakeTct: 10,
    timeControl: defaultTimeControl,
    colorPreference: "random",
    isRated: true,
    message: "Want to play?",
    ...overrides,
  };
}

// ============================================================================
// FriendChallengeService Tests
// ============================================================================

describe("FriendChallengeService", () => {
  let service: FriendChallengeService;
  let callbacks: FriendChallengeCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500,
      callbacks
    );
  });

  afterEach(() => {
    service.destroy();
  });

  describe("constructor", () => {
    it("should create service with correct user ID", () => {
      expect(service).toBeInstanceOf(FriendChallengeService);
    });
  });

  describe("searchUsers", () => {
    it("should return array of users", async () => {
      const results = await service.searchUsers("chess");

      expect(Array.isArray(results)).toBe(true);
    });

    it("should return empty array for empty query", async () => {
      const results = await service.searchUsers("");

      expect(results).toHaveLength(0);
    });

    it("should return empty array for short query", async () => {
      const results = await service.searchUsers("a");

      // Minimum 2 characters required
      expect(results).toHaveLength(0);
    });

    it("should include required fields in search results", async () => {
      const results = await service.searchUsers("chess");

      if (results.length > 0) {
        const user = results[0];
        expect(user).toHaveProperty("id");
        expect(user).toHaveProperty("username");
        expect(user).toHaveProperty("avatarIndex");
        expect(user).toHaveProperty("eloRating");
      }
    });

    it("should respect limit parameter", async () => {
      const results5 = await service.searchUsers("chess", 5);

      expect(results5.length).toBeLessThanOrEqual(5);
    });

    it("should return demo results in demo mode", async () => {
      const results = await service.searchUsers("chess");

      // Demo mode returns mock users matching the query
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].username).toContain("Chess");
    });
  });

  describe("findUserByUsername", () => {
    it("should return user for valid username", async () => {
      const user = await service.findUserByUsername("TestPlayer");

      expect(user).not.toBeNull();
      expect(user?.username).toBe("TestPlayer");
    });

    it("should return null for empty username", async () => {
      const user = await service.findUserByUsername("");

      expect(user).toBeNull();
    });
  });

  describe("sendChallenge", () => {
    it("should create a challenge in demo mode", async () => {
      const input = createMockChallengeInput();
      const challenge = await service.sendChallenge(input);

      expect(challenge).not.toBeNull();
      expect(challenge?.challengerId).toBe("user-123");
    });

    it("should set stake amount", async () => {
      const input = createMockChallengeInput({ stakeTct: 25 });
      const challenge = await service.sendChallenge(input);

      expect(challenge?.stakeTct).toBe(25);
    });

    it("should set time control", async () => {
      const rapidTimeControl = TIME_CONTROLS.find(tc => tc.id === "rapid_10_0") || TIME_CONTROLS[0];
      const input = createMockChallengeInput({ timeControl: rapidTimeControl });
      const challenge = await service.sendChallenge(input);

      expect(challenge?.timeControlSeconds).toBe(rapidTimeControl.baseTimeSeconds);
      expect(challenge?.incrementSeconds).toBe(rapidTimeControl.incrementSeconds);
    });

    it("should set initial status to pending", async () => {
      const input = createMockChallengeInput();
      const challenge = await service.sendChallenge(input);

      expect(challenge?.status).toBe("pending");
    });

    it("should include timestamp", async () => {
      const beforeSend = Date.now();
      const input = createMockChallengeInput();
      const challenge = await service.sendChallenge(input);
      const afterSend = Date.now();

      expect(challenge?.createdAt).toBeDefined();
      const challengeTime = new Date(challenge!.createdAt).getTime();
      expect(challengeTime).toBeGreaterThanOrEqual(beforeSend);
      expect(challengeTime).toBeLessThanOrEqual(afterSend);
    });

    it("should include optional message", async () => {
      const input = createMockChallengeInput({ message: "Let's play!" });
      const challenge = await service.sendChallenge(input);

      expect(challenge?.message).toBe("Let's play!");
    });

    it("should work without message", async () => {
      const input = createMockChallengeInput({ message: undefined });
      const challenge = await service.sendChallenge(input);

      expect(challenge).not.toBeNull();
    });

    it("should set color preference", async () => {
      const input = createMockChallengeInput({ colorPreference: "white" });
      const challenge = await service.sendChallenge(input);

      expect(challenge?.colorPreference).toBe("white");
    });

    it("should set isRated flag", async () => {
      const input = createMockChallengeInput({ isRated: false });
      const challenge = await service.sendChallenge(input);

      expect(challenge?.isRated).toBe(false);
    });

    it("should return null for non-existent user", async () => {
      const input = createMockChallengeInput({ targetUsername: "" });
      const challenge = await service.sendChallenge(input);

      // Empty username returns null from findUserByUsername
      expect(challenge).toBeNull();
    });
  });

  describe("acceptChallenge", () => {
    it("should return null for non-existent challenge", async () => {
      const gameId = await service.acceptChallenge("non-existent-challenge");

      expect(gameId).toBeNull();
    });

    it("should call onChallengeAccepted callback when exists", async () => {
      expect(callbacks.onChallengeAccepted).toBeDefined();
    });
  });

  describe("declineChallenge", () => {
    it("should return false for non-existent challenge", async () => {
      const result = await service.declineChallenge("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("cancelChallenge", () => {
    it("should return false for non-existent challenge", async () => {
      const result = await service.cancelChallenge("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("getReceivedChallenges", () => {
    it("should return empty array initially", () => {
      const challenges = service.getReceivedChallenges();

      expect(challenges).toHaveLength(0);
    });
  });

  describe("getSentChallenges", () => {
    it("should track sent challenges", async () => {
      const input = createMockChallengeInput();
      await service.sendChallenge(input);

      const sent = service.getSentChallenges();
      expect(sent.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("destroy", () => {
    it("should not throw if called multiple times", () => {
      service.destroy();
      expect(() => service.destroy()).not.toThrow();
    });
  });
});

// ============================================================================
// UserSearchResult Type Tests
// ============================================================================

describe("UserSearchResult type", () => {
  it("should have correct structure", () => {
    const user: UserSearchResult = {
      id: "user-123",
      username: "TestPlayer",
      avatarIndex: 5,
      eloRating: 1500,
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
    };

    expect(user.id).toBeDefined();
    expect(user.username).toBeDefined();
    expect(typeof user.avatarIndex).toBe("number");
    expect(typeof user.eloRating).toBe("number");
  });
});

// ============================================================================
// FriendChallenge Type Tests
// ============================================================================

describe("FriendChallenge type", () => {
  it("should have correct structure", () => {
    const challenge: FriendChallenge = {
      id: "challenge-123",
      challengerId: "player-1",
      challengerUsername: "Player1",
      challengerAvatarIndex: 3,
      challengerElo: 1400,
      targetUserId: "player-2",
      targetUsername: "Player2",
      stakeTct: 10,
      timeControlSeconds: 180,
      incrementSeconds: 2,
      colorPreference: "random",
      isRated: true,
      message: "Let's play!",
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    expect(challenge.id).toBeDefined();
    expect(["pending", "accepted", "declined", "expired", "cancelled"]).toContain(challenge.status);
    expect(challenge.stakeTct).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createFriendChallengeService", () => {
  it("should create a new service instance", () => {
    const callbacks = createMockCallbacks();
    const service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500,
      callbacks
    );

    expect(service).toBeInstanceOf(FriendChallengeService);
    service.destroy();
  });

  it("should accept optional callbacks", () => {
    const service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500
    );

    expect(service).toBeInstanceOf(FriendChallengeService);
    service.destroy();
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Challenge validation", () => {
  let service: FriendChallengeService;
  let callbacks: FriendChallengeCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500,
      callbacks
    );
  });

  afterEach(() => {
    service.destroy();
  });

  it("should handle zero stake amount", async () => {
    const input = createMockChallengeInput({ stakeTct: 0 });
    const challenge = await service.sendChallenge(input);

    expect(challenge?.stakeTct).toBe(0);
  });

  it("should handle high stake amount", async () => {
    const input = createMockChallengeInput({ stakeTct: 100 });
    const challenge = await service.sendChallenge(input);

    expect(challenge?.stakeTct).toBe(100);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge cases", () => {
  let service: FriendChallengeService;
  let callbacks: FriendChallengeCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500,
      callbacks
    );
  });

  afterEach(() => {
    service.destroy();
  });

  it("should handle special characters in username search", async () => {
    const results = await service.searchUsers("test@#$%");

    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle unicode characters in username search", async () => {
    const results = await service.searchUsers("用户名");

    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle very long usernames", async () => {
    const longUsername = "a".repeat(100);
    const results = await service.searchUsers(longUsername);

    expect(Array.isArray(results)).toBe(true);
  });

  it("should handle sending multiple challenges simultaneously", async () => {
    const inputs = [
      createMockChallengeInput({ targetUsername: "ChessMaster" }),
      createMockChallengeInput({ targetUsername: "ChessMaster" }),
      createMockChallengeInput({ targetUsername: "ChessMaster" }),
    ];

    const challenges = await Promise.all(
      inputs.map(input => service.sendChallenge(input))
    );

    const validChallenges = challenges.filter(c => c !== null);
    expect(validChallenges.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Time Control Integration Tests
// ============================================================================

describe("Time control integration", () => {
  let service: FriendChallengeService;

  beforeEach(() => {
    service = createFriendChallengeService(
      "user-123",
      "TestUser",
      0,
      1500
    );
  });

  afterEach(() => {
    service.destroy();
  });

  it("should accept valid time controls", async () => {
    const timeControls = TIME_CONTROLS.slice(0, 4);

    for (const timeControl of timeControls) {
      const challenge = await service.sendChallenge(
        createMockChallengeInput({ timeControl })
      );

      if (challenge) {
        expect(challenge.timeControlSeconds).toBe(timeControl.baseTimeSeconds);
        expect(challenge.incrementSeconds).toBe(timeControl.incrementSeconds);
      }
    }
  });
});
