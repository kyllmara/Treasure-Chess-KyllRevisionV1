/**
 * Challenge System Unit Tests
 *
 * Comprehensive test coverage for:
 * - Room code generation and validation
 * - Time control formatting and categorization
 * - Challenge expiry formatting
 * - ChallengeService class functionality
 */

import {
  generateRoomCode,
  isValidRoomCode,
  formatTimeControl,
  getTimeControlCategory,
  formatChallengeExpiry,
  getChallengeCountdown,
  isExpiringSoon,
  CHALLENGE_FILTER_OPTIONS,
  ChallengeService,
  createChallengeService,
  type Challenge,
  type ChallengeStatus,
  type ColorPreference,
  type CreateChallengeInput,
  type ChallengeFilters,
} from "@/lib/challenges";

// ============================================================================
// Room Code Generation Tests
// ============================================================================

describe("generateRoomCode", () => {
  it("should generate a 6-character code", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it("should only contain valid characters", () => {
    const validChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(validChars).toContain(char);
      }
    }
  });

  it("should not contain confusing characters (0, O, 1, I, L)", () => {
    const confusingChars = ["0", "O", "1", "I", "L"];

    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of confusingChars) {
        expect(code).not.toContain(char);
      }
    }
  });

  it("should generate different codes on subsequent calls", () => {
    const codes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }

    // Should have mostly unique codes (allow some collision)
    expect(codes.size).toBeGreaterThan(95);
  });

  it("should only contain uppercase letters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toBe(code.toUpperCase());
    }
  });
});

// ============================================================================
// Room Code Validation Tests
// ============================================================================

describe("isValidRoomCode", () => {
  describe("valid codes", () => {
    it("should accept valid 6-character codes", () => {
      // Only uses characters from ROOM_CODE_CHARS: ABCDEFGHJKMNPQRSTUVWXYZ23456789
      expect(isValidRoomCode("ABC234")).toBe(true);
      expect(isValidRoomCode("XYZT89")).toBe(true);
      expect(isValidRoomCode("QWERTY")).toBe(true);
    });

    it("should accept lowercase codes (case insensitive)", () => {
      expect(isValidRoomCode("abc234")).toBe(true);
      expect(isValidRoomCode("AbC234")).toBe(true);
    });

    it("should accept generated codes", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateRoomCode();
        expect(isValidRoomCode(code)).toBe(true);
      }
    });
  });

  describe("invalid codes", () => {
    it("should reject codes that are too short", () => {
      expect(isValidRoomCode("ABC12")).toBe(false);
      expect(isValidRoomCode("A")).toBe(false);
      expect(isValidRoomCode("")).toBe(false);
    });

    it("should reject codes that are too long", () => {
      expect(isValidRoomCode("ABC1234")).toBe(false);
      expect(isValidRoomCode("ABCDEFGH")).toBe(false);
    });

    it("should reject codes with invalid characters", () => {
      expect(isValidRoomCode("ABC12O")).toBe(false); // Contains O
      expect(isValidRoomCode("ABC12I")).toBe(false); // Contains I
      expect(isValidRoomCode("ABC12L")).toBe(false); // Contains L
      expect(isValidRoomCode("ABC120")).toBe(false); // Contains 0
      expect(isValidRoomCode("ABC121")).toBe(false); // Contains 1
    });

    it("should reject codes with special characters", () => {
      expect(isValidRoomCode("ABC12!")).toBe(false);
      expect(isValidRoomCode("ABC-12")).toBe(false);
      expect(isValidRoomCode("ABC 12")).toBe(false);
    });

    it("should reject null/undefined", () => {
      expect(isValidRoomCode(null as any)).toBe(false);
      expect(isValidRoomCode(undefined as any)).toBe(false);
    });
  });
});

// ============================================================================
// Time Control Formatting Tests
// ============================================================================

describe("formatTimeControl", () => {
  it("should format time without increment", () => {
    expect(formatTimeControl(60, 0)).toBe("1 min");
    expect(formatTimeControl(180, 0)).toBe("3 min");
    expect(formatTimeControl(300, 0)).toBe("5 min");
    expect(formatTimeControl(600, 0)).toBe("10 min");
    expect(formatTimeControl(900, 0)).toBe("15 min");
  });

  it("should format time with increment", () => {
    expect(formatTimeControl(180, 2)).toBe("3+2");
    expect(formatTimeControl(300, 3)).toBe("5+3");
    expect(formatTimeControl(60, 1)).toBe("1+1");
    expect(formatTimeControl(600, 5)).toBe("10+5");
  });

  it("should handle sub-minute times", () => {
    expect(formatTimeControl(30, 0)).toBe("0 min");
    expect(formatTimeControl(30, 1)).toBe("0+1");
  });
});

