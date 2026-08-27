/**
 * Admin Settings Screen (Super Admin Only)
 *
 * Configure platform-wide settings including rake rates.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAdmin } from "@/hooks/useAdmin";
import type { RakeSettings, UpdateRakeSettingsParams } from "@/types/admin";

export default function AdminSettingsScreen() {
  return (
    <AdminGate
      featureName="Platform Settings"
      requireSuperAdmin
    >
      <AdminSettingsContent />
    </AdminGate>
  );
}

function AdminSettingsContent() {
  const router = useRouter();
  const { getRakeSettings, updateRakeSettings, isLoading } = useAdmin();

  const [settings, setSettings] = useState<RakeSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Editable fields
  const [rakePercentage, setRakePercentage] = useState("");
  const [treasurySplit, setTreasurySplit] = useState("");
  const [minRakeTCT, setMinRakeTCT] = useState("");
  const [enabled, setEnabled] = useState(true);

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    const result = await getRakeSettings();
    if (result) {
      setSettings(result);
      setRakePercentage((result.rakePercentage * 100).toString());
      setTreasurySplit((result.treasurySplit * 100).toString());
      setMinRakeTCT(result.minRakeTCT.toString());
      setEnabled(result.enabled);
    }
    setIsLoadingSettings(false);
  }, [getRakeSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Track changes
  useEffect(() => {
    if (!settings) return;

    const currentRake = parseFloat(rakePercentage) / 100;
    const currentTreasury = parseFloat(treasurySplit) / 100;
    const currentMinRake = parseFloat(minRakeTCT);

    const changed =
      currentRake !== settings.rakePercentage ||
      currentTreasury !== settings.treasurySplit ||
      currentMinRake !== settings.minRakeTCT ||
      enabled !== settings.enabled;

    setHasChanges(changed);
  }, [rakePercentage, treasurySplit, minRakeTCT, enabled, settings]);

  const handleSave = async () => {
    // Validate inputs
    const rakeValue = parseFloat(rakePercentage);
    const treasuryValue = parseFloat(treasurySplit);
    const minRakeValue = parseFloat(minRakeTCT);

    if (isNaN(rakeValue) || rakeValue < 0 || rakeValue > 50) {
      Alert.alert("Invalid Value", "Rake percentage must be between 0 and 50%");
      return;
    }

    if (isNaN(treasuryValue) || treasuryValue < 0 || treasuryValue > 100) {
      Alert.alert("Invalid Value", "Treasury split must be between 0 and 100%");
      return;
    }

    if (isNaN(minRakeValue) || minRakeValue < 0) {
      Alert.alert("Invalid Value", "Minimum rake must be a positive number");
      return;
    }

    Alert.alert(
      "Confirm Changes",
      `Are you sure you want to update the rake settings?\n\n` +
        `Rake: ${rakeValue}%\n` +
        `Treasury Split: ${treasuryValue}%\n` +
        `Reward Pool Split: ${100 - treasuryValue}%\n` +
        `Min Rake: ${minRakeValue} TCT\n` +
        `Status: ${enabled ? "Enabled" : "Disabled"}\n\n` +
        `This will affect all future game settlements.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update Settings",
          style: "destructive",
          onPress: async () => {
            setIsSaving(true);

            const params: UpdateRakeSettingsParams = {
              rakePercentage: rakeValue / 100,
              treasurySplit: treasuryValue / 100,
              minRakeTCT: minRakeValue,
              enabled,
            };

            const result = await updateRakeSettings(params);

            setIsSaving(false);

            if (result) {
              setSettings(result);
              setHasChanges(false);
              Alert.alert("Success", "Rake settings have been updated");
            } else {
              Alert.alert("Error", "Failed to update rake settings");
            }
          },
        },
      ]
    );
  };

  const handleReset = () => {
    if (!settings) return;

    setRakePercentage((settings.rakePercentage * 100).toString());
    setTreasurySplit((settings.treasurySplit * 100).toString());
    setMinRakeTCT(settings.minRakeTCT.toString());
    setEnabled(settings.enabled);
    setHasChanges(false);
  };

  if (isLoadingSettings) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Platform Settings</Text>
            {hasChanges ? (
              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>

          {/* Super Admin Badge */}
          <View style={styles.badgeContainer}>
            <View style={styles.superAdminBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.superAdminBadgeText}>Super Admin</Text>
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {/* Warning Banner */}
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={24} color="#FF9500" />
              <Text style={styles.warningText}>
                Changes to these settings affect all future game settlements.
                Proceed with caution.
              </Text>
            </View>

            {/* Rake Configuration */}
            <Text style={styles.sectionTitle}>Rake Configuration</Text>
            <View style={styles.settingsCard}>
              <SettingInput
                label="Rake Percentage"
                value={rakePercentage}
                onChangeText={setRakePercentage}
                suffix="%"
                description="Percentage taken from the winning pot (0-50%)"
                keyboardType="decimal-pad"
              />

              <View style={styles.settingDivider} />

              <SettingInput
                label="Treasury Split"
                value={treasurySplit}
                onChangeText={(value) => {
                  setTreasurySplit(value);
                }}
                suffix="%"
                description="Portion of rake that goes to treasury"
                keyboardType="decimal-pad"
              />

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Reward Pool Split</Text>
                  <Text style={styles.settingDescription}>
                    Automatically calculated (100% - Treasury)
                  </Text>
                </View>
                <Text style={styles.settingValueDisplay}>
                  {(100 - parseFloat(treasurySplit || "0")).toFixed(0)}%
                </Text>
              </View>

              <View style={styles.settingDivider} />

              <SettingInput
                label="Minimum Rake"
                value={minRakeTCT}
                onChangeText={setMinRakeTCT}
                suffix="TCT"
                description="Minimum rake amount per game"
                keyboardType="decimal-pad"
              />

              <View style={styles.settingDivider} />

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Rake System Status</Text>
                  <Text style={styles.settingDescription}>
                    Enable or disable rake collection
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ false: "#333", true: "#34C75980" }}
                  thumbColor={enabled ? "#34C759" : "#666"}
                />
              </View>
            </View>

            {/* Preview */}
            <Text style={styles.sectionTitle}>Settlement Preview</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Example: 100 TCT Game Pot</Text>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Total Pot</Text>
                <Text style={styles.previewValue}>100 TCT</Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>
                  Rake ({rakePercentage || 0}%)
                </Text>
                <Text style={styles.previewValueHighlight}>
                  -{(parseFloat(rakePercentage || "0")).toFixed(2)} TCT
                </Text>
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Winner Receives</Text>
                <Text style={styles.previewValueGreen}>
                  {(100 - parseFloat(rakePercentage || "0")).toFixed(2)} TCT
                </Text>
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>
                  To Treasury ({treasurySplit || 0}%)
                </Text>
                <Text style={styles.previewValueSmall}>
                  {(
                    parseFloat(rakePercentage || "0") *
                    (parseFloat(treasurySplit || "0") / 100)
                  ).toFixed(2)}{" "}
                  TCT
                </Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>
                  To Rewards ({100 - parseFloat(treasurySplit || "0")}%)
                </Text>
                <Text style={styles.previewValueSmall}>
                  {(
                    parseFloat(rakePercentage || "0") *
                    ((100 - parseFloat(treasurySplit || "0")) / 100)
                  ).toFixed(2)}{" "}
                  TCT
                </Text>
              </View>
            </View>

            {/* Current Settings */}
            {settings && (
              <>
                <Text style={styles.sectionTitle}>Current Live Settings</Text>
                <View style={styles.currentSettingsCard}>
                  <CurrentSettingRow
                    label="Rake"
                    value={`${(settings.rakePercentage * 100).toFixed(1)}%`}
                  />
                  <CurrentSettingRow
                    label="Treasury Split"
                    value={`${(settings.treasurySplit * 100).toFixed(0)}%`}
                  />
                  <CurrentSettingRow
                    label="Reward Pool Split"
                    value={`${(settings.rewardPoolSplit * 100).toFixed(0)}%`}
                  />
                  <CurrentSettingRow
                    label="Min Rake"
                    value={`${settings.minRakeTCT} TCT`}
                  />
                  <CurrentSettingRow
                    label="Status"
                    value={settings.enabled ? "Enabled" : "Disabled"}
                    valueColor={settings.enabled ? "#34C759" : "#FF453A"}
                  />
                </View>
              </>
            )}

            {/* Save Button */}
            {hasChanges && (
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#0F0F1E" />
                ) : (
                  <>
                    <Ionicons name="save" size={20} color="#0F0F1E" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.bottomPadding} />
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

// ============================================================================
// Components
// ============================================================================

interface SettingInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  suffix?: string;
  description: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}

