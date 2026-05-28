/**
 * SoundSettings Component
 *
 * Settings panel for audio and haptic preferences.
 * Integrates with settingsStore for persistence.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Platform,
} from "react-native";
import Slider from "@/components/shims/Slider";
import {
  Volume2,
  VolumeX,
  Music,
  Vibrate,
  Bell,
  RotateCcw,
} from "lucide-react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";

// ============================================================================
// Types
// ============================================================================

interface SoundSettingsProps {
  /** Show only audio settings */
  audioOnly?: boolean;
  /** Show only haptic settings */
  hapticsOnly?: boolean;
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
}

function SettingRow({ icon, label, description, value, onToggle }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>{icon}</View>
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#3E3E5E", true: "#4ECDC4" }}
        thumbColor={value ? "#FFFFFF" : "#9CA3AF"}
        ios_backgroundColor="#3E3E5E"
      />
    </View>
  );
}

interface VolumeSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function VolumeSlider({ label, value, onChange, disabled }: VolumeSliderProps) {
  return (
    <View style={[styles.sliderRow, disabled && styles.sliderRowDisabled]}>
      <Text style={[styles.sliderLabel, disabled && styles.sliderLabelDisabled]}>
        {label}
      </Text>
      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          value={value}
          onValueChange={onChange}
          minimumValue={0}
          maximumValue={1}
          step={0.1}
          minimumTrackTintColor={disabled ? "#666" : "#4ECDC4"}
          maximumTrackTintColor="#3E3E5E"
          thumbTintColor={disabled ? "#666" : "#FFFFFF"}
          disabled={disabled}
        />
        <Text style={[styles.sliderValue, disabled && styles.sliderValueDisabled]}>
          {Math.round(value * 100)}%
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SoundSettings({
  audioOnly = false,
  hapticsOnly = false,
  compact = false,
}: SoundSettingsProps) {
  const {
    audio,
    haptics,
    setAudioSettings,
    setHapticSettings,
    resetToDefaults,
  } = useSettingsStore();

  const { playToggle, playButtonPress } = useSoundAndHaptics();

  // Audio toggles
  const handleSoundToggle = useCallback(() => {
    setAudioSettings({ soundEnabled: !audio.soundEnabled });
    playToggle();
  }, [audio.soundEnabled, setAudioSettings, playToggle]);

  const handleMusicToggle = useCallback(() => {
    setAudioSettings({ musicEnabled: !audio.musicEnabled });
    playToggle();
  }, [audio.musicEnabled, setAudioSettings, playToggle]);

  // Haptic toggles
  const handleHapticToggle = useCallback(() => {
    setHapticSettings({ hapticEnabled: !haptics.hapticEnabled });
    playToggle();
  }, [haptics.hapticEnabled, setHapticSettings, playToggle]);

  const handleHapticMoveToggle = useCallback(() => {
    setHapticSettings({ hapticOnMove: !haptics.hapticOnMove });
    playToggle();
  }, [haptics.hapticOnMove, setHapticSettings, playToggle]);

  const handleHapticCaptureToggle = useCallback(() => {
    setHapticSettings({ hapticOnCapture: !haptics.hapticOnCapture });
    playToggle();
  }, [haptics.hapticOnCapture, setHapticSettings, playToggle]);

  const handleHapticButtonToggle = useCallback(() => {
    setHapticSettings({ hapticOnButton: !haptics.hapticOnButton });
    playToggle();
  }, [haptics.hapticOnButton, setHapticSettings, playToggle]);

  // Volume changes
  const handleMasterVolumeChange = useCallback(
    (value: number) => {
      setAudioSettings({ masterVolume: value });
    },
    [setAudioSettings]
  );

  const handleSoundVolumeChange = useCallback(
    (value: number) => {
      setAudioSettings({ soundVolume: value });
    },
    [setAudioSettings]
  );

  const handleMusicVolumeChange = useCallback(
    (value: number) => {
      setAudioSettings({ musicVolume: value });
    },
    [setAudioSettings]
  );

  // Reset
  const handleReset = useCallback(() => {
    resetToDefaults();
    playButtonPress();
  }, [resetToDefaults, playButtonPress]);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          style={[styles.compactButton, audio.soundEnabled && styles.compactButtonActive]}
          onPress={handleSoundToggle}
        >
          {audio.soundEnabled ? (
            <Volume2 size={20} color="#4ECDC4" />
          ) : (
            <VolumeX size={20} color="#666" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.compactButton, audio.musicEnabled && styles.compactButtonActive]}
          onPress={handleMusicToggle}
        >
          <Music size={20} color={audio.musicEnabled ? "#4ECDC4" : "#666"} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.compactButton, haptics.hapticEnabled && styles.compactButtonActive]}
          onPress={handleHapticToggle}
        >
          <Vibrate size={20} color={haptics.hapticEnabled ? "#4ECDC4" : "#666"} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Audio Section */}
      {!hapticsOnly && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio</Text>

          <SettingRow
            icon={audio.soundEnabled ? <Volume2 size={20} color="#4ECDC4" /> : <VolumeX size={20} color="#666" />}
            label="Sound Effects"
            description="Move, capture, and game sounds"
            value={audio.soundEnabled}
            onToggle={handleSoundToggle}
          />

          <SettingRow
            icon={<Music size={20} color={audio.musicEnabled ? "#4ECDC4" : "#666"} />}
            label="Background Music"
            description="Ambient music during games"
            value={audio.musicEnabled}
            onToggle={handleMusicToggle}
          />

          <View style={styles.volumeSection}>
            <VolumeSlider
              label="Master Volume"
              value={audio.masterVolume}
              onChange={handleMasterVolumeChange}
              disabled={!audio.soundEnabled && !audio.musicEnabled}
            />

            <VolumeSlider
              label="Sound Effects"
              value={audio.soundVolume}
              onChange={handleSoundVolumeChange}
              disabled={!audio.soundEnabled}
            />

            <VolumeSlider
              label="Music"
              value={audio.musicVolume}
              onChange={handleMusicVolumeChange}
              disabled={!audio.musicEnabled}
            />
          </View>
        </View>
      )}

      {/* Haptics Section */}
      {!audioOnly && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Haptics</Text>

          <SettingRow
            icon={<Vibrate size={20} color={haptics.hapticEnabled ? "#4ECDC4" : "#666"} />}
            label="Haptic Feedback"
            description="Vibration on actions"
            value={haptics.hapticEnabled}
            onToggle={handleHapticToggle}
          />

          {haptics.hapticEnabled && (
            <>
              <SettingRow
                icon={<View style={styles.subIcon} />}
                label="On Piece Moves"
                value={haptics.hapticOnMove}
                onToggle={handleHapticMoveToggle}
              />

              <SettingRow
                icon={<View style={styles.subIcon} />}
                label="On Captures"
                value={haptics.hapticOnCapture}
                onToggle={handleHapticCaptureToggle}
              />

              <SettingRow
                icon={<View style={styles.subIcon} />}
                label="On Button Press"
                value={haptics.hapticOnButton}
                onToggle={handleHapticButtonToggle}
              />
            </>
          )}
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
  settingDescription: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },

  // Sub icon for nested settings
  subIcon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(78, 205, 196, 0.3)",
    marginLeft: 16,
  },

  // Volume Section
  volumeSection: {
    marginTop: 16,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 12,
    padding: 16,
  },
  sliderRow: {
    marginBottom: 16,
  },
  sliderRowDisabled: {
    opacity: 0.5,
  },
  sliderLabel: {
    fontSize: 14,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  sliderLabelDisabled: {
    color: "#666",
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 45,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: "#4ECDC4",
  },
  sliderValueDisabled: {
    color: "#666",
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

export default SoundSettings;
