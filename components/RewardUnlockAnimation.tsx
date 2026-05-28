/**
 * Reward Unlock Animation Component
 *
 * Celebration modal for newly unlocked rewards and achievements featuring:
 * - Smooth scale and fade entrance animation
 * - Particle/confetti burst effect
 * - Icon glow animation
 * - TCT amount display with counter animation
 * - Auto-dismiss after delay
 * - Manual dismiss on tap
 * - Queue support for multiple unlocks
 * - Achievement sound effect on appearance
 * - Haptic feedback (success pattern)
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Trophy,
  Flame,
  Target,
  Medal,
  Crown,
  Star,
  Zap,
  Award,
  Swords,
  TrendingUp,
  Gamepad2,
  Gift,
  X,
} from "lucide-react-native";
import {
  type UnlockedReward,
  type EarnedAchievement,
  TIER_COLORS,
  RARITY_COLORS,
  type RewardTier,
  type AchievementRarity,
  formatTctReward,
  getTierLabel,
  getRarityLabel,
} from "@/lib/rewards";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Types
// ============================================================================

export interface RewardUnlockAnimationProps {
  /** Newly unlocked rewards */
  unlockedRewards: UnlockedReward[];
  /** Newly earned achievements */
  earnedAchievements: EarnedAchievement[];
  /** Callback when all animations are dismissed */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms */
  autoDismissDelay?: number;
}

interface UnlockItem {
  id: string;
  type: "reward" | "achievement";
  name: string;
  description: string;
  icon: string;
  tctReward?: number;
  tier?: RewardTier;
  rarity?: AchievementRarity;
  gradientStart: string;
  gradientEnd: string;
  badgeColor?: string;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PARTICLE_COUNT = 20;
const DEFAULT_AUTO_DISMISS_DELAY = 4000;

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
// Particle Component
// ============================================================================

interface ParticleProps {
  index: number;
  color: string;
}

function Particle({ index, color }: ParticleProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
    const distance = 100 + Math.random() * 80;
    const targetX = Math.cos(angle) * distance;
    const targetY = Math.sin(angle) * distance - 50;
    const delay = Math.random() * 200;

    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: targetX,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: targetY,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: Math.random() * 4 - 2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [index, translateX, translateY, opacity, scale, rotate]);

  const size = 6 + Math.random() * 6;
  const isCircle = Math.random() > 0.5;

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: isCircle ? size / 2 : 2,
          backgroundColor: color,
          opacity,
          transform: [
            { translateX },
            { translateY },
            { scale },
            {
              rotate: rotate.interpolate({
                inputRange: [-2, 2],
                outputRange: ["-360deg", "360deg"],
              }),
            },
          ],
        },
      ]}
    />
  );
}

// ============================================================================
// Unlock Card Component
// ============================================================================

interface UnlockCardProps {
  item: UnlockItem;
  onDismiss: () => void;
}

