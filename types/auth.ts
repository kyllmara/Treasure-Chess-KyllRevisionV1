/**
 * Authentication Type Definitions
 *
 * Comprehensive type system for Magic Link authentication with guest mode support.
 * Used throughout the application for type-safe authentication handling.
 */

import type { Profile } from "./supabase";

// ============================================================================
// Core Auth State Types
// ============================================================================

/**
 * Authentication mode determines the user's access level
 */
export type AuthMode =
  | "guest"           // Unauthenticated - practice mode only
  | "authenticated"   // Fully authenticated with Magic Link
  | "loading";        // Initial state while checking auth

/**
 * Login method used for authentication
 */
export type LoginMethod =
  | "email"
  | "google"
  | "apple"
  | "twitter"
  | "discord"
  | "wallet";

/**
 * Email OTP flow state
 */
export type OTPFlowState =
  | "idle"                    // No OTP flow in progress
  | "sending_code"            // Sending OTP to email
  | "awaiting_code_input"     // Waiting for user to enter OTP
  | "verifying_code"          // Verifying entered OTP
  | "success"                 // OTP verified, login complete
  | "error";                  // Error occurred during flow

/**
 * Wallet type for multi-wallet support
 */
export type WalletType =
  | "embedded"      // Magic Link-managed embedded wallet
  | "smart"         // Smart contract wallet (future)
  | "external";     // External wallet via WalletConnect

/**
 * Legacy Magic Link user representation — kept for interface compatibility, always null.
 * @deprecated Supabase Auth is the only auth system in use.
 */
export interface MagicUser {
  issuer: string;
  email: string | null;
  publicAddress: string | null;
}

/**
 * @deprecated Kept for backwards compatibility — never populated.
 */
export interface PrivyUser {
  id: string;
  createdAt: string;
  linkedAccounts: LinkedAccount[];
}

/**
 * Linked account types (for backwards compatibility)
 */
export type LinkedAccount =
  | EmailAccount
  | GoogleAccount
  | AppleAccount
  | TwitterAccount
  | DiscordAccount
  | WalletAccount;

export interface EmailAccount {
  type: "email";
  address: string;
  verifiedAt?: string;
}

export interface GoogleAccount {
  type: "google";
  email: string;
  name?: string;
  profilePictureUrl?: string;
  subject: string;
}

export interface AppleAccount {
  type: "apple";
  email?: string;
  subject: string;
}

export interface TwitterAccount {
  type: "twitter";
  username: string;
  name?: string;
  profilePictureUrl?: string;
  subject: string;
}

export interface DiscordAccount {
  type: "discord";
  username: string;
  email?: string;
  subject: string;
}

export interface WalletAccount {
  type: "wallet";
  address: string;
  chainType: "ethereum" | "solana";
  walletClient?: string;
  connectorType?: string;
}

// ============================================================================
// Auth State
// ============================================================================

/**
 * Authenticated user information
 */
export interface AuthUser {
  /** Internal user ID (from Supabase profile) */
  id: string;
  /** Supabase Auth UUID (session.user.id) */
  authUserId: string;
  /** User's email if available */
  email: string | null;
  /** Username for display */
  username: string;
  /** Primary wallet address */
  walletAddress: string | null;
  /** Active wallet type */
  activeWalletType: WalletType;
  /** Login method used */
  loginMethod: LoginMethod | null;
}

/**
 * Complete authentication state
 */
export interface AuthState {
  /** Current authentication mode */
  mode: AuthMode;

  /** Always true — kept for interface compatibility with Supabase Auth */
  isMagicReady: boolean;

  /** @deprecated Use isMagicReady */
  isPrivyReady?: boolean;

  /** Whether auth state is being loaded */
  isLoading: boolean;

  /** User is fully authenticated with Magic Link */
  isAuthenticated: boolean;

  /** User is in guest mode (not authenticated) */
  isGuest: boolean;

  /** Authenticated user info (null if guest) */
  user: AuthUser | null;

  /** User profile from Supabase */
  profile: Profile | null;

  /** Magic Link user object */
  magicUser: MagicUser | null;

  /** @deprecated Use magicUser instead */
  privyUser?: PrivyUser | null;

  /** Current error message */
  error: AuthError | null;

  /** OTP flow state for email login */
  otpState: OTPFlowState;

  /** Email used in current OTP flow */
  otpEmail: string | null;

}

// ============================================================================
// Auth Actions
// ============================================================================

/**
 * Email OTP login params
 */
export interface EmailLoginParams {
  email: string;
}

/**
 * OTP verification params
 */
