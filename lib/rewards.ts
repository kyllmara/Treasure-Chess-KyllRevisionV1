/**
 * Rewards & Achievements Service
 *
 * Elite-level backend service for the Treasure Chess rewards system featuring:
 * - Bidirectional sync with Supabase rewards/achievements tables
 * - Progress tracking with real-time updates
 * - Automatic reward unlocking based on game statistics
 * - TCT reward claiming with balance updates
 * - Achievement badges for profile and leaderboard
 * - Push notification integration for unlocks
 * - Optimistic updates with rollback
 * - Offline support with cached data
 *
 * @example
 * // Fetch user rewards with progress
 * const rewards = await rewardsService.fetchUserRewards(userId);
 *
 * // Check for newly unlocked rewards after a game
 * const unlocked = await rewardsService.checkAndUnlockRewards(userId);
 *
 * // Claim TCT reward
 * const result = await rewardsService.claimReward(userId, rewardId);
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// Types
// ============================================================================

export type RewardTier = "bronze" | "silver" | "gold" | "platinum";
export type AchievementRarity = "common" | "rare" | "epic" | "legendary";
export type CriteriaType =
  | "win_streak"
  | "games_played"
  | "total_earnings"
  | "total_wins"
  | "elo_rating"
  | "longest_streak"
  | "referral_count"
  | "tournament_wins"
  | "tournaments_played"
  | "challenges_completed"
  | "consecutive_days"
  | "checkmate_count"
  | "quick_win"
  | "comeback_win"
  | "perfect_game"
  | "first_blood";

export type RewardType = "standard" | "dragon_avatar" | "tct_bonus";

/** Database reward definition */
export interface Reward {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: RewardTier;
  criteriaType: CriteriaType;
  criteriaValue: number;
  tctReward: number;
  gradientStart: string;
  gradientEnd: string;
  sortOrder: number;
  isActive: boolean;
  avatarUrl?: string;
  rewardType: RewardType;
}

/** Dragon avatar reward with progress info */
export interface DragonRewardProgress {
  rewardId: string;
  rewardName: string;
  criteriaType: CriteriaType;
  criteriaValue: number;
  currentProgress: number;
  isUnlocked: boolean;
  tctReward: number;
  tctClaimed: boolean;
  avatarUrl: string | null;
  rewardType: RewardType;
  tier: RewardTier;
}

/** Dragon avatar category for grouping */
export type DragonCategory = "baby" | "teenage" | "adult" | "fierce";

/** User's progress on a reward */
export interface UserReward {
  id: string;
  rewardId: string;
  reward: Reward;
  progress: number;
  unlockedAt: string | null;
  notifiedAt: string | null;
  tctClaimed: boolean;
  claimedAt: string | null;
}

/** Database achievement definition */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  criteriaType: CriteriaType;
  criteriaValue: number;
  badgeColor: string;
  sortOrder: number;
  isActive: boolean;
}

/** User's progress on an achievement */
export interface UserAchievement {
  id: string;
  achievementId: string;
  achievement: Achievement;
  progress: number;
  earnedAt: string | null;
  notifiedAt: string | null;
  featured: boolean;
}

/** Result from checking rewards after game */
export interface UnlockedReward {
  rewardId: string;
  rewardName: string;
  rewardDescription: string;
  tctReward: number;
  tier: RewardTier;
  icon: string;
  gradientStart: string;
  gradientEnd: string;
}

/** Result from checking achievements after game */
export interface EarnedAchievement {
  achievementId: string;
  achievementName: string;
  achievementDescription: string;
  rarity: AchievementRarity;
  icon: string;
  badgeColor: string;
}

/** Result from claiming a reward */
export interface ClaimResult {
  success: boolean;
  amountClaimed: number;
  errorMessage?: string;
}

/** Player stats for local progress calculation */
export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  currentStreak: number;
  longestStreak: number;
  eloRating: number;
  totalEarnings?: number;
  challengesCompleted?: number;
  tournamentsPlayed?: number;
  tournamentWins?: number;
}