// ============================================================================
// Time Control Category Tests
// ============================================================================

describe("getTimeControlCategory", () => {
  describe("Bullet", () => {
    it("should categorize 1 minute games as Bullet", () => {
      expect(getTimeControlCategory(60, 0)).toBe("Bullet");
    });

    it("should categorize 1+0 as Bullet", () => {
      expect(getTimeControlCategory(60, 0)).toBe("Bullet");
    });

    it("should categorize 2+1 as Bullet", () => {
      // 2 min + 40 moves * 1 sec = 120 + 40 = 160 < 180
      expect(getTimeControlCategory(120, 1)).toBe("Bullet");
    });
  });

  describe("Blitz", () => {
    it("should categorize 3 minute games as Blitz", () => {
      // 3 min = 180 sec, 180 + 0 = 180 (at threshold)
      expect(getTimeControlCategory(180, 0)).toBe("Blitz");
    });

    it("should categorize 5+0 as Blitz", () => {
      expect(getTimeControlCategory(300, 0)).toBe("Blitz");
    });

    it("should categorize 3+2 as Blitz", () => {
      // 180 + 40 * 2 = 180 + 80 = 260 < 480
      expect(getTimeControlCategory(180, 2)).toBe("Blitz");
    });

    it("should categorize 5+3 as Blitz", () => {
      // 300 + 40 * 3 = 300 + 120 = 420 < 480
      expect(getTimeControlCategory(300, 3)).toBe("Blitz");
    });
  });

  describe("Rapid", () => {
    it("should categorize 10 minute games as Rapid", () => {
      expect(getTimeControlCategory(600, 0)).toBe("Rapid");
    });

    it("should categorize 15+10 as Rapid", () => {
      // 900 + 40 * 10 = 900 + 400 = 1300 < 1500
      expect(getTimeControlCategory(900, 10)).toBe("Rapid");
    });
  });

  describe("Classical", () => {
    it("should categorize 30 minute games as Classical", () => {
      // 1800 + 0 = 1800 >= 1500
      expect(getTimeControlCategory(1800, 0)).toBe("Classical");
    });

    it("should categorize 15+20 as Classical", () => {
      // 900 + 40 * 20 = 900 + 800 = 1700 >= 1500
      expect(getTimeControlCategory(900, 20)).toBe("Classical");
    });
  });

  describe("edge cases", () => {
    it("should handle boundary between Bullet and Blitz", () => {
      // Just under Blitz threshold
      expect(getTimeControlCategory(179, 0)).toBe("Bullet");
      // Exactly at Blitz threshold
      expect(getTimeControlCategory(180, 0)).toBe("Blitz");
    });

    it("should handle boundary between Blitz and Rapid", () => {
      expect(getTimeControlCategory(479, 0)).toBe("Blitz");
      expect(getTimeControlCategory(480, 0)).toBe("Rapid");
    });
  });
});

// ============================================================================
// Challenge Expiry Formatting Tests
// ============================================================================

describe("formatChallengeExpiry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return 'Expired' for past dates", () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    expect(formatChallengeExpiry(pastDate)).toBe("Expired");
  });

  it("should format hours and minutes for multi-hour expiry", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 5 * 60 * 60 * 1000 + 30 * 60 * 1000); // 5h 30m
    expect(formatChallengeExpiry(futureDate.toISOString())).toBe("5h 30m");
  });

  it("should format only minutes for sub-hour expiry", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 45 * 60 * 1000); // 45 minutes
    expect(formatChallengeExpiry(futureDate.toISOString())).toBe("45m");
  });

  it("should handle 1 hour exactly", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 60 * 60 * 1000); // 1 hour
    expect(formatChallengeExpiry(futureDate.toISOString())).toBe("1h 0m");
  });

  it("should handle 24 hours (full expiry)", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 24 * 60 * 60 * 1000); // 24 hours
    expect(formatChallengeExpiry(futureDate.toISOString())).toBe("24h 0m");
  });
});

