import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@/types/supabase";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials not configured. Using placeholder values for development.");
}

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Helper to set Privy JWT for authenticated requests
export const setSupabaseAccessToken = async (accessToken: string | null) => {
  if (accessToken) {
    // For Privy integration, we use the access token as a custom header
    // The Edge Functions will verify this token with Privy
    await supabase.functions.setAuth(accessToken);
  }
};

// ============================================================================
// Magic Auth Integration
// ============================================================================

interface MagicAuthResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
}

/**
 * Authenticate with Supabase using Magic DID token
 *
 * This calls our Edge Function which:
 * 1. Verifies the Magic DID token
 * 2. Creates/finds a Supabase Auth user with matching profile ID
 * 3. Returns Supabase session tokens
 *
 * @param didToken - The DID token from Magic after successful login
 * @param profileId - The user's profile ID (must match for RLS)
 * @returns Session tokens if successful
 */
export const authenticateWithMagic = async (
  didToken: string,
  profileId: string
): Promise<MagicAuthResponse> => {
  try {
    console.log("[Supabase] Authenticating with Magic DID token...");
    console.log("[Supabase] DID token length:", didToken?.length);
    console.log("[Supabase] DID token preview:", didToken?.substring(0, 50) + "...");
    console.log("[Supabase] Profile ID:", profileId);

    const { data, error } = await supabase.functions.invoke("magic-auth", {
      body: { didToken, profileId },
    });

    // Log both data and error regardless of success/failure for debugging
    console.log("[Supabase] Magic auth response data:", JSON.stringify(data, null, 2));

    if (error) {
      console.error("[Supabase] Magic auth function error:", error);
      console.error("[Supabase] Error details:", JSON.stringify(error, null, 2));
      // The data might still contain useful error info even when error is set
      if (data) {
        console.error("[Supabase] Response data with error:", JSON.stringify(data, null, 2));
        // Return the more detailed error from data if available
        if (data.magicError || data.magicStatus) {
          return {
            success: false,
            error: `Magic API error (${data.magicStatus}): ${data.magicError || data.error || error.message}`
          };
        }
      }
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      console.error("[Supabase] Magic auth failed:", data?.error);
      if (data?.magicError) {
        console.error("[Supabase] Magic API error:", data.magicStatus, data.magicError);
      }
      return { success: false, error: data?.error || "Unknown error" };
    }

    // Set the session in Supabase client
    if (data.accessToken && data.refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      if (sessionError) {
        console.error("[Supabase] Failed to set session:", sessionError);
        return { success: false, error: "Failed to set session" };
      }

      console.log("[Supabase] Session established for user:", data.user?.id);
    }

    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    };
  } catch (e) {
    console.error("[Supabase] Magic auth error:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
};

/**
 * Get current Supabase Auth session
 */
export const getSupabaseSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[Supabase] Get session error:", error);
      return null;
    }
    return session;
  } catch (e) {
    console.error("[Supabase] Get session error:", e);
    return null;
  }
};

/**
 * Get current Supabase Auth user ID (matches profile.id for RLS)
 */
export const getSupabaseUserId = async (): Promise<string | null> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
  } catch (e) {
    return null;
  }
};

/**
 * Sign out from Supabase Auth
 */
export const signOutSupabase = async (): Promise<void> => {
  try {
    await supabase.auth.signOut();
    console.log("[Supabase] Signed out");
  } catch (e) {
    console.error("[Supabase] Sign out error:", e);
  }
};

/**
 * Refresh the Supabase session
 */
export const refreshSupabaseSession = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.error("[Supabase] Refresh session error:", error);
      return false;
    }
    return !!data.session;
  } catch (e) {
    console.error("[Supabase] Refresh session error:", e);
    return false;
  }
};

// Check if Supabase is properly configured
export const isSupabaseConfigured = !!(
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