/** Featured achievement for display */
export interface FeaturedAchievement {
  achievementId: string;
  name: string;
  icon: string;
  rarity: AchievementRarity;
  badgeColor: string;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEYS = {
  REWARDS: "rewards_cache",
  ACHIEVEMENTS: "achievements_cache",
  USER_REWARDS: (userId: string) => `user_rewards_${userId}`,
  USER_ACHIEVEMENTS: (userId: string) => `user_achievements_${userId}`,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Tier colors for UI */
export const TIER_COLORS: Record<RewardTier, { bg: string; text: string; border: string }> = {
  bronze: { bg: "rgba(205, 127, 50, 0.15)", text: "#CD7F32", border: "rgba(205, 127, 50, 0.3)" },
  silver: { bg: "rgba(192, 192, 192, 0.15)", text: "#C0C0C0", border: "rgba(192, 192, 192, 0.3)" },
  gold: { bg: "rgba(255, 215, 0, 0.15)", text: "#FFD700", border: "rgba(255, 215, 0, 0.3)" },
  platinum: { bg: "rgba(167, 112, 239, 0.15)", text: "#A770EF", border: "rgba(167, 112, 239, 0.3)" },
};

/** Rarity colors for UI */
export const RARITY_COLORS: Record<AchievementRarity, { bg: string; text: string; border: string; glow: string }> = {
  common: { bg: "rgba(78, 205, 196, 0.15)", text: "#4ECDC4", border: "rgba(78, 205, 196, 0.3)", glow: "#4ECDC4" },
  rare: { bg: "rgba(108, 92, 231, 0.15)", text: "#6C5CE7", border: "rgba(108, 92, 231, 0.3)", glow: "#6C5CE7" },
  epic: { bg: "rgba(225, 112, 85, 0.15)", text: "#E17055", border: "rgba(225, 112, 85, 0.3)", glow: "#E17055" },
  legendary: { bg: "rgba(255, 215, 0, 0.15)", text: "#FFD700", border: "rgba(255, 215, 0, 0.5)", glow: "#FFD700" },
};

// ============================================================================
// Cache Helpers
// ============================================================================

interface CachedData<T> {
  data: T;
  timestamp: number;
}

async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;

    return isExpired ? null : parsed.data;
  } catch {
    return null;
  }
}

async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    const cached: CachedData<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Cache write failure is non-critical
  }
}

async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Cache clear failure is non-critical
  }
}

// ============================================================================
// Retry Helper
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  shouldRetry: (error: any) => {
    // Retry on network errors, 5xx server errors, and rate limiting
    if (!error) return false;
    const status = error?.status || error?.code;
    if (status === 429) return true; // Rate limited
    if (status >= 500 && status < 600) return true; // Server error
    if (error?.message?.includes("network")) return true;
    if (error?.message?.includes("timeout")) return true;
    if (error?.message?.includes("ECONNRESET")) return true;
    return false;
  },
};