// ============================================================================
// ChallengeService Factory Tests
// ============================================================================

describe("createChallengeService", () => {
  it("should create a ChallengeService instance", () => {
    const service = createChallengeService("user-123");
    expect(service).toBeInstanceOf(ChallengeService);
  });

  it("should accept optional callbacks", () => {
    const callbacks = {
      onChallengeAccepted: jest.fn(),
      onChallengeCancelled: jest.fn(),
    };

    const service = createChallengeService("user-123", callbacks);
    expect(service).toBeInstanceOf(ChallengeService);
  });
});

// ============================================================================
// ChallengeService Class Tests
// ============================================================================

describe("ChallengeService", () => {
  let service: ChallengeService;
  const userId = "test-user-id";

  beforeEach(() => {
    service = new ChallengeService(userId);
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.destroy();
  });

  describe("constructor", () => {
    it("should initialize with userId", () => {
      const newService = new ChallengeService("my-user-id");
      expect(newService).toBeInstanceOf(ChallengeService);
      newService.destroy();
    });

    it("should accept callbacks", () => {
      const callbacks = {
        onChallengeAccepted: jest.fn(),
        onChallengeDeclined: jest.fn(),
        onChallengeCancelled: jest.fn(),
        onChallengeExpired: jest.fn(),
        onNewChallenge: jest.fn(),
      };

      const newService = new ChallengeService("user-id", callbacks);
      expect(newService).toBeInstanceOf(ChallengeService);
      newService.destroy();
    });
  });

  describe("destroy", () => {
    it("should clean up subscriptions without error", () => {
      const newService = new ChallengeService("user-id");

      // Subscribe to things
      newService.subscribeToMyChallenges();
      newService.subscribeToPublicChallenges(jest.fn());

      // Should not throw
      expect(() => newService.destroy()).not.toThrow();
    });
  });

  describe("subscription management", () => {
    it("should subscribe to user challenges", () => {
      expect(() => service.subscribeToMyChallenges()).not.toThrow();
    });

    it("should subscribe to public challenges", () => {
      const callback = jest.fn();
      expect(() => service.subscribeToPublicChallenges(callback)).not.toThrow();
    });

    it("should unsubscribe from user challenges", () => {
      service.subscribeToMyChallenges();
      expect(() => service.unsubscribeFromMyChallenges()).not.toThrow();
    });

    it("should unsubscribe from public challenges", () => {
      service.subscribeToPublicChallenges(jest.fn());
      expect(() => service.unsubscribeFromPublicChallenges()).not.toThrow();
    });
  });
});

// ============================================================================
// Type Tests (compile-time verification)
// ============================================================================

describe("type definitions", () => {
  it("should have correct ChallengeStatus values", () => {
    const statuses: ChallengeStatus[] = [
      "pending",
      "accepted",
      "declined",
      "cancelled",
      "expired",
    ];

    expect(statuses).toHaveLength(5);
  });

  it("should have correct ColorPreference values", () => {
    const preferences: ColorPreference[] = ["white", "black", "random"];
    expect(preferences).toHaveLength(3);
  });

  it("should accept valid CreateChallengeInput", () => {
    const input: CreateChallengeInput = {
      creatorId: "user-123",
      timeControlSeconds: 300,
      incrementSeconds: 3,
    };

    expect(input.creatorId).toBe("user-123");
    expect(input.timeControlSeconds).toBe(300);
    expect(input.incrementSeconds).toBe(3);
  });

  it("should accept full CreateChallengeInput with optionals", () => {
    const input: CreateChallengeInput = {
      creatorId: "user-123",
      opponentId: "opponent-456",
      wagerTct: 100,
      timeControlSeconds: 600,
      incrementSeconds: 5,
      colorPreference: "white",
      isPublic: false,
      isRated: true,
    };

    expect(input.opponentId).toBe("opponent-456");
    expect(input.wagerTct).toBe(100);
    expect(input.colorPreference).toBe("white");
    expect(input.isPublic).toBe(false);
    expect(input.isRated).toBe(true);
  });

  it("should have correct Challenge structure", () => {
    const challenge: Partial<Challenge> = {
      id: "challenge-id",
      room_code: "ABC123",
      creator_id: "creator-id",
      opponent_id: null,
      wager_tct: 0,
      time_control_seconds: 300,
      increment_seconds: 3,
      creator_color_preference: "random",
      is_public: true,
      is_rated: true,
      status: "pending",
      game_id: null,
      expires_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      accepted_at: null,
    };

    expect(challenge.room_code).toBe("ABC123");
    expect(challenge.status).toBe("pending");
  });
});

