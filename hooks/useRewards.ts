/**
 * Rewards Hooks
 *
 * React hooks for the rewards and achievements system featuring:
 * - Real-time reward/achievement progress tracking
 * - Automatic unlocking after game completion
 * - Push notification integration
 * - Optimistic UI updates
 * - Caching and background refresh
 * - Unclaimed rewards badge count
 *
 * @example
 * // In rewards screen
 * const { rewards, achievements, isLoading, refresh } = useRewards();
 *
 * // Check for unlocks after game
 * const { checkForUnlocks } = useRewardTriggers();
 * await checkForUnlocks();
 *
 * // Get unclaimed count for badge
 * const { unclaimedCount } = useUnclaimedRewards();
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  rewardsService,
  type UserReward,
  type UserAchievement,
  type UnlockedReward,
  type EarnedAchievement,
  type FeaturedAchievement,
  type ClaimResult,
  type PlayerStats,
  getProgressPercentage,
} from "@/lib/rewards";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStore } from "@/stores/userStore";
import { NotificationService } from "@/lib/notifications";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ============================================================================
// Types
// ============================================================================

export interface UseRewardsOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Refresh on app foreground */
  refreshOnForeground?: boolean;
}

export interface UseRewardsReturn {
  /** User's rewards with progress */
  rewards: UserReward[];
  /** User's achievements with progress */
  achievements: UserAchievement[];
  /** Loading state */
  isLoading: boolean;
  /** Refreshing state */
  isRefreshing: boolean;
  /** Error state */
  error: Error | null;
  /** Refresh data */
  refresh: () => Promise<void>;
  /** Force refresh (bypass cache) */
  forceRefresh: () => Promise<void>;
  /** Claim a reward */
  claimReward: (rewardId: string) => Promise<ClaimResult>;
  /** Check if a reward is claimable */
  isClaimable: (reward: UserReward) => boolean;
  /** Get unlocked rewards */
  unlockedRewards: UserReward[];
  /** Get locked rewards */
  lockedRewards: UserReward[];
  /** Get earned achievements */
  earnedAchievements: UserAchievement[];
  /** Get unearned achievements */
  unearnedAchievements: UserAchievement[];
  /** Get unclaimed rewards */
  unclaimedRewards: UserReward[];
}

export interface UseRewardTriggersReturn {
  /** Check for and unlock rewards/achievements */
  checkForUnlocks: () => Promise<{
    unlockedRewards: UnlockedReward[];
    earnedAchievements: EarnedAchievement[];
  }>;
  /** Newly unlocked rewards (to show animation) */
  newlyUnlocked: UnlockedReward[];
  /** Newly earned achievements */
  newlyEarned: EarnedAchievement[];
  /** Clear the newly unlocked/earned lists */
  clearNewlyUnlocked: () => void;
  /** Is currently checking */
  isChecking: boolean;
}

export interface UseUnclaimedRewardsReturn {
  /** Count of unclaimed rewards */
  unclaimedCount: number;
  /** Refresh count */
  refresh: () => Promise<void>;
}

export interface UseFeaturedAchievementReturn {
  /** Featured achievement */
  featured: FeaturedAchievement | null;
  /** All earned achievements for selection */
  earnedAchievements: FeaturedAchievement[];
  /** Set new featured achievement */
  setFeatured: (achievementId: string) => Promise<boolean>;
  /** Loading state */
  isLoading: boolean;
}

// ============================================================================
// useRewards Hook
// ============================================================================

/**
 * Main hook for accessing user rewards and achievements
 */
