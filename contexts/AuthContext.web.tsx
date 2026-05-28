import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Profile } from "@/types/supabase";

export type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  user: {
    id: string;
    email: string | null;
    privyUserId: string;
  } | null;
  profile: Profile | null;
  walletAddress: string | null;
  error: string | null;
};

export type AuthActions = {
  loginWithEmail: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | null>(null);

// Web version - Privy Expo SDK doesn't support web
// This provides a stub implementation for web platform
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  const handleLoginWithEmail = useCallback(async () => {
    setError("Authentication not available on web. Please use the mobile app.");
    throw new Error("Authentication not available on web");
  }, []);

  const handleLoginWithGoogle = useCallback(async () => {
    setError("Authentication not available on web. Please use the mobile app.");
    throw new Error("Authentication not available on web");
  }, []);

  const handleLoginWithApple = useCallback(async () => {
    setError("Authentication not available on web. Please use the mobile app.");
    throw new Error("Authentication not available on web");
  }, []);

  const handleLogout = useCallback(async () => {
    // No-op on web
  }, []);

  const refreshProfile = useCallback(async () => {
    // No-op on web
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated: false,
      isLoading: false,
      isReady: true,
      user: null,
      profile: null,
      walletAddress: null,
      error,
      loginWithEmail: handleLoginWithEmail,
      loginWithGoogle: handleLoginWithGoogle,
      loginWithApple: handleLoginWithApple,
      logout: handleLogout,
      refreshProfile,
    }),
    [
      error,
      handleLoginWithEmail,
      handleLoginWithGoogle,
      handleLoginWithApple,
      handleLogout,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