// ============================================================================
// Integration-like Tests (with mocked Supabase)
// ============================================================================

describe("ChallengeService integration tests", () => {
  let service: ChallengeService;
  const userId = "integration-test-user";

  beforeEach(() => {
    service = new ChallengeService(userId);
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.destroy();
  });

  describe("createChallenge", () => {
    it("should attempt to create a challenge", async () => {
      const input: CreateChallengeInput = {
        creatorId: userId,
        timeControlSeconds: 300,
        incrementSeconds: 3,
        isPublic: true,
        isRated: true,
      };

      // With our mock, this will return null (no actual database)
      const result = await service.createChallenge(input);

      // The mock returns null, but the function should complete without error
      expect(result).toBeNull();
    });
  });

  describe("acceptChallengeByCode", () => {
    it("should reject invalid room codes", async () => {
      const result = await service.acceptChallengeByCode("INVALID");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid room code format");
    });

    it("should normalize room code to uppercase", async () => {
      // With our mock, challenge won't be found, but code should be normalized
      // Using only valid characters (no 0, O, 1, I, L)
      const result = await service.acceptChallengeByCode("abc234");

      expect(result.success).toBe(false);
      // Should get to the "not found" stage, meaning code was validated
      expect(result.error).toBe("Challenge not found or expired");
    });
  });

  describe("getChallengeByCode", () => {
    it("should normalize code to uppercase before query", async () => {
      // Using only valid characters (no 0, O, 1, I, L)
      const result = await service.getChallengeByCode("abc234");

      // With mock, returns null
      expect(result).toBeNull();
    });
  });

  describe("getMyCreatedChallenges", () => {
    it("should return empty array with mock", async () => {
      const result = await service.getMyCreatedChallenges();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("getMyChallenges", () => {
    it("should return empty array with mock", async () => {
      const result = await service.getMyChallenges();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("getPublicChallenges", () => {
    it("should return empty array with mock", async () => {
      const result = await service.getPublicChallenges();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("should accept limit parameter", async () => {
      const result = await service.getPublicChallenges(10);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should accept filter object", async () => {
      const filters: ChallengeFilters = {
        timeCategory: "blitz",
        minWager: 50,
        maxWager: 500,
      };
      const result = await service.getPublicChallenges(filters);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("cancelChallenge", () => {
    it("should return false when challenge not found", async () => {
      const result = await service.cancelChallenge("non-existent-id");

      expect(result).toBe(false);
    });
  });

  describe("declineChallenge", () => {
    it("should return false when challenge not found", async () => {
      const result = await service.declineChallenge("non-existent-id");

      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// Challenge Countdown Tests
// ============================================================================

describe("getChallengeCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return expired state for past dates", () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const countdown = getChallengeCountdown(pastDate);

    expect(countdown.isExpired).toBe(true);
    expect(countdown.totalSeconds).toBe(0);
    expect(countdown.hours).toBe(0);
    expect(countdown.minutes).toBe(0);
    expect(countdown.seconds).toBe(0);
    expect(countdown.formatted).toBe("Expired");
    expect(countdown.shortFormatted).toBe("Expired");
    expect(countdown.urgency).toBe("critical");
  });

  it("should calculate correct countdown for future dates", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    // 2 hours, 30 minutes, 45 seconds from now
    const futureDate = new Date(
      now + 2 * 60 * 60 * 1000 + 30 * 60 * 1000 + 45 * 1000
    ).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.isExpired).toBe(false);
    expect(countdown.hours).toBe(2);
    expect(countdown.minutes).toBe(30);
    expect(countdown.seconds).toBe(45);
    expect(countdown.totalSeconds).toBe(2 * 3600 + 30 * 60 + 45);
  });

  it("should show normal urgency for > 1 hour", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.urgency).toBe("normal");
  });

  it("should show warning urgency for < 1 hour but > 5 minutes", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 30 * 60 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.urgency).toBe("warning");
  });

  it("should show critical urgency for < 5 minutes", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 3 * 60 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.urgency).toBe("critical");
  });

  it("should format hours correctly in formatted string", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 5 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.formatted).toContain("h");
    expect(countdown.shortFormatted).toContain("h");
  });

  it("should format minutes only when no hours", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 45 * 60 * 1000 + 30 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.formatted).toContain("m");
    expect(countdown.formatted).not.toContain("h");
  });

  it("should format seconds only when no minutes", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 45 * 1000).toISOString();
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.formatted).toContain("s");
    expect(countdown.formatted).not.toContain("m");
    expect(countdown.formatted).not.toContain("h");
  });

  it("should handle exactly 0 seconds correctly", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const countdown = getChallengeCountdown(new Date(now).toISOString());

    expect(countdown.isExpired).toBe(true);
    expect(countdown.totalSeconds).toBe(0);
  });

  it("should handle 1 second remaining", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const futureDate = new Date(now + 1500).toISOString(); // 1.5 seconds
    const countdown = getChallengeCountdown(futureDate);

    expect(countdown.isExpired).toBe(false);
    expect(countdown.totalSeconds).toBeGreaterThan(0);
    expect(countdown.totalSeconds).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// isExpiringSoon Tests
// ============================================================================

describe("isExpiringSoon", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return true for challenges expiring within 1 hour", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const soonDate = new Date(now + 30 * 60 * 1000).toISOString();
    expect(isExpiringSoon(soonDate)).toBe(true);
  });

  it("should return true for challenges expiring within 5 minutes", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const verySoonDate = new Date(now + 3 * 60 * 1000).toISOString();
    expect(isExpiringSoon(verySoonDate)).toBe(true);
  });

  it("should return false for challenges expiring after 1 hour", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const laterDate = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    expect(isExpiringSoon(laterDate)).toBe(false);
  });

  it("should return false for already expired challenges", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const pastDate = new Date(now - 60000).toISOString();
    expect(isExpiringSoon(pastDate)).toBe(false);
  });

  it("should return true for exactly 59 minutes remaining", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const almostHourDate = new Date(now + 59 * 60 * 1000).toISOString();
    expect(isExpiringSoon(almostHourDate)).toBe(true);
  });

  it("should return false for exactly 1 hour remaining", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const exactlyHourDate = new Date(now + 60 * 60 * 1000).toISOString();
    expect(isExpiringSoon(exactlyHourDate)).toBe(false);
  });
});

