/**
 * Rewards Screen
 *
 * Elite-level rewards screen featuring:
 * - Backend-synced rewards with progress tracking
 * - Achievement badges with rarity system
 * - TCT reward claiming with balance updates
 * - Progress bars for locked rewards
 * - Unlock animations with confetti
 * - Pull-to-refresh functionality
 * - Category filtering
 * - Real-time progress updates
 */

import { Stack, useRouter } from "expo-router";
import {
  ArrowLeft,
  Trophy,
  Target,
  Flame,
  TrendingUp,
  Crown,
  Medal,
  Star,
  Zap,
  Award,
  Check,
  Gift,
  RefreshCw,
  AlertCircle,
  Swords,
  Gamepad2,
} from "lucide-react-native";
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Image,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRewards } from "@/hooks/useRewards";
import type { UserReward, UserAchievement } from "@/lib/rewards";
import {
  TIER_COLORS,
  RARITY_COLORS,
  type RewardTier,
  type AchievementRarity,
  type DragonRewardProgress,
  formatTctReward,
  getProgressPercentage,
  getTierLabel,
  getRarityLabel,
} from "@/lib/rewards";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { useDragonAvatars } from "@/hooks/useDragonAvatars";
import { getDragonAvatarSource } from "@/constants/dragonAssets";
import { Lock } from "lucide-react-native";

// ============================================================================
// Types
// ============================================================================

type TabType = "rewards" | "dragons";
type FilterType = "all" | "unlocked" | "locked";

// ============================================================================
// Icon Mapping
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  flame: Flame,
  trophy: Trophy,
  target: Target,
  medal: Medal,
  crown: Crown,
  star: Star,
  zap: Zap,
  sword: Swords,
  "trending-up": TrendingUp,
  gamepad: Gamepad2,
  award: Award,
};

function getIconComponent(iconName: string): React.ComponentType<any> {
  return ICON_MAP[iconName] || Trophy;
}

// ============================================================================
// Reward Card Component
// ============================================================================

interface RewardCardProps {
  userReward: UserReward;
  onClaim: (rewardId: string) => void;
  isClaiming: boolean;
}