export function useRewards(options: UseRewardsOptions = {}): UseRewardsReturn {
  const { autoFetch = true, refreshOnForeground = true } = options;
  const { user } = useAuth();
  const userId = user?.id;

  const [rewards, setRewards] = useState<UserReward[]>([]);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);

  // Fetch data
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) {
        setRewards([]);
        setAchievements([]);
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        const [userRewards, userAchievements] = await Promise.all([
          rewardsService.fetchUserRewards(userId, forceRefresh),
          rewardsService.fetchUserAchievements(userId, forceRefresh),
        ]);

        if (isMountedRef.current) {
          setRewards(userRewards);
          setAchievements(userAchievements);
        }
      } catch (err) {
        console.error("[useRewards] Failed to fetch:", err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error("Failed to fetch rewards"));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [userId]
  );

  // Refresh function
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData(false);
  }, [fetchData]);

  // Force refresh function
  const forceRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData(true);
  }, [fetchData]);

  // Claim reward
  const claimReward = useCallback(
    async (rewardId: string): Promise<ClaimResult> => {
      if (!userId) {
        return { success: false, amountClaimed: 0, errorMessage: "Not logged in" };
      }

      const result = await rewardsService.claimReward(userId, rewardId);

      if (result.success) {
        // Update local state optimistically
        setRewards((prev) =>
          prev.map((r) =>
            r.rewardId === rewardId
              ? { ...r, tctClaimed: true, claimedAt: new Date().toISOString() }
              : r
          )
        );
      }

      return result;
    },
    [userId]
  );

  // Check if reward is claimable
  const isClaimable = useCallback((reward: UserReward): boolean => {
    return reward.unlockedAt !== null && !reward.tctClaimed && reward.reward.tctReward > 0;
  }, []);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;

    if (autoFetch) {
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [autoFetch, fetchData]);

  // App state listener for background refresh
  useEffect(() => {
    if (!refreshOnForeground) return;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App came to foreground - refresh
        fetchData(false);
      }
      appStateRef.current = nextAppState;
    });

    return () => subscription.remove();
  }, [refreshOnForeground, fetchData]);

  // Real-time Supabase subscription for reward/achievement updates
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    // Subscribe to user_rewards changes
    const rewardsChannel = supabase
      .channel(`user_rewards:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_rewards",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("[useRewards] Real-time reward update:", payload.eventType);
          // Refresh data on any change
          fetchData(true);
        }
      )
      .subscribe();

    // Subscribe to user_achievements changes
    const achievementsChannel = supabase
      .channel(`user_achievements:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_achievements",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("[useRewards] Real-time achievement update:", payload.eventType);
          // Refresh data on any change
          fetchData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(rewardsChannel);
      supabase.removeChannel(achievementsChannel);
    };
  }, [userId, fetchData]);

  // Computed values
  const unlockedRewards = useMemo(
    () => rewards.filter((r) => r.unlockedAt !== null),
    [rewards]
  );

  const lockedRewards = useMemo(
    () => rewards.filter((r) => r.unlockedAt === null),
    [rewards]
  );

  const earnedAchievements = useMemo(
    () => achievements.filter((a) => a.earnedAt !== null),
    [achievements]
  );

  const unearnedAchievements = useMemo(
    () => achievements.filter((a) => a.earnedAt === null),
    [achievements]
  );

  const unclaimedRewards = useMemo(
    () =>
      rewards.filter(
        (r) => r.unlockedAt !== null && !r.tctClaimed && r.reward.tctReward > 0
      ),
    [rewards]
  );

  return {
    rewards,
    achievements,
    isLoading,
    isRefreshing,
    error,
    refresh,
    forceRefresh,
    claimReward,
    isClaimable,
    unlockedRewards,
    lockedRewards,
    earnedAchievements,
    unearnedAchievements,
    unclaimedRewards,
  };
}

// ============================================================================
// useRewardTriggers Hook
// ============================================================================

/**
 * Hook for triggering reward/achievement checks after games
 */
export function useRewardTriggers(): UseRewardTriggersReturn {
  const { user } = useAuth();
  const { profile } = useUserStore();
  const userId = user?.id;

  const [newlyUnlocked, setNewlyUnlocked] = useState<UnlockedReward[]>([]);
  const [newlyEarned, setNewlyEarned] = useState<EarnedAchievement[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Build current stats from profile
  const currentStats = useMemo((): PlayerStats | undefined => {
    if (!profile) return undefined;
    return {
      gamesPlayed: profile.gamesPlayed,
      gamesWon: profile.gamesWon,
      gamesLost: profile.gamesLost,
      gamesDrawn: profile.gamesDrawn,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      eloRating: profile.eloRating,
    };
  }, [profile]);

  // Check for unlocks
  const checkForUnlocks = useCallback(async () => {
    if (!userId) {
      return { unlockedRewards: [], earnedAchievements: [] };
    }

    setIsChecking(true);

    try {
      const result = await rewardsService.checkAllAfterGame(userId, currentStats);

      // Store newly unlocked for animations
      if (result.unlockedRewards.length > 0) {
        setNewlyUnlocked(result.unlockedRewards);

        // Send push notifications
        for (const reward of result.unlockedRewards) {
          await NotificationService.showLocalNotification({
            title: "Reward Unlocked!",
            body: `${reward.rewardName}: ${reward.rewardDescription}`,
            data: { type: "reward_unlocked", rewardId: reward.rewardId },
          });
        }

        // Mark as notified
        await rewardsService.markRewardNotified(
          userId,
          result.unlockedRewards.map((r) => r.rewardId)
        );
      }

      if (result.earnedAchievements.length > 0) {
        setNewlyEarned(result.earnedAchievements);

        // Send push notifications
        for (const achievement of result.earnedAchievements) {
          await NotificationService.notifyAchievementUnlocked(
            achievement.achievementId,
            achievement.achievementName,
            achievement.achievementDescription
          );
        }

        // Mark as notified
        await rewardsService.markAchievementNotified(
          userId,
          result.earnedAchievements.map((a) => a.achievementId)
        );
      }

      return result;
    } catch (error) {
      console.error("[useRewardTriggers] Check failed:", error);
      return { unlockedRewards: [], earnedAchievements: [] };
    } finally {
      setIsChecking(false);
    }
  }, [userId, currentStats]);

  // Clear newly unlocked
  const clearNewlyUnlocked = useCallback(() => {
    setNewlyUnlocked([]);
    setNewlyEarned([]);
  }, []);

  return {
    checkForUnlocks,
    newlyUnlocked,
    newlyEarned,
    clearNewlyUnlocked,
    isChecking,
  };
}

// ============================================================================
// useUnclaimedRewards Hook
// ============================================================================

/**
 * Hook for getting unclaimed rewards count (for badges)
 */
export function useUnclaimedRewards(): UseUnclaimedRewardsReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [unclaimedCount, setUnclaimedCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnclaimedCount(0);
      return;
    }

    const count = await rewardsService.getUnclaimedRewardsCount(userId);
    setUnclaimedCount(count);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { unclaimedCount, refresh };
}