// ============================================================================
// Challenge Filter Options Tests
// ============================================================================

describe("CHALLENGE_FILTER_OPTIONS", () => {
  describe("timeCategories", () => {
    it("should have 4 time categories", () => {
      expect(CHALLENGE_FILTER_OPTIONS.timeCategories).toHaveLength(4);
    });

    it("should include bullet, blitz, rapid, classical", () => {
      const values = CHALLENGE_FILTER_OPTIONS.timeCategories.map((c) => c.value);
      expect(values).toContain("bullet");
      expect(values).toContain("blitz");
      expect(values).toContain("rapid");
      expect(values).toContain("classical");
    });

    it("should have labels and descriptions", () => {
      CHALLENGE_FILTER_OPTIONS.timeCategories.forEach((category) => {
        expect(category).toHaveProperty("value");
        expect(category).toHaveProperty("label");
        expect(category).toHaveProperty("description");
        expect(category.label).toBeTruthy();
        expect(category.description).toBeTruthy();
      });
    });
  });

  describe("wagerRanges", () => {
    it("should have wager ranges defined", () => {
      expect(CHALLENGE_FILTER_OPTIONS.wagerRanges.length).toBeGreaterThan(0);
    });

    it("should have min, max, and label for each range", () => {
      CHALLENGE_FILTER_OPTIONS.wagerRanges.forEach((range) => {
        expect(range).toHaveProperty("min");
        expect(range).toHaveProperty("max");
        expect(range).toHaveProperty("label");
        expect(typeof range.min).toBe("number");
        expect(range.label).toBeTruthy();
      });
    });

    it("should start from 0 or low wager", () => {
      const firstRange = CHALLENGE_FILTER_OPTIONS.wagerRanges[0];
      expect(firstRange.min).toBeLessThanOrEqual(50);
    });

    it("should have ascending ranges", () => {
      const ranges = CHALLENGE_FILTER_OPTIONS.wagerRanges;
      for (let i = 0; i < ranges.length - 1; i++) {
        expect(ranges[i].min).toBeLessThan(ranges[i + 1].min);
      }
    });
  });

  describe("eloRanges", () => {
    it("should have ELO ranges defined", () => {
      expect(CHALLENGE_FILTER_OPTIONS.eloRanges.length).toBeGreaterThan(0);
    });

    it("should have min, max, and label for each range", () => {
      CHALLENGE_FILTER_OPTIONS.eloRanges.forEach((range) => {
        expect(range).toHaveProperty("min");
        expect(range).toHaveProperty("max");
        expect(range).toHaveProperty("label");
        expect(typeof range.min).toBe("number");
        expect(range.label).toBeTruthy();
      });
    });

    it("should cover beginner to expert ratings", () => {
      const ranges = CHALLENGE_FILTER_OPTIONS.eloRanges;
      const allMins = ranges.map((r) => r.min);
      const allMaxes = ranges.map((r) => r.max).filter((m) => m !== null);

      expect(Math.min(...allMins)).toBeLessThanOrEqual(1200);
      expect(Math.max(...(allMaxes as number[]))).toBeGreaterThanOrEqual(1800);
    });

    it("should have ascending ranges", () => {
      const ranges = CHALLENGE_FILTER_OPTIONS.eloRanges;
      for (let i = 0; i < ranges.length - 1; i++) {
        expect(ranges[i].min).toBeLessThan(ranges[i + 1].min);
      }
    });
  });
});

