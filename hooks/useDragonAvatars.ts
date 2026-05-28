/**
 * Dragon Avatars Hook
 *
 * Custom hook for fetching unlocked dragon avatars and dragon reward progress.
 * Used by both settings (avatar picker) and rewards page.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  rewardsService,
  type DragonRewardProgress,
  type DragonCategory,
  type ClaimResult,
} from "@/lib/rewards";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ============================================================================
// Dragon category ranges (matching DRAGON_AVATARS indices in settings.tsx)
// ============================================================================

const DRAGON_CATEGORIES: {
  key: DragonCategory;
  label: string;
  sortStart: number;
  sortEnd: number;
}[] = [
  { key: "baby", label: "Baby Dragons", sortStart: 100, sortEnd: 108 },
  { key: "teenage", label: "Teenage Dragons", sortStart: 200, sortEnd: 208 },
  { key: "adult", label: "Adult Dragons", sortStart: 300, sortEnd: 308 },
  { key: "fierce", label: "Fierce Dragons", sortStart: 400, sortEnd: 407 },
];

// ============================================================================
// Types
// ============================================================================

export interface UseDragonAvatarsReturn {
  /** List of avatar URLs the user has unlocked */
  unlockedAvatars: string[];
  /** All dragon rewards with progress */
  dragonRewards: DragonRewardProgress[];
  /** Dragon rewards grouped by category */
  groupedDragonRewards: {
    key: DragonCategory;
    label: string;
    rewards: DragonRewardProgress[];
  }[];
  /** TCT-only bonus rewards */
  bonusRewards: DragonRewardProgress[];
  /** Loading state */
  isLoading: boolean;
  /** Refresh data */
  refresh: () => Promise<void>;
  /** Claim a dragon reward */
  claimReward: (rewardId: string) => Promise<ClaimResult>;
  /** Check if a specific avatar URL is unlocked */
  isAvatarUnlocked: (avatarUrl: string) => boolean;
  /** Get the unlock hint for a locked dragon by avatar URL */
  getUnlockHint: (avatarUrl: string) => string | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useDragonAvatars(): UseDragonAvatarsReturn {
  const { user } = useAuth();
  const userId = user?.id;

  const [unlockedAvatars, setUnlockedAvatars] = useState<string[]>([]);
  const [dragonRewards, setDragonRewards] = useState<DragonRewardProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!userId || !isSupabaseConfigured) {
      setUnlockedAvatars([]);
      setDragonRewards([]);
      setIsLoading(false);
      return;
    }

    try {
      const [avatars, rewards] = await Promise.all([
        rewardsService.getUnlockedAvatarUrls(userId),
        rewardsService.fetchDragonRewards(userId),
      ]);

      console.log("[useDragonAvatars] Fetched data:", {
        avatarsCount: avatars.length,
        rewardsCount: rewards.length,
        unlockedDragons: rewards.filter(r => r.isUnlocked && r.rewardType === "dragon_avatar").length,
        avatarUrls: avatars.slice(0, 3),
      });

      if (isMountedRef.current) {
        setUnlockedAvatars(avatars);
        setDragonRewards(rewards);
      }
    } catch (error) {
      console.error("[useDragonAvatars] Failed to fetch:", error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchData();
  }, [fetchData]);

  const claimReward = useCallback(
    async (rewardId: string): Promise<ClaimResult> => {
      if (!userId) {
        return { success: false, amountClaimed: 0, errorMessage: "Not logged in" };
      }

      const result = await rewardsService.claimDragonReward(userId, rewardId);

      if (result.success) {
        // Update local state optimistically
        setDragonRewards((prev) =>
          prev.map((r) =>
            r.rewardId === rewardId ? { ...r, tctClaimed: true } : r
          )
        );

        // Check if on-chain payout was queued
        if (isSupabaseConfigured && result.amountClaimed > 0) {
          try {
            const { data: payoutData } = await (supabase
              .from("reward_payouts" as any)
              .select("id, amount_usdc, status")
              .eq("user_id", userId)
              .eq("reward_id", rewardId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle() as any);

            if (payoutData) {
              const payout = payoutData as { id: string; amount_usdc: number; status: string };
              console.log(
                `[useDragonAvatars] On-chain payout queued: ${payout.amount_usdc} USDC (status: ${payout.status})`
              );

              // Trigger the edge function to process the payout on-chain
              supabase.functions
                .invoke("process-reward-payout", {
                  body: { payout_id: payout.id },
                })
                .then(({ data: fnData, error: fnError }) => {
                  if (fnError) {
                    console.warn("[useDragonAvatars] Edge function error:", fnError);
                  } else {
                    console.log("[useDragonAvatars] Payout processed:", fnData);
                  }
                })
                .catch((e) => {
                  console.warn("[useDragonAvatars] Failed to invoke payout function:", e);
                });
            }
          } catch (e) {
            // Non-critical: payout tracking is best-effort
            console.warn("[useDragonAvatars] Could not check payout status:", e);
          }
        }
      }

      return result;
    },
    [userId]
  );

  // Group dragon avatar rewards by category
  const groupedDragonRewards = useMemo(() => {
    return DRAGON_CATEGORIES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      rewards: dragonRewards.filter(
        (r) => r.rewardType === "dragon_avatar" && r.avatarUrl
      ).filter((r) => {
        // Match by sort order range (determined by the DB sort_order)
        const reward = dragonRewards.find((dr) => dr.rewardId === r.rewardId);
        if (!reward) return false;
        // Use criteria type to categorize
        switch (cat.key) {
          case "baby":
            return r.criteriaType === "games_played";
          case "teenage":
            return r.criteriaType === "total_wins";
          case "adult":
            return r.criteriaType === "challenges_completed";
          case "fierce":
            return r.criteriaType === "tournaments_played" || r.criteriaType === "tournament_wins";
          default:
            return false;
        }
      }),
    }));
  }, [dragonRewards]);

  // TCT-only bonus rewards
  const bonusRewards = useMemo(() => {
    return dragonRewards.filter((r) => r.rewardType === "tct_bonus");
  }, [dragonRewards]);

  const isAvatarUnlocked = useCallback(
    (avatarUrl: string): boolean => {
      // Check unlockedAvatars array first
      if (unlockedAvatars.includes(avatarUrl)) {
        return true;
      }
      // Fallback: check dragonRewards for this avatar URL
      const reward = dragonRewards.find(
        (r) => r.avatarUrl === avatarUrl && r.rewardType === "dragon_avatar"
      );
      return reward?.isUnlocked ?? false;
    },
    [unlockedAvatars, dragonRewards]
  );

  const getUnlockHint = useCallback(
    (avatarUrl: string): string | null => {
      const reward = dragonRewards.find(
        (r) => r.avatarUrl === avatarUrl && r.rewardType === "dragon_avatar"
      );
      if (!reward || reward.isUnlocked) return null;

      const remaining = reward.criteriaValue - reward.currentProgress;
      switch (reward.criteriaType) {
        case "games_played":
          return `Play ${remaining} more game${remaining !== 1 ? "s" : ""} to unlock`;
        case "total_wins":
          return `Win ${remaining} more game${remaining !== 1 ? "s" : ""} to unlock`;
        case "challenges_completed":
          return `Complete ${remaining} more challenge${remaining !== 1 ? "s" : ""} to unlock`;
        case "tournaments_played":
          return `Play ${remaining} more tournament${remaining !== 1 ? "s" : ""} to unlock`;
        case "tournament_wins":
          return `Win ${remaining} more tournament${remaining !== 1 ? "s" : ""} to unlock`;
        default:
          return null;
      }
    },
    [dragonRewards]
  );

  return {
    unlockedAvatars,
    dragonRewards,
    groupedDragonRewards,
    bonusRewards,
    isLoading,
    refresh,
    claimReward,
    isAvatarUnlocked,
    getUnlockHint,
  };
}