// ============================================================================
// useFeaturedAchievement Hook
// ============================================================================

/**
 * Hook for managing featured achievement
 */
export function useFeaturedAchievement(): UseFeaturedAchievementReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [featured, setFeatured] = useState<FeaturedAchievement | null>(null);
  const [earnedAchievements, setEarnedAchievements] = useState<FeaturedAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch featured and earned achievements
  useEffect(() => {
    async function fetch() {
      if (!userId) {
        setFeatured(null);
        setEarnedAchievements([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [featuredResult, earnedResult] = await Promise.all([
          rewardsService.getFeaturedAchievement(userId),
          rewardsService.getEarnedAchievements(userId),
        ]);

        setFeatured(featuredResult);
        setEarnedAchievements(earnedResult);
      } catch (error) {
        console.error("[useFeaturedAchievement] Fetch failed:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetch();
  }, [userId]);

  // Set featured achievement
  const setFeaturedAchievement = useCallback(
    async (achievementId: string): Promise<boolean> => {
      if (!userId) return false;

      const success = await rewardsService.setFeaturedAchievement(userId, achievementId);

      if (success) {
        // Update local state
        const newFeatured = earnedAchievements.find(
          (a) => a.achievementId === achievementId
        );
        if (newFeatured) {
          setFeatured(newFeatured);
        }
      }

      return success;
    },
    [userId, earnedAchievements]
  );

  return {
    featured,
    earnedAchievements,
    setFeatured: setFeaturedAchievement,
    isLoading,
  };
}

// ============================================================================
// useRewardProgress Hook
// ============================================================================

/**
 * Hook for tracking progress on a specific reward
 */
export function useRewardProgress(rewardId: string) {
  const { rewards } = useRewards({ autoFetch: true });
  const { profile } = useUserStore();

  const reward = useMemo(
    () => rewards.find((r) => r.rewardId === rewardId),
    [rewards, rewardId]
  );

  const currentProgress = useMemo(() => {
    if (!reward || !profile) return 0;
    return rewardsService.calculateProgress(reward.reward.criteriaType, {
      gamesPlayed: profile.gamesPlayed,
      gamesWon: profile.gamesWon,
      gamesLost: profile.gamesLost,
      gamesDrawn: profile.gamesDrawn,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      eloRating: profile.eloRating,
    });
  }, [reward, profile]);

  const targetProgress = reward?.reward.criteriaValue || 0;
  const percentage = getProgressPercentage(currentProgress, targetProgress);
  const isUnlocked = reward?.unlockedAt !== null;

  return {
    reward,
    currentProgress,
    targetProgress,
    percentage,
    isUnlocked,
  };
}

// ============================================================================
// useAchievementProgress Hook
// ============================================================================

/**
 * Hook for tracking progress on a specific achievement
 */
export function useAchievementProgress(achievementId: string) {
  const { achievements } = useRewards({ autoFetch: true });
  const { profile } = useUserStore();

  const achievement = useMemo(
    () => achievements.find((a) => a.achievementId === achievementId),
    [achievements, achievementId]
  );

  const currentProgress = useMemo(() => {
    if (!achievement || !profile) return 0;
    return rewardsService.calculateProgress(achievement.achievement.criteriaType, {
      gamesPlayed: profile.gamesPlayed,
      gamesWon: profile.gamesWon,
      gamesLost: profile.gamesLost,
      gamesDrawn: profile.gamesDrawn,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      eloRating: profile.eloRating,
    });
  }, [achievement, profile]);

  const targetProgress = achievement?.achievement.criteriaValue || 0;
  const percentage = getProgressPercentage(currentProgress, targetProgress);
  const isEarned = achievement?.earnedAt !== null;

  return {
    achievement,
    currentProgress,
    targetProgress,
    percentage,
    isEarned,
  };
}

// ============================================================================
// usePlayerAchievementBadges Hook
// ============================================================================

/**
 * Hook for getting a player's achievement badges (for leaderboard)
 */
export function usePlayerAchievementBadges(playerId: string) {
  const [badges, setBadges] = useState<FeaturedAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!playerId) {
        setBadges([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const earnedBadges = await rewardsService.getEarnedAchievements(playerId);
        setBadges(earnedBadges);
      } catch {
        setBadges([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetch();
  }, [playerId]);

  return { badges, isLoading };
}