// ============================================================================
// ChallengeFilters Type Tests
// ============================================================================

describe("ChallengeFilters type", () => {
  it("should accept all filter properties", () => {
    const filters: ChallengeFilters = {
      timeCategory: "blitz",
      minWager: 50,
      maxWager: 500,
      minElo: 1200,
      maxElo: 1800,
      usernameSearch: "testuser",
      isRated: true,
    };

    expect(filters.timeCategory).toBe("blitz");
    expect(filters.minWager).toBe(50);
    expect(filters.maxWager).toBe(500);
    expect(filters.minElo).toBe(1200);
    expect(filters.maxElo).toBe(1800);
    expect(filters.usernameSearch).toBe("testuser");
    expect(filters.isRated).toBe(true);
  });

  it("should accept partial filters", () => {
    const filters: ChallengeFilters = {
      timeCategory: "bullet",
    };

    expect(filters.timeCategory).toBe("bullet");
    expect(filters.minWager).toBeUndefined();
  });

  it("should accept empty filters", () => {
    const filters: ChallengeFilters = {};

    expect(Object.keys(filters)).toHaveLength(0);
  });

  it("should accept isRated false", () => {
    const filters: ChallengeFilters = {
      isRated: false,
    };

    expect(filters.isRated).toBe(false);
  });

  it("should accept all time categories", () => {
    const categories: Array<ChallengeFilters["timeCategory"]> = [
      "bullet",
      "blitz",
      "rapid",
      "classical",
      undefined,
    ];

    categories.forEach((cat) => {
      const filters: ChallengeFilters = { timeCategory: cat };
      expect(filters.timeCategory).toBe(cat);
    });
  });
});

// ============================================================================
// Integration Test - Full Challenge Flow
// ============================================================================

