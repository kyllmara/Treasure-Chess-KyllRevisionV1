/**
 * ChallengeCard Component
 *
 * Displays a challenge with creator info, game settings, and action buttons.
 * Used in:
 * - Challenge board (join button)
 * - My challenges list (cancel button)
 * - Challenge waiting room (status display)
 */

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Clock,
  Coins,
  User,
  Crown,
  Zap,
  Globe,
  Lock,
  X,
  Play,
  Trophy,
} from "lucide-react-native";
import { Challenge } from "@/lib/challenges";
import { getAvatarConfig } from "@/constants/avatars";

// Type for challenge player data
interface ChallengePlayer {
  id: string;
  username: string;
  avatar_index: number;
  elo_rating: number;
}

// ============================================================================
// Types
// ============================================================================

export interface ChallengeCardProps {
  challenge: Challenge;
  variant?: "default" | "compact" | "waiting";
  showCreator?: boolean;
  showActions?: boolean;
  isCreator?: boolean;
  onJoin?: () => void;
  onCancel?: () => void;
  onView?: () => void;
  isJoining?: boolean;
  isCancelling?: boolean;
}

// ============================================================================
// Time Control Formatting
// ============================================================================

function formatTimeControlDisplay(seconds: number, increment: number): string {
  const minutes = Math.floor(seconds / 60);

  if (increment > 0) {
    return `${minutes}+${increment}`;
  }

  return `${minutes} min`;
}

function getTimeControlCategory(
  seconds: number
): "bullet" | "blitz" | "rapid" | "classical" {
  const minutes = seconds / 60;

  if (minutes < 3) return "bullet";
  if (minutes < 10) return "blitz";
  if (minutes < 30) return "rapid";
  return "classical";
}

function getTimeControlGradient(category: string): [string, string] {
  switch (category) {
    case "bullet":
      return ["#E05C5C", "#E88080"];
    case "blitz":
      return ["#FFB347", "#FFCC80"];
    case "rapid":
      return ["#4CAF82", "#7EDDD6"];
    case "classical":
      return ["#6C5CE7", "#A29BFE"];
    default:
      return ["#667eea", "#764ba2"];
  }
}

function getTimeControlIcon(category: string) {
  switch (category) {
    case "bullet":
      return Zap;
    case "blitz":
      return Zap;
    default:
      return Clock;
  }
}

// ============================================================================
// Component Implementation
// ============================================================================

