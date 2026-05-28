/**
 * Profile Sync Service
 *
 * Elite-level bidirectional sync between local state and Supabase.
 *
 * Features:
 * - Server-authoritative for ELO/stats (prevents cheating)
 * - Optimistic updates with rollback for user preferences
 * - Real-time subscription for external changes
 * - Offline queue with automatic replay
 * - Conflict resolution with merge strategies
 * - Rate-limited sync to prevent excessive API calls
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import type { Profile, ProfileUpdate, Balance } from "@/types/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// ============================================================================
// Balance Types
// ============================================================================

export interface SyncableBalance {
  availableTct: number;
  lockedTct: number;
  totalDepositedTct: number;
  totalWithdrawnTct: number;
  totalWonTct: number;
  totalLostTct: number;
  totalCommissionPaidTct: number;
}

export type BalanceChangeCallback = (balance: SyncableBalance) => void;

// ============================================================================
// Types
// ============================================================================

export interface SyncableProfile {
  id: string;
  privyUserId: string;
  username: string;
  email: string | null;
  avatarIndex: number;
  embeddedWalletAddress: string;
  smartWalletAddress: string | null;
  externalWalletAddress: string | null;
  activeWalletType: string;
  // Server-authoritative fields (read-only locally)
  eloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  // User preferences (client can modify)
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  pushToken: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  pendingChanges: number;
  isOnline: boolean;
}

export interface ProfileChange {
  id: string;
  timestamp: string;
  changes: Partial<ProfileUpdate>;
  retryCount: number;
  maxRetries: number;
}

export interface ConflictResolution {
  strategy: "server_wins" | "client_wins" | "merge";
  mergedProfile?: SyncableProfile;
  conflicts?: Array<{
    field: string;
    serverValue: unknown;
    clientValue: unknown;
    resolvedValue: unknown;
  }>;
}

export type ProfileChangeCallback = (profile: SyncableProfile) => void;
export type SyncStateCallback = (state: SyncState) => void;
export type EloChangeCallback = (oldElo: number, newElo: number, change: number) => void;

// Helper to map balance from Supabase
function mapBalanceToSyncable(balance: Balance): SyncableBalance {
  return {
    availableTct: balance.available_tct,
    lockedTct: balance.locked_tct,
    totalDepositedTct: balance.total_deposited_tct,
    totalWithdrawnTct: balance.total_withdrawn_tct,
    totalWonTct: balance.total_won_tct,
    totalLostTct: balance.total_lost_tct,
    totalCommissionPaidTct: balance.total_commission_paid_tct,
  };
}

// ============================================================================
// Constants
// ============================================================================

const OFFLINE_QUEUE_KEY = "@treasure_chess_profile_queue";
const LAST_SYNC_KEY = "@treasure_chess_last_sync";
const SYNC_DEBOUNCE_MS = 1000;
const MIN_SYNC_INTERVAL_MS = 5000; // Minimum 5s between syncs
const BACKGROUND_SYNC_INTERVAL_MS = 300000; // 5 minutes
const MAX_RETRY_COUNT = 3;

// Fields that are server-authoritative (client cannot modify)
const SERVER_AUTHORITATIVE_FIELDS = new Set([
  "elo_rating",
  "games_played",
  "games_won",
  "games_lost",
  "games_drawn",
  "current_streak",
  "longest_streak",
  "created_at",
]);

// Fields that clients can modify
const CLIENT_MODIFIABLE_FIELDS = new Set([
  "username",
  "avatar_index",
  "sound_enabled",
  "music_enabled",
  "haptic_enabled",
  "notifications_enabled",
  "push_token",
  "active_wallet_type",
  "external_wallet_address",
  "smart_wallet_address",
]);

// ============================================================================
// Helper Functions
// ============================================================================

function mapProfileToSyncable(profile: Profile): SyncableProfile {
  return {
    id: profile.id,
    privyUserId: profile.privy_user_id,
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
    soundEnabled: profile.sound_enabled,
    musicEnabled: profile.music_enabled,
    hapticEnabled: profile.haptic_enabled,
    notificationsEnabled: profile.notifications_enabled,
    pushToken: profile.push_token,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    lastSeenAt: profile.last_seen_at,
  };
}

function mapSyncableToProfileUpdate(
  updates: Partial<SyncableProfile>
): Partial<ProfileUpdate> {
  const mapped: Partial<ProfileUpdate> = {};

  if (updates.username !== undefined) mapped.username = updates.username;
  if (updates.avatarIndex !== undefined) mapped.avatar_index = updates.avatarIndex;
  if (updates.soundEnabled !== undefined) mapped.sound_enabled = updates.soundEnabled;
  if (updates.musicEnabled !== undefined) mapped.music_enabled = updates.musicEnabled;
  if (updates.hapticEnabled !== undefined) mapped.haptic_enabled = updates.hapticEnabled;
  if (updates.notificationsEnabled !== undefined)
    mapped.notifications_enabled = updates.notificationsEnabled;
  if (updates.pushToken !== undefined) mapped.push_token = updates.pushToken;
  if (updates.activeWalletType !== undefined)
    mapped.active_wallet_type = updates.activeWalletType;
  if (updates.externalWalletAddress !== undefined)
    mapped.external_wallet_address = updates.externalWalletAddress;
  if (updates.smartWalletAddress !== undefined)
    mapped.smart_wallet_address = updates.smartWalletAddress;

  return mapped;
}

// ============================================================================
// ProfileSyncService Class
// ============================================================================

export class ProfileSyncService {
  private userId: string | null = null;
  private profileId: string | null = null;
  private currentProfile: SyncableProfile | null = null;
  private currentBalance: SyncableBalance | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private balanceRealtimeChannel: RealtimeChannel | null = null;
  private syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncTime: number = 0;
  private isOnline: boolean = true;
  private offlineQueue: ProfileChange[] = [];
  private backgroundSyncInterval: ReturnType<typeof setInterval> | null = null;

  // Callbacks
  private profileChangeCallbacks: Set<ProfileChangeCallback> = new Set();
  private syncStateCallbacks: Set<SyncStateCallback> = new Set();
  private eloChangeCallbacks: Set<EloChangeCallback> = new Set();
  private balanceChangeCallbacks: Set<BalanceChangeCallback> = new Set();

  // State
  private syncState: SyncState = {
    isSyncing: false,
    lastSyncedAt: null,
    syncError: null,
    pendingChanges: 0,
    isOnline: true,
  };

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  async initialize(userId: string): Promise<SyncableProfile | null> {
    if (!isSupabaseConfigured) {
      console.warn("[ProfileSync] Supabase not configured");
      return null;
    }

    this.userId = userId;

    // Load offline queue
    await this.loadOfflineQueue();

    // Check network status
    const netState = await NetInfo.fetch();
    this.isOnline = netState.isConnected ?? true;
    this.updateSyncState({ isOnline: this.isOnline });

    // Subscribe to network changes
    NetInfo.addEventListener((state) => {
      const wasOffline = !this.isOnline;
      this.isOnline = state.isConnected ?? true;
      this.updateSyncState({ isOnline: this.isOnline });

      // Replay queue when coming back online
      if (wasOffline && this.isOnline) {
        this.replayOfflineQueue();
      }
    });

    // Fetch initial profile
    const profile = await this.fetchProfile();

    if (profile) {
      this.profileId = profile.id;
      this.currentProfile = profile;

      // Fetch initial balance
      await this.fetchBalance();

      // Subscribe to real-time changes
      this.subscribeToChanges();
      this.subscribeToBalanceChanges();

      // Start background sync
      this.startBackgroundSync();
    }

    return profile;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  async cleanup(): Promise<void> {
    // Unsubscribe from real-time profile changes
    if (this.realtimeChannel) {
      await supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    // Unsubscribe from real-time balance changes
    if (this.balanceRealtimeChannel) {
      await supabase.removeChannel(this.balanceRealtimeChannel);
      this.balanceRealtimeChannel = null;
    }

    // Clear background sync
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
    }

    // Clear debounce timer
    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = null;
    }

    // Save any pending changes
    await this.saveOfflineQueue();

    // Clear callbacks
    this.profileChangeCallbacks.clear();
    this.syncStateCallbacks.clear();
    this.eloChangeCallbacks.clear();
    this.balanceChangeCallbacks.clear();

    this.userId = null;
    this.profileId = null;
    this.currentProfile = null;
    this.currentBalance = null;
  }

  // --------------------------------------------------------------------------
  // Fetch Profile
  // --------------------------------------------------------------------------

  async fetchProfile(): Promise<SyncableProfile | null> {
    if (!isSupabaseConfigured || !this.userId) {
      return null;
    }

    this.updateSyncState({ isSyncing: true, syncError: null });

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("privy_user_id", this.userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Profile not found
          this.updateSyncState({ isSyncing: false });
          return null;
        }
        throw error;
      }

      const profile = mapProfileToSyncable(data as Profile);
      const now = new Date().toISOString();

      // Check for ELO changes
      if (this.currentProfile && profile.eloRating !== this.currentProfile.eloRating) {
        const change = profile.eloRating - this.currentProfile.eloRating;
        this.notifyEloChange(this.currentProfile.eloRating, profile.eloRating, change);
      }

      this.currentProfile = profile;
      this.profileId = profile.id;
      this.lastSyncTime = Date.now();

      // Update last seen
      this.updateLastSeen();

      // Save last sync time
      await AsyncStorage.setItem(LAST_SYNC_KEY, now);

      this.updateSyncState({
        isSyncing: false,
        lastSyncedAt: now,
        syncError: null,
      });

      this.notifyProfileChange(profile);

      return profile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[ProfileSync] Fetch error:", error);
      this.updateSyncState({
        isSyncing: false,
        syncError: errorMessage,
      });
      return this.currentProfile;
    }
  }

  // --------------------------------------------------------------------------
  // Update Profile (Optimistic)
  // --------------------------------------------------------------------------

  async updateProfile(
    updates: Partial<SyncableProfile>,
    options: { optimistic?: boolean; skipValidation?: boolean } = {}
  ): Promise<{ success: boolean; profile?: SyncableProfile; error?: string }> {
    const { optimistic = true, skipValidation = false } = options;

    if (!this.profileId || !this.currentProfile) {
      return { success: false, error: "No profile loaded" };
    }

    // Filter out server-authoritative fields
    const clientUpdates = this.filterClientModifiableFields(updates);

    if (Object.keys(clientUpdates).length === 0) {
      return { success: false, error: "No valid fields to update" };
    }

    // Validate updates
    if (!skipValidation) {
      const validation = this.validateUpdates(clientUpdates);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    // Store previous state for rollback
    const previousProfile = { ...this.currentProfile };

    // Apply optimistic update
    if (optimistic) {
      const optimisticProfile = {
        ...this.currentProfile,
        ...clientUpdates,
        updatedAt: new Date().toISOString(),
      };
      this.currentProfile = optimisticProfile;
      this.notifyProfileChange(optimisticProfile);
    }

    // If offline, queue the change
    if (!this.isOnline) {
      await this.queueChange(clientUpdates);
      return {
        success: true,
        profile: this.currentProfile,
      };
    }

    // Sync to server
    const dbUpdates = mapSyncableToProfileUpdate(clientUpdates);

    try {
      this.updateSyncState({ isSyncing: true });

      const { data, error } = await supabase
        .from("profiles")
        .update({
          ...dbUpdates,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", this.profileId)
        .select()
        .single();

      if (error) throw error;

      const serverProfile = mapProfileToSyncable(data as Profile);
      const now = new Date().toISOString();

      // Merge server response (server-authoritative fields take precedence)
      this.currentProfile = this.mergeProfiles(serverProfile, this.currentProfile);

      this.updateSyncState({
        isSyncing: false,
        lastSyncedAt: now,
        syncError: null,
      });

      this.notifyProfileChange(this.currentProfile);

      return {
        success: true,
        profile: this.currentProfile,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[ProfileSync] Update error:", error);

      // Rollback optimistic update
      if (optimistic) {
        this.currentProfile = previousProfile;
        this.notifyProfileChange(previousProfile);
      }

      // Queue for retry if network error
      if (this.isNetworkError(error)) {
        await this.queueChange(clientUpdates);
        this.updateSyncState({
          isSyncing: false,
          syncError: "Update queued for retry",
        });
        return {
          success: true,
          profile: this.currentProfile,
        };
      }

      this.updateSyncState({
        isSyncing: false,
        syncError: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        profile: previousProfile,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Real-time Subscription
  // --------------------------------------------------------------------------

  private subscribeToChanges(): void {
    if (!this.profileId || this.realtimeChannel) return;

    this.realtimeChannel = supabase
      .channel(`profile_changes_${this.profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${this.profileId}`,
        },
        (payload: RealtimePostgresChangesPayload<Profile>) => {
          this.handleRealtimeUpdate(payload);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[ProfileSync] Real-time subscription active");
        } else if (status === "CHANNEL_ERROR") {
          console.error("[ProfileSync] Real-time subscription error");
        }
      });
  }

  private handleRealtimeUpdate(
    payload: RealtimePostgresChangesPayload<Profile>
  ): void {
    if (payload.eventType !== "UPDATE" || !payload.new) return;

    const serverProfile = mapProfileToSyncable(payload.new as Profile);

    // Detect ELO change
    if (this.currentProfile && serverProfile.eloRating !== this.currentProfile.eloRating) {
      const change = serverProfile.eloRating - this.currentProfile.eloRating;
      this.notifyEloChange(this.currentProfile.eloRating, serverProfile.eloRating, change);
    }

    // Merge with local state (server-authoritative fields win)
    this.currentProfile = this.mergeProfiles(serverProfile, this.currentProfile);

    this.updateSyncState({
      lastSyncedAt: new Date().toISOString(),
    });

    this.notifyProfileChange(this.currentProfile);
  }

  // --------------------------------------------------------------------------
  // Balance Sync
  // --------------------------------------------------------------------------

  async fetchBalance(): Promise<SyncableBalance | null> {
    if (!isSupabaseConfigured || !this.profileId) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("balances")
        .select("*")
        .eq("user_id", this.profileId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Balance not found - this is okay for new users
          return null;
        }
        throw error;
      }

      const balance = mapBalanceToSyncable(data as Balance);
      this.currentBalance = balance;
      this.notifyBalanceChange(balance);

      return balance;
    } catch (error) {
      console.error("[ProfileSync] Balance fetch error:", error);
      return this.currentBalance;
    }
  }

  private subscribeToBalanceChanges(): void {
    if (!this.profileId || this.balanceRealtimeChannel) return;

    this.balanceRealtimeChannel = supabase
      .channel(`balance_changes_${this.profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "balances",
          filter: `user_id=eq.${this.profileId}`,
        },
        (payload: RealtimePostgresChangesPayload<Balance>) => {
          if (payload.eventType === "UPDATE" && payload.new) {
            const balance = mapBalanceToSyncable(payload.new as Balance);
            this.currentBalance = balance;
            this.notifyBalanceChange(balance);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[ProfileSync] Real-time balance subscription active");
        }
      });
  }

  // --------------------------------------------------------------------------
  // Conflict Resolution
  // --------------------------------------------------------------------------

  private mergeProfiles(
    serverProfile: SyncableProfile,
    localProfile: SyncableProfile | null
  ): SyncableProfile {
    if (!localProfile) return serverProfile;

    // Server-authoritative fields always come from server
    return {
      ...localProfile,
      // Server-authoritative (always from server)
      id: serverProfile.id,
      privyUserId: serverProfile.privyUserId,
      eloRating: serverProfile.eloRating,
      gamesPlayed: serverProfile.gamesPlayed,
      gamesWon: serverProfile.gamesWon,
      gamesLost: serverProfile.gamesLost,
      gamesDrawn: serverProfile.gamesDrawn,
      currentStreak: serverProfile.currentStreak,
      longestStreak: serverProfile.longestStreak,
      createdAt: serverProfile.createdAt,
      embeddedWalletAddress: serverProfile.embeddedWalletAddress,
      // Use server values if they're newer
      ...(new Date(serverProfile.updatedAt) > new Date(localProfile.updatedAt)
        ? {
            username: serverProfile.username,
            email: serverProfile.email,
            avatarIndex: serverProfile.avatarIndex,
            soundEnabled: serverProfile.soundEnabled,
            musicEnabled: serverProfile.musicEnabled,
            hapticEnabled: serverProfile.hapticEnabled,
            notificationsEnabled: serverProfile.notificationsEnabled,
            pushToken: serverProfile.pushToken,
            activeWalletType: serverProfile.activeWalletType,
            smartWalletAddress: serverProfile.smartWalletAddress,
            externalWalletAddress: serverProfile.externalWalletAddress,
          }
        : {}),
      updatedAt: serverProfile.updatedAt,
      lastSeenAt: serverProfile.lastSeenAt,
    };
  }

  resolveConflict(
    serverProfile: SyncableProfile,
    localProfile: SyncableProfile
  ): ConflictResolution {
    const conflicts: ConflictResolution["conflicts"] = [];

    // Check for conflicts in client-modifiable fields
    const clientFields = [
      "username",
      "avatarIndex",
      "soundEnabled",
      "musicEnabled",
      "hapticEnabled",
      "notificationsEnabled",
    ] as const;

    for (const field of clientFields) {
      if (serverProfile[field] !== localProfile[field]) {
        conflicts.push({
          field,
          serverValue: serverProfile[field],
          clientValue: localProfile[field],
          // For user preferences, more recent wins
          resolvedValue:
            new Date(serverProfile.updatedAt) > new Date(localProfile.updatedAt)
              ? serverProfile[field]
              : localProfile[field],
        });
      }
    }

    if (conflicts.length === 0) {
      return {
        strategy: "merge",
        mergedProfile: this.mergeProfiles(serverProfile, localProfile),
      };
    }

    return {
      strategy: "merge",
      mergedProfile: this.mergeProfiles(serverProfile, localProfile),
      conflicts,
    };
  }

  // --------------------------------------------------------------------------
  // Offline Queue
  // --------------------------------------------------------------------------

  private async queueChange(changes: Partial<SyncableProfile>): Promise<void> {
    const change: ProfileChange = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      changes: mapSyncableToProfileUpdate(changes),
      retryCount: 0,
      maxRetries: MAX_RETRY_COUNT,
    };

    this.offlineQueue.push(change);
    this.updateSyncState({ pendingChanges: this.offlineQueue.length });

    await this.saveOfflineQueue();
  }

  private async loadOfflineQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (data) {
        this.offlineQueue = JSON.parse(data);
        this.updateSyncState({ pendingChanges: this.offlineQueue.length });
      }
    } catch (error) {
      console.error("[ProfileSync] Failed to load offline queue:", error);
      this.offlineQueue = [];
    }
  }

  private async saveOfflineQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        OFFLINE_QUEUE_KEY,
        JSON.stringify(this.offlineQueue)
      );
    } catch (error) {
      console.error("[ProfileSync] Failed to save offline queue:", error);
    }
  }

  async replayOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0 || !this.isOnline || !this.profileId) {
      return;
    }

    console.log(`[ProfileSync] Replaying ${this.offlineQueue.length} queued changes`);

    const failedChanges: ProfileChange[] = [];

    for (const change of this.offlineQueue) {
      try {
        const { error } = await supabase
          .from("profiles")
          .update({
            ...change.changes,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", this.profileId);

        if (error) {
          throw error;
        }
      } catch (error) {
        change.retryCount++;

        if (change.retryCount < change.maxRetries) {
          failedChanges.push(change);
        } else {
          console.error(
            `[ProfileSync] Dropping change after ${change.maxRetries} retries:`,
            change
          );
        }
      }
    }

    this.offlineQueue = failedChanges;
    this.updateSyncState({ pendingChanges: this.offlineQueue.length });
    await this.saveOfflineQueue();

    // Fetch latest profile after replay
    if (failedChanges.length < this.offlineQueue.length) {
      await this.fetchProfile();
    }
  }

  // --------------------------------------------------------------------------
  // Background Sync
  // --------------------------------------------------------------------------

  private startBackgroundSync(): void {
    if (this.backgroundSyncInterval) return;

    this.backgroundSyncInterval = setInterval(() => {
      if (this.isOnline) {
        this.debouncedSync();
      }
    }, BACKGROUND_SYNC_INTERVAL_MS);
  }

  private debouncedSync(): void {
    // Prevent too-frequent syncs
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
      return;
    }

    if (this.syncDebounceTimer) {
      clearTimeout(this.syncDebounceTimer);
    }

    this.syncDebounceTimer = setTimeout(() => {
      this.fetchProfile();
    }, SYNC_DEBOUNCE_MS);
  }

  async forceSyncNow(): Promise<SyncableProfile | null> {
    // Replay any queued changes first
    await this.replayOfflineQueue();

    // Then fetch latest
    return this.fetchProfile();
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  private validateUpdates(
    updates: Partial<SyncableProfile>
  ): { valid: boolean; error?: string } {
    // Validate username
    if (updates.username !== undefined) {
      if (updates.username.length < 3) {
        return { valid: false, error: "Username must be at least 3 characters" };
      }
      if (updates.username.length > 20) {
        return { valid: false, error: "Username must be at most 20 characters" };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(updates.username)) {
        return {
          valid: false,
          error: "Username can only contain letters, numbers, and underscores",
        };
      }
    }

    // Validate avatar index
    if (updates.avatarIndex !== undefined) {
      if (updates.avatarIndex < 0 || updates.avatarIndex > 9) {
        return { valid: false, error: "Invalid avatar index" };
      }
    }

    return { valid: true };
  }

  private filterClientModifiableFields(
    updates: Partial<SyncableProfile>
  ): Partial<SyncableProfile> {
    const filtered: Partial<SyncableProfile> = {};
    const fieldMap: Record<string, keyof SyncableProfile> = {
      username: "username",
      avatarIndex: "avatarIndex",
      soundEnabled: "soundEnabled",
      musicEnabled: "musicEnabled",
      hapticEnabled: "hapticEnabled",
      notificationsEnabled: "notificationsEnabled",
      pushToken: "pushToken",
      activeWalletType: "activeWalletType",
      smartWalletAddress: "smartWalletAddress",
      externalWalletAddress: "externalWalletAddress",
    };

    for (const [key, mappedKey] of Object.entries(fieldMap)) {
      if (updates[mappedKey] !== undefined) {
        (filtered as Record<string, unknown>)[mappedKey] = updates[mappedKey];
      }
    }

    return filtered;
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private async updateLastSeen(): Promise<void> {
    if (!this.profileId || !this.isOnline) return;

    try {
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() } as never)
        .eq("id", this.profileId);
    } catch (error) {
      // Non-critical, don't throw
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("fetch") ||
        msg.includes("connection")
      );
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Callbacks & State Updates
  // --------------------------------------------------------------------------

  onProfileChange(callback: ProfileChangeCallback): () => void {
    this.profileChangeCallbacks.add(callback);
    return () => this.profileChangeCallbacks.delete(callback);
  }

  onSyncStateChange(callback: SyncStateCallback): () => void {
    this.syncStateCallbacks.add(callback);
    return () => this.syncStateCallbacks.delete(callback);
  }

  onEloChange(callback: EloChangeCallback): () => void {
    this.eloChangeCallbacks.add(callback);
    return () => this.eloChangeCallbacks.delete(callback);
  }

  onBalanceChange(callback: BalanceChangeCallback): () => void {
    this.balanceChangeCallbacks.add(callback);
    return () => this.balanceChangeCallbacks.delete(callback);
  }

  private notifyProfileChange(profile: SyncableProfile): void {
    this.profileChangeCallbacks.forEach((cb) => cb(profile));
  }

  private notifyEloChange(oldElo: number, newElo: number, change: number): void {
    this.eloChangeCallbacks.forEach((cb) => cb(oldElo, newElo, change));
  }

  private notifyBalanceChange(balance: SyncableBalance): void {
    this.balanceChangeCallbacks.forEach((cb) => cb(balance));
  }

  private updateSyncState(updates: Partial<SyncState>): void {
    this.syncState = { ...this.syncState, ...updates };
    this.syncStateCallbacks.forEach((cb) => cb(this.syncState));
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getCurrentProfile(): SyncableProfile | null {
    return this.currentProfile;
  }

  getCurrentBalance(): SyncableBalance | null {
    return this.currentBalance;
  }

  getSyncState(): SyncState {
    return this.syncState;
  }

  getPendingChangesCount(): number {
    return this.offlineQueue.length;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const profileSyncService = new ProfileSyncService();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function initializeProfileSync(
  userId: string
): Promise<SyncableProfile | null> {
  return profileSyncService.initialize(userId);
}

export async function updateProfile(
  updates: Partial<SyncableProfile>
): Promise<{ success: boolean; profile?: SyncableProfile; error?: string }> {
  return profileSyncService.updateProfile(updates);
}

export async function syncProfileNow(): Promise<SyncableProfile | null> {
  return profileSyncService.forceSyncNow();
}

export function getCurrentProfile(): SyncableProfile | null {
  return profileSyncService.getCurrentProfile();
}

export function getCurrentBalance(): SyncableBalance | null {
  return profileSyncService.getCurrentBalance();
}

export async function fetchBalance(): Promise<SyncableBalance | null> {
  return profileSyncService.fetchBalance();
}

export function getSyncState(): SyncState {
  return profileSyncService.getSyncState();
}

export async function cleanupProfileSync(): Promise<void> {
  return profileSyncService.cleanup();
}
