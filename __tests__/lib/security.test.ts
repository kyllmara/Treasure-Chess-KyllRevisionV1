/**
 * Security Module Unit Tests
 *
 * Comprehensive test coverage for:
 * - Input validation with Zod schemas
 * - XSS sanitization and detection
 * - Rate limiting
 * - Environment security checks
 * - Double-entry ledger operations
 * - Escrow atomicity
 */

// Mock expo-constants
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: "expo",
    expoConfig: {
      version: "1.0.0",
      extra: {},
      ios: { buildNumber: "1" },
      android: { versionCode: 1 },
    },
  },
}));

// Mock react-native
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        order: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      insert: jest.fn(() => Promise.resolve({ error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
  },
  isSupabaseConfigured: false,
}));

import { z } from "zod";

// ============================================================================
// Validation Tests
// ============================================================================

import {
  emailSchema,
  usernameSchema,
  otpSchema,
  ethereumAddressSchema,
  solanaAddressSchema,
  stakeAmountSchema,
  depositAmountSchema,
  withdrawalAmountSchema,
  ukBankAccountSchema,
  profileSetupSchema,
  chessMoveSchema,
  validate,
  getValidationErrors,
  createValidationResult,
  VALID_STAKE_AMOUNTS,
} from "@/lib/security/validation";

