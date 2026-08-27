import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import type { Profile, ProfileInsert, ProfileUpdate, Balance } from "@/types/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// App-side user profile (maps from Supabase profile + balance)
export interface UserProfile {
  id: string;
  authUserId: string;
  username: string;
  email: string | null;
  avatarIndex: number;
  embeddedWalletAddress: string;
  smartWalletAddress: string | null;
  externalWalletAddress: string | null;
  activeWalletType: string;
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  // Balance data
  availableTct: number;
  lockedTct: number;
  totalDepositedTct: number;
  totalWithdrawnTct: number;
  totalWonTct: number;
  totalLostTct: number;
  totalCommissionPaidTct: number;
  // Settings
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  pushToken: string | null;
  stripeConnectAccountId: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

// ELO change event for animations
export interface EloChangeEvent {
  previousElo: number;
  newElo: number;
  change: number;
  timestamp: number;
}

export interface GameSettings {
  boardTheme: "purple" | "classic" | "eco" | "retro";
  pieceStyle: "classic" | "modern" | "elegant";
  soundEffects: boolean;
  vibration: boolean;
  autoQueen: boolean;
  showLegalMoves: boolean;
  confirmMoves: boolean;
}

interface UserState {
  profile: UserProfile | null;
  settings: GameSettings;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  pendingChanges: number;
  isOnline: boolean;
  lastEloChange: EloChangeEvent | null;

  // Internal state (not persisted)
  _realtimeChannel: RealtimeChannel | null;

