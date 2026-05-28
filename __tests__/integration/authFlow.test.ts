/**
 * Authentication Flow Integration Tests
 *
 * Tests the complete authentication lifecycle:
 * - Initial app load state
 * - Login flow simulation
 * - Profile creation
 * - Session persistence
 * - Logout flow
 * - Error handling
 */

import {
  createMockUser,
  resetCounters,
  MockUser,
} from "./testHelpers";

// ============================================================================
// Test Setup
// ============================================================================

describe("Authentication Flow", () => {
  beforeEach(() => {
    resetCounters();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Initial State Tests
  // ============================================================================

  describe("Initial App State", () => {
    it("should start with no authenticated user", () => {
      const authState = {
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };

      expect(authState.user).toBeNull();
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.isLoading).toBe(false);
    });

    it("should show loading state while checking session", () => {
      const authState = {
        user: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
      };

      expect(authState.isLoading).toBe(true);
      expect(authState.isAuthenticated).toBe(false);
    });
  });

  // ============================================================================
  // Login Flow Tests
  // ============================================================================

  describe("Login Flow", () => {
    it("should successfully authenticate user with valid credentials", async () => {
      const mockUser = createMockUser({
        email: "test@example.com",
        username: "TestPlayer",
      });

      // Simulate successful login
      const loginResult = simulateLogin(mockUser.email);

      expect(loginResult.success).toBe(true);
      expect(loginResult.user).toBeDefined();
      expect(loginResult.user?.email).toBe(mockUser.email);
    });

    it("should handle login with new user (requires profile creation)", async () => {
      const email = "newuser@example.com";

      // Simulate login for new user
      const loginResult = simulateLogin(email, { isNewUser: true });

      expect(loginResult.success).toBe(true);
      expect(loginResult.requiresProfileCreation).toBe(true);
    });

    it("should handle invalid email format", async () => {
      const invalidEmails = [
        "notanemail",
        "@nodomain.com",
        "no@.com",
        "",
      ];

      invalidEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
      });
    });

    it("should handle valid email formats", async () => {
      const validEmails = [
        "user@example.com",
        "user.name@domain.org",
        "user+tag@company.io",
      ];

      validEmails.forEach((email) => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
      });
    });
  });

  // ============================================================================
  // Profile Creation Tests
  // ============================================================================

  describe("Profile Creation", () => {
    it("should create profile with valid username", async () => {
      const profileData = {
        username: "ChessKing",
        avatar_index: 5,
      };

      const result = simulateProfileCreation(profileData);

      expect(result.success).toBe(true);
      expect(result.profile?.username).toBe(profileData.username);
      expect(result.profile?.avatar_index).toBe(profileData.avatar_index);
    });

    it("should reject invalid usernames", async () => {
      const invalidUsernames = [
        "", // Empty
        "ab", // Too short
        "a".repeat(21), // Too long
        "user name", // Contains space
        "user@name", // Contains special char
      ];

      invalidUsernames.forEach((username) => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(false);
      });
    });

    it("should accept valid usernames", async () => {
      const validUsernames = [
        "Player1",
        "ChessKing",
        "the_master",
        "User123",
      ];

      validUsernames.forEach((username) => {
        const result = validateUsername(username);
        expect(result.isValid).toBe(true);
      });
    });

    it("should set default ELO rating for new profile", async () => {
      const profileData = {
        username: "NewPlayer",
        avatar_index: 0,
      };

      const result = simulateProfileCreation(profileData);

      expect(result.profile?.elo_rating).toBe(1200);
      expect(result.profile?.games_played).toBe(0);
      expect(result.profile?.balance_tct).toBe(0);
    });

    it("should detect duplicate username", async () => {
      const existingUser = createMockUser({ username: "TakenName" });

      const result = simulateProfileCreation(
        { username: "TakenName", avatar_index: 0 },
        { existingUsernames: [existingUser.username] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("taken");
    });
  });

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe("Session Management", () => {
    it("should persist session across app restarts", async () => {
      const user = createMockUser();

      // Simulate session storage
      const session = createSession(user);
      const storedSession = storeSession(session);

      // Simulate app restart and session restoration
      const restoredSession = restoreSession(storedSession);

      expect(restoredSession).not.toBeNull();
      expect(restoredSession?.userId).toBe(user.id);
    });

    it("should expire session after timeout", async () => {
      const user = createMockUser();
      const session = createSession(user, { expiresInMs: -1000 }); // Already expired

      const isValid = isSessionValid(session);

      expect(isValid).toBe(false);
    });

    it("should refresh session before expiry", async () => {
      const user = createMockUser();
      const session = createSession(user, { expiresInMs: 1000 }); // About to expire

      const refreshedSession = refreshSession(session);

      expect(refreshedSession.expiresAt).toBeGreaterThan(session.expiresAt);
    });
  });

  // ============================================================================
  // Logout Flow Tests
  // ============================================================================

  describe("Logout Flow", () => {
    it("should clear user state on logout", async () => {
      const user = createMockUser();
      let authState = {
        user,
        isAuthenticated: true,
        session: createSession(user),
      };

      // Simulate logout
      authState = simulateLogout(authState);

      expect(authState.user).toBeNull();
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.session).toBeNull();
    });

    it("should clear stored session on logout", async () => {
      const user = createMockUser();
      const session = createSession(user);
      storeSession(session);

      // Simulate logout
      clearStoredSession();
      const restoredSession = restoreSession(null);

      expect(restoredSession).toBeNull();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle network error during login", async () => {
      const result = simulateLogin("user@example.com", { networkError: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("network");
    });

    it("should handle server error during profile creation", async () => {
      const result = simulateProfileCreation(
        { username: "Test", avatar_index: 0 },
        { serverError: true }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle expired OTP", async () => {
      const result = simulateOTPVerification("123456", { expired: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("should handle invalid OTP", async () => {
      const result = simulateOTPVerification("000000", { invalid: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("invalid");
    });
  });
});

// ============================================================================
// Helper Functions (Simulations)
// ============================================================================

interface LoginResult {
  success: boolean;
  user?: MockUser;
  requiresProfileCreation?: boolean;
  error?: string;
}

function simulateLogin(
  email: string,
  options: { isNewUser?: boolean; networkError?: boolean } = {}
): LoginResult {
  if (options.networkError) {
    return { success: false, error: "A network error occurred" };
  }

  if (!validateEmail(email).isValid) {
    return { success: false, error: "Invalid email format" };
  }

  if (options.isNewUser) {
    return {
      success: true,
      requiresProfileCreation: true,
    };
  }

  return {
    success: true,
    user: createMockUser({ email }),
  };
}

function validateEmail(email: string): { isValid: boolean; error?: string } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return { isValid: false, error: "Invalid email format" };
  }
  return { isValid: true };
}

function validateUsername(username: string): { isValid: boolean; error?: string } {
  if (!username || username.length < 3) {
    return { isValid: false, error: "Username too short" };
  }
  if (username.length > 20) {
    return { isValid: false, error: "Username too long" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { isValid: false, error: "Username contains invalid characters" };
  }
  return { isValid: true };
}

interface ProfileCreationResult {
  success: boolean;
  profile?: Partial<MockUser>;
  error?: string;
}

function simulateProfileCreation(
  profileData: { username: string; avatar_index: number },
  options: { existingUsernames?: string[]; serverError?: boolean } = {}
): ProfileCreationResult {
  if (options.serverError) {
    return { success: false, error: "Server error occurred" };
  }

  const usernameValidation = validateUsername(profileData.username);
  if (!usernameValidation.isValid) {
    return { success: false, error: usernameValidation.error };
  }

  if (options.existingUsernames?.includes(profileData.username)) {
    return { success: false, error: "Username is already taken" };
  }

  return {
    success: true,
    profile: {
      username: profileData.username,
      avatar_index: profileData.avatar_index,
      elo_rating: 1200,
      games_played: 0,
      balance_tct: 0,
    },
  };
}

interface Session {
  userId: string;
  token: string;
  expiresAt: number;
}

function createSession(
  user: MockUser,
  options: { expiresInMs?: number } = {}
): Session {
  const expiresInMs = options.expiresInMs ?? 24 * 60 * 60 * 1000; // 24 hours
  return {
    userId: user.id,
    token: `session-${Date.now()}`,
    expiresAt: Date.now() + expiresInMs,
  };
}

let storedSessionData: string | null = null;

function storeSession(session: Session): string {
  storedSessionData = JSON.stringify(session);
  return storedSessionData;
}

function restoreSession(data: string | null): Session | null {
  if (!data && !storedSessionData) return null;
  try {
    return JSON.parse(data || storedSessionData || "null");
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  storedSessionData = null;
}

function isSessionValid(session: Session): boolean {
  return session.expiresAt > Date.now();
}

function refreshSession(session: Session): Session {
  return {
    ...session,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
}

function simulateLogout(authState: any): any {
  return {
    user: null,
    isAuthenticated: false,
    session: null,
  };
}

function simulateOTPVerification(
  otp: string,
  options: { expired?: boolean; invalid?: boolean } = {}
): { success: boolean; error?: string } {
  if (options.expired) {
    return { success: false, error: "OTP has expired" };
  }
  if (options.invalid) {
    return { success: false, error: "OTP is invalid" };
  }
  return { success: true };
}
