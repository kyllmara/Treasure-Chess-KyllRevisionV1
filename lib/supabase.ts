import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@/types/supabase";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase credentials not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
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