function UnlockCard({ item, onDismiss }: UnlockCardProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const iconScaleAnim = useRef(new Animated.Value(0)).current;
  const soundPlayedRef = useRef(false);
  const { playButtonPress, playAchievement, playHaptic } = useSoundAndHaptics();

  const Icon = getIconComponent(item.icon);
  const isReward = item.type === "reward";
  const colors = isReward && item.tier
    ? TIER_COLORS[item.tier]
    : item.rarity
    ? RARITY_COLORS[item.rarity]
    : { bg: "rgba(255, 215, 0, 0.15)", text: "#FFD700", border: "rgba(255, 215, 0, 0.3)" };

  useEffect(() => {
    // Play achievement sound and haptic on card appearance (only once)
    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      // Delay sound slightly to sync with animation
      const soundTimer = setTimeout(() => {
        playAchievement();
        playHaptic("success");
      }, 200);
      return () => clearTimeout(soundTimer);
    }
  }, [playAchievement, playHaptic]);

  useEffect(() => {
    // Entrance animation sequence
    Animated.sequence([
      // Fade in background
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // Scale up card
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Icon bounce animation
    Animated.sequence([
      Animated.delay(300),
      Animated.spring(iconScaleAnim, {
        toValue: 1,
        tension: 120,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim, opacityAnim, glowAnim, iconScaleAnim]);

  const handleDismiss = useCallback(() => {
    playButtonPress();
    // Exit animation
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [playButtonPress, scaleAnim, opacityAnim, onDismiss]);

  // Generate particle colors
  const particleColors = [
    item.gradientStart,
    item.gradientEnd,
    "#FFD700",
    "#FFFFFF",
    colors.text,
  ];

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.dismissArea}
        activeOpacity={1}
        onPress={handleDismiss}
      >
        {/* Particles */}
        <View style={styles.particlesContainer}>
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
            <Particle
              key={i}
              index={i}
              color={particleColors[i % particleColors.length]}
            />
          ))}
        </View>

        {/* Card */}
        <View style={styles.card}>
          <LinearGradient
            colors={[item.gradientStart, item.gradientEnd]}
            style={styles.cardGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Close button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <X size={20} color="rgba(255, 255, 255, 0.6)" />
            </TouchableOpacity>

            {/* Type label */}
            <Text style={styles.typeLabel}>
              {isReward ? "REWARD UNLOCKED!" : "ACHIEVEMENT EARNED!"}
            </Text>

            {/* Icon with glow */}
            <View style={styles.iconWrapper}>
              <Animated.View
                style={[
                  styles.iconGlow,
                  {
                    opacity: glowAnim,
                    backgroundColor: colors.text,
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.iconCircle,
                  {
                    transform: [{ scale: iconScaleAnim }],
                  },
                ]}
              >
                <Icon size={48} color="#FFFFFF" strokeWidth={2} />
              </Animated.View>
            </View>

            {/* Name */}
            <Text style={styles.itemName}>{item.name}</Text>

            {/* Tier/Rarity badge */}
            <View
              style={[
                styles.badgeContainer,
                { backgroundColor: colors.bg, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.badgeText, { color: colors.text }]}>
                {isReward && item.tier
                  ? getTierLabel(item.tier)
                  : item.rarity
                  ? getRarityLabel(item.rarity)
                  : ""}
              </Text>
            </View>

            {/* Description */}
            <Text style={styles.itemDescription}>{item.description}</Text>

            {/* TCT Reward (for rewards only) */}
            {isReward && item.tctReward && item.tctReward > 0 && (
              <View style={styles.tctContainer}>
                <Gift size={20} color="#FFD700" />
                <Text style={styles.tctAmount}>
                  +{formatTctReward(item.tctReward)} TCT
                </Text>
              </View>
            )}

            {/* Tap to dismiss hint */}
            <Text style={styles.dismissHint}>Tap anywhere to continue</Text>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RewardUnlockAnimation({
  unlockedRewards,
  earnedAchievements,
  onDismiss,
  autoDismissDelay = DEFAULT_AUTO_DISMISS_DELAY,
}: RewardUnlockAnimationProps) {
  // Convert rewards and achievements to unified items
  const [items, setItems] = useState<UnlockItem[]>(() => {
    const rewardItems: UnlockItem[] = unlockedRewards.map((r) => ({
      id: r.rewardId,
      type: "reward",
      name: r.rewardName,
      description: r.rewardDescription,
      icon: r.icon,
      tctReward: r.tctReward,
      tier: r.tier,
      gradientStart: r.gradientStart,
      gradientEnd: r.gradientEnd,
    }));

    const achievementItems: UnlockItem[] = earnedAchievements.map((a) => ({
      id: a.achievementId,
      type: "achievement",
      name: a.achievementName,
      description: a.achievementDescription,
      icon: a.icon,
      rarity: a.rarity,
      badgeColor: a.badgeColor,
      gradientStart: RARITY_COLORS[a.rarity].text,
      gradientEnd: RARITY_COLORS[a.rarity].border,
    }));

    return [...rewardItems, ...achievementItems];
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const autoDismissTimer = useRef<NodeJS.Timeout | null>(null);

  // Current item being displayed
  const currentItem = items[currentIndex];

  // Set up auto-dismiss timer
  useEffect(() => {
    if (currentItem) {
      autoDismissTimer.current = setTimeout(() => {
        handleDismissCurrent();
      }, autoDismissDelay);

      return () => {
        if (autoDismissTimer.current) {
          clearTimeout(autoDismissTimer.current);
        }
      };
    }
  }, [currentIndex, currentItem, autoDismissDelay]);

  // Handle dismissing current item
  const handleDismissCurrent = useCallback(() => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
    }

    if (currentIndex < items.length - 1) {
      // Show next item
      setCurrentIndex((prev) => prev + 1);
    } else {
      // All items dismissed
      onDismiss();
    }
  }, [currentIndex, items.length, onDismiss]);

  // Don't render if no items
  if (!currentItem) {
    return null;
  }

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <UnlockCard
          key={currentItem.id}
          item={currentItem}
          onDismiss={handleDismissCurrent}
        />

        {/* Progress indicator */}
        {items.length > 1 && (
          <View style={styles.progressIndicator}>
            {items.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === currentIndex && styles.progressDotActive,
                  i < currentIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  cardContainer: {
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 340,
  },
  dismissArea: {
    alignItems: "center",
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardGradient: {
    padding: 24,
    alignItems: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.8)",
    letterSpacing: 2,
    marginBottom: 16,
  },
  iconWrapper: {
    position: "relative",
    marginBottom: 16,
  },
  iconGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -20,
    left: -20,
    opacity: 0.3,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  itemName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  badgeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  itemDescription: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  tctContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  tctAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFD700",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dismissHint: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
  },

  // Particles
  particlesContainer: {
    position: "absolute",
    width: 0,
    height: 0,
    top: "50%",
    left: "50%",
    zIndex: 10,
  },
  particle: {
    position: "absolute",
  },

  // Progress indicator
  progressIndicator: {
    flexDirection: "row",
    gap: 8,
    position: "absolute",
    bottom: 60,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  progressDotActive: {
    backgroundColor: "#FFD700",
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: "rgba(255, 215, 0, 0.5)",
  },
});

export default RewardUnlockAnimation;