export interface VerifyOTPParams {
  code: string;
}

/**
 * OAuth provider for social login
 */
export type OAuthProvider = "google" | "apple" | "twitter" | "discord";

/**
 * External wallet connection params
 */
export interface ConnectWalletParams {
  /** Optional: Specific wallet to connect (e.g., "metamask", "rainbow") */
  walletClient?: string;
}

/**
 * Authentication actions available to consumers
 */
export interface AuthActions {
  // Email OTP Flow
  /** Start email login - sends OTP to provided email */
  sendOTP: (params: EmailLoginParams) => Promise<void>;
  /** Verify OTP code and complete login */
  verifyOTP: (params: VerifyOTPParams) => Promise<void>;
  /** Cancel current OTP flow */
  cancelOTPFlow: () => void;
  /** Resend OTP to current email */
  resendOTP: () => Promise<void>;

  // OAuth Logins
  /** Login with Google */
  loginWithGoogle: () => Promise<void>;
  /** Login with Apple (iOS only) */
  loginWithApple: () => Promise<void>;
  /** Login with Twitter/X (not supported with Magic Link) */
  loginWithTwitter: () => Promise<void>;
  /** Login with Discord (not supported with Magic Link) */
  loginWithDiscord: () => Promise<void>;

  // Wallet Connection
  /** Connect external wallet via WalletConnect */
  connectWallet: (params?: ConnectWalletParams) => Promise<void>;
  /** Disconnect external wallet */
  disconnectWallet: () => Promise<void>;
  /** Switch active wallet type */
  setActiveWallet: (type: WalletType) => Promise<void>;

  // Guest Mode
  /** Continue as guest (no login required) */
  continueAsGuest: () => void;

  // Session Management
  /** Log out and clear session */
  logout: () => Promise<void>;
  /** Refresh user profile from Supabase */
  refreshProfile: () => Promise<void>;

  // Utilities
  /** Check if user can access protected feature */
  requireAuth: () => boolean;
  /** Clear current error */
  clearError: () => void;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for authentication errors
 */
export type AuthErrorCode =
  | "INVALID_EMAIL"
  | "INVALID_OTP"
  | "OTP_EXPIRED"
  | "OTP_SEND_FAILED"
  | "OAUTH_CANCELLED"
  | "OAUTH_FAILED"
  | "OAUTH_NOT_SUPPORTED"
  | "WALLET_CONNECTION_FAILED"
  | "WALLET_DISCONNECTED"
  | "PROFILE_FETCH_FAILED"
  | "PROFILE_CREATE_FAILED"
  | "PROFILE_UPDATE_FAILED"
  | "LOGOUT_FAILED"
  | "RATE_LIMIT_EXCEEDED"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Structured authentication error
 */
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

// ============================================================================
// Route Protection Types
// ============================================================================

/**
 * Routes that require authentication (multiplayer features)
 */
export const PROTECTED_ROUTES = [
  "/game",              // Online multiplayer games
  "/matchmaking",       // Find opponents
  "/challenge-board",   // Public challenges
  "/create-challenge",  // Create a challenge
  "/join-challenge",    // Join a challenge
  "/challenge-player",  // Challenge specific player
  "/challenge-waiting", // Waiting for challenge acceptance
  "/tournaments",       // Tournament participation
  "/wallet",            // Wallet management
  "/deposit",           // Deposit funds
  "/withdraw",          // Withdraw funds
  "/profile",           // User profile
  "/rewards",           // Reward claims
  "/livestream",        // Live streaming
] as const;

/**
 * Routes accessible without authentication (guest mode)
 */
export const GUEST_ROUTES = [
  "/",                  // Home screen
  "/practice",          // Practice vs AI
  "/settings",          // App settings
  "/leaderboard",       // View leaderboard
  "/login",             // Login screen
  "/game-settings",     // Game preferences
] as const;

export type ProtectedRoute = typeof PROTECTED_ROUTES[number];
export type GuestRoute = typeof GUEST_ROUTES[number];

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Complete auth context type (state + actions)
 */
export type AuthContextType = AuthState & AuthActions;

/**
 * Guest profile template for unauthenticated users
 */
export interface GuestProfile {
  id: "guest_user";
  username: "Guest";
  email: null;
  avatar_index: 0;
  elo_rating: 0;
  games_played: 0;
  games_won: 0;
  games_lost: 0;
}

/**
 * Profile creation params for new users
 */
export interface CreateProfileParams {
  authUserId: string;
  email: string | null;
  username: string;
  embeddedWalletAddress: string;
}
