/**
 * NotificationSettings Component
 *
 * Settings panel for push notification preferences.
 * Integrates with settingsStore for persistence and NotificationService.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
} from "react-native";
import {
  Bell,
  BellOff,
  Gamepad2,
  Trophy,
  Wallet,
  Award,
  RotateCcw,
} from "lucide-react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { useNotifications } from "@/lib/notifications";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Types
// ============================================================================

interface NotificationSettingsProps {
  /** Compact mode for inline display */
  compact?: boolean;
}

// ============================================================================
// Components
// ============================================================================

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function SettingRow({
  icon,
  label,
  description,
  value,
  onToggle,
  disabled,
}: SettingRowProps) {
  return (
    <View style={[styles.settingRow, disabled && styles.settingRowDisabled]}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, disabled && styles.settingLabelDisabled]}>
          {label}
        </Text>
        {description && (
          <Text style={[styles.settingDescription, disabled && styles.settingDescriptionDisabled]}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#3E3E5E", true: "#4CAF82" }}
        thumbColor={value ? "#FFFFFF" : "#9CA3AF"}
        ios_backgroundColor="#3E3E5E"
        disabled={disabled}
      />
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationSettings({ compact = false }: NotificationSettingsProps) {
  const {
    notifications,
    setNotificationSettings,
    resetToDefaults,
  } = useSettingsStore();

  const {
    permissionGranted,
    requestPermissions,
    isRegistered,
  } = useNotifications();

  const { playToggle, playButtonPress } = useSoundAndHaptics();

  // Request permissions if not granted
  const handleEnableNotifications = useCallback(async () => {
    if (!permissionGranted) {
      const granted = await requestPermissions();

      if (!granted) {
        // Show alert to open settings
        Alert.alert(
          "Notifications Disabled",
          "To receive game and wallet notifications, please enable notifications in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                if (Platform.OS === "ios") {
                  Linking.openURL("app-settings:");
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        return;
      }
    }

    setNotificationSettings({ pushEnabled: !notifications.pushEnabled });
    playToggle();
  }, [notifications.pushEnabled, permissionGranted, requestPermissions, setNotificationSettings, playToggle]);

  // Toggle handlers
  const handleGameInvitesToggle = useCallback(() => {
    setNotificationSettings({ notifyGameInvites: !notifications.notifyGameInvites });
    playToggle();
  }, [notifications.notifyGameInvites, setNotificationSettings, playToggle]);

  const handleYourTurnToggle = useCallback(() => {
    setNotificationSettings({ notifyYourTurn: !notifications.notifyYourTurn });
    playToggle();
  }, [notifications.notifyYourTurn, setNotificationSettings, playToggle]);

  const handleGameResultsToggle = useCallback(() => {
    setNotificationSettings({ notifyGameResults: !notifications.notifyGameResults });
    playToggle();
  }, [notifications.notifyGameResults, setNotificationSettings, playToggle]);

  const handleDepositsToggle = useCallback(() => {
    setNotificationSettings({ notifyDeposits: !notifications.notifyDeposits });
    playToggle();
  }, [notifications.notifyDeposits, setNotificationSettings, playToggle]);

  const handleAchievementsToggle = useCallback(() => {
    setNotificationSettings({ notifyAchievements: !notifications.notifyAchievements });
    playToggle();
  }, [notifications.notifyAchievements, setNotificationSettings, playToggle]);

  // Reset
  const handleReset = useCallback(() => {
    resetToDefaults();
    playButtonPress();
  }, [resetToDefaults, playButtonPress]);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          style={[
            styles.compactButton,
            notifications.pushEnabled && styles.compactButtonActive,
          ]}
          onPress={handleEnableNotifications}
        >
          {notifications.pushEnabled ? (
            <Bell size={20} color="#4CAF82" />
          ) : (
            <BellOff size={20} color="#666" />
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const notificationsDisabled = !notifications.pushEnabled || !permissionGranted;

  return (
    <View style={styles.container}>
      {/* Permission Status */}
      {!permissionGranted && (
        <TouchableOpacity
          style={styles.permissionBanner}
          onPress={handleEnableNotifications}
        >
          <BellOff size={20} color="#FFD700" />
          <Text style={styles.permissionBannerText}>
            Notifications are disabled. Tap to enable.
          </Text>
        </TouchableOpacity>
      )}

      {/* Main Toggle */}
      <View style={styles.section}>
        <SettingRow
          icon={
            notifications.pushEnabled ? (
              <Bell size={20} color="#4CAF82" />
            ) : (
              <BellOff size={20} color="#666" />
            )
          }
          label="Push Notifications"
          description="Receive alerts for games and wallet"
          value={notifications.pushEnabled && permissionGranted}
          onToggle={handleEnableNotifications}
        />
      </View>

      {/* Notification Types */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Types</Text>

        <SettingRow
          icon={<Gamepad2 size={20} color={notificationsDisabled ? "#666" : "#4CAF82"} />}
          label="Game Invites"
          description="Challenge requests from other players"
          value={notifications.notifyGameInvites}
          onToggle={handleGameInvitesToggle}
          disabled={notificationsDisabled}
        />

        <SettingRow
          icon={<View style={styles.subIcon} />}
          label="Your Turn"
          description="When opponent makes a move"
          value={notifications.notifyYourTurn}
          onToggle={handleYourTurnToggle}
          disabled={notificationsDisabled}
        />

        <SettingRow
          icon={<Trophy size={20} color={notificationsDisabled ? "#666" : "#4CAF82"} />}
          label="Game Results"
          description="Win, lose, or draw notifications"
          value={notifications.notifyGameResults}
          onToggle={handleGameResultsToggle}
          disabled={notificationsDisabled}
        />

        <SettingRow
          icon={<Wallet size={20} color={notificationsDisabled ? "#666" : "#4CAF82"} />}
          label="Wallet Activity"
          description="Deposits and withdrawals"
          value={notifications.notifyDeposits}
          onToggle={handleDepositsToggle}
          disabled={notificationsDisabled}
        />

        <SettingRow
          icon={<Award size={20} color={notificationsDisabled ? "#666" : "#4CAF82"} />}
          label="Achievements"
          description="When you unlock achievements"
          value={notifications.notifyAchievements}
          onToggle={handleAchievementsToggle}
          disabled={notificationsDisabled}
        />
      </View>

      {/* Status Info */}
      {isRegistered && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            Notifications are active on this device
          </Text>
        </View>
      )}

      {/* Reset Button */}
      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <RotateCcw size={16} color="#A0A0A0" />
        <Text style={styles.resetButtonText}>Reset to Defaults</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },

  // Permission Banner
  permissionBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
    gap: 12,
  },
  permissionBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
  },

  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  // Setting Row
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  settingRowDisabled: {
    opacity: 0.5,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  settingLabelDisabled: {
    color: "#666",
  },
  settingDescription: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  settingDescriptionDisabled: {
    color: "#555",
  },

  // Sub icon for nested settings
  subIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(78, 205, 196, 0.3)",
    marginLeft: 16,
  },

  // Status
  statusContainer: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 12,
    color: "#4CAF82",
    textAlign: "center",
  },

  // Reset Button
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  resetButtonText: {
    fontSize: 14,
    color: "#A0A0A0",
  },

  // Compact Mode
  compactContainer: {
    flexDirection: "row",
    gap: 8,
  },
  compactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  compactButtonActive: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
});

// ============================================================================
// Exports
// ============================================================================

export default NotificationSettings;