function RewardCard({ userReward, onClaim, isClaiming }: RewardCardProps) {
  const { reward, progress, unlockedAt, tctClaimed } = userReward;
  const isUnlocked = unlockedAt !== null;
  const isClaimable = isUnlocked && !tctClaimed && reward.tctReward > 0;
  const progressPercentage = getProgressPercentage(progress, reward.criteriaValue);
  const Icon = getIconComponent(reward.icon);
  const tierColors = TIER_COLORS[reward.tier];

  return (
    <View style={styles.rewardCard}>
      <LinearGradient
        colors={
          isUnlocked
            ? [reward.gradientStart, reward.gradientEnd]
            : ["#2A2A3E", "#1E1E2E"]
        }
        style={styles.rewardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Header */}
        <View style={styles.rewardHeader}>
          <View
            style={[
              styles.iconContainer,
              !isUnlocked && styles.iconContainerLocked,
            ]}
          >
            <Icon
              size={28}
              color={isUnlocked ? "#FFFFFF" : "#606060"}
              strokeWidth={2.5}
            />
          </View>
          <View style={styles.rewardInfo}>
            <View style={styles.rewardTitleRow}>
              <Text
                style={[
                  styles.rewardTitle,
                  !isUnlocked && styles.rewardTitleLocked,
                ]}
              >
                {reward.name}
              </Text>
              <View
                style={[
                  styles.tierBadge,
                  { backgroundColor: tierColors.bg, borderColor: tierColors.border },
                ]}
              >
                <Text style={[styles.tierText, { color: tierColors.text }]}>
                  {getTierLabel(reward.tier)}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.rewardDescription,
                !isUnlocked && styles.rewardDescriptionLocked,
              ]}
            >
              {reward.description}
            </Text>
          </View>
        </View>

        {/* TCT Reward Badge */}
        {reward.tctReward > 0 && (
          <View
            style={[
              styles.tctBadge,
              isUnlocked && tctClaimed && styles.tctBadgeClaimed,
            ]}
          >
            <Gift
              size={14}
              color={isUnlocked && !tctClaimed ? "#FFD700" : "#606060"}
            />
            <Text
              style={[
                styles.tctAmount,
                isUnlocked && !tctClaimed && styles.tctAmountActive,
                tctClaimed && styles.tctAmountClaimed,
              ]}
            >
              {formatTctReward(reward.tctReward)} TCT
            </Text>
            {tctClaimed && (
              <Check size={12} color="#4CAF50" style={{ marginLeft: 4 }} />
            )}
          </View>
        )}

        {/* Progress or Claim Button */}
        {isUnlocked ? (
          isClaimable ? (
            <TouchableOpacity
              style={styles.claimButton}
              onPress={() => onClaim(reward.id)}
              disabled={isClaiming}
            >
              {isClaiming ? (
                <ActivityIndicator size="small" color="#0F0F1E" />
              ) : (
                <>
                  <Gift size={16} color="#0F0F1E" />
                  <Text style={styles.claimButtonText}>Claim Reward</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.unlockedBadge}>
              <Check size={16} color="#4CAF50" />
              <Text style={styles.unlockedText}>
                {tctClaimed ? "Claimed" : "Unlocked"}
              </Text>
            </View>
          )
        ) : (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progressPercentage}%` }]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.toLocaleString()} / {reward.criteriaValue.toLocaleString()}
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Achievement Card Component
// ============================================================================

interface AchievementCardProps {
  userAchievement: UserAchievement;
  onSetFeatured?: (achievementId: string) => void;
}

function AchievementCard({ userAchievement, onSetFeatured }: AchievementCardProps) {
  const { achievement, progress, earnedAt, featured } = userAchievement;
  const isEarned = earnedAt !== null;
  const progressPercentage = getProgressPercentage(progress, achievement.criteriaValue);
  const Icon = getIconComponent(achievement.icon);
  const rarityColors = RARITY_COLORS[achievement.rarity];

  return (
    <TouchableOpacity
      style={[
        styles.achievementCard,
        featured && styles.achievementCardFeatured,
      ]}
      onPress={() => isEarned && onSetFeatured?.(achievement.id)}
      disabled={!isEarned}
      activeOpacity={isEarned ? 0.7 : 1}
    >
      {/* Rarity glow for legendary */}
      {achievement.rarity === "legendary" && isEarned && (
        <View style={[styles.legendaryGlow, { shadowColor: rarityColors.glow }]} />
      )}

      <View
        style={[
          styles.achievementIconContainer,
          { backgroundColor: isEarned ? rarityColors.bg : "rgba(96, 96, 96, 0.1)" },
          { borderColor: isEarned ? rarityColors.border : "rgba(96, 96, 96, 0.2)" },
        ]}
      >
        <Icon
          size={24}
          color={isEarned ? rarityColors.text : "#606060"}
          strokeWidth={2}
        />
      </View>

      <View style={styles.achievementInfo}>
        <View style={styles.achievementTitleRow}>
          <Text
            style={[
              styles.achievementName,
              !isEarned && styles.achievementNameLocked,
            ]}
            numberOfLines={1}
          >
            {achievement.name}
          </Text>
          {featured && (
            <View style={styles.featuredBadge}>
              <Star size={10} color="#FFD700" fill="#FFD700" />
            </View>
          )}
        </View>
        <View
          style={[
            styles.rarityBadge,
            { backgroundColor: rarityColors.bg, borderColor: rarityColors.border },
          ]}
        >
          <Text style={[styles.rarityText, { color: rarityColors.text }]}>
            {getRarityLabel(achievement.rarity)}
          </Text>
        </View>
      </View>

      {/* Progress indicator */}
      {!isEarned && (
        <View style={styles.achievementProgress}>
          <Text style={styles.achievementProgressText}>
            {progress}/{achievement.criteriaValue}
          </Text>
        </View>
      )}
      {isEarned && (
        <Check size={20} color="#4CAF50" style={styles.achievementCheck} />
      )}
    </TouchableOpacity>
  );
}

// ============================================================================
// Dragon Reward Card Component
// ============================================================================

interface DragonRewardCardProps {
  reward: DragonRewardProgress;
  onClaim: (rewardId: string) => void;
  isClaiming: boolean;
}

function DragonRewardCard({ reward, onClaim, isClaiming }: DragonRewardCardProps) {
  const isUnlocked = reward.isUnlocked;
  const isClaimable = isUnlocked && !reward.tctClaimed && reward.tctReward > 0;
  const progressPercentage = getProgressPercentage(reward.currentProgress, reward.criteriaValue);
  const tierColors = TIER_COLORS[reward.tier];
  const hasThumbnail = !!reward.avatarUrl;

  return (
    <View style={styles.dragonCard}>
      <View style={styles.dragonCardInner}>
        {/* Thumbnail */}
        {hasThumbnail ? (
          <View style={[styles.dragonThumbnailContainer, !isUnlocked && styles.dragonThumbnailLocked]}>
            <Image
              source={getDragonAvatarSource(reward.avatarUrl)}
              style={[styles.dragonThumbnail, !isUnlocked && { opacity: 0.4 }]}
            />
            {!isUnlocked && (
              <View style={styles.dragonLockOverlay}>
                <Lock size={16} color="#FFD700" />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.dragonThumbnailContainer, styles.dragonBonusIcon]}>
            <Gift size={24} color={isUnlocked ? "#FFD700" : "#606060"} />
          </View>
        )}

        {/* Info */}
        <View style={styles.dragonInfo}>
          <View style={styles.dragonTitleRow}>
            <Text style={[styles.dragonName, !isUnlocked && { color: "#808080" }]} numberOfLines={1}>
              {reward.rewardName}
            </Text>
            <View style={[styles.tierBadge, { backgroundColor: tierColors.bg, borderColor: tierColors.border }]}>
              <Text style={[styles.tierText, { color: tierColors.text }]}>
                {getTierLabel(reward.tier)}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          {!isUnlocked && (
            <View style={styles.dragonProgressContainer}>
              <View style={styles.dragonProgressBar}>
                <View style={[styles.dragonProgressFill, { width: `${progressPercentage}%` }]} />
              </View>
              <Text style={styles.dragonProgressText}>
                {reward.currentProgress.toLocaleString()} / {reward.criteriaValue.toLocaleString()}
              </Text>
            </View>
          )}

          {/* TCT + claim */}
          {reward.tctReward > 0 && (
            <View style={styles.dragonTctRow}>
              {isClaimable ? (
                <TouchableOpacity
                  style={styles.dragonClaimButton}
                  onPress={() => onClaim(reward.rewardId)}
                  disabled={isClaiming}
                >
                  {isClaiming ? (
                    <ActivityIndicator size="small" color="#0F0F1E" />
                  ) : (
                    <>
                      <Gift size={12} color="#0F0F1E" />
                      <Text style={styles.dragonClaimText}>Claim {formatTctReward(reward.tctReward)} TCT</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : isUnlocked && reward.tctClaimed ? (
                <View style={styles.dragonClaimedBadge}>
                  <Check size={12} color="#4CAF50" />
                  <Text style={styles.dragonClaimedText}>{formatTctReward(reward.tctReward)} TCT Claimed</Text>
                </View>
              ) : (
                <Text style={styles.dragonTctPending}>{formatTctReward(reward.tctReward)} TCT</Text>
              )}
            </View>
          )}

          {isUnlocked && reward.tctReward === 0 && (
            <View style={styles.dragonClaimedBadge}>
              <Check size={12} color="#4CAF50" />
              <Text style={styles.dragonClaimedText}>Unlocked</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================================================
// Filter Tabs Component
// ============================================================================

interface FilterTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  rewardCount: number;
  dragonCount: number;
  unlockedRewardCount: number;
  unlockedDragonCount: number;
}

function FilterTabs({
  activeTab,
  onTabChange,
  activeFilter,
  onFilterChange,
  rewardCount,
  dragonCount,
  unlockedRewardCount,
  unlockedDragonCount,
}: FilterTabsProps) {
  return (
    <View style={styles.filterContainer}>
      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "dragons" && styles.tabActive]}
          onPress={() => onTabChange("dragons")}
        >
          <Flame size={16} color={activeTab === "dragons" ? "#0F0F1E" : "#A0A0A0"} />
          <Text
            style={[
              styles.tabText,
              activeTab === "dragons" && styles.tabTextActive,
            ]}
          >
            Dragons
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {unlockedDragonCount}/{dragonCount}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "rewards" && styles.tabActive]}
          onPress={() => onTabChange("rewards")}
        >
          <Trophy size={16} color={activeTab === "rewards" ? "#0F0F1E" : "#A0A0A0"} />
          <Text
            style={[
              styles.tabText,
              activeTab === "rewards" && styles.tabTextActive,
            ]}
          >
            Rewards
          </Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {unlockedRewardCount}/{rewardCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Filter Pills */}
      <View style={styles.filterPills}>
        {(["all", "unlocked", "locked"] as FilterType[]).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterPill,
              activeFilter === filter && styles.filterPillActive,
            ]}
            onPress={() => onFilterChange(filter)}
          >
            <Text
              style={[
                styles.filterPillText,
                activeFilter === filter && styles.filterPillTextActive,
              ]}
            >
              {filter === "all"
                ? "All"
                : filter === "unlocked"
                ? "Unlocked"
                : "Locked"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// Main Screen Component
// ============================================================================

export default function RewardsScreen() {
  const router = useRouter();
  const { playButtonPress } = useSoundAndHaptics();

  const {
    rewards,
    achievements,
    isLoading,
    isRefreshing,
    error,
    refresh,
    forceRefresh,
    claimReward,
    unlockedRewards,
    lockedRewards,
    earnedAchievements,
    unearnedAchievements,
  } = useRewards();

  const {
    dragonRewards,
    groupedDragonRewards,
    bonusRewards,
    isLoading: isDragonLoading,
    refresh: refreshDragons,
    claimReward: claimDragonReward,
  } = useDragonAvatars();

  // Standard rewards from the RPC (filter dragonRewards for reward_type = 'standard')
  const standardRewards = useMemo(() => {
    return dragonRewards.filter((r) => r.rewardType === "standard");
  }, [dragonRewards]);

  const [activeTab, setActiveTab] = useState<TabType>("dragons");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);

  // Filter data based on active filter (using RPC-based standard rewards)
  const filteredStandardRewards = useMemo(() => {
    return standardRewards.filter((r) => {
      if (activeFilter === "unlocked") return r.isUnlocked;
      if (activeFilter === "locked") return !r.isUnlocked;
      return true;
    });
  }, [activeFilter, standardRewards]);

  // Keep old filtered rewards for backwards compatibility (unused now)
  const filteredRewards = useMemo(() => {
    switch (activeFilter) {
      case "unlocked":
        return unlockedRewards;
      case "locked":
        return lockedRewards;
      default:
        return rewards;
    }
  }, [activeFilter, rewards, unlockedRewards, lockedRewards]);

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: TabType) => {
      playButtonPress();
      setActiveTab(tab);
    },
    [playButtonPress]
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (filter: FilterType) => {
      playButtonPress();
      setActiveFilter(filter);
    },
    [playButtonPress]
  );

  // Handle claim reward
  const handleClaimReward = useCallback(
    async (rewardId: string) => {
      setClaimingRewardId(rewardId);
      playButtonPress();

      try {
        const result = await claimReward(rewardId);
        if (result.success) {
          Alert.alert("Reward Claimed!", `You received ${result.amountClaimed} TCT`);
        } else {
          console.error("Failed to claim:", result.errorMessage);
          Alert.alert("Claim Failed", result.errorMessage || "Unable to claim reward. Please try again.");
        }
      } finally {
        setClaimingRewardId(null);
      }
    },
    [claimReward, playButtonPress]
  );

  // Handle claim dragon reward
  const handleClaimDragonReward = useCallback(
    async (rewardId: string) => {
      setClaimingRewardId(rewardId);
      playButtonPress();

      try {
        const result = await claimDragonReward(rewardId);
        if (result.success) {
          const usdcAmount = (result.amountClaimed / 25).toFixed(2);
          Alert.alert(
            "Dragon Reward Claimed!",
            `You received ${result.amountClaimed} TCT.\n\n${parseFloat(usdcAmount) >= 0.01 ? `${usdcAmount} USDC payout queued to your wallet on-chain.` : ""}`,
          );
        } else {
          console.error("Failed to claim dragon reward:", result.errorMessage);
          Alert.alert("Claim Failed", result.errorMessage || "Unable to claim dragon reward. Please try again.");
        }
      } finally {
        setClaimingRewardId(null);
      }
    },
    [claimDragonReward, playButtonPress]
  );

  // Handle combined refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshDragons()]);
  }, [refresh, refreshDragons]);

  const handleForceRefresh = useCallback(async () => {
    await Promise.all([forceRefresh(), refreshDragons()]);
  }, [forceRefresh, refreshDragons]);

  // Dragon reward counts
  const allDragonAvatarRewards = useMemo(
    () => dragonRewards.filter((r) => r.rewardType === "dragon_avatar"),
    [dragonRewards]
  );
  const unlockedDragonCount = useMemo(
    () => allDragonAvatarRewards.filter((r) => r.isUnlocked).length,
    [allDragonAvatarRewards]
  );

  // Filter dragon rewards
  const filteredDragonGroups = useMemo(() => {
    return groupedDragonRewards.map((group) => ({
      ...group,
      rewards: group.rewards.filter((r) => {
        if (activeFilter === "unlocked") return r.isUnlocked;
        if (activeFilter === "locked") return !r.isUnlocked;
        return true;
      }),
    }));
  }, [groupedDragonRewards, activeFilter]);

  const filteredBonusRewards = useMemo(() => {
    return bonusRewards.filter((r) => {
      if (activeFilter === "unlocked") return r.isUnlocked;
      if (activeFilter === "locked") return !r.isUnlocked;
      return true;
    });
  }, [bonusRewards, activeFilter]);

  // Calculate unclaimed TCT total (all rewards from RPC)
  const unclaimedTctTotal = useMemo(() => {
    // All rewards (standard, dragon_avatar, tct_bonus) are in dragonRewards from the RPC
    return dragonRewards
      .filter((r) => r.isUnlocked && !r.tctClaimed && r.tctReward > 0)
      .reduce((sum, r) => sum + r.tctReward, 0);
  }, [dragonRewards]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Rewards</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleForceRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#FFD700" />
              ) : (
                <RefreshCw size={20} color="#FFD700" />
              )}
            </TouchableOpacity>
          </View>

          {/* Unclaimed TCT Banner */}
          {unclaimedTctTotal > 0 && (
            <View style={styles.unclaimedBanner}>
              <Gift size={20} color="#FFD700" />
              <Text style={styles.unclaimedText}>
                {formatTctReward(unclaimedTctTotal)} TCT available to claim!
              </Text>
            </View>
          )}

          {/* Filter Tabs */}
          <FilterTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            rewardCount={standardRewards.length}
            dragonCount={allDragonAvatarRewards.length}
            unlockedRewardCount={standardRewards.filter((r) => r.isUnlocked).length}
            unlockedDragonCount={unlockedDragonCount}
          />

          {/* Content */}
          {(isLoading || isDragonLoading) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
              <Text style={styles.loadingText}>Loading rewards...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <AlertCircle size={48} color="#F87171" />
              <Text style={styles.errorTitle}>Failed to load rewards</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleForceRefresh}>
                <RefreshCw size={16} color="#0F0F1E" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor="#FFD700"
                  colors={["#FFD700"]}
                />
              }
            >
              {activeTab === "dragons" ? (
                <>
                  {/* Dragon Avatar Categories */}
                  {filteredDragonGroups.map((group) => (
                    group.rewards.length > 0 && (
                      <View key={group.key} style={styles.dragonCategorySection}>
                        <Text style={styles.dragonCategoryTitle}>{group.label}</Text>
                        <View style={styles.dragonCategoryList}>
                          {group.rewards.map((reward) => (
                            <DragonRewardCard
                              key={reward.rewardId}
                              reward={reward}
                              onClaim={handleClaimDragonReward}
                              isClaiming={claimingRewardId === reward.rewardId}
                            />
                          ))}
                        </View>
                      </View>
                    )
                  ))}

                  {/* Empty state for dragons */}
                  {filteredDragonGroups.every((g) => g.rewards.length === 0) && (
                    <View style={styles.emptyContainer}>
                      <Flame size={48} color="#606060" />
                      <Text style={styles.emptyTitle}>No dragon rewards found</Text>
                      <Text style={styles.emptyMessage}>
                        {activeFilter === "unlocked"
                          ? "Play more games to unlock dragon avatars!"
                          : activeFilter === "locked"
                          ? "You've unlocked all dragon avatars!"
                          : "No dragon rewards available at this time."}
                      </Text>
                    </View>
                  )}
                </>
              ) : activeTab === "rewards" ? (
                filteredStandardRewards.length > 0 || filteredBonusRewards.length > 0 ? (
                  <View style={styles.rewardsContainer}>
                    {/* Standard Rewards (from RPC) */}
                    {filteredStandardRewards.map((reward) => (
                      <DragonRewardCard
                        key={reward.rewardId}
                        reward={reward}
                        onClaim={handleClaimDragonReward}
                        isClaiming={claimingRewardId === reward.rewardId}
                      />
                    ))}

                    {/* Milestone Bonuses */}
                    {filteredBonusRewards.length > 0 && (
                      <View style={styles.milestoneBonusSection}>
                        <Text style={styles.milestoneBonusTitle}>Milestone Bonuses</Text>
                        <View style={styles.milestoneBonusList}>
                          {filteredBonusRewards.map((reward) => (
                            <DragonRewardCard
                              key={reward.rewardId}
                              reward={reward}
                              onClaim={handleClaimDragonReward}
                              isClaiming={claimingRewardId === reward.rewardId}
                            />
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Trophy size={48} color="#606060" />
                    <Text style={styles.emptyTitle}>No rewards found</Text>
                    <Text style={styles.emptyMessage}>
                      {activeFilter === "unlocked"
                        ? "Play more games to unlock rewards!"
                        : activeFilter === "locked"
                        ? "You've unlocked all available rewards!"
                        : "No standard rewards available at this time."}
                    </Text>
                  </View>
                )
              ) : null}

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>How Dragon Rewards Work</Text>
                <Text style={styles.infoText}>
                  {"\u2022"} Play games to unlock baby dragon avatars{"\n"}
                  {"\u2022"} Win games to unlock teenage dragon avatars{"\n"}
                  {"\u2022"} Complete challenges for adult dragon avatars{"\n"}
                  {"\u2022"} Play and win tournaments for fierce dragons{"\n"}
                  {"\u2022"} Claim TCT bonuses when you hit milestones{"\n"}
                  {"\u2022"} Use unlocked dragons as your profile picture
                </Text>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Unclaimed Banner
  unclaimedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  unclaimedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },

  // Filter Tabs
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tabSelector: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#FFD700",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  tabTextActive: {
    color: "#0F0F1E",
  },
  countBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterPillActive: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4ECDC4",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  filterPillTextActive: {
    color: "#4ECDC4",
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  // Rewards Container
  rewardsContainer: {
    gap: 16,
  },

  // Reward Card
  rewardCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  rewardGradient: {
    padding: 16,
  },
  rewardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainerLocked: {
    backgroundColor: "rgba(96, 96, 96, 0.2)",
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
  },
  rewardTitleLocked: {
    color: "#808080",
  },
  rewardDescription: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    lineHeight: 18,
  },
  rewardDescriptionLocked: {
    color: "#606060",
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // TCT Badge
  tctBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    marginBottom: 12,
  },
  tctBadgeClaimed: {
    backgroundColor: "rgba(76, 175, 80, 0.1)",
  },
  tctAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#606060",
  },
  tctAmountActive: {
    color: "#FFD700",
  },
  tctAmountClaimed: {
    color: "#4CAF50",
    textDecorationLine: "line-through",
  },

  // Progress Container
  progressContainer: {
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4ECDC4",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: "#A0A0A0",
    fontWeight: "600",
    textAlign: "right",
  },

  // Claim Button
  claimButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    borderRadius: 10,
  },
  claimButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },

  // Unlocked Badge
  unlockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  unlockedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF50",
  },

  // Achievements Container
  achievementsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  // Achievement Card
  achievementCard: {
    width: "47%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    position: "relative",
  },
  achievementCardFeatured: {
    borderColor: "rgba(255, 215, 0, 0.3)",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  legendaryGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  achievementIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 2,
  },
  achievementInfo: {
    alignItems: "center",
    gap: 4,
  },
  achievementTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  achievementName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  achievementNameLocked: {
    color: "#808080",
  },
  featuredBadge: {
    padding: 2,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  achievementProgress: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  achievementProgressText: {
    fontSize: 10,
    color: "#606060",
    fontWeight: "600",
  },
  achievementCheck: {
    position: "absolute",
    top: 8,
    right: 8,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#A0A0A0",
  },

  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },

  // Empty State
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  emptyMessage: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },

  // Info Box
  infoBox: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#A0A0A0",
    lineHeight: 20,
  },

  // Dragon Category Section
  dragonCategorySection: {
    marginBottom: 24,
  },
  dragonCategoryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFD700",
    marginBottom: 12,
  },
  dragonCategoryList: {
    gap: 10,
  },

  // Milestone Bonus Section (in Rewards tab)
  milestoneBonusSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  milestoneBonusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFD700",
    marginBottom: 12,
  },
  milestoneBonusList: {
    gap: 10,
  },

  // Dragon Reward Card
  dragonCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  dragonCardInner: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  dragonThumbnailContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255, 215, 0, 0.3)",
    position: "relative",
  },
  dragonThumbnailLocked: {
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  dragonThumbnail: {
    width: "100%",
    height: "100%",
  },
  dragonLockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  dragonBonusIcon: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  dragonInfo: {
    flex: 1,
    gap: 4,
  },
  dragonTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dragonName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
  },
  dragonProgressContainer: {
    gap: 3,
  },
  dragonProgressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  dragonProgressFill: {
    height: "100%",
    backgroundColor: "#4ECDC4",
    borderRadius: 2,
  },
  dragonProgressText: {
    fontSize: 10,
    color: "#A0A0A0",
    fontWeight: "600",
    textAlign: "right",
  },
  dragonTctRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  dragonClaimButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFD700",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  dragonClaimText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  dragonClaimedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dragonClaimedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF50",
  },
  dragonTctPending: {
    fontSize: 11,
    fontWeight: "600",
    color: "#606060",
  },
});
