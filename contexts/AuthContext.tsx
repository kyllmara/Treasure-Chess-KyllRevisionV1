/**
 * AuthContext - Comprehensive Authentication Provider using Magic Link
 *
 * Provides authentication state and actions throughout the app.
 *
 * Features:
 * - Magic Link authentication with embedded wallet
 * - Email OTP login flow (users sign in with email, get wallet automatically)
 * - OAuth logins (Google, Apple)
 * - Guest mode for unauthenticated access to practice/settings
 * - Supabase profile synchronization
 * - Comprehensive error handling
 *
 * Usage:
 * ```tsx
 * import { useAuth } from "@/contexts/AuthContext";
 *
 * function MyComponent() {
 *   const { isAuthenticated, isGuest, user, sendOTP, verifyOTP } = useAuth();
 *   // ...
 * }
 * ```
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured, authenticateWithMagic, signOutSupabase } from "@/lib/supabase";
import { useMagic, getMagicInstance } from "@/components/MagicWrapper";
import type { Profile, ProfileInsert } from "@/types/supabase";

// Security module imports
import {
  authRateLimiter,
  otpRateLimiter,
  formatRetryTime,
  emailSchema,
  otpSchema,
  validate,
  getValidationErrors,
  logger,
  validateNotTestAccount,
} from "@/lib/security";
import { cleanupProfileSync } from "@/lib/profileSync";
import { useUserStore } from "@/stores/userStore";
import { getRelaySDK, resetRelaySDK } from "@/lib/relay";
import type {
  AuthState,
  AuthActions,
  AuthContextType,
  AuthError,
  AuthErrorCode,
  AuthUser,
  OTPFlowState,
  WalletType,
  LoginMethod,
  MagicUser,
  EmailLoginParams,
  VerifyOTPParams,
  ConnectWalletParams,
  OAuthProvider,
  CreateProfileParams,
} from "@/types/auth";

// ============================================================================
// Constants
// ============================================================================

const AUTH_STORAGE_KEY = "@treasure_chess_auth_state";
const GUEST_MODE_KEY = "@treasure_chess_guest_mode";

// Magic API Key from environment
const MAGIC_API_KEY = process.env.EXPO_PUBLIC_MAGIC_API_KEY || "";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a structured auth error
 */
function createAuthError(
  code: AuthErrorCode,
  message: string,
  recoverable: boolean = true,
  details?: Record<string, unknown>
): AuthError {
  return { code, message, recoverable, details };
}

/**
 * Generates a username from email
 */
function generateUsername(email: string | null): string {
  if (email) {
    return email.split("@")[0];
  }
  // Fallback to "Player" + random suffix
  return `Player${Math.floor(Math.random() * 10000)}`;
}

// ============================================================================
// Guest Profile
// ============================================================================

/**
 * Default profile for guest users (unauthenticated)
 */
const GUEST_PROFILE: Profile = {
  id: "guest_user",
  privy_user_id: "guest_user", // Using privy_user_id for backwards compatibility with database
  username: "Guest",
  email: null,
  avatar_index: 0,
  embedded_wallet_address: "",
  smart_wallet_address: null,
  external_wallet_address: null,
  active_wallet_type: "embedded",
  elo_rating: 0,
  games_played: 0,
  games_won: 0,
  games_lost: 0,
  games_drawn: 0,
  current_streak: 0,
  longest_streak: 0,
  sound_enabled: true,
  music_enabled: true,
  haptic_enabled: true,
  notifications_enabled: false,
  push_token: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
};

// ============================================================================
// Initial State
// ============================================================================