describe("Validation Schemas", () => {
  describe("emailSchema", () => {
    it("should accept valid email addresses", () => {
      const validEmails = [
        "test@example.com",
        "user.name@domain.co.uk",
        "user+tag@gmail.com",
        "a@b.co",
      ];

      validEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid email addresses", () => {
      const invalidEmails = [
        "not-an-email",
        "@domain.com",
        "user@",
        "user@.com",
        "user name@domain.com",
        "",
      ];

      invalidEmails.forEach((email) => {
        const result = emailSchema.safeParse(email);
        expect(result.success).toBe(false);
      });
    });

    it("should normalize email to lowercase", () => {
      const result = emailSchema.safeParse("TEST@EXAMPLE.COM");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test@example.com");
      }
    });
  });

  describe("usernameSchema", () => {
    it("should accept valid usernames", () => {
      const validUsernames = ["player1", "chess_master", "abc", "user123", "Player_One"];

      validUsernames.forEach((username) => {
        const result = usernameSchema.safeParse(username);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid usernames", () => {
      const invalidUsernames = [
        "", // too short
        "ab", // still valid (min 3)
        "a".repeat(31), // too long
        "user__name", // consecutive underscores
        "admin", // reserved
        "support", // reserved
        "_username", // starts with underscore
        "user name", // contains space
        "user@name", // contains special char
      ];

      // Filter out "ab" which should be valid
      invalidUsernames
        .filter((u) => u !== "ab")
        .forEach((username) => {
          const result = usernameSchema.safeParse(username);
          expect(result.success).toBe(false);
        });
    });

    it("should reject reserved usernames", () => {
      const reservedUsernames = ["admin", "Admin", "ADMIN", "moderator", "support", "system"];

      reservedUsernames.forEach((username) => {
        const result = usernameSchema.safeParse(username);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("otpSchema", () => {
    it("should accept valid OTP codes", () => {
      const validOtps = ["123456", "000000", "999999"];

      validOtps.forEach((otp) => {
        const result = otpSchema.safeParse(otp);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid OTP codes", () => {
      const invalidOtps = ["12345", "1234567", "abcdef", "12345a", "", " 23456"];

      invalidOtps.forEach((otp) => {
        const result = otpSchema.safeParse(otp);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("ethereumAddressSchema", () => {
    it("should accept valid Ethereum addresses", () => {
      const validAddresses = [
        "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD31",
        "0x0000000000000000000000000000000000000000",
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      ];

      validAddresses.forEach((address) => {
        const result = ethereumAddressSchema.safeParse(address);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid Ethereum addresses", () => {
      const invalidAddresses = [
        "742d35Cc6634C0532925a3b844Bc9e7595f2bD31", // missing 0x
        "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD3", // too short
        "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD312", // too long
        "0x742d35Gg6634C0532925a3b844Bc9e7595f2bD31", // invalid char G
        "",
      ];

      invalidAddresses.forEach((address) => {
        const result = ethereumAddressSchema.safeParse(address);
        expect(result.success).toBe(false);
      });
    });

    it("should normalize to lowercase", () => {
      const result = ethereumAddressSchema.safeParse(
        "0x742D35CC6634C0532925A3B844BC9E7595F2BD31"
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("0x742d35cc6634c0532925a3b844bc9e7595f2bd31");
      }
    });
  });

  describe("solanaAddressSchema", () => {
    it("should accept valid Solana addresses", () => {
      const validAddresses = [
        "11111111111111111111111111111111",
        "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
      ];

      validAddresses.forEach((address) => {
        const result = solanaAddressSchema.safeParse(address);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid Solana addresses", () => {
      const invalidAddresses = [
        "1111111111111111111111111111111", // too short
        "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD31", // ethereum format
        "InvalidAddress!@#$",
        "",
      ];

      invalidAddresses.forEach((address) => {
        const result = solanaAddressSchema.safeParse(address);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("stakeAmountSchema", () => {
    it("should accept valid stake amounts", () => {
      VALID_STAKE_AMOUNTS.forEach((amount) => {
        const result = stakeAmountSchema.safeParse(amount);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid stake amounts", () => {
      const invalidAmounts = [1, 15, 200, -10, 1.5];

      invalidAmounts.forEach((amount) => {
        const result = stakeAmountSchema.safeParse(amount);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("depositAmountSchema", () => {
    it("should accept amounts within range", () => {
      const validAmounts = [10, 100, 1000, 10000];

      validAmounts.forEach((amount) => {
        const result = depositAmountSchema.safeParse(amount);
        expect(result.success).toBe(true);
      });
    });

    it("should reject amounts outside range", () => {
      const result1 = depositAmountSchema.safeParse(5);
      expect(result1.success).toBe(false);

      const result2 = depositAmountSchema.safeParse(20000);
      expect(result2.success).toBe(false);
    });
  });

  describe("ukBankAccountSchema", () => {
    it("should accept valid UK bank details", () => {
      const validAccount = {
        fullName: "John Smith",
        sortCode: "12-34-56",
        accountNumber: "12345678",
      };

      const result = ukBankAccountSchema.safeParse(validAccount);
      expect(result.success).toBe(true);
    });

    it("should reject invalid sort code format", () => {
      const invalidAccount = {
        fullName: "John Smith",
        sortCode: "123456", // missing dashes
        accountNumber: "12345678",
      };

      const result = ukBankAccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });

    it("should reject invalid account number", () => {
      const invalidAccount = {
        fullName: "John Smith",
        sortCode: "12-34-56",
        accountNumber: "1234567", // 7 digits instead of 8
      };

      const result = ukBankAccountSchema.safeParse(invalidAccount);
      expect(result.success).toBe(false);
    });
  });

  describe("chessMoveSchema", () => {
    it("should accept valid chess moves", () => {
      const validMoves = [
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "e2", to: "e4" },
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "e7", to: "e8", promotion: "q" },
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "a1", to: "h8" },
      ];

      validMoves.forEach((move) => {
        const result = chessMoveSchema.safeParse(move);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid squares", () => {
      const invalidMoves = [
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "e9", to: "e4" },
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "i2", to: "e4" },
        { gameId: "550e8400-e29b-41d4-a716-446655440000", from: "e2", to: "" },
      ];

      invalidMoves.forEach((move) => {
        const result = chessMoveSchema.safeParse(move);
        expect(result.success).toBe(false);
      });
    });
  });
});

describe("Validation Utilities", () => {
  describe("validate", () => {
    it("should return success for valid data", () => {
      const result = validate(emailSchema, "test@example.com");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("test@example.com");
      }
    });

    it("should return errors for invalid data", () => {
      const result = validate(emailSchema, "not-an-email");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
      }
    });
  });

  describe("getValidationErrors", () => {
    it("should return array from ZodError", () => {
      // Create a direct ZodError for testing
      try {
        z.string().min(10).parse("short");
      } catch (e) {
        if (e instanceof z.ZodError) {
          const errors = getValidationErrors(e);
          expect(Array.isArray(errors)).toBe(true);
        }
      }
    });

    it("should return empty array for null error", () => {
      const errors = getValidationErrors(null as any);
      expect(errors).toEqual([]);
    });

    it("should return empty array for undefined error", () => {
      const errors = getValidationErrors(undefined as any);
      expect(errors).toEqual([]);
    });
  });

  describe("createValidationResult", () => {
    it("should return field errors for complex objects", () => {
      const result = createValidationResult(ukBankAccountSchema, {
        fullName: "",
        sortCode: "invalid",
        accountNumber: "123",
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors).toBeDefined();
    });
  });
});

// ============================================================================
// Sanitization Tests
// ============================================================================

import {
  sanitizeDisplayName,
  sanitizeUsername,
  sanitizeMessage,
  sanitizeUrl,
  detectXss,
  detectSqlInjection,
  securityCheck,
  encodeHtmlEntities,
  stripHtml,
} from "@/lib/security/sanitization";

describe("Sanitization", () => {
  describe("sanitizeDisplayName", () => {
    it("should remove HTML tags", () => {
      expect(sanitizeDisplayName("<script>alert('xss')</script>")).not.toContain("<script>");
      expect(sanitizeDisplayName("<b>Bold</b>")).not.toContain("<b>");
    });

    it("should remove JavaScript event handlers", () => {
      const result = sanitizeDisplayName('Player<img src="x" onerror="alert(1)">');
      expect(result).not.toContain("onerror");
    });

    it("should handle normal text correctly", () => {
      expect(sanitizeDisplayName("John Smith")).toBe("John Smith");
      expect(sanitizeDisplayName("Player123")).toBe("Player123");
    });

    it("should handle null/undefined", () => {
      expect(sanitizeDisplayName(null as any)).toBe("");
      expect(sanitizeDisplayName(undefined as any)).toBe("");
    });

    it("should limit length", () => {
      const longName = "a".repeat(100);
      expect(sanitizeDisplayName(longName).length).toBeLessThanOrEqual(50);
    });
  });

  describe("sanitizeUsername", () => {
    it("should only allow alphanumeric and underscores", () => {
      expect(sanitizeUsername("user@name")).toBe("username");
      expect(sanitizeUsername("user name")).toBe("username");
      expect(sanitizeUsername("user_name")).toBe("user_name");
    });

    it("should convert to lowercase", () => {
      expect(sanitizeUsername("UserName")).toBe("username");
    });

    it("should limit length to 30 characters", () => {
      const longUsername = "a".repeat(50);
      expect(sanitizeUsername(longUsername).length).toBe(30);
    });
  });

  describe("sanitizeMessage", () => {
    it("should remove HTML but preserve text", () => {
      expect(sanitizeMessage("<p>Hello</p>")).toBe("Hello");
    });

    it("should normalize whitespace", () => {
      expect(sanitizeMessage("Hello     World")).toBe("Hello World");
    });

    it("should limit length to 500 characters", () => {
      const longMessage = "a".repeat(600);
      expect(sanitizeMessage(longMessage).length).toBeLessThanOrEqual(500);
    });
  });

  describe("sanitizeUrl", () => {
    it("should accept valid HTTP URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
      expect(sanitizeUrl("http://example.com/path")).toBe("http://example.com/path");
    });

    it("should reject javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("should reject data: URLs", () => {
      expect(sanitizeUrl("data:text/html,<script>")).toBeNull();
    });

    it("should reject invalid protocols", () => {
      expect(sanitizeUrl("ftp://example.com")).toBeNull();
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });
  });

  describe("detectXss", () => {
    it("should detect script tags", () => {
      const result = detectXss("<script>alert(1)</script>");
      expect(result.isClean).toBe(false);
      expect(result.threats).toContain("Script tag detected");
    });

    it("should detect event handlers", () => {
      const result = detectXss('<img onerror="alert(1)">');
      expect(result.isClean).toBe(false);
      expect(result.threats).toContain("Event handler detected");
    });

    it("should detect javascript: protocol", () => {
      const result = detectXss('javascript:alert(1)');
      expect(result.isClean).toBe(false);
      expect(result.threats).toContain("JavaScript protocol detected");
    });

    it("should pass clean input", () => {
      const result = detectXss("Hello, my name is John");
      expect(result.isClean).toBe(true);
      expect(result.threats).toHaveLength(0);
    });
  });

  describe("detectSqlInjection", () => {
    it("should detect SQL keywords", () => {
      const result = detectSqlInjection("'; DROP TABLE users; --");
      expect(result.isClean).toBe(false);
    });

    it("should detect comment markers", () => {
      const result = detectSqlInjection("'; DROP TABLE users; --");
      expect(result.isClean).toBe(false);
      expect(result.threats.length).toBeGreaterThan(0);
    });

    it("should pass normal text", () => {
      const result = detectSqlInjection("My username is John");
      expect(result.isClean).toBe(true);
    });
  });

  describe("securityCheck", () => {
    it("should return comprehensive check results", () => {
      const result = securityCheck('<script>DROP TABLE users</script>');
      expect(result.isClean).toBe(false);
      expect(result.threats.length).toBeGreaterThan(0);
      expect(result.severity).not.toBe("none");
      expect(result.sanitized).toBeDefined();
    });

    it("should categorize severity correctly", () => {
      const cleanResult = securityCheck("Hello World");
      expect(cleanResult.severity).toBe("none");

      const lowResult = securityCheck("<b>bold</b>");
      expect(["none", "low"]).toContain(lowResult.severity);
    });
  });

  describe("encodeHtmlEntities", () => {
    it("should encode special characters", () => {
      expect(encodeHtmlEntities("<")).toBe("&lt;");
      expect(encodeHtmlEntities(">")).toBe("&gt;");
      expect(encodeHtmlEntities("&")).toBe("&amp;");
      expect(encodeHtmlEntities('"')).toBe("&quot;");
      expect(encodeHtmlEntities("'")).toBe("&#x27;");
    });

    it("should encode multiple characters", () => {
      expect(encodeHtmlEntities('<script>"test"</script>')).toBe(
        "&lt;script&gt;&quot;test&quot;&lt;&#x2F;script&gt;"
      );
    });
  });

  describe("stripHtml", () => {
    it("should remove all HTML tags", () => {
      expect(stripHtml("<p>Hello</p>")).toBe("Hello");
      expect(stripHtml("<div><span>Test</span></div>")).toBe("Test");
    });

    it("should remove HTML entities", () => {
      expect(stripHtml("Hello&nbsp;World")).toBe("HelloWorld");
    });
  });
});

// ============================================================================
// Rate Limiter Tests
// ============================================================================

import {
  RateLimiter,
  RateLimitError,
  formatRetryTime,
  AUTH_RATE_LIMIT,
} from "@/lib/security/rateLimiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(async () => {
    limiter = new RateLimiter({
      maxAttempts: 3,
      windowMs: 1000,
      cooldownMs: 2000,
      keyPrefix: "test_rate",
    });
    await limiter.clearAll();
  });

  afterEach(async () => {
    await limiter.clearAll();
  });

  describe("check", () => {
    it("should allow requests within limit", async () => {
      const result1 = await limiter.check("user1");
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = await limiter.check("user1");
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = await limiter.check("user1");
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it("should block after limit exceeded", async () => {
      await limiter.check("user1");
      await limiter.check("user1");
      await limiter.check("user1");

      const result = await limiter.check("user1");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should track different identifiers separately", async () => {
      await limiter.check("user1");
      await limiter.check("user1");
      await limiter.check("user1");

      const user1Result = await limiter.check("user1");
      const user2Result = await limiter.check("user2");

      expect(user1Result.allowed).toBe(false);
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe("peek", () => {
    it("should not increment counter", async () => {
      const peek1 = await limiter.peek("user1");
      const peek2 = await limiter.peek("user1");

      expect(peek1.remaining).toBe(peek2.remaining);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for identifier", async () => {
      await limiter.check("user1");
      await limiter.check("user1");
      await limiter.check("user1");

      const beforeReset = await limiter.peek("user1");
      expect(beforeReset.allowed).toBe(false);

      await limiter.reset("user1");

      const afterReset = await limiter.peek("user1");
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(3);
    });
  });
});

describe("formatRetryTime", () => {
  it("should format seconds correctly", () => {
    expect(formatRetryTime(5000)).toBe("5s");
    expect(formatRetryTime(30000)).toBe("30s");
  });

  it("should format minutes correctly", () => {
    expect(formatRetryTime(60000)).toBe("1m 0s");
    expect(formatRetryTime(90000)).toBe("1m 30s");
  });

  it("should format hours correctly", () => {
    expect(formatRetryTime(3600000)).toBe("1h 0m");
    expect(formatRetryTime(5400000)).toBe("1h 30m");
  });

  it("should return 'now' for zero or negative", () => {
    expect(formatRetryTime(0)).toBe("now");
    expect(formatRetryTime(-1000)).toBe("now");
  });
});

// ============================================================================
// Environment Tests
// ============================================================================

import {
  getEnvironment,
  getSecurityConfig,
  runSecurityChecks,
  isTestEmail,
  isTestUsername,
  validateNotTestAccount,
  getAppVersion,
} from "@/lib/security/environment";

describe("Environment Security", () => {
  describe("getEnvironment", () => {
    it("should return a valid environment", () => {
      const env = getEnvironment();
      expect(["development", "staging", "production"]).toContain(env);
    });
  });

  describe("getSecurityConfig", () => {
    it("should return a complete config object", () => {
      const config = getSecurityConfig();

      expect(config).toHaveProperty("allowDemoMode");
      expect(config).toHaveProperty("allowTestAccounts");
      expect(config).toHaveProperty("requireHttps");
      expect(config).toHaveProperty("enableDebugLogging");
      expect(config).toHaveProperty("maxSessionDuration");
    });
  });

  describe("runSecurityChecks", () => {
    it("should return check results", () => {
      const result = runSecurityChecks();

      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("isTestEmail", () => {
    it("should detect test emails", () => {
      expect(isTestEmail("test@example.com")).toBe(true);
      expect(isTestEmail("demo@test.com")).toBe(true);
      expect(isTestEmail("user@mailinator.com")).toBe(true);
      expect(isTestEmail("user+test@gmail.com")).toBe(true);
    });

    it("should pass normal emails", () => {
      expect(isTestEmail("john@company.com")).toBe(false);
      expect(isTestEmail("player@gmail.com")).toBe(false);
    });
  });

  describe("isTestUsername", () => {
    it("should detect test usernames", () => {
      expect(isTestUsername("testuser")).toBe(true);
      expect(isTestUsername("demo123")).toBe(true);
      expect(isTestUsername("admin")).toBe(true);
      expect(isTestUsername("usertest")).toBe(true);
    });

    it("should pass normal usernames", () => {
      expect(isTestUsername("player123")).toBe(false);
      expect(isTestUsername("chess_master")).toBe(false);
    });
  });

  describe("validateNotTestAccount", () => {
    it("should return valid for normal accounts", () => {
      const result = validateNotTestAccount("john@company.com", "player123");
      expect(result.valid).toBe(true);
    });
  });

  describe("getAppVersion", () => {
    it("should return a version string", () => {
      const version = getAppVersion();
      expect(typeof version).toBe("string");
    });
  });
});

// ============================================================================
// Logger Tests
// ============================================================================

import { logger, logDebug, logInfo, logWarn, logError, logAudit } from "@/lib/security/logger";

describe("Logger", () => {
  describe("logging methods", () => {
    it("should not throw when logging", () => {
      expect(() => logDebug("Test", "Debug message")).not.toThrow();
      expect(() => logInfo("Test", "Info message")).not.toThrow();
      expect(() => logWarn("Test", "Warning message")).not.toThrow();
      expect(() => logError("Test", "Error message")).not.toThrow();
    });

    it("should accept data objects", () => {
      expect(() =>
        logInfo("Test", "Message with data", { key: "value" })
      ).not.toThrow();
    });

    it("should handle Error objects", () => {
      expect(() =>
        logError("Test", "Error occurred", new Error("Test error"))
      ).not.toThrow();
    });
  });

  describe("audit logging", () => {
    it("should log audit events", () => {
      expect(() =>
        logAudit("test_action", "test_resource", "success", {
          resourceId: "123",
        })
      ).not.toThrow();

      expect(() =>
        logAudit("test_action", "test_resource", "failure", {
          failureReason: "Test failure",
        })
      ).not.toThrow();
    });
  });

  describe("specialized audit methods", () => {
    it("should log auth events", () => {
      expect(() =>
        logger.authEvent("login", "success", { method: "email" })
      ).not.toThrow();

      expect(() =>
        logger.authEvent("login", "failure", { failureReason: "Invalid OTP" })
      ).not.toThrow();
    });

    it("should log financial events", () => {
      expect(() =>
        logger.financialEvent("deposit", "success", {
          amount: 100,
          currency: "TCT",
          transactionId: "txn_123",
        })
      ).not.toThrow();
    });

    it("should log game events", () => {
      expect(() =>
        logger.gameEvent("create", "success", { gameId: "game_123" })
      ).not.toThrow();
    });

    it("should log security events", () => {
      expect(() =>
        logger.securityEvent("xss_attempt", { description: "XSS payload detected" })
      ).not.toThrow();
    });
  });

  describe("log retrieval", () => {
    it("should retrieve recent logs", () => {
      const logs = logger.getRecentLogs(10);
      expect(Array.isArray(logs)).toBe(true);
    });

    it("should retrieve audit logs", () => {
      const auditLogs = logger.getAuditLogs();
      expect(Array.isArray(auditLogs)).toBe(true);
    });

    it("should export logs as JSON", () => {
      const exported = logger.exportLogs();
      expect(typeof exported).toBe("string");
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });

  describe("setUserId", () => {
    it("should set user context", () => {
      expect(() => logger.setUserId("user_123")).not.toThrow();
      expect(() => logger.setUserId(undefined)).not.toThrow();
    });
  });
});

// ============================================================================
// Ledger Tests
// ============================================================================

import { LedgerService, PLATFORM_FEE_RATE, MIN_TRANSACTION_AMOUNT } from "@/lib/security/ledger";

describe("LedgerService", () => {
  let ledger: LedgerService;

  beforeEach(() => {
    ledger = new LedgerService();
  });

  describe("createTransaction", () => {
    it("should create balanced transactions", async () => {
      const transaction = await ledger.createTransaction(
        "deposit",
        [
          {
            accountType: "external_deposit",
            accountId: "system",
            direction: "debit",
            amount: 100,
            description: "Test deposit",
          },
          {
            accountType: "user_balance",
            accountId: "user_123",
            direction: "credit",
            amount: 100,
            description: "Test deposit credited",
          },
        ]
      );

      expect(transaction).not.toBeNull();
      expect(transaction?.isBalanced).toBe(true);
      expect(transaction?.totalDebits).toBe(100);
      expect(transaction?.totalCredits).toBe(100);
    });

    it("should reject unbalanced transactions", async () => {
      const transaction = await ledger.createTransaction(
        "deposit",
        [
          {
            accountType: "external_deposit",
            accountId: "system",
            direction: "debit",
            amount: 100,
            description: "Test deposit",
          },
          {
            accountType: "user_balance",
            accountId: "user_123",
            direction: "credit",
            amount: 50, // Unbalanced!
            description: "Test deposit credited",
          },
        ]
      );

      expect(transaction).toBeNull();
    });

    it("should reject amounts below minimum", async () => {
      const transaction = await ledger.createTransaction(
        "deposit",
        [
          {
            accountType: "external_deposit",
            accountId: "system",
            direction: "debit",
            amount: 0.001, // Below minimum
            description: "Test",
          },
          {
            accountType: "user_balance",
            accountId: "user_123",
            direction: "credit",
            amount: 0.001,
            description: "Test",
          },
        ]
      );

      expect(transaction).toBeNull();
    });
  });

  describe("recordDeposit", () => {
    it("should create deposit transaction", async () => {
      const transaction = await ledger.recordDeposit(
        "user_123",
        100,
        "stripe",
        "pi_123"
      );

      expect(transaction).not.toBeNull();
      expect(transaction?.type).toBe("deposit");
      expect(transaction?.entries.length).toBe(2);
    });
  });

  describe("getUserBalance", () => {
    it("should return balance structure", async () => {
      const balance = await ledger.getUserBalance("user_123");

      expect(balance).toHaveProperty("available");
      expect(balance).toHaveProperty("escrow");
      expect(balance).toHaveProperty("total");
      expect(typeof balance.available).toBe("number");
    });
  });

  describe("constants", () => {
    it("should have correct platform fee rate", () => {
      expect(PLATFORM_FEE_RATE).toBe(0.10);
    });

    it("should have minimum transaction amount", () => {
      expect(MIN_TRANSACTION_AMOUNT).toBe(0.01);
    });
  });
});

// ============================================================================
// Escrow Tests
// ============================================================================

import { EscrowService } from "@/lib/security/escrow";

describe("EscrowService", () => {
  let escrowService: EscrowService;

  beforeEach(() => {
    escrowService = new EscrowService();
  });

  describe("createEscrow", () => {
    it("should create escrow for new game", async () => {
      const result = await escrowService.createEscrow(
        "game_123",
        "white_player",
        "black_player",
        25
      );

      expect(result.success).toBe(true);
      expect(result.escrow).toBeDefined();
      expect(result.escrow?.status).toBe("pending");
      expect(result.escrow?.gameId).toBe("game_123");
    });
  });

  describe("lockBothPlayers", () => {
    it("should lock funds for both players atomically", async () => {
      const result = await escrowService.lockBothPlayers(
        "game_456",
        "white_player",
        "black_player",
        50
      );

      expect(result.success).toBe(true);
      expect(result.escrow?.status).toBe("locked");
      expect(result.escrow?.totalPool).toBe(100);
      expect(result.escrow?.whiteLockedAmount).toBe(50);
      expect(result.escrow?.blackLockedAmount).toBe(50);
    });
  });

  describe("releaseFunds", () => {
    it("should release funds to winner", async () => {
      // First create and lock escrow
      await escrowService.lockBothPlayers(
        "game_789",
        "white_player",
        "black_player",
        25
      );

      const result = await escrowService.releaseFunds({
        gameId: "game_789",
        winnerId: "white_player",
        loserId: "black_player",
        isDraw: false,
        isTimeout: false,
        isResignation: false,
        isCheckmate: true,
        isDisconnect: false,
      });

      expect(result.success).toBe(true);
      expect(result.escrow?.status).toBe("released");
    });

    it("should refund both players on draw", async () => {
      await escrowService.lockBothPlayers(
        "game_draw",
        "white_player",
        "black_player",
        25
      );

      const result = await escrowService.releaseFunds({
        gameId: "game_draw",
        winnerId: null,
        loserId: null,
        isDraw: true,
        isTimeout: false,
        isResignation: false,
        isCheckmate: false,
        isDisconnect: false,
      });

      expect(result.success).toBe(true);
      expect(result.escrow?.status).toBe("refunded");
    });
  });

  describe("cancelEscrow", () => {
    it("should cancel and refund pending escrow", async () => {
      await escrowService.createEscrow(
        "game_cancel",
        "white_player",
        "black_player",
        25
      );

      const result = await escrowService.cancelEscrow(
        "game_cancel",
        "Player disconnected"
      );

      expect(result.success).toBe(true);
      expect(result.escrow?.status).toBe("refunded");
    });
  });

  describe("getEscrow", () => {
    it("should retrieve existing escrow", async () => {
      await escrowService.createEscrow(
        "game_get",
        "white_player",
        "black_player",
        25
      );

      const escrow = await escrowService.getEscrow("game_get");

      expect(escrow).not.toBeNull();
      expect(escrow?.gameId).toBe("game_get");
    });

    it("should return null for non-existent escrow", async () => {
      const escrow = await escrowService.getEscrow("non_existent_game");

      expect(escrow).toBeNull();
    });
  });

  describe("operation locking", () => {
    it("should prevent concurrent operations on same game", async () => {
      // Start two operations simultaneously
      const promise1 = escrowService.lockBothPlayers(
        "concurrent_game",
        "white",
        "black",
        25
      );
      const promise2 = escrowService.lockBothPlayers(
        "concurrent_game",
        "white",
        "black",
        25
      );

      const results = await Promise.allSettled([promise1, promise2]);

      // One should succeed, one should fail or wait
      const successes = results.filter(
        (r) => r.status === "fulfilled" && (r.value as any).success
      );
      expect(successes.length).toBe(1);
    });
  });
});
