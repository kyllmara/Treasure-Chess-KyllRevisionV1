/**
 * AuthContext - Authentication Provider using Supabase Auth
 *
 * Replaces Magic SDK with Supabase Auth for:
 * - Email OTP login (signInWithOtp + verifyOtp)
 * - Google OAuth (expo-web-browser + signInWithOAuth)
 * - Apple Sign-In (expo-apple-authentication + signInWithIdToken)
 * - Guest mode for unauthenticated access to practice/settings
 * - Supabase profile synchronization
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
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Profile, ProfileInsert } from "@/types/supabase";
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

// Deep-link scheme the app listens on — Supabase redirects here after OAuth completes,
// openAuthSessionAsync intercepts it and returns the tokens in the URL fragment.
const OAUTH_REDIRECT_URL = "treasurechess://login";

// ============================================================================
// Helper Functions
// ============================================================================

function createAuthError(
  code: AuthErrorCode,
  message: string,
  recoverable: boolean = true,
  details?: Record<string, unknown>
): AuthError {
  return { code, message, recoverable, details };
}

function generateUsername(email: string | null): string {
  if (email) {
    return email.split("@")[0];
  }
  return `Player${Math.floor(Math.random() * 10000)}`;
}

// ============================================================================
// Guest Profile
// ============================================================================

// TEMPORARY TEST BYPASS — remove before production, gated by EXPO_PUBLIC_SKIP_AUTH
// Provides a realistic stub session so every screen renders without real auth.
const TEST_STUB_PROFILE: Profile = {
  id: "00000000-0000-0000-0000-000000000001",
  auth_user_id: "00000000-0000-0000-0000-000000000001",
  username: "TestPlayer",
  email: "test@treasurechess.dev",
  avatar_index: 0,
  embedded_wallet_address: "0x0000000000000000000000000000000000000001",
  smart_wallet_address: null,
  external_wallet_address: null,
  active_wallet_type: "embedded",
  elo_rating: 1200,
  games_played: 25,
  games_won: 15,
  games_lost: 8,
  games_drawn: 2,
  current_streak: 3,
  longest_streak: 7,
  sound_enabled: true,
  music_enabled: true,
  haptic_enabled: true,
  notifications_enabled: false,
  push_token: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_seen_at: new Date().toISOString(),
};

const GUEST_PROFILE: Profile = {
  id: "guest_user",
  auth_user_id: "guest_user",
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
  isMagicReady: true, // Kept for interface compatibility — always true with Supabase Auth
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,
  user: null,
  profile: null,
  magicUser: null, // Kept for interface compatibility — always null
  error: null,
  otpState: "idle",
  otpEmail: null,
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
  const [state, setState] = useState<AuthState>(initialState);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const isInitialized = useRef(false);
  const profileSyncInProgress = useRef(false);

  // --------------------------------------------------------------------------
  // Profile helpers
  // --------------------------------------------------------------------------

  const fetchProfileByAuthId = useCallback(async (authUserId: string): Promise<Profile | null> => {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", authUserId)
        .single();
      if (error && error.code !== "PGRST116") {
        logger.error("Auth", "Error fetching profile", { error: error.message });
      }
      return data ?? null;
    } catch (e) {
      logger.error("Auth", "Exception fetching profile", { error: String(e) });
      return null;
    }
  }, []);

  const createProfile = useCallback(async (params: CreateProfileParams): Promise<Profile | null> => {
    if (!isSupabaseConfigured) return null;
    try {
      const newProfile: ProfileInsert = {
        auth_user_id: params.authUserId,
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

      const { data, error } = await (supabase.from("profiles") as any)
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        logger.error("Auth", "Error creating profile", { error: error.message });
        return null;
      }

      if (data?.id) {
        await (supabase.from("balances") as any).insert({
          user_id: data.id,
          available_tct: 0,
          locked_tct: 0,
          total_deposited_tct: 0,
          total_withdrawn_tct: 0,
          total_won_tct: 0,
          total_lost_tct: 0,
          total_commission_paid_tct: 0,
        });
      }

      return data;
    } catch (e) {
      logger.error("Auth", "Exception creating profile", { error: String(e) });
      return null;
    }
  }, []);

  const updateLastSeen = useCallback(async (profileId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      await (supabase.from("profiles") as any)
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", profileId);
    } catch (e) {
      // Non-critical
    }
  }, []);

  // --------------------------------------------------------------------------
  // Sync profile to stores
  // --------------------------------------------------------------------------

  const syncProfileToStore = useCallback((profile: Profile) => {
    const userStoreProfile = {
      id: profile.id,
      authUserId: profile.auth_user_id,
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
  }, []);

  // --------------------------------------------------------------------------
  // Handle signed-in session
  // --------------------------------------------------------------------------

  const handleSession = useCallback(async (session: { user: { id: string; email?: string | null } }) => {
    if (profileSyncInProgress.current) return;
    profileSyncInProgress.current = true;

    const PROFILE_FETCH_TIMEOUT_MS = 8000;
    const PROFILE_FETCH_MAX_ATTEMPTS = 2;

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Auth timed out after ${ms}ms`)), ms)
        ),
      ]);

    try {
      const authUserId = session.user.id;
      const email = session.user.email ?? null;

      // Retry the profile fetch before giving up — a slow first request (e.g. a
      // cold-booted emulator/device) shouldn't discard a valid session and bounce
      // the user to Guest mode.
      let profile: Profile | null = null;
      for (let attempt = 1; attempt <= PROFILE_FETCH_MAX_ATTEMPTS; attempt++) {
        try {
          profile = await withTimeout(fetchProfileByAuthId(authUserId), PROFILE_FETCH_TIMEOUT_MS);
          break;
        } catch (e) {
          if (attempt === PROFILE_FETCH_MAX_ATTEMPTS) throw e;
          logger.warn("Auth", `Profile fetch attempt ${attempt} timed out, retrying`, { error: String(e) });
        }
      }

      if (!profile) {
        profile = await createProfile({
          authUserId,
          email,
          username: generateUsername(email),
          embeddedWalletAddress: "",
        });
      } else {
        await updateLastSeen(profile.id);
      }

      if (!profile) {
        logger.error("Auth", "Could not create or fetch profile");
        setState((s) => ({
          ...s,
          mode: "guest",
          isLoading: false,
          isAuthenticated: false,
          isGuest: true,
          profile: GUEST_PROFILE,
          error: createAuthError("PROFILE_FETCH_FAILED", "Failed to load profile"),
        }));
        return;
      }

      const authUser: AuthUser = {
        id: profile.id,
        authUserId,
        email,
        username: profile.username,
        walletAddress: profile.embedded_wallet_address || null,
        activeWalletType: "embedded",
        loginMethod: "email",
      };

      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      syncProfileToStore(profile);

      setState((s) => ({
        ...s,
        mode: "authenticated",
        isLoading: false,
        isAuthenticated: true,
        isGuest: false,
        user: authUser,
        profile,
        magicUser: null,
        error: null,
        otpState: "success",
        otpEmail: null,
      }));

      setOtpEmail(null);
      logger.authEvent("login", "success", { userId: authUserId });
    } catch (e) {
      logger.error("Auth", "Error handling session", { error: String(e) });
      // On unrecoverable error, treat as unauthenticated so index.tsx redirects to login
      setState({
        ...initialState,
        mode: "guest",
        isMagicReady: true,
        isLoading: false,
        isGuest: true,
        profile: GUEST_PROFILE,
        error: createAuthError("PROFILE_FETCH_FAILED", "Login succeeded but profile could not be loaded. Please try again."),
      });
    } finally {
      profileSyncInProgress.current = false;
    }
  }, [fetchProfileByAuthId, createProfile, updateLastSeen, syncProfileToStore]);

  // --------------------------------------------------------------------------
  // Initialize: listen to Supabase auth state
  // --------------------------------------------------------------------------

  useEffect(() => {
    // TEMPORARY TEST BYPASS — remove before production, gated by EXPO_PUBLIC_SKIP_AUTH
    if (process.env.EXPO_PUBLIC_SKIP_AUTH === "true") {
      isInitialized.current = true;
      // Overwrite any stale persisted real-user profile so stores that read from
      // userStore (e.g. wallet.tsx) don't leak the previous real user's ID.
      syncProfileToStore(TEST_STUB_PROFILE);
      setState({
        mode: "authenticated",
        isMagicReady: true,
        isLoading: false,
        isAuthenticated: true,
        isGuest: false,
        user: { id: "00000000-0000-0000-0000-000000000001", email: "test@treasurechess.dev" } as any,
        profile: TEST_STUB_PROFILE,
        magicUser: null,
        error: null,
        otpState: "idle",
        otpEmail: null,
      });
      return;
    }

    if (isInitialized.current) return;
    isInitialized.current = true;

    // Hard cap: never stay in isLoading state longer than 20 seconds.
    // Set above PROFILE_FETCH_TIMEOUT_MS * PROFILE_FETCH_MAX_ATTEMPTS in handleSession
    // so a slow-but-successful retry can still resolve to "authenticated" first.
    const loadingTimeout = setTimeout(() => {
      setState((s) => {
        if (!s.isLoading) return s;
        logger.warn("Auth", "Auth loading timed out after 20s, falling back to guest");
        return {
          ...initialState,
          mode: "guest",
          isMagicReady: true,
          isLoading: false,
          isGuest: true,
          profile: GUEST_PROFILE,
        };
      });
    }, 20000);

    // Subscribe to auth state changes — this is the single source of truth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.debug("Auth", "Auth state changed", { event, hasSession: !!session });

      if (event === "SIGNED_IN" && session) {
        await handleSession(session);
      } else if (event === "SIGNED_OUT") {
        setState({
          ...initialState,
          mode: "guest",
          isMagicReady: true,
          isLoading: false,
          isGuest: true,
          profile: GUEST_PROFILE,
        });
      } else if (event === "TOKEN_REFRESHED") {
        logger.debug("Auth", "Token refreshed");
      } else if (event === "INITIAL_SESSION") {
        if (session) {
          await handleSession(session);
        } else {
          // No active session — unauthenticated (index.tsx redirects to login)
          setState({
            ...initialState,
            mode: "guest",
            isMagicReady: true,
            isLoading: false,
            isGuest: true,
            profile: GUEST_PROFILE,
          });
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(loadingTimeout);
    };
  }, [handleSession]);

  // --------------------------------------------------------------------------
  // Auth Actions
  // --------------------------------------------------------------------------

  const sendOTP = useCallback(async ({ email }: EmailLoginParams): Promise<void> => {
    // Rate limit check
    const rateLimitResult = await authRateLimiter.check(email);
    if (!rateLimitResult.allowed) {
      const retryTime = formatRetryTime(rateLimitResult.retryAfter);
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

    setState((s) => ({
      ...s,
      otpState: "sending_code",
      otpEmail: email,
      error: null,
    }));
    setOtpEmail(email);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

      if (error) throw error;

      await authRateLimiter.reset(email);

      setState((s) => ({
        ...s,
        otpState: "awaiting_code_input",
      }));
    } catch (e: any) {
      logger.authEvent("login", "failure", { method: "email", failureReason: e?.message });
      const error = createAuthError(
        "OTP_SEND_FAILED",
        e?.message || "Failed to send verification code"
      );
      setState((s) => ({ ...s, otpState: "error", error }));
      throw error;
    }
  }, []);

  const verifyOTP = useCallback(async ({ code }: VerifyOTPParams): Promise<void> => {
    const currentEmail = otpEmail;
    if (!currentEmail) {
      throw createAuthError("OTP_SEND_FAILED" as AuthErrorCode, "No email address to verify");
    }

    // OTP rate limit
    const rateLimitResult = await otpRateLimiter.check(currentEmail);
    if (!rateLimitResult.allowed) {
      const retryTime = formatRetryTime(rateLimitResult.retryAfter);
      const error = createAuthError(
        "RATE_LIMIT_EXCEEDED" as AuthErrorCode,
        `Too many verification attempts. Please try again in ${retryTime}.`,
        true,
        { retryAfter: rateLimitResult.retryAfter }
      );
      setState((s) => ({ ...s, error }));
      throw error;
    }

    // Validate OTP format
    const otpValidation = validate(otpSchema, code);
    if (!otpValidation.success) {
      const errors = getValidationErrors(otpValidation.errors);
      const error = createAuthError("INVALID_OTP", errors[0] || "Please enter a valid 6-digit code");
      setState((s) => ({ ...s, error }));
      throw error;
    }

    setState((s) => ({ ...s, otpState: "verifying_code", error: null }));

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: currentEmail,
        token: code,
        type: "email",
      });

      if (error) throw error;

      await authRateLimiter.reset(currentEmail);
      await otpRateLimiter.reset(currentEmail);
      // onAuthStateChange SIGNED_IN will fire and call handleSession
    } catch (e: any) {
      logger.authEvent("login", "failure", { method: "email", failureReason: e?.message });
      const error = createAuthError("INVALID_OTP", e?.message || "Invalid or expired code");
      setState((s) => ({ ...s, otpState: "error", error }));
      throw error;
    }
  }, [otpEmail]);

  const cancelOTPFlow = useCallback(() => {
    setState((s) => ({ ...s, otpState: "idle", otpEmail: null, error: null }));
    setOtpEmail(null);
  }, []);

  const resendOTP = useCallback(async (): Promise<void> => {
    if (!otpEmail) {
      throw createAuthError("OTP_SEND_FAILED", "No email address to resend to");
    }
    await sendOTP({ email: otpEmail });
  }, [otpEmail, sendOTP]);

  // Google OAuth via expo-web-browser
  const loginWithGoogle = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      logger.debug("Auth", "Starting Google OAuth");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true },
      });

      if (error || !data.url) throw error || new Error("No OAuth URL returned");
      logger.debug("Auth", "Opening OAuth browser", { url: data.url.substring(0, 80) });

      const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT_URL);
      logger.debug("Auth", "OAuth browser result", { type: result.type, url: result.type === "success" ? (result as any).url?.substring(0, 120) : undefined });

      if (result.type === "cancel" || result.type === "dismiss") {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }

      if (result.type === "success" && (result as any).url) {
        const redirectUrl: string = (result as any).url;
        // Implicit flow: tokens come back in the URL fragment (#access_token=...&refresh_token=...)
        const url = new URL(redirectUrl);
        const params = new URLSearchParams(
          url.hash ? url.hash.substring(1) : url.search.substring(1)
        );
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        logger.debug("Auth", "OAuth redirect parsed", { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          // onAuthStateChange SIGNED_IN fires and handleSession completes auth
        } else {
          throw new Error("No tokens in OAuth redirect — check Supabase OAuth flow type");
        }
      }
    } catch (e: any) {
      logger.authEvent("login", "failure", { method: "google", failureReason: e?.message });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: createAuthError("OAUTH_FAILED", e?.message || "Google login failed"),
      }));
      throw e;
    }
  }, []);

  // Apple Sign-In via expo-apple-authentication
  const loginWithApple = useCallback(async (): Promise<void> => {
    if (Platform.OS !== "ios") {
      const error = createAuthError("OAUTH_NOT_SUPPORTED", "Apple Sign-In is only available on iOS");
      setState((s) => ({ ...s, error }));
      throw error;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("No identity token from Apple");
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });

      if (error) throw error;
      // onAuthStateChange SIGNED_IN fires and handles the rest
    } catch (e: any) {
      const isCancelled = e?.code === "ERR_REQUEST_CANCELED";
      if (isCancelled) {
        setState((s) => ({ ...s, isLoading: false }));
        return;
      }
      logger.authEvent("login", "failure", { method: "apple", failureReason: e?.message });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: createAuthError("OAUTH_FAILED", e?.message || "Apple Sign-In failed"),
      }));
      throw e;
    }
  }, []);

  const loginWithTwitter = useCallback(async () => {
    throw createAuthError("OAUTH_NOT_SUPPORTED", "Twitter login not supported");
  }, []);

  const loginWithDiscord = useCallback(async () => {
    throw createAuthError("OAUTH_NOT_SUPPORTED", "Discord login not supported");
  }, []);

  // loginWithEmail is an alias for sendOTP (backwards compatibility)
  const loginWithEmail = useCallback(async (email: string): Promise<void> => {
    await sendOTP({ email });
  }, [sendOTP]);

  const connectWallet = useCallback(async (_params?: ConnectWalletParams): Promise<void> => {
    const error = createAuthError("WALLET_CONNECTION_FAILED", "External wallet connection coming soon", true);
    setState((s) => ({ ...s, error }));
    throw error;
  }, []);

  const disconnectWallet = useCallback(async (): Promise<void> => {}, []);

  const setActiveWallet = useCallback(async (type: WalletType): Promise<void> => {
    if (!state.profile?.id) return;
    if (isSupabaseConfigured) {
      await (supabase.from("profiles") as any)
        .update({ active_wallet_type: type })
        .eq("id", state.profile.id);
    }
    setState((s) => ({
      ...s,
      user: s.user ? { ...s.user, activeWalletType: type } : null,
      profile: s.profile ? { ...s.profile, active_wallet_type: type } : null,
    }));
  }, [state.profile?.id]);

  const continueAsGuest = useCallback(() => {
    AsyncStorage.setItem(GUEST_MODE_KEY, "true").catch(() => {});
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

  const logout = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      try { await cleanupProfileSync(); } catch (_) {}
      await supabase.auth.signOut();
      await AsyncStorage.multiRemove([AUTH_STORAGE_KEY, GUEST_MODE_KEY]);
      logger.authEvent("logout", "success");
      // onAuthStateChange SIGNED_OUT will fire and reset state
    } catch (e: any) {
      logger.authEvent("logout", "failure", { failureReason: e?.message });
      const error = createAuthError("LOGOUT_FAILED", e?.message || "Logout failed");
      setState((s) => ({ ...s, isLoading: false, error }));
      throw error;
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const profile = await fetchProfileByAuthId(session.user.id);
    if (profile) {
      setState((s) => ({ ...s, profile }));
      syncProfileToStore(profile);
    }
  }, [fetchProfileByAuthId, syncProfileToStore]);

  const requireAuth = useCallback((): boolean => {
    return state.isAuthenticated && !state.isGuest;
  }, [state.isAuthenticated, state.isGuest]);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  // --------------------------------------------------------------------------
  // Context Value
  // --------------------------------------------------------------------------

  const value = useMemo<AuthContextType>(
    () => ({
      ...state,
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

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return context;
}

// ============================================================================
// Re-exports
// ============================================================================

export { GUEST_PROFILE };
export type { AuthContextType, AuthState, AuthActions, AuthError };