const initialState: AuthState = {
  mode: "loading",
  isMagicReady: false,
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,
  user: null,
  profile: null,
  magicUser: null,
  error: null,
  otpState: "idle",
  otpEmail: null,
  walletProvider: null,
};

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [state, setState] = useState<AuthState>(initialState);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [pendingDIDToken, setPendingDIDToken] = useState<string | null>(null);

  // Refs to track initialization
  const isInitialized = useRef(false);
  const profileSyncInProgress = useRef(false);

  // -------------------------------------------------------------------------
  // Magic Link
  // -------------------------------------------------------------------------
  const { magic, isReady: magicReady } = useMagic();
  const isMagicAvailable = Boolean(MAGIC_API_KEY && magic);

  // -------------------------------------------------------------------------
  // Profile Sync with Supabase
  // -------------------------------------------------------------------------

  /**
   * Fetches profile from Supabase by Magic user ID (issuer)
   */
  const fetchProfile = useCallback(async (magicUserId: string): Promise<Profile | null> => {
    if (!isSupabaseConfigured) {
      logger.debug("Auth", "Supabase not configured, skipping profile fetch");
      return null;
    }

    try {
      // Query using privy_user_id (Magic user ID is stored here for backwards compatibility)
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("privy_user_id", magicUserId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Profile not found - will need to create
          return null;
        }
        logger.error("Auth", "Error fetching profile", { error: error.message, magicUserId });
        return null;
      }

      logger.info("Auth", "Fetched profile from Supabase", {
        profileId: data.id,
        username: data.username,
        magicUserId
      });
      return data;
    } catch (e) {
      logger.error("Auth", "Exception fetching profile", { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, []);

  /**
   * Creates a new profile in Supabase for a new user
   */
  const createProfile = useCallback(async (params: CreateProfileParams): Promise<Profile | null> => {
    if (!isSupabaseConfigured) {
      logger.debug("Auth", "Supabase not configured, skipping profile creation");
      return null;
    }

    try {
      const newProfile: ProfileInsert = {
        privy_user_id: params.magicUserId, // Store Magic user ID in privy_user_id for backwards compatibility
        username: params.username,
        email: params.email,
        embedded_wallet_address: params.embeddedWalletAddress,
        avatar_index: Math.floor(Math.random() * 10),
        elo_rating: 0,
        games_played: 0,
        games_won: 0,
        games_lost: 0,
        games_drawn: 0,
        current_streak: 0,
        longest_streak: 0,
        sound_enabled: true,
        music_enabled: true,
        haptic_enabled: true,
        notifications_enabled: false,
      };

      // Cast to any to handle Supabase strict typing
      const { data, error } = await (supabase
        .from("profiles") as any)
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        logger.error("Auth", "Error creating profile", { error: error.message });
        return null;
      }

      // Create initial balance record for the new user
      if (data?.id) {
        const { error: balanceError } = await (supabase
          .from("balances") as any)
          .insert({
            user_id: data.id,
            available_tct: 0,
            locked_tct: 0,
            total_deposited_tct: 0,
            total_withdrawn_tct: 0,
            total_won_tct: 0,
            total_lost_tct: 0,
            total_commission_paid_tct: 0,
          });

        if (balanceError) {
          logger.error("Auth", "Error creating balance record", { error: balanceError.message });
          // Don't fail profile creation if balance creation fails
        } else {
          logger.info("Auth", "Balance record created for new user", { userId: data.id });
        }
      }

      return data;
    } catch (e) {
      logger.error("Auth", "Exception creating profile", { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }, []);

  /**
   * Updates last_seen_at timestamp in profile
   */
  const updateLastSeen = useCallback(async (profileId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      await (supabase
        .from("profiles") as any)
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", profileId);
    } catch (e) {
      // Non-critical, don't throw
      logger.debug("Auth", "Failed to update last_seen_at", { error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  /**
   * Synchronizes Magic user with Supabase profile
   * Creates profile if it doesn't exist
   */
  const syncProfile = useCallback(async (
    mUser: MagicUser,
    walletAddr: string | null
  ): Promise<Profile | null> => {
    if (profileSyncInProgress.current) {
      logger.debug("Auth", "Profile sync already in progress");
      return null;
    }

    profileSyncInProgress.current = true;

    try {
      // First, try to fetch existing profile
      let profile = await fetchProfile(mUser.issuer);

      if (!profile) {
        // Create new profile
        const username = generateUsername(mUser.email);

        profile = await createProfile({
          magicUserId: mUser.issuer,
          email: mUser.email,
          username,
          embeddedWalletAddress: walletAddr || "",
        });

        if (profile) {
          logger.info("Auth", "Created new profile", { profileId: profile.id });
        }
      } else {
        // Update last seen
        await updateLastSeen(profile.id);

        // Update wallet address if changed
        if (walletAddr && walletAddr !== profile.embedded_wallet_address) {
          // Cast to any to handle Supabase strict typing
          await (supabase
            .from("profiles") as any)
            .update({ embedded_wallet_address: walletAddr })
            .eq("id", profile.id);
          profile.embedded_wallet_address = walletAddr;
        }
      }

      return profile;
    } finally {
      profileSyncInProgress.current = false;
    }
  }, [fetchProfile, createProfile, updateLastSeen]);

  // -------------------------------------------------------------------------
  // Handle successful authentication
  // -------------------------------------------------------------------------
  const handleAuthSuccess = useCallback(async () => {
    if (!magic) return;

    try {
      // Get user metadata from Magic
      const metadata = await magic.user.getInfo();
      logger.info("Auth", "Magic user metadata", {
        issuer: metadata?.issuer,
        email: metadata?.email,
        publicAddress: metadata?.publicAddress
      });

      if (!metadata || !metadata.issuer) {
        throw new Error("Failed to get user metadata");
      }

      // Try to get wallet address - publicAddress should be present with network config
      let walletAddress = metadata.publicAddress;

      // If publicAddress is null, try to get it via Web3 provider
      if (!walletAddress) {
        try {
          const provider = magic.rpcProvider;
          if (provider) {
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
              walletAddress = accounts[0];
              logger.info("Auth", "Got wallet address from provider", { walletAddress });
            }
          }
        } catch (providerError) {
          logger.debug("Auth", "Failed to get wallet from provider", {
            error: providerError instanceof Error ? providerError.message : String(providerError)
          });
        }
      }

      const magicUser: MagicUser = {
        issuer: metadata.issuer,
        email: metadata.email || null,
        publicAddress: walletAddress || null,
      };

      // Sync profile with Supabase
      const profile = await syncProfile(magicUser, magicUser.publicAddress);

      const authUser: AuthUser = {
        id: profile?.id ?? magicUser.issuer,
        magicUserId: magicUser.issuer,
        email: magicUser.email,
        username: profile?.username ?? generateUsername(magicUser.email),
        walletAddress: magicUser.publicAddress,
        activeWalletType: "embedded",
        loginMethod: "email",
      };

      // Clear guest mode flag
      await AsyncStorage.removeItem(GUEST_MODE_KEY);

      // Get wallet provider from Magic RPC provider
      const provider = magic.rpcProvider || null;

      setState((s) => ({
        ...s,
        mode: "authenticated",
        isLoading: false,
        isAuthenticated: true,
        isGuest: false,
        user: authUser,
        profile: profile ?? GUEST_PROFILE,
        magicUser,
        error: null,
        otpState: "success",
        otpEmail: null,
        walletProvider: provider,
      }));

      // Sync profile to userStore for wallet and other screens
      if (profile) {
        logger.info("Auth", "Syncing profile to userStore", {
          profileId: profile.id,
          username: profile.username,
          email: profile.email
        });
        const userStoreProfile = {
          id: profile.id,
          privyUserId: profile.privy_user_id,
          username: profile.username,
          email: profile.email,
          avatarIndex: profile.avatar_index,
          embeddedWalletAddress: profile.embedded_wallet_address || "",
          smartWalletAddress: profile.smart_wallet_address,
          externalWalletAddress: profile.external_wallet_address,
          activeWalletType: profile.active_wallet_type,
          eloRating: profile.elo_rating,
          gamesPlayed: profile.games_played,
          gamesWon: profile.games_won,
          gamesLost: profile.games_lost,
          gamesDrawn: profile.games_drawn,
          currentStreak: profile.current_streak,
          longestStreak: profile.longest_streak,
          availableTct: 0,
          lockedTct: 0,
          totalDepositedTct: 0,
          totalWithdrawnTct: 0,
          totalWonTct: 0,
          totalLostTct: 0,
          totalCommissionPaidTct: 0,
          soundEnabled: profile.sound_enabled,
          musicEnabled: profile.music_enabled,
          hapticEnabled: profile.haptic_enabled,
          notificationsEnabled: profile.notifications_enabled,
          pushToken: profile.push_token,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
          lastSeenAt: profile.last_seen_at,
        };
        useUserStore.getState().setProfile(userStoreProfile);
        logger.info("Auth", "Profile synced to userStore", { profileId: profile.id });

        // Establish Supabase Auth session for RLS policies
        // Get DID token from Magic and verify with our Edge Function
        // This is REQUIRED for relay transactions to work
        try {
          logger.info("Auth", "Getting DID token from Magic...");
          const didToken = await magic.user.getIdToken();
          logger.info("Auth", "Got DID token from Magic", {
            tokenLength: didToken?.length,
            tokenPreview: didToken?.substring(0, 100) + "...",
            tokenType: typeof didToken,
          });
          if (didToken && profile.id) {
            logger.info("Auth", "Establishing Supabase Auth session...");
            const authResult = await authenticateWithMagic(didToken, profile.id);
            if (authResult.success) {
              logger.info("Auth", "Supabase Auth session established", {
                userId: authResult.user?.id
              });
            } else {
              // This is critical for challenges/tournaments to work
              logger.error("Auth", "Failed to establish Supabase Auth session", {
                error: authResult.error
              });
              // Don't fail login, but warn user
              console.warn("[Auth] Warning: Session not fully established. Some features may not work.");
            }
          } else {
            logger.error("Auth", "Could not get DID token or profile ID", {
              hasDidToken: !!didToken,
              hasProfileId: !!profile?.id
            });
          }
        } catch (supabaseAuthError) {
          logger.error("Auth", "Supabase Auth integration error", {
            error: supabaseAuthError instanceof Error ? supabaseAuthError.message : String(supabaseAuthError)
          });
          console.error("[Auth] Session setup error:", supabaseAuthError);
        }
      }

      setOtpEmail(null);
      logger.authEvent("login", "success", { method: "email" });

      // Initialize Relay SDK for gasless transactions (non-blocking)
      // This pre-initializes the wallet so challenges/tournaments work immediately
      if (provider) {
        try {
          const relaySDK = getRelaySDK();
          await relaySDK.initialize(provider);
          logger.info("Auth", "Relay SDK initialized for gasless transactions");
        } catch (relayError) {
          // Non-fatal: user can still use the app, SDK will retry on first use
          logger.warn("Auth", "Relay SDK initialization failed (will retry on use)", {
            error: relayError instanceof Error ? relayError.message : String(relayError)
          });
        }
      }
    } catch (e) {
      logger.error("Auth", "Error handling auth success", { error: e instanceof Error ? e.message : String(e) });
      const error = createAuthError(
        "PROFILE_FETCH_FAILED",
        "Login succeeded but failed to load profile"
      );
      setState((s) => ({ ...s, error, isLoading: false }));
    }
  }, [magic, syncProfile]);

  // -------------------------------------------------------------------------
  // Initialization & Magic State Sync
  // -------------------------------------------------------------------------

  // Initialize auth state
  useEffect(() => {
    async function init() {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        // Check if user was in guest mode
        const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);

        if (guestMode === "true" && !isMagicAvailable) {
          // Continue in guest mode
          setState((s) => ({
            ...s,
            mode: "guest",
            isLoading: false,
            isGuest: true,
            isAuthenticated: false,
            profile: GUEST_PROFILE,
          }));
          return;
        }

        // If Magic is not available, default to guest mode
        if (!isMagicAvailable) {
          setState((s) => ({
            ...s,
            mode: "guest",
            isLoading: false,
            isGuest: true,
            isAuthenticated: false,
            profile: GUEST_PROFILE,
          }));
          return;
        }

        // Magic is available - wait for it to be ready
        setState((s) => ({
          ...s,
          isLoading: true,
        }));
      } catch (e) {
        logger.error("Auth", "Init error", { error: e instanceof Error ? e.message : String(e) });
        // Default to guest mode on error
        setState((s) => ({
          ...s,
          mode: "guest",
          isLoading: false,
          isGuest: true,
          profile: GUEST_PROFILE,
        }));
      }
    }

    init();
  }, [isMagicAvailable]);

  // Check Magic login status when ready
  useEffect(() => {
    if (!isMagicAvailable || !magicReady) return;

    async function checkLoginStatus() {
      if (!magic) return;

      setState((s) => ({ ...s, isMagicReady: true }));

      try {
        const isLoggedIn = await magic.user.isLoggedIn();

        if (isLoggedIn) {
          // User is logged in - fetch their info
          await handleAuthSuccess();
        } else {
          // User is not logged in - check for guest mode
          const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);

          setState((s) => ({
            ...s,
            mode: "guest",
            isLoading: false,
            isAuthenticated: false,
            isGuest: true,
            user: null,
            profile: GUEST_PROFILE,
            magicUser: null,
          }));
        }
      } catch (e) {
        logger.error("Auth", "Error checking login status", { error: e instanceof Error ? e.message : String(e) });
        setState((s) => ({
          ...s,
          mode: "guest",
          isLoading: false,
          isAuthenticated: false,
          isGuest: true,
          profile: GUEST_PROFILE,
        }));
      }
    }

    checkLoginStatus();
  }, [isMagicAvailable, magicReady, magic, handleAuthSuccess]);

  // Periodically refresh Supabase session to prevent JWT expiration
  useEffect(() => {
    if (!state.isAuthenticated || state.isGuest) return;

    // Refresh session every 10 minutes
    const REFRESH_INTERVAL = 10 * 60 * 1000;

    const refreshSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          logger.debug("Auth", "No active session to refresh - user may need to log in again");
          // Don't attempt refresh if there's no session at all - it will fail
          // The user will see an error when they try to make an authenticated action
          return;
        }

        // Check if token expires within 5 minutes
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = expiresAt ? expiresAt - now : 0;

        if (expiresIn < 300) { // 5 minutes
          logger.debug("Auth", "Session expiring soon, refreshing", { expiresIn });
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            logger.error("Auth", "Session refresh failed", { error: refreshError.message });
          } else {
            logger.debug("Auth", "Session refreshed successfully");
          }
        }
      } catch (e) {
        logger.error("Auth", "Session refresh error", { error: e instanceof Error ? e.message : String(e) });
      }
    };

    // Initial check
    refreshSession();

    // Set up interval
    const intervalId = setInterval(refreshSession, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [state.isAuthenticated, state.isGuest]);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.debug("Auth", "Supabase auth state changed", { event, hasSession: !!session });

      if (event === "TOKEN_REFRESHED") {
        logger.debug("Auth", "Token refreshed by Supabase");
      } else if (event === "SIGNED_OUT") {
        logger.debug("Auth", "Supabase session signed out");
        // Don't automatically sign out the user - Magic session might still be valid
        // The handleAuthSuccess will re-establish Supabase session when needed
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Auth Actions
  // -------------------------------------------------------------------------

  /**
   * Send OTP to email address using Magic Link
   */
  const sendOTP = useCallback(async ({ email }: EmailLoginParams): Promise<void> => {
    if (!magic) {
      throw createAuthError(
        "MAGIC_NOT_READY" as AuthErrorCode,
        "Authentication not available. Please try again later.",
        true
      );
    }

    // Check rate limit first
    const rateLimitResult = await authRateLimiter.check(email);
    if (!rateLimitResult.allowed) {
      const retryTime = formatRetryTime(rateLimitResult.retryAfter);
      logger.securityEvent("rate_limit_exceeded", {
        description: `Auth rate limit exceeded for ${email}`,
      });
      const error = createAuthError(
        "RATE_LIMIT_EXCEEDED" as AuthErrorCode,
        `Too many login attempts. Please try again in ${retryTime}.`,
        true,
        { retryAfter: rateLimitResult.retryAfter }
      );
      setState((s) => ({ ...s, error }));
      throw error;
    }

    // Validate email
    const emailValidation = validate(emailSchema, email);
    if (!emailValidation.success) {
      const errors = getValidationErrors(emailValidation.errors);
      const error = createAuthError("INVALID_EMAIL", errors[0] || "Please enter a valid email address");
      setState((s) => ({ ...s, error }));
      throw error;
    }

    // Check for test accounts in production
    const testAccountCheck = validateNotTestAccount(email);
    if (!testAccountCheck.valid) {
      logger.securityEvent("suspicious_activity", {
        description: `Test account login attempt: ${email}`,
      });
      const error = createAuthError(
        "INVALID_EMAIL",
        testAccountCheck.reason || "This email address is not allowed"
      );
      setState((s) => ({ ...s, error }));
      throw error;
    }

    setState((s) => ({
      ...s,
      otpState: "sending_code",
      otpEmail: email,
      error: null,
    }));
    setOtpEmail(email);

    try {
      // Magic Link's loginWithEmailOTP handles the entire flow
      // It sends the OTP and shows Magic's UI for code entry
      logger.info("Auth", "Starting Magic email OTP flow for", { email });

      const didToken = await magic.auth.loginWithEmailOTP({ email });

      if (didToken) {
        logger.info("Auth", "Magic email OTP login successful");
        // Reset rate limiters on successful login
        await authRateLimiter.reset(email);

        setState((s) => ({
          ...s,
          otpState: "success",
        }));

        // Handle successful auth
        await handleAuthSuccess();
      } else {
        throw new Error("Login failed - no token received");
      }
    } catch (e) {
      const isCancelled = e instanceof Error && (
        e.message.includes("cancel") ||
        e.message.includes("User denied") ||
        e.message.includes("closed")
      );

      if (isCancelled) {
        logger.info("Auth", "User cancelled OTP flow");
        setState((s) => ({
          ...s,
          otpState: "idle",
          otpEmail: null,
          error: null,
        }));
        return;
      }

      logger.authEvent("login", "failure", {
        method: "email",
        failureReason: e instanceof Error ? e.message : "Unknown error",
      });
      const error = createAuthError(
        "OTP_SEND_FAILED",
        e instanceof Error ? e.message : "Failed to send verification code"
      );
      setState((s) => ({
        ...s,
        otpState: "error",
        error,
      }));
      throw error;
    }
  }, [magic, handleAuthSuccess]);

  /**
   * Verify OTP code using Magic Link
   */
  const verifyOTP = useCallback(async ({ code }: VerifyOTPParams): Promise<void> => {
    if (!magic || !otpEmail) {
      throw createAuthError(
        "MAGIC_NOT_READY" as AuthErrorCode,
        "Email verification not available",
        true
      );
    }

    // Check OTP rate limit
    const rateLimitResult = await otpRateLimiter.check(otpEmail);
    if (!rateLimitResult.allowed) {
      const retryTime = formatRetryTime(rateLimitResult.retryAfter);
      logger.securityEvent("rate_limit_exceeded", {
        description: `OTP verification rate limit exceeded for ${otpEmail}`,
      });
      const error = createAuthError(
        "RATE_LIMIT_EXCEEDED" as AuthErrorCode,
        `Too many verification attempts. Please try again in ${retryTime}.`,
        true,
        { retryAfter: rateLimitResult.retryAfter }
      );
      setState((s) => ({ ...s, error }));
      throw error;
    }

    // Validate OTP
    const otpValidation = validate(otpSchema, code);
    if (!otpValidation.success) {
      const errors = getValidationErrors(otpValidation.errors);
      const error = createAuthError("INVALID_OTP", errors[0] || "Please enter a valid 6-digit code");
      setState((s) => ({ ...s, error }));
      throw error;
    }

    setState((s) => ({
      ...s,
      otpState: "verifying_code",
      error: null,
    }));

    try {
      // Magic Link loginWithEmailOTP - this verifies the code and logs in
      const didToken = await magic.auth.loginWithEmailOTP({
        email: otpEmail,
        // The code is entered through Magic's UI, but we can also pass it programmatically
        // if using showUI: false
      });

      if (didToken) {
        // Reset rate limiters on successful login
        await authRateLimiter.reset(otpEmail);
        await otpRateLimiter.reset(otpEmail);

        // Handle successful auth
        await handleAuthSuccess();
      } else {
        throw new Error("Login failed - no token received");
      }
    } catch (e) {
      logger.authEvent("login", "failure", {
        method: "email",
        failureReason: e instanceof Error ? e.message : "Invalid OTP",
      });
      const error = createAuthError(
        "INVALID_OTP",
        e instanceof Error ? e.message : "Invalid or expired code"
      );
      setState((s) => ({
        ...s,
        otpState: "error",
        error,
      }));
      throw error;
    }
  }, [magic, otpEmail, handleAuthSuccess]);

  /**
   * Login with email directly (Magic Link handles the full flow)
   * This is the preferred method - shows Magic's login UI
   */
  const loginWithEmail = useCallback(async (email: string): Promise<void> => {
    if (!magic) {
      throw createAuthError(
        "MAGIC_NOT_READY" as AuthErrorCode,
        "Authentication not available. Please try again later.",
        true
      );
    }

    setState((s) => ({
      ...s,
      isLoading: true,
      otpState: "sending_code",
      otpEmail: email,
      error: null,
    }));

    try {
      // Magic Link's loginWithEmailOTP handles the entire flow
      const didToken = await magic.auth.loginWithEmailOTP({ email });

      if (didToken) {
        await handleAuthSuccess();
      } else {
        throw new Error("Login failed");
      }
    } catch (e) {
      const isCancelled = e instanceof Error && (
        e.message.includes("cancel") ||
        e.message.includes("User denied")
      );

      if (isCancelled) {
        setState((s) => ({
          ...s,
          isLoading: false,
          otpState: "idle",
          error: null,
        }));
        return;
      }

      const error = createAuthError(
        "OTP_SEND_FAILED",
        e instanceof Error ? e.message : "Login failed"
      );
      setState((s) => ({
        ...s,
        isLoading: false,
        otpState: "error",
        error,
      }));
      throw error;
    }
  }, [magic, handleAuthSuccess]);

  /**
   * Cancel current OTP flow
   */
  const cancelOTPFlow = useCallback(() => {
    setState((s) => ({
      ...s,
      otpState: "idle",
      otpEmail: null,
      error: null,
    }));
    setOtpEmail(null);
  }, []);

  /**
   * Resend OTP to current email
   */
  const resendOTP = useCallback(async (): Promise<void> => {
    if (!otpEmail) {
      throw createAuthError(
        "OTP_SEND_FAILED",
        "No email address to resend to"
      );
    }
    await loginWithEmail(otpEmail);
  }, [otpEmail, loginWithEmail]);

  /**
   * Login with OAuth provider using Magic Link
   */
  const loginWithOAuth = useCallback(async (provider: OAuthProvider): Promise<void> => {
    if (!magic) {
      const error = createAuthError(
        "OAUTH_NOT_SUPPORTED",
        `${provider} login not available. Please use email login.`,
        true
      );
      setState((s) => ({ ...s, error }));
      throw error;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Magic Link OAuth extension - access via oauth property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oauth = (magic as any).oauth;

      if (!oauth) {
        throw new Error("OAuth not configured. Please use email login.");
      }

      // OAuth login with popup (works better in React Native)
      await oauth.loginWithPopup({
        provider,
        redirectURI: `${process.env.EXPO_PUBLIC_APP_SCHEME || 'treasurechess'}://oauth`,
      });

      // After successful OAuth, handle auth success
      await handleAuthSuccess();
    } catch (e) {
      const isCancelled = e instanceof Error && (
        e.message.includes("cancel") ||
        e.message.includes("closed") ||
        e.message.includes("User denied")
      );
      const error = createAuthError(
        isCancelled ? "OAUTH_CANCELLED" : "OAUTH_FAILED",
        isCancelled
          ? "Login was cancelled"
          : e instanceof Error
          ? e.message
          : `${provider} login failed`
      );
      setState((s) => ({
        ...s,
        isLoading: false,
        error: isCancelled ? null : error,
      }));
      if (!isCancelled) {
        throw error;
      }
    }
  }, [magic, handleAuthSuccess]);

  const loginWithGoogle = useCallback(() => loginWithOAuth("google"), [loginWithOAuth]);
  const loginWithApple = useCallback(() => loginWithOAuth("apple"), [loginWithOAuth]);
  const loginWithTwitter = useCallback(async () => {
    throw createAuthError("OAUTH_NOT_SUPPORTED", "Twitter login not supported with Magic Link");
  }, []);
  const loginWithDiscord = useCallback(async () => {
    throw createAuthError("OAUTH_NOT_SUPPORTED", "Discord login not supported with Magic Link");
  }, []);

  /**
   * Connect external wallet (placeholder)
   */
  const connectWallet = useCallback(async (_params?: ConnectWalletParams): Promise<void> => {
    const error = createAuthError(
      "WALLET_CONNECTION_FAILED",
      "External wallet connection coming soon",
      true
    );
    setState((s) => ({ ...s, error }));
    throw error;
  }, []);

  /**
   * Disconnect external wallet
   */
  const disconnectWallet = useCallback(async (): Promise<void> => {
    logger.debug("Auth", "disconnectWallet called");
  }, []);

  /**
   * Set active wallet type
   */
  const setActiveWallet = useCallback(async (type: WalletType): Promise<void> => {
    if (!state.profile?.id) return;

    if (isSupabaseConfigured) {
      // Cast to any to handle Supabase strict typing
      await (supabase
        .from("profiles") as any)
        .update({ active_wallet_type: type })
        .eq("id", state.profile.id);
    }

    setState((s) => ({
      ...s,
      user: s.user ? { ...s.user, activeWalletType: type } : null,
      profile: s.profile ? { ...s.profile, active_wallet_type: type } : null,
    }));
  }, [state.profile?.id]);

  /**
   * Continue as guest (no authentication)
   */
  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_MODE_KEY, "true").catch((e) =>
      logger.debug("Auth", "Failed to set guest mode key")
    );

    setState((s) => ({
      ...s,
      mode: "guest",
      isLoading: false,
      isAuthenticated: false,
      isGuest: true,
      user: null,
      profile: GUEST_PROFILE,
      magicUser: null,
      error: null,
      otpState: "idle",
      otpEmail: null,
    }));
  }, []);

  /**
   * Log out and clear session
   */
  const logout = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Cleanup profile sync service first
      try {
        await cleanupProfileSync();
        logger.debug("Auth", "Profile sync cleaned up on logout");
      } catch (cleanupError) {
        logger.debug("Auth", "Profile sync cleanup error", {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      // Logout from Magic
      if (magic) {
        await magic.user.logout();
      }

      // Sign out from Supabase Auth
      await signOutSupabase();

      // Reset Relay SDK to clear cached wallet address
      resetRelaySDK();

      // Clear stored data
      await AsyncStorage.multiRemove([AUTH_STORAGE_KEY, GUEST_MODE_KEY]);

      logger.authEvent("logout", "success");

      // Reset to guest mode
      setState({
        ...initialState,
        mode: "guest",
        isMagicReady: magicReady,
        isLoading: false,
        isGuest: true,
        profile: GUEST_PROFILE,
        walletProvider: null,
      });
    } catch (e) {
      logger.authEvent("logout", "failure", {
        failureReason: e instanceof Error ? e.message : "Unknown error",
      });
      const error = createAuthError(
        "LOGOUT_FAILED",
        e instanceof Error ? e.message : "Logout failed"
      );
      setState((s) => ({
        ...s,
        isLoading: false,
        error,
      }));
      throw error;
    }
  }, [magic, magicReady]);

  /**
   * Refresh user profile from Supabase
   */
  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!state.magicUser?.issuer) return;

    const profile = await fetchProfile(state.magicUser.issuer);
    if (profile) {
      setState((s) => ({ ...s, profile }));

      // Also sync to userStore for consistent state across app
      const userStoreProfile = {
        id: profile.id,
        privyUserId: profile.privy_user_id,
        username: profile.username,
        email: profile.email,
        avatarIndex: profile.avatar_index,
        embeddedWalletAddress: profile.embedded_wallet_address || "",
        smartWalletAddress: profile.smart_wallet_address,
        externalWalletAddress: profile.external_wallet_address,
        activeWalletType: profile.active_wallet_type,
        eloRating: profile.elo_rating,
        gamesPlayed: profile.games_played,
        gamesWon: profile.games_won,
        gamesLost: profile.games_lost,
        gamesDrawn: profile.games_drawn,
        currentStreak: profile.current_streak,
        longestStreak: profile.longest_streak,
        soundEnabled: profile.sound_enabled,
        musicEnabled: profile.music_enabled,
        hapticEnabled: profile.haptic_enabled,
        notificationsEnabled: profile.notifications_enabled,
        pushToken: profile.push_token,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        lastSeenAt: profile.last_seen_at,
      };
      useUserStore.getState().updateProfile(userStoreProfile);
      logger.info("Auth", "Profile refreshed and synced to userStore", { profileId: profile.id, username: profile.username });
    }
  }, [state.magicUser?.issuer, fetchProfile]);

  /**
   * Check if user is authenticated (not guest)
   */
  const requireAuth = useCallback((): boolean => {
    return state.isAuthenticated && !state.isGuest;
  }, [state.isAuthenticated, state.isGuest]);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  // -------------------------------------------------------------------------
  // Context Value
  // -------------------------------------------------------------------------

  const value = useMemo<AuthContextType>(
    () => ({
      // State
      ...state,

      // Actions
      sendOTP,
      verifyOTP,
      cancelOTPFlow,
      resendOTP,
      loginWithGoogle,
      loginWithApple,
      loginWithTwitter,
      loginWithDiscord,
      connectWallet,
      disconnectWallet,
      setActiveWallet,
      continueAsGuest,
      logout,
      refreshProfile,
      requireAuth,
      clearError,
    }),
    [
      state,
      sendOTP,
      verifyOTP,
      cancelOTPFlow,
      resendOTP,
      loginWithGoogle,
      loginWithApple,
      loginWithTwitter,
      loginWithDiscord,
      connectWallet,
      disconnectWallet,
      setActiveWallet,
      continueAsGuest,
      logout,
      refreshProfile,
      requireAuth,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access authentication state and actions
 *
 * @throws Error if used outside of AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider. " +
      "Make sure your component is wrapped with <AuthProvider>."
    );
  }

  return context;
}

// ============================================================================
// Re-exports
// ============================================================================

export { GUEST_PROFILE };
export type { AuthContextType, AuthState, AuthActions, AuthError };