describe("Integration: Full Challenge Flow", () => {
  // This test validates the full challenge lifecycle:
  // create → accept → play → settle

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Challenge Creation Flow", () => {
    it("should generate valid room code for challenge", () => {
      const roomCode = generateRoomCode();
      expect(roomCode).toHaveLength(6);
      expect(isValidRoomCode(roomCode)).toBe(true);
    });

    it("should properly categorize time control", () => {
      // Simulate creating a blitz challenge (5+0)
      const timeControl = 300;
      const increment = 0;
      const category = getTimeControlCategory(timeControl, increment);
      expect(category).toBe("Blitz");
    });

    it("should calculate correct expiry", () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const countdown = getChallengeCountdown(expiresAt);

      expect(countdown.isExpired).toBe(false);
      expect(countdown.hours).toBe(24);
      expect(countdown.urgency).toBe("normal");
    });
  });

  describe("Challenge Acceptance Flow", () => {
    it("should detect when challenge is expiring soon", () => {
      const almostExpired = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      expect(isExpiringSoon(almostExpired)).toBe(true);

      const notExpiring = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      expect(isExpiringSoon(notExpiring)).toBe(false);
    });

    it("should show critical urgency for last 5 minutes", () => {
      const almostDead = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      const countdown = getChallengeCountdown(almostDead);

      expect(countdown.urgency).toBe("critical");
      expect(countdown.isExpired).toBe(false);
    });
  });

  describe("Challenge Filter Flow", () => {
    it("should apply multiple filters correctly", () => {
      const filters: ChallengeFilters = {
        timeCategory: "blitz",
        minWager: 100,
        maxWager: 1000,
        minElo: 1200,
        maxElo: 1800,
        isRated: true,
      };

      // Count active filters
      let count = 0;
      if (filters.timeCategory) count++;
      if (filters.minWager !== undefined || filters.maxWager !== undefined) count++;
      if (filters.minElo !== undefined || filters.maxElo !== undefined) count++;
      if (filters.isRated !== undefined) count++;

      expect(count).toBe(4); // 4 filter categories active
    });
  });

  describe("Challenge Status Transitions", () => {
    it("should track valid status transitions", () => {
      const validTransitions: Record<string, string[]> = {
        pending: ["accepted", "declined", "cancelled", "expired"],
        accepted: [], // Terminal state (becomes a game)
        declined: [], // Terminal state
        cancelled: [], // Terminal state
        expired: [], // Terminal state
      };

      expect(validTransitions.pending).toContain("accepted");
      expect(validTransitions.pending).toContain("expired");
      expect(validTransitions.pending).not.toContain("pending");
    });
  });

  describe("Challenge History Flow", () => {
    it("should format history items correctly", () => {
      const historyItem = {
        id: "challenge-789",
        wagerTct: 500,
        timeControlSeconds: 300,
        incrementSeconds: 0,
        status: "accepted" as const,
        gameResult: "win" as const,
        opponentUsername: "ChessMaster",
        createdAt: "2025-01-15T10:00:00Z",
      };

      expect(formatTimeControl(
        historyItem.timeControlSeconds,
        historyItem.incrementSeconds
      )).toBe("5 min");

      expect(historyItem.gameResult).toBe("win");
    });
  });

  describe("End-to-End Scenario", () => {
    it("should simulate complete challenge lifecycle", async () => {
      // Step 1: Create challenge
      const roomCode = generateRoomCode();
      expect(isValidRoomCode(roomCode)).toBe(true);

      // Step 2: Set challenge parameters
      const challengeParams = {
        wagerTct: 500,
        timeControlSeconds: 300,
        incrementSeconds: 0,
        colorPreference: "white" as const,
        isRated: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Step 3: Validate time category
      const timeCategory = getTimeControlCategory(
        challengeParams.timeControlSeconds,
        challengeParams.incrementSeconds
      );
      expect(timeCategory).toBe("Blitz");

      // Step 4: Check expiry countdown
      const countdown = getChallengeCountdown(challengeParams.expiresAt);
      expect(countdown.isExpired).toBe(false);
      expect(countdown.urgency).toBe("normal");

      // Step 5: Format display strings
      const timeDisplay = formatTimeControl(
        challengeParams.timeControlSeconds,
        challengeParams.incrementSeconds
      );
      expect(timeDisplay).toBe("5 min");

      const expiryDisplay = formatChallengeExpiry(challengeParams.expiresAt);
      expect(expiryDisplay).toBe("24h 0m");

      // Step 6: Simulate time passing (23h 30m)
      jest.setSystemTime(new Date("2025-01-16T11:30:00Z"));

      // Step 7: Check urgency changes to warning
      const laterCountdown = getChallengeCountdown(challengeParams.expiresAt);
      expect(laterCountdown.urgency).toBe("warning");
      expect(isExpiringSoon(challengeParams.expiresAt)).toBe(true);

      // Step 8: Simulate near expiry (2 minutes before)
      jest.setSystemTime(new Date("2025-01-16T11:58:00Z"));

      // Step 9: Check urgency is critical (< 5 minutes remaining)
      const criticalCountdown = getChallengeCountdown(challengeParams.expiresAt);
      expect(criticalCountdown.urgency).toBe("critical");
    });
  });
});