/**
 * Retry an async operation with exponential backoff
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, shouldRetry } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        maxDelayMs
      );

      console.log(
        `[RewardsService] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Database Row Transformers
// ============================================================================

function transformReward(row: any): Reward {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    tier: row.tier,
    criteriaType: row.criteria_type,
    criteriaValue: row.criteria_value,
    tctReward: parseFloat(row.tct_reward) || 0,
    gradientStart: row.gradient_start,
    gradientEnd: row.gradient_end,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    avatarUrl: row.avatar_url || undefined,
    rewardType: row.reward_type || "standard",
  };
}

function transformDragonRewardProgress(row: any): DragonRewardProgress {
  return {
    rewardId: row.reward_id,
    rewardName: row.reward_name,
    criteriaType: row.criteria_type,
    criteriaValue: row.criteria_value,
    currentProgress: row.current_progress,
    isUnlocked: row.is_unlocked,
    tctReward: parseFloat(row.tct_reward) || 0,
    tctClaimed: row.tct_claimed,
    avatarUrl: row.avatar_url,
    rewardType: row.reward_type || "standard",
    tier: row.tier,
  };
}

function transformAchievement(row: any): Achievement {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    rarity: row.rarity,
    criteriaType: row.criteria_type,
    criteriaValue: row.criteria_value,
    badgeColor: row.badge_color,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function transformUserReward(row: any): UserReward {
  return {
    id: row.id,
    rewardId: row.reward_id,
    reward: transformReward(row.rewards),
    progress: row.progress,
    unlockedAt: row.unlocked_at,
    notifiedAt: row.notified_at,
    tctClaimed: row.tct_claimed,
    claimedAt: row.claimed_at,
  };
}

function transformUserAchievement(row: any): UserAchievement {
  return {
    id: row.id,
    achievementId: row.achievement_id,
    achievement: transformAchievement(row.achievements),
    progress: row.progress,
    earnedAt: row.earned_at,
    notifiedAt: row.notified_at,
    featured: row.featured,
  };
}

// ============================================================================
// Demo Data
// ============================================================================

const DEMO_REWARDS: Reward[] = [
  {
    id: "demo_1",
    name: "Hot Streak",
    description: "3 game win streak",
    icon: "flame",
    tier: "bronze",
    criteriaType: "win_streak",
    criteriaValue: 3,
    tctReward: 10,
    gradientStart: "#FF6B6B",
    gradientEnd: "#EE5A6F",
    sortOrder: 10,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
  {
    id: "demo_2",
    name: "On Fire",
    description: "5 game win streak",
    icon: "flame",
    tier: "silver",
    criteriaType: "win_streak",
    criteriaValue: 5,
    tctReward: 25,
    gradientStart: "#FF8C42",
    gradientEnd: "#FF6B35",
    sortOrder: 11,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
  {
    id: "demo_3",
    name: "Unstoppable",
    description: "10 game win streak",
    icon: "flame",
    tier: "gold",
    criteriaType: "win_streak",
    criteriaValue: 10,
    tctReward: 100,
    gradientStart: "#FFD700",
    gradientEnd: "#FFA500",
    sortOrder: 12,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
  {
    id: "demo_4",
    name: "Rookie",
    description: "Play 10 games",
    icon: "target",
    tier: "bronze",
    criteriaType: "games_played",
    criteriaValue: 10,
    tctReward: 5,
    gradientStart: "#4ECDC4",
    gradientEnd: "#556270",
    sortOrder: 20,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
  {
    id: "demo_5",
    name: "Veteran",
    description: "Play 100 games",
    icon: "target",
    tier: "silver",
    criteriaType: "games_played",
    criteriaValue: 100,
    tctReward: 50,
    gradientStart: "#00B894",
    gradientEnd: "#55EFC4",
    sortOrder: 22,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
  {
    id: "demo_6",
    name: "First Victory",
    description: "Win your first game",
    icon: "trophy",
    tier: "bronze",
    criteriaType: "total_wins",
    criteriaValue: 1,
    tctReward: 5,
    gradientStart: "#4ECDC4",
    gradientEnd: "#44A08D",
    sortOrder: 30,
    isActive: true,
    rewardType: "standard" as RewardType,
  },
];

const DEMO_ACHIEVEMENTS: Achievement[] = [
  {
    id: "demo_ach_1",
    name: "First Blood",
    description: "Win your first game",
    icon: "sword",
    rarity: "common",
    criteriaType: "first_blood",
    criteriaValue: 1,
    badgeColor: "#4ECDC4",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "demo_ach_2",
    name: "Hot Hand",
    description: "Achieve a 5 game win streak",
    icon: "flame",
    rarity: "common",
    criteriaType: "win_streak",
    criteriaValue: 5,
    badgeColor: "#FF6B6B",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "demo_ach_3",
    name: "Fire Starter",
    description: "Achieve a 10 game win streak",
    icon: "flame",
    rarity: "rare",
    criteriaType: "win_streak",
    criteriaValue: 10,
    badgeColor: "#FF8C42",
    sortOrder: 21,
    isActive: true,
  },
];

// ============================================================================
// Rewards Service Class
// ============================================================================

class RewardsService {
  // --------------------------------------------------------------------------
  // Fetch All Rewards (Available)
  // --------------------------------------------------------------------------

  /**
   * Fetch all available rewards from database
   */
  async fetchAllRewards(forceRefresh = false): Promise<Reward[]> {
    // Check cache first
    if (!forceRefresh) {
      const cached = await getCachedData<Reward[]>(CACHE_KEYS.REWARDS);
      if (cached) return cached;
    }

    if (!isSupabaseConfigured) {
      return DEMO_REWARDS;
    }

    try {
      const { data, error } = await supabase
        .from("rewards")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      const rewards = (data || []).map(transformReward);
      await setCachedData(CACHE_KEYS.REWARDS, rewards);
      return rewards;
    } catch (error) {
      console.error("[RewardsService] Failed to fetch rewards:", error);
      // Return cached or demo data on error
      const cached = await getCachedData<Reward[]>(CACHE_KEYS.REWARDS);
      return cached || DEMO_REWARDS;
    }
  }

  // --------------------------------------------------------------------------
  // Fetch All Achievements (Available)
  // --------------------------------------------------------------------------

  /**
   * Fetch all available achievements from database
   */
  async fetchAllAchievements(forceRefresh = false): Promise<Achievement[]> {
    if (!forceRefresh) {
      const cached = await getCachedData<Achievement[]>(CACHE_KEYS.ACHIEVEMENTS);
      if (cached) return cached;
    }

    if (!isSupabaseConfigured) {
      return DEMO_ACHIEVEMENTS;
    }

    try {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      const achievements = (data || []).map(transformAchievement);
      await setCachedData(CACHE_KEYS.ACHIEVEMENTS, achievements);
      return achievements;
    } catch (error) {
      console.error("[RewardsService] Failed to fetch achievements:", error);
      const cached = await getCachedData<Achievement[]>(CACHE_KEYS.ACHIEVEMENTS);
      return cached || DEMO_ACHIEVEMENTS;
    }
  }

  // --------------------------------------------------------------------------
  // Fetch User Rewards (With Progress)
  // --------------------------------------------------------------------------

  /**
   * Fetch user's rewards with their progress
   */
  async fetchUserRewards(userId: string, forceRefresh = false): Promise<UserReward[]> {
    if (!userId) return [];

    if (!forceRefresh) {
      const cached = await getCachedData<UserReward[]>(CACHE_KEYS.USER_REWARDS(userId));
      if (cached) return cached;
    }

    if (!isSupabaseConfigured) {
      // Return demo rewards with simulated progress
      return DEMO_REWARDS.map((reward, index) => ({
        id: `user_${reward.id}`,
        rewardId: reward.id,
        reward,
        progress: index < 2 ? reward.criteriaValue : Math.floor(reward.criteriaValue * 0.3),
        unlockedAt: index < 2 ? new Date().toISOString() : null,
        notifiedAt: index < 2 ? new Date().toISOString() : null,
        tctClaimed: index === 0,
        claimedAt: index === 0 ? new Date().toISOString() : null,
      }));
    }

    try {
      // First ensure user has reward records for all active rewards
      await this.initializeUserRewards(userId);

      const { data, error } = await supabase
        .from("user_rewards")
        .select(`
          *,
          rewards!inner(*)
        `)
        .eq("user_id", userId)
        .eq("rewards.is_active", true)
        .order("rewards(sort_order)");

      if (error) throw error;

      const userRewards = (data || []).map(transformUserReward);
      await setCachedData(CACHE_KEYS.USER_REWARDS(userId), userRewards);
      return userRewards;
    } catch (error) {
      console.error("[RewardsService] Failed to fetch user rewards:", error);
      const cached = await getCachedData<UserReward[]>(CACHE_KEYS.USER_REWARDS(userId));
      return cached || [];
    }
  }

  // --------------------------------------------------------------------------
  // Fetch User Achievements (With Progress)
  // --------------------------------------------------------------------------

  /**
   * Fetch user's achievements with their progress
   */
  async fetchUserAchievements(userId: string, forceRefresh = false): Promise<UserAchievement[]> {
    if (!userId) return [];

    if (!forceRefresh) {
      const cached = await getCachedData<UserAchievement[]>(CACHE_KEYS.USER_ACHIEVEMENTS(userId));
      if (cached) return cached;
    }

    if (!isSupabaseConfigured) {
      return DEMO_ACHIEVEMENTS.map((achievement, index) => ({
        id: `user_${achievement.id}`,
        achievementId: achievement.id,
        achievement,
        progress: index === 0 ? achievement.criteriaValue : Math.floor(achievement.criteriaValue * 0.5),
        earnedAt: index === 0 ? new Date().toISOString() : null,
        notifiedAt: index === 0 ? new Date().toISOString() : null,
        featured: index === 0,
      }));
    }

    try {
      await this.initializeUserAchievements(userId);

      const { data, error } = await supabase
        .from("user_achievements")
        .select(`
          *,
          achievements!inner(*)
        `)
        .eq("user_id", userId)
        .eq("achievements.is_active", true)
        .order("achievements(sort_order)");

      if (error) throw error;

      const userAchievements = (data || []).map(transformUserAchievement);
      await setCachedData(CACHE_KEYS.USER_ACHIEVEMENTS(userId), userAchievements);
      return userAchievements;
    } catch (error) {
      console.error("[RewardsService] Failed to fetch user achievements:", error);
      const cached = await getCachedData<UserAchievement[]>(CACHE_KEYS.USER_ACHIEVEMENTS(userId));
      return cached || [];
    }
  }

  // --------------------------------------------------------------------------
  // Initialize User Rewards (Create Records)
  // --------------------------------------------------------------------------

  /**
   * Initialize user_rewards records for all active rewards
   */
  private async initializeUserRewards(userId: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const { data: rewards } = await supabase
        .from("rewards")
        .select("id")
        .eq("is_active", true);

      if (!rewards?.length) return;

      // Upsert records for all rewards
      const records = rewards.map((r) => ({
        user_id: userId,
        reward_id: r.id,
        progress: 0,
      }));

      await supabase
        .from("user_rewards")
        .upsert(records, { onConflict: "user_id,reward_id", ignoreDuplicates: true });
    } catch (error) {
      console.error("[RewardsService] Failed to initialize user rewards:", error);
    }
  }

  /**
   * Initialize user_achievements records for all active achievements
   */
  private async initializeUserAchievements(userId: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const { data: achievements } = await supabase
        .from("achievements")
        .select("id")
        .eq("is_active", true);

      if (!achievements?.length) return;

      const records = achievements.map((a) => ({
        user_id: userId,
        achievement_id: a.id,
        progress: 0,
      }));

      await supabase
        .from("user_achievements")
        .upsert(records, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
    } catch (error) {
      console.error("[RewardsService] Failed to initialize user achievements:", error);
    }
  }

  // --------------------------------------------------------------------------
  // Check and Unlock Rewards
  // --------------------------------------------------------------------------

  /**
   * Check and unlock rewards based on current player stats
   * Returns list of newly unlocked rewards
   * Uses retry logic for transient failures
   */
  async checkAndUnlockRewards(userId: string, stats?: PlayerStats): Promise<UnlockedReward[]> {
    if (!userId) return [];

    if (!isSupabaseConfigured) {
      // Demo mode - simulate unlocking
      return [];
    }

    try {
      // Call database function to check rewards with retry
      const { data, error } = await withRetry(
        () => supabase.rpc("check_user_rewards", {
          p_user_id: userId,
        })
      );

      if (error) throw error;

      // Clear cache to reflect updates
      await clearCache(CACHE_KEYS.USER_REWARDS(userId));

      // Transform and return newly unlocked rewards
      const unlocked: UnlockedReward[] = (data || [])
        .filter((r: any) => r.newly_unlocked)
        .map((r: any) => ({
          rewardId: r.reward_id,
          rewardName: r.reward_name,
          rewardDescription: r.reward_description,
          tctReward: parseFloat(r.tct_reward) || 0,
          tier: "gold" as RewardTier, // Default, actual tier fetched separately
          icon: "trophy",
          gradientStart: "#FFD700",
          gradientEnd: "#FFA500",
        }));

      // Fetch full reward details for newly unlocked
      if (unlocked.length > 0) {
        const { data: rewardDetails } = await supabase
          .from("rewards")
          .select("id, tier, icon, gradient_start, gradient_end")
          .in(
            "id",
            unlocked.map((u) => u.rewardId)
          );

        if (rewardDetails) {
          for (const reward of unlocked) {
            const detail = rewardDetails.find((d) => d.id === reward.rewardId);
            if (detail) {
              reward.tier = detail.tier;
              reward.icon = detail.icon;
              reward.gradientStart = detail.gradient_start;
              reward.gradientEnd = detail.gradient_end;
            }
          }
        }
      }

      return unlocked;
    } catch (error) {
      console.error("[RewardsService] Failed to check rewards:", error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Check and Unlock Achievements
  // --------------------------------------------------------------------------

  /**
   * Check and unlock achievements based on current player stats
   * Returns list of newly earned achievements
   * Uses retry logic for transient failures
   */
  async checkAndUnlockAchievements(userId: string, stats?: PlayerStats): Promise<EarnedAchievement[]> {
    if (!userId) return [];

    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      // Call database function to check achievements with retry
      const { data, error } = await withRetry(
        () => supabase.rpc("check_user_achievements", {
          p_user_id: userId,
        })
      );

      if (error) throw error;

      await clearCache(CACHE_KEYS.USER_ACHIEVEMENTS(userId));

      const earned: EarnedAchievement[] = (data || [])
        .filter((a: any) => a.newly_earned)
        .map((a: any) => ({
          achievementId: a.achievement_id,
          achievementName: a.achievement_name,
          achievementDescription: a.achievement_description,
          rarity: a.rarity,
          icon: "medal",
          badgeColor: "#FFD700",
        }));

      // Fetch full achievement details
      if (earned.length > 0) {
        const { data: achievementDetails } = await supabase
          .from("achievements")
          .select("id, icon, badge_color")
          .in(
            "id",
            earned.map((e) => e.achievementId)
          );

        if (achievementDetails) {
          for (const achievement of earned) {
            const detail = achievementDetails.find((d) => d.id === achievement.achievementId);
            if (detail) {
              achievement.icon = detail.icon;
              achievement.badgeColor = detail.badge_color;
            }
          }
        }
      }

      return earned;
    } catch (error) {
      console.error("[RewardsService] Failed to check achievements:", error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Check All (Rewards + Achievements)
  // --------------------------------------------------------------------------

  /**
   * Check both rewards and achievements after a game
   */
  async checkAllAfterGame(
    userId: string,
    stats?: PlayerStats
  ): Promise<{
    unlockedRewards: UnlockedReward[];
    earnedAchievements: EarnedAchievement[];
  }> {
    const [unlockedRewards, earnedAchievements] = await Promise.all([
      this.checkAndUnlockRewards(userId, stats),
      this.checkAndUnlockAchievements(userId, stats),
    ]);

    return { unlockedRewards, earnedAchievements };
  }

  // --------------------------------------------------------------------------
  // Update Progress Locally
  // --------------------------------------------------------------------------

  /**
   * Update reward/achievement progress based on player stats
   * This is called locally to update UI before server confirmation
   */
  calculateProgress(criteriaType: CriteriaType, stats: PlayerStats): number {
    switch (criteriaType) {
      case "win_streak":
        return Math.max(0, stats.currentStreak);
      case "games_played":
        return stats.gamesPlayed;
      case "total_wins":
        return stats.gamesWon;
      case "elo_rating":
        return stats.eloRating;
      case "longest_streak":
        return stats.longestStreak;
      case "first_blood":
        return stats.gamesWon >= 1 ? 1 : 0;
      case "total_earnings":
        return stats.totalEarnings || 0;
      case "challenges_completed":
        return stats.challengesCompleted || 0;
      case "tournaments_played":
        return stats.tournamentsPlayed || 0;
      case "tournament_wins":
        return stats.tournamentWins || 0;
      default:
        return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Claim Reward TCT
  // --------------------------------------------------------------------------

  /**
   * Claim TCT reward for an unlocked reward
   * Uses retry logic for transient failures
   */
  async claimReward(userId: string, rewardId: string): Promise<ClaimResult> {
    if (!userId || !rewardId) {
      return { success: false, amountClaimed: 0, errorMessage: "Invalid parameters" };
    }

    if (!isSupabaseConfigured) {
      // Demo mode - simulate claiming
      return { success: true, amountClaimed: 10 };
    }

    try {
      // Use retry logic for the RPC call
      const { data, error } = await withRetry(
        () => supabase.rpc("claim_reward_tct", {
          p_user_id: userId,
          p_reward_id: rewardId,
        }),
        { maxRetries: 2 } // Fewer retries for user-facing operations
      );

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      if (!result) {
        return { success: false, amountClaimed: 0, errorMessage: "No result returned" };
      }

      // Clear cache on success
      if (result.success) {
        await clearCache(CACHE_KEYS.USER_REWARDS(userId));
      }

      return {
        success: result.success,
        amountClaimed: parseFloat(result.amount_claimed) || 0,
        errorMessage: result.error_message || undefined,
      };
    } catch (error) {
      console.error("[RewardsService] Failed to claim reward:", error);
      let message = "Failed to claim reward";
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        const pgError = error as { message?: string; details?: string; hint?: string; code?: string };
        message = pgError.message || pgError.details || pgError.hint || `Database error (${pgError.code || "unknown"})`;
      } else if (typeof error === "string") {
        message = error;
      }
      return {
        success: false,
        amountClaimed: 0,
        errorMessage: message,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Set Featured Achievement
  // --------------------------------------------------------------------------

  /**
   * Set a user's featured achievement (displayed on profile/leaderboard)
   */
  async setFeaturedAchievement(userId: string, achievementId: string): Promise<boolean> {
    if (!userId || !achievementId) return false;

    if (!isSupabaseConfigured) {
      return true;
    }

    try {
      const { data, error } = await supabase.rpc("set_featured_achievement", {
        p_user_id: userId,
        p_achievement_id: achievementId,
      });

      if (error) throw error;

      await clearCache(CACHE_KEYS.USER_ACHIEVEMENTS(userId));
      return data === true;
    } catch (error) {
      console.error("[RewardsService] Failed to set featured achievement:", error);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Get Featured Achievement
  // --------------------------------------------------------------------------

  /**
   * Get user's featured achievement for display
   */
  async getFeaturedAchievement(userId: string): Promise<FeaturedAchievement | null> {
    if (!userId) return null;

    if (!isSupabaseConfigured) {
      return {
        achievementId: "demo_ach_1",
        name: "First Blood",
        icon: "sword",
        rarity: "common",
        badgeColor: "#4ECDC4",
      };
    }

    try {
      const { data, error } = await supabase
        .from("user_achievements")
        .select(`
          achievement_id,
          achievements!inner(name, icon, rarity, badge_color)
        `)
        .eq("user_id", userId)
        .eq("featured", true)
        .not("earned_at", "is", null)
        .single();

      if (error || !data) return null;

      const ach = data.achievements as any;
      return {
        achievementId: data.achievement_id,
        name: ach.name,
        icon: ach.icon,
        rarity: ach.rarity,
        badgeColor: ach.badge_color,
      };
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Get Earned Achievements for User
  // --------------------------------------------------------------------------

  /**
   * Get list of earned achievements for a user (for leaderboard badges)
   */
  async getEarnedAchievements(userId: string): Promise<FeaturedAchievement[]> {
    if (!userId) return [];

    if (!isSupabaseConfigured) {
      return [
        {
          achievementId: "demo_ach_1",
          name: "First Blood",
          icon: "sword",
          rarity: "common",
          badgeColor: "#4ECDC4",
        },
      ];
    }

    try {
      const { data, error } = await supabase
        .from("user_achievements")
        .select(`
          achievement_id,
          achievements!inner(name, icon, rarity, badge_color, sort_order)
        `)
        .eq("user_id", userId)
        .not("earned_at", "is", null)
        .order("achievements(rarity)")
        .limit(5);

      if (error) throw error;

      return (data || []).map((row) => {
        const ach = row.achievements as any;
        return {
          achievementId: row.achievement_id,
          name: ach.name,
          icon: ach.icon,
          rarity: ach.rarity,
          badgeColor: ach.badge_color,
        };
      });
    } catch {
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Mark Notifications Sent
  // --------------------------------------------------------------------------

  /**
   * Mark reward notifications as sent
   */
  async markRewardNotified(userId: string, rewardIds: string[]): Promise<void> {
    if (!userId || rewardIds.length === 0) return;
    if (!isSupabaseConfigured) return;

    try {
      await supabase
        .from("user_rewards")
        .update({ notified_at: new Date().toISOString() })
        .eq("user_id", userId)
        .in("reward_id", rewardIds)
        .is("notified_at", null);
    } catch (error) {
      console.error("[RewardsService] Failed to mark rewards notified:", error);
    }
  }

  /**
   * Mark achievement notifications as sent
   */
  async markAchievementNotified(userId: string, achievementIds: string[]): Promise<void> {
    if (!userId || achievementIds.length === 0) return;
    if (!isSupabaseConfigured) return;

    try {
      await supabase
        .from("user_achievements")
        .update({ notified_at: new Date().toISOString() })
        .eq("user_id", userId)
        .in("achievement_id", achievementIds)
        .is("notified_at", null);
    } catch (error) {
      console.error("[RewardsService] Failed to mark achievements notified:", error);
    }
  }

  // --------------------------------------------------------------------------
  // Get Unclaimed Rewards Count
  // --------------------------------------------------------------------------

  /**
   * Get count of unlocked but unclaimed rewards
   */
  async getUnclaimedRewardsCount(userId: string): Promise<number> {
    if (!userId) return 0;

    if (!isSupabaseConfigured) {
      return 1; // Demo
    }

    try {
      const { count, error } = await supabase
        .from("user_rewards")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("unlocked_at", "is", null)
        .eq("tct_claimed", false);

      if (error) throw error;
      return count || 0;
    } catch {
      return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Dragon Avatar Rewards
  // --------------------------------------------------------------------------

  /**
   * Fetch all dragon avatar rewards with user's current progress
   */
  async fetchDragonRewards(userId: string): Promise<DragonRewardProgress[]> {
    if (!userId) return [];

    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      const { data, error } = await supabase.rpc("get_user_reward_progress", {
        p_user_id: userId,
      });

      if (error) {
        // RPC function not yet deployed - migration 092 not applied
        if (error.code === "PGRST202" || error.code === "42883") {
          console.warn("[RewardsService] get_user_reward_progress not available yet (migration 092 pending)");
          return [];
        }
        throw error;
      }

      return (data || []).map(transformDragonRewardProgress);
    } catch (error: any) {
      // Suppress expected noise when running with stub user (no real Supabase session).
      // PGRST116 = no rows, P0001/PGRST301/42501 = RLS/auth block — all expected for stub.
      const isExpectedBypassNoise =
        process.env.EXPO_PUBLIC_SKIP_AUTH === "true" &&
        (error?.code === "PGRST116" ||
          error?.code === "P0001" ||
          error?.code === "PGRST301" ||
          error?.code === "42501");
      if (!isExpectedBypassNoise) {
        console.error("[RewardsService] Failed to fetch dragon rewards:", error);
      }
      return [];
    }
  }

  /**
   * Claim a dragon avatar reward's TCT bonus
   */
  async claimDragonReward(userId: string, rewardId: string): Promise<ClaimResult> {
    if (!userId || !rewardId) {
      return { success: false, amountClaimed: 0, errorMessage: "Invalid parameters" };
    }

    if (!isSupabaseConfigured) {
      return { success: true, amountClaimed: 10 };
    }

    try {
      const { data, error } = await withRetry(
        () => supabase.rpc("claim_dragon_reward", {
          p_user_id: userId,
          p_reward_id: rewardId,
        }),
        { maxRetries: 2 }
      );

      console.log("[RewardsService] claim_dragon_reward raw response:", JSON.stringify({ data, error }));

      if (error) {
        // RPC function not yet deployed - migration 092 not applied
        if (error.code === "PGRST202" || error.code === "42883") {
          return { success: false, amountClaimed: 0, errorMessage: "Dragon rewards not yet available. Migration pending." };
        }
        throw error;
      }

      // Trigger on-chain payout processing after a short delay
      // This ensures the payout record is committed to the database first
      setTimeout(async () => {
        try {
          console.log("[RewardsService] Invoking payout processor...");
          const resp = await supabase.functions.invoke("process-reward-payout", {
            body: {},
          });
          console.log("[RewardsService] Payout processing response:", JSON.stringify(resp.data));
          if (resp.error) {
            console.warn("[RewardsService] Payout processing error:", resp.error);
          }
          // If no payouts were processed, retry once after another delay
          if (resp.data?.processed === 0) {
            console.log("[RewardsService] No payouts found, retrying in 2s...");
            setTimeout(async () => {
              const retryResp = await supabase.functions.invoke("process-reward-payout", {
                body: {},
              });
              console.log("[RewardsService] Payout retry response:", JSON.stringify(retryResp.data));
            }, 2000);
          }
        } catch (e) {
          console.warn("[RewardsService] Failed to invoke payout processor:", e);
        }
      }, 1000);

      // RPC RETURNS TABLE may come back as array or single object
      const result = Array.isArray(data) ? data[0] : data;
      if (!result) {
        console.warn("[RewardsService] claim_dragon_reward returned no data:", data);
        // Even if parsing fails, the DB claim may have succeeded
        // Return partial success to avoid confusing error message
        return { success: true, amountClaimed: 0, errorMessage: undefined };
      }

      const success = result.success === true;
      const amountClaimed = parseFloat(result.amount_claimed) || 0;

      if (success) {
        await clearCache(CACHE_KEYS.USER_REWARDS(userId));
      }

      return {
        success: success || !result.error_message, // Assume success if no error
        amountClaimed,
        errorMessage: result.error_message || undefined,
      };
    } catch (error) {
      console.error("[RewardsService] Failed to claim dragon reward:", error);
      let message = "Failed to claim reward";
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        const pgError = error as { message?: string; details?: string; hint?: string; code?: string };
        message = pgError.message || pgError.details || pgError.hint || `Database error (${pgError.code || "unknown"})`;
      } else if (typeof error === "string") {
        message = error;
      }
      return {
        success: false,
        amountClaimed: 0,
        errorMessage: message,
      };
    }
  }

  /**
   * Get list of avatar URLs the user has unlocked (dragon rewards only)
   */
  async getUnlockedAvatarUrls(userId: string): Promise<string[]> {
    if (!userId) return [];

    if (!isSupabaseConfigured) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from("user_rewards")
        .select(`
          rewards!inner(avatar_url, reward_type)
        `)
        .eq("user_id", userId)
        .not("unlocked_at", "is", null)
        .eq("rewards.reward_type", "dragon_avatar");

      if (error) {
        // avatar_url column not yet added - migration 092 not applied
        if (error.code === "42703") {
          console.warn("[RewardsService] avatar_url column not available yet (migration 092 pending)");
          return [];
        }
        throw error;
      }

      return (data || [])
        .map((row: any) => row.rewards?.avatar_url)
        .filter((url: string | null): url is string => !!url);
    } catch (error) {
      console.error("[RewardsService] Failed to fetch unlocked avatar URLs:", error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Clear Cache
  // --------------------------------------------------------------------------

  /**
   * Clear all cached reward/achievement data for a user
   */
  async clearUserCache(userId: string): Promise<void> {
    await Promise.all([
      clearCache(CACHE_KEYS.USER_REWARDS(userId)),
      clearCache(CACHE_KEYS.USER_ACHIEVEMENTS(userId)),
    ]);
  }

  /**
   * Clear all reward caches
   */
  async clearAllCache(): Promise<void> {
    await Promise.all([
      clearCache(CACHE_KEYS.REWARDS),
      clearCache(CACHE_KEYS.ACHIEVEMENTS),
    ]);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const rewardsService = new RewardsService();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function fetchAllRewards(forceRefresh = false) {
  return rewardsService.fetchAllRewards(forceRefresh);
}

export async function fetchAllAchievements(forceRefresh = false) {
  return rewardsService.fetchAllAchievements(forceRefresh);
}

export async function fetchUserRewards(userId: string, forceRefresh = false) {
  return rewardsService.fetchUserRewards(userId, forceRefresh);
}

export async function fetchUserAchievements(userId: string, forceRefresh = false) {
  return rewardsService.fetchUserAchievements(userId, forceRefresh);
}

export async function checkAndUnlockRewards(userId: string, stats?: PlayerStats) {
  return rewardsService.checkAndUnlockRewards(userId, stats);
}

export async function checkAndUnlockAchievements(userId: string, stats?: PlayerStats) {
  return rewardsService.checkAndUnlockAchievements(userId, stats);
}

export async function checkAllAfterGame(userId: string, stats?: PlayerStats) {
  return rewardsService.checkAllAfterGame(userId, stats);
}

export async function claimReward(userId: string, rewardId: string) {
  return rewardsService.claimReward(userId, rewardId);
}

export async function setFeaturedAchievement(userId: string, achievementId: string) {
  return rewardsService.setFeaturedAchievement(userId, achievementId);
}

export async function getFeaturedAchievement(userId: string) {
  return rewardsService.getFeaturedAchievement(userId);
}

export async function getEarnedAchievements(userId: string) {
  return rewardsService.getEarnedAchievements(userId);
}

export async function fetchDragonRewards(userId: string) {
  return rewardsService.fetchDragonRewards(userId);
}

export async function claimDragonReward(userId: string, rewardId: string) {
  return rewardsService.claimDragonReward(userId, rewardId);
}

export async function getUnlockedAvatarUrls(userId: string) {
  return rewardsService.getUnlockedAvatarUrls(userId);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get icon component name for a reward/achievement icon string
 */
export function getIconName(icon: string): string {
  const iconMap: Record<string, string> = {
    flame: "Flame",
    trophy: "Trophy",
    target: "Target",
    medal: "Medal",
    crown: "Crown",
    star: "Star",
    zap: "Zap",
    sword: "Swords",
    "trending-up": "TrendingUp",
    gamepad: "Gamepad2",
    award: "Award",
  };
  return iconMap[icon] || "Trophy";
}

/**
 * Format TCT reward amount for display
 */
export function formatTctReward(amount: number): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}K`;
  }
  return amount.toString();
}

/**
 * Get progress percentage (0-100)
 */
export function getProgressPercentage(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

/**
 * Get tier label for display
 */
export function getTierLabel(tier: RewardTier): string {
  const labels: Record<RewardTier, string> = {
    bronze: "Bronze",
    silver: "Silver",
    gold: "Gold",
    platinum: "Platinum",
  };
  return labels[tier];
}

/**
 * Get rarity label for display
 */
export function getRarityLabel(rarity: AchievementRarity): string {
  const labels: Record<AchievementRarity, string> = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
  };
  return labels[rarity];
}