export function ChallengeCard({
  challenge,
  variant = "default",
  showCreator = true,
  showActions = true,
  isCreator = false,
  onJoin,
  onCancel,
  onView,
  isJoining = false,
  isCancelling = false,
}: ChallengeCardProps) {
  // Computed values
  const timeCategory = useMemo(
    () => getTimeControlCategory(challenge.time_control_seconds),
    [challenge.time_control_seconds]
  );

  const timeControlDisplay = useMemo(
    () =>
      formatTimeControlDisplay(
        challenge.time_control_seconds,
        challenge.increment_seconds
      ),
    [challenge.time_control_seconds, challenge.increment_seconds]
  );

  const gradient = useMemo(() => getTimeControlGradient(timeCategory), [timeCategory]);
  const TimeIcon = useMemo(() => getTimeControlIcon(timeCategory), [timeCategory]);

  const creator = challenge.creator as ChallengePlayer | undefined;
  const creatorAvatar = creator?.avatar_index !== undefined
    ? getAvatarConfig(creator.avatar_index)
    : null;

  const hasWager = challenge.wager_tct > 0;

  // Compact variant for lists
  if (variant === "compact") {
    return (
      <TouchableOpacity
        style={styles.compactContainer}
        onPress={onView}
        activeOpacity={0.7}
      >
        <View style={styles.compactLeft}>
          {/* Time Control Badge */}
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.timeBadgeCompact}
          >
            <TimeIcon size={12} color="#FFF" />
            <Text style={styles.timeBadgeTextCompact}>{timeControlDisplay}</Text>
          </LinearGradient>

          {/* Creator Info */}
          {showCreator && creator && (
            <View style={styles.creatorCompact}>
              <Text style={styles.creatorNameCompact}>{creator.username}</Text>
              <View style={styles.ratingBadgeCompact}>
                <Trophy size={10} color="#FFD700" />
                <Text style={styles.ratingTextCompact}>{creator.elo_rating}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.compactRight}>
          {/* Wager */}
          {hasWager && (
            <View style={styles.wagerBadgeCompact}>
              <Coins size={12} color="#FFD700" />
              <Text style={styles.wagerTextCompact}>{challenge.wager_tct}</Text>
            </View>
          )}

          {/* Status Icon */}
          {challenge.is_public ? (
            <Globe size={14} color="#4CAF82" />
          ) : (
            <Lock size={14} color="#A0A0A0" />
          )}

          {/* Action */}
          {showActions && onJoin && !isCreator && (
            <TouchableOpacity
              style={[styles.joinBtnCompact, isJoining && styles.btnDisabled]}
              onPress={onJoin}
              disabled={isJoining}
            >
              <Play size={14} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // Waiting variant for challenge waiting room
  if (variant === "waiting") {
    return (
      <View style={styles.waitingContainer}>
        <LinearGradient
          colors={["#1a1a2e", "#16213e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.waitingGradient}
        >
          {/* Time Control */}
          <View style={styles.waitingTimeSection}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.waitingTimeBadge}
            >
              <TimeIcon size={24} color="#FFF" />
              <Text style={styles.waitingTimeText}>{timeControlDisplay}</Text>
            </LinearGradient>

            <Text style={styles.timeCategoryLabel}>
              {timeCategory.charAt(0).toUpperCase() + timeCategory.slice(1)}
            </Text>
          </View>

          {/* Settings Row */}
          <View style={styles.waitingSettingsRow}>
            {hasWager && (
              <View style={styles.waitingSettingItem}>
                <Coins size={20} color="#FFD700" />
                <Text style={styles.waitingSettingValue}>
                  {challenge.wager_tct} TCT
                </Text>
              </View>
            )}

            <View style={styles.waitingSettingItem}>
              {challenge.is_rated ? (
                <>
                  <Trophy size={20} color="#4CAF82" />
                  <Text style={styles.waitingSettingValue}>Rated</Text>
                </>
              ) : (
                <>
                  <User size={20} color="#A0A0A0" />
                  <Text style={styles.waitingSettingValueMuted}>Casual</Text>
                </>
              )}
            </View>

            <View style={styles.waitingSettingItem}>
              {challenge.is_public ? (
                <>
                  <Globe size={20} color="#4CAF82" />
                  <Text style={styles.waitingSettingValue}>Public</Text>
                </>
              ) : (
                <>
                  <Lock size={20} color="#FFD700" />
                  <Text style={styles.waitingSettingValue}>Private</Text>
                </>
              )}
            </View>
          </View>

          {/* Room Code (for private) */}
          {!challenge.is_public && challenge.room_code && (
            <View style={styles.roomCodeSection}>
              <Text style={styles.roomCodeLabel}>Room Code</Text>
              <View style={styles.roomCodeBox}>
                <Text style={styles.roomCodeText}>{challenge.room_code}</Text>
              </View>
              <Text style={styles.roomCodeHint}>
                Share this code with your friend
              </Text>
            </View>
          )}

          {/* Cancel Button */}
          {isCreator && onCancel && (
            <TouchableOpacity
              style={[styles.cancelBtnWaiting, isCancelling && styles.btnDisabled]}
              onPress={onCancel}
              disabled={isCancelling}
            >
              <X size={18} color="#E05C5C" />
              <Text style={styles.cancelBtnText}>
                {isCancelling ? "Cancelling..." : "Cancel Challenge"}
              </Text>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>
    );
  }

  // Default variant
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onView}
      activeOpacity={onView ? 0.7 : 1}
    >
      <LinearGradient
        colors={["#1e1e2e", "#252540"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          {/* Time Control */}
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.timeBadge}
          >
            <TimeIcon size={16} color="#FFF" />
            <Text style={styles.timeBadgeText}>{timeControlDisplay}</Text>
          </LinearGradient>

          {/* Status Badges */}
          <View style={styles.statusBadges}>
            {challenge.is_rated && (
              <View style={styles.ratedBadge}>
                <Trophy size={12} color="#4CAF82" />
                <Text style={styles.ratedText}>Rated</Text>
              </View>
            )}

            {challenge.is_public ? (
              <Globe size={16} color="#4CAF82" style={styles.visibilityIcon} />
            ) : (
              <Lock size={16} color="#FFD700" style={styles.visibilityIcon} />
            )}
          </View>
        </View>

        {/* Creator Info */}
        {showCreator && creator && (
          <View style={styles.creatorRow}>
            <View style={styles.creatorInfo}>
              {creatorAvatar && (
                <View
                  style={[
                    styles.avatarContainer,
                    { backgroundColor: creatorAvatar.color },
                  ]}
                >
                  <Text style={styles.avatarEmoji}>{creatorAvatar.emoji}</Text>
                </View>
              )}
              <View style={styles.creatorDetails}>
                <Text style={styles.creatorName}>{creator.username}</Text>
                <View style={styles.creatorRating}>
                  <Crown size={12} color="#FFD700" />
                  <Text style={styles.ratingText}>{creator.elo_rating}</Text>
                </View>
              </View>
            </View>

            {/* Wager Display */}
            {hasWager && (
              <View style={styles.wagerContainer}>
                <Coins size={18} color="#FFD700" />
                <Text style={styles.wagerAmount}>{challenge.wager_tct} TCT</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        {showActions && (
          <View style={styles.actionsRow}>
            {isCreator ? (
              // Creator sees cancel button
              <TouchableOpacity
                style={[styles.cancelBtn, isCancelling && styles.btnDisabled]}
                onPress={onCancel}
                disabled={isCancelling}
              >
                <X size={16} color="#E05C5C" />
                <Text style={styles.cancelBtnLabel}>
                  {isCancelling ? "Cancelling..." : "Cancel"}
                </Text>
              </TouchableOpacity>
            ) : (
              // Others see join button
              onJoin && (
                <TouchableOpacity
                  style={[styles.joinBtn, isJoining && styles.btnDisabled]}
                  onPress={onJoin}
                  disabled={isJoining}
                >
                  <LinearGradient
                    colors={["#4CAF82", "#3A9F6E"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinBtnGradient}
                  >
                    <Play size={16} color="#FFF" />
                    <Text style={styles.joinBtnLabel}>
                      {isJoining ? "Joining..." : "Accept Challenge"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  // Default variant
  container: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  gradient: {
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  timeBadgeText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  ratedText: {
    color: "#4CAF82",
    fontSize: 11,
    fontWeight: "600",
  },
  visibilityIcon: {
    marginLeft: 4,
  },
  creatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  creatorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEmoji: {
    fontSize: 20,
  },
  creatorDetails: {
    gap: 2,
  },
  creatorName: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  creatorRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    color: "#A0A0A0",
    fontSize: 12,
    fontWeight: "500",
  },
  wagerContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  wagerAmount: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  joinBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  joinBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  joinBtnLabel: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
    gap: 6,
  },
  cancelBtnLabel: {
    color: "#E05C5C",
    fontSize: 13,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Compact variant
  compactContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e1e2e",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  compactLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  timeBadgeTextCompact: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  creatorCompact: {
    gap: 2,
  },
  creatorNameCompact: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  ratingBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingTextCompact: {
    color: "#A0A0A0",
    fontSize: 11,
  },
  compactRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wagerBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wagerTextCompact: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "600",
  },
  joinBtnCompact: {
    backgroundColor: "#4CAF82",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  // Waiting variant
  waitingContainer: {
    borderRadius: 20,
    overflow: "hidden",
  },
  waitingGradient: {
    padding: 24,
    alignItems: "center",
  },
  waitingTimeSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  waitingTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 10,
    marginBottom: 8,
  },
  waitingTimeText: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "800",
  },
  timeCategoryLabel: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "500",
  },
  waitingSettingsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  waitingSettingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  waitingSettingValue: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  waitingSettingValueMuted: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "500",
  },
  roomCodeSection: {
    alignItems: "center",
    marginBottom: 24,
    width: "100%",
  },
  roomCodeLabel: {
    color: "#A0A0A0",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  roomCodeBox: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 215, 0, 0.3)",
    borderStyle: "dashed",
  },
  roomCodeText: {
    color: "#FFD700",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 4,
    fontFamily: "monospace",
  },
  roomCodeHint: {
    color: "#666",
    fontSize: 12,
    marginTop: 8,
  },
  cancelBtnWaiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
    gap: 8,
    marginTop: 8,
  },
  cancelBtnText: {
    color: "#E05C5C",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default ChallengeCard;