function SettingInput({
  label,
  value,
  onChangeText,
  suffix,
  description,
  keyboardType = "default",
}: SettingInputProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <View style={styles.settingInputContainer}>
        <TextInput
          style={styles.settingInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          selectTextOnFocus
        />
        {suffix && <Text style={styles.settingInputSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

interface CurrentSettingRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

function CurrentSettingRow({ label, value, valueColor }: CurrentSettingRowProps) {
  return (
    <View style={styles.currentSettingRow}>
      <Text style={styles.currentSettingLabel}>{label}</Text>
      <Text style={[styles.currentSettingValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 44,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 69, 58, 0.2)",
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF453A",
  },
  badgeContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  superAdminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  superAdminBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFD700",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 149, 0, 0.15)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.3)",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#FF9500",
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 24,
    marginBottom: 12,
  },
  settingsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  settingDescription: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  settingInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    minWidth: 100,
  },
  settingInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 8,
    textAlign: "right",
  },
  settingInputSuffix: {
    fontSize: 14,
    color: "#A0A0A0",
    marginLeft: 4,
  },
  settingValueDisplay: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF82",
  },
  settingDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 12,
  },
  previewCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.2)",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4CAF82",
    marginBottom: 16,
    textAlign: "center",
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  previewLabel: {
    fontSize: 13,
    color: "#A0A0A0",
  },
  previewValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  previewValueHighlight: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF9500",
  },
  previewValueGreen: {
    fontSize: 14,
    fontWeight: "700",
    color: "#34C759",
  },
  previewValueSmall: {
    fontSize: 12,
    fontWeight: "500",
    color: "#A0A0A0",
  },
  previewDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 8,
  },
  currentSettingsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
  },
  currentSettingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  currentSettingLabel: {
    fontSize: 13,
    color: "#666",
  },
  currentSettingValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A0A0A0",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  bottomPadding: {
    height: 32,
  },
});