  // Actions
  setProfile: (profile: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setSettings: (settings: Partial<GameSettings>) => void;
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  logout: () => void;

  // Supabase sync
  fetchProfile: (authUserId: string) => Promise<UserProfile | null>;
  createProfile: (data: CreateProfileData) => Promise<UserProfile | null>;
  syncProfileToSupabase: (updates: Partial<ProfileUpdate>) => Promise<boolean>;
  syncWithServer: () => Promise<void>;
  pushToServer: (updates: Partial<UserProfile>) => Promise<boolean>;
  refreshBalance: () => Promise<void>;
  savePushToken: (token: string) => Promise<boolean>;

  // Real-time subscription
  subscribeToProfileChanges: () => void;
  unsubscribeFromProfileChanges: () => void;

  // ELO tracking
  setEloChange: (change: EloChangeEvent | null) => void;
  clearEloChange: () => void;

  // Sync state
  setSyncState: (state: { isSyncing?: boolean; lastSyncError?: string | null; lastSyncedAt?: string | null; pendingChanges?: number; isOnline?: boolean }) => void;

  // Balance updates (local + sync)
  addTCT: (amount: number) => void;
  subtractTCT: (amount: number) => void;

  // Stats updates
  recordWin: (isCheckmate: boolean, earnings: number) => void;
  recordLoss: () => void;
  recordDraw: () => void;
}

export interface CreateProfileData {
  authUserId: string;
  username: string;
  avatarIndex: number;
  embeddedWalletAddress: string;
  email?: string | null;
}

const defaultSettings: GameSettings = {
  boardTheme: "purple",
  pieceStyle: "classic",
  soundEffects: true,
  vibration: true,
  autoQueen: true,
  showLegalMoves: true,
  confirmMoves: false,
};

// Helper to convert Supabase profile + balance to app UserProfile
function mapSupabaseToUserProfile(profile: Profile, balance?: Balance): UserProfile {
  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    username: profile.username,
    email: profile.email,
    avatarIndex: profile.avatar_index,
    embeddedWalletAddress: profile.embedded_wallet_address,
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
    // Balance data
    availableTct: balance?.available_tct ?? 0,
    lockedTct: balance?.locked_tct ?? 0,
    totalDepositedTct: balance?.total_deposited_tct ?? 0,
    totalWithdrawnTct: balance?.total_withdrawn_tct ?? 0,
    totalWonTct: balance?.total_won_tct ?? 0,
    totalLostTct: balance?.total_lost_tct ?? 0,
    totalCommissionPaidTct: balance?.total_commission_paid_tct ?? 0,
    // Settings
    soundEnabled: profile.sound_enabled,
    musicEnabled: profile.music_enabled,
    hapticEnabled: profile.haptic_enabled,
    notificationsEnabled: profile.notifications_enabled,
    pushToken: profile.push_token,
    stripeConnectAccountId: profile.stripe_connect_account_id ?? null,
    // Timestamps
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    lastSeenAt: profile.last_seen_at,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      profile: null,
      settings: defaultSettings,
      isAuthenticated: false,
      isLoading: true,
      isSyncing: false,
      lastSyncError: null,
      lastSyncedAt: null,
      pendingChanges: 0,
      isOnline: true,
      lastEloChange: null,
      _realtimeChannel: null,

      setProfile: (profile) => set({ profile, isAuthenticated: true }),

      updateProfile: (updates) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...updates } : null,
        })),

      setSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setLoading: (value) => set({ isLoading: value }),

      logout: () =>
        set({
          profile: null,
          isAuthenticated: false,
        }),

      fetchProfile: async (authUserId: string): Promise<UserProfile | null> => {
        if (DEV_BYPASS_AUTH || !isSupabaseConfigured) {
          return null;
        }

        set({ isSyncing: true, lastSyncError: null });

        try {
          // Fetch profile
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("auth_user_id", authUserId)
            .single();

          if (profileError) {
            if (profileError.code === "PGRST116") {
              // No profile found - this is expected for new users
              set({ isSyncing: false });
              return null;
            }
            throw profileError;
          }

          const profile = profileData as Profile;

          // Fetch balance
          const { data: balanceData, error: balanceError } = await supabase
            .from("balances")
            .select("*")
            .eq("user_id", profile.id)
            .single();

          if (balanceError && balanceError.code !== "PGRST116") {
            console.warn("Failed to fetch balance:", balanceError);
          }

          const balance = balanceData as Balance | null;
          const userProfile = mapSupabaseToUserProfile(profile, balance ?? undefined);

          set({
            profile: userProfile,
            isAuthenticated: true,
            isSyncing: false,
          });

          return userProfile;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to fetch profile:", error);
          set({ isSyncing: false, lastSyncError: errorMessage });
          return null;
        }
      },

      // Create new profile in Supabase
      createProfile: async (data: CreateProfileData): Promise<UserProfile | null> => {
        if (!isSupabaseConfigured) {
          console.warn("Supabase not configured, skipping profile creation");
          return null;
        }

        set({ isSyncing: true, lastSyncError: null });

        try {
          // Insert profile
          const insertData: ProfileInsert = {
            auth_user_id: data.authUserId,
            username: data.username,
            avatar_index: data.avatarIndex,
            embedded_wallet_address: data.embeddedWalletAddress,
            email: data.email ?? null,
          };

          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .insert(insertData as never)
            .select()
            .single();

          if (profileError) {
            throw profileError;
          }

          const profile = profileData as Profile;

          // Create initial balance record
          const { data: balanceData, error: balanceError } = await supabase
            .from("balances")
            .insert({
              user_id: profile.id,
              available_tct: 0,
              locked_tct: 0,
            } as never)
            .select()
            .single();

          if (balanceError) {
            console.warn("Failed to create balance:", balanceError);
          }

          const balance = balanceData as Balance | null;
          const userProfile = mapSupabaseToUserProfile(profile, balance ?? undefined);

          set({
            profile: userProfile,
            isAuthenticated: true,
            isSyncing: false,
          });

          return userProfile;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to create profile:", error);
          set({ isSyncing: false, lastSyncError: errorMessage });
          return null;
        }
      },

      // Sync local profile updates to Supabase
      syncProfileToSupabase: async (updates: Partial<ProfileUpdate>): Promise<boolean> => {
        const { profile } = get();
        if (!profile || !isSupabaseConfigured) {
          return false;
        }

        set({ isSyncing: true, lastSyncError: null });

        try {
          const updateData = {
            ...updates,
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("profiles")
            .update(updateData as never)
            .eq("id", profile.id);

          if (error) {
            throw error;
          }

          set({ isSyncing: false });
          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to sync profile:", error);
          set({ isSyncing: false, lastSyncError: errorMessage });
          return false;
        }
      },

      // Save push token to Supabase
      savePushToken: async (token: string): Promise<boolean> => {
        const { profile } = get();
        if (!profile || !isSupabaseConfigured) {
          return false;
        }

        // Skip if token hasn't changed
        if (profile.pushToken === token) {
          return true;
        }

        try {
          const { error } = await supabase
            .from("profiles")
            .update({ push_token: token } as never)
            .eq("id", profile.id);

          if (error) {
            throw error;
          }

          // Update local state
          set((state) => ({
            profile: state.profile
              ? { ...state.profile, pushToken: token }
              : null,
          }));

          console.log("[UserStore] Push token saved to Supabase");
          return true;
        } catch (error) {
          console.error("Failed to save push token:", error);
          return false;
        }
      },

      // Refresh balance from Supabase
      refreshBalance: async (): Promise<void> => {
        const { profile } = get();
        if (DEV_BYPASS_AUTH || !profile || !isSupabaseConfigured) {
          return;
        }

        try {
          const { data: balanceData, error } = await supabase
            .from("balances")
            .select("*")
            .eq("user_id", profile.id)
            .single();

          if (error) {
            // PGRST116 = no balance row — expected for stub user in dev bypass
            if (error.code === "PGRST116" && process.env.EXPO_PUBLIC_SKIP_AUTH === "true") {
              return;
            }
            throw error;
          }

          const balance = balanceData as Balance | null;
          if (balance) {
            set((state) => ({
              profile: state.profile
                ? {
                    ...state.profile,
                    availableTct: balance.available_tct,
                    lockedTct: balance.locked_tct,
                    totalDepositedTct: balance.total_deposited_tct,
                    totalWithdrawnTct: balance.total_withdrawn_tct,
                    totalWonTct: balance.total_won_tct,
                    totalLostTct: balance.total_lost_tct,
                    totalCommissionPaidTct: balance.total_commission_paid_tct,
                  }
                : null,
            }));
          }
        } catch (error) {
          console.error("Failed to refresh balance:", error);
        }
      },

      addTCT: (amount) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, availableTct: state.profile.availableTct + amount }
            : null,
        })),

      subtractTCT: (amount) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, availableTct: Math.max(0, state.profile.availableTct - amount) }
            : null,
        })),

      recordWin: (isCheckmate, earnings) =>
        set((state) => {
          if (!state.profile) return state;

          const newStreak = state.profile.currentStreak + 1;
          return {
            profile: {
              ...state.profile,
              gamesWon: state.profile.gamesWon + 1,
              gamesPlayed: state.profile.gamesPlayed + 1,
              totalWonTct: state.profile.totalWonTct + earnings,
              currentStreak: newStreak,
              longestStreak: Math.max(state.profile.longestStreak, newStreak),
            },
          };
        }),

      recordLoss: () =>
        set((state) => ({
          profile: state.profile
            ? {
                ...state.profile,
                gamesLost: state.profile.gamesLost + 1,
                gamesPlayed: state.profile.gamesPlayed + 1,
                currentStreak: 0,
              }
            : null,
        })),

      recordDraw: () =>
        set((state) => ({
          profile: state.profile
            ? {
                ...state.profile,
                gamesDrawn: state.profile.gamesDrawn + 1,
                gamesPlayed: state.profile.gamesPlayed + 1,
              }
            : null,
        })),

      // ========================================================================
      // Real-time Subscription
      // ========================================================================

      subscribeToProfileChanges: () => {
        const { profile, _realtimeChannel } = get();
        if (!profile || !isSupabaseConfigured || _realtimeChannel) return;

        const channel = supabase
          .channel(`profile_sync_${profile.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${profile.id}`,
            },
            (payload) => {
              if (payload.eventType === "UPDATE" && payload.new) {
                const serverProfile = payload.new as Profile;
                const currentProfile = get().profile;

                // Detect ELO change for animation
                if (currentProfile && serverProfile.elo_rating !== currentProfile.eloRating) {
                  const change = serverProfile.elo_rating - currentProfile.eloRating;
                  set({
                    lastEloChange: {
                      previousElo: currentProfile.eloRating,
                      newElo: serverProfile.elo_rating,
                      change,
                      timestamp: Date.now(),
                    },
                  });
                }

                // Merge server-authoritative fields
                set((state) => ({
                  profile: state.profile
                    ? {
                        ...state.profile,
                        // Server-authoritative fields
                        eloRating: serverProfile.elo_rating,
                        gamesPlayed: serverProfile.games_played,
                        gamesWon: serverProfile.games_won,
                        gamesLost: serverProfile.games_lost,
                        gamesDrawn: serverProfile.games_drawn,
                        currentStreak: serverProfile.current_streak,
                        longestStreak: serverProfile.longest_streak,
                        updatedAt: serverProfile.updated_at,
                        lastSeenAt: serverProfile.last_seen_at,
                      }
                    : null,
                  lastSyncedAt: new Date().toISOString(),
                }));
              }
            }
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              console.log("[UserStore] Real-time profile subscription active");
            }
          });

        set({ _realtimeChannel: channel });
      },

      unsubscribeFromProfileChanges: () => {
        const { _realtimeChannel } = get();
        if (_realtimeChannel) {
          supabase.removeChannel(_realtimeChannel);
          set({ _realtimeChannel: null });
        }
      },

      // ========================================================================
      // Sync Actions
      // ========================================================================

      syncWithServer: async () => {
        const { profile, fetchProfile } = get();
        if (!profile) return;

        await fetchProfile(profile.authUserId);
      },

      pushToServer: async (updates: Partial<UserProfile>): Promise<boolean> => {
        const { profile, syncProfileToSupabase, updateProfile } = get();
        if (!profile) return false;

        // Optimistically update local state
        updateProfile(updates);

        // Map to Supabase format
        const dbUpdates: Partial<ProfileUpdate> = {};
        if (updates.username !== undefined) dbUpdates.username = updates.username;
        if (updates.avatarIndex !== undefined) dbUpdates.avatar_index = updates.avatarIndex;
        if (updates.soundEnabled !== undefined) dbUpdates.sound_enabled = updates.soundEnabled;
        if (updates.musicEnabled !== undefined) dbUpdates.music_enabled = updates.musicEnabled;
        if (updates.hapticEnabled !== undefined) dbUpdates.haptic_enabled = updates.hapticEnabled;
        if (updates.notificationsEnabled !== undefined) dbUpdates.notifications_enabled = updates.notificationsEnabled;
        if (updates.activeWalletType !== undefined) dbUpdates.active_wallet_type = updates.activeWalletType;

        return syncProfileToSupabase(dbUpdates);
      },

      // ========================================================================
      // ELO Tracking
      // ========================================================================

      setEloChange: (change: EloChangeEvent | null) => set({ lastEloChange: change }),

      clearEloChange: () => set({ lastEloChange: null }),

      // ========================================================================
      // Sync State
      // ========================================================================

      setSyncState: (state) => set((current) => ({
        isSyncing: state.isSyncing ?? current.isSyncing,
        lastSyncError: state.lastSyncError !== undefined ? state.lastSyncError : current.lastSyncError,
        lastSyncedAt: state.lastSyncedAt !== undefined ? state.lastSyncedAt : current.lastSyncedAt,
        pendingChanges: state.pendingChanges ?? current.pendingChanges,
        isOnline: state.isOnline ?? current.isOnline,
      })),
    }),
    {
      name: "treasure-chess-user",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        settings: state.settings,
      }),
    }
  )
);
