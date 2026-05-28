/**
 * StreamPlatformPicker Component
 *
 * Platform selection for livestreaming with OAuth connection status
 * for Twitch, TikTok, Kick, and custom RTMP.
 */

import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Twitch,
  Music,
  Zap,
  Radio,
  Check,
  Link,
  LinkOff,
  Key,
  ChevronRight,
  ExternalLink,
} from "lucide-react-native";
import type {
  StreamPlatform,
  PlatformConnection,
  PlatformPickerProps,
  PLATFORM_INFO,
} from "@/types/livestream";

// ============================================================================
// Platform Info
// ============================================================================

const PLATFORMS: Array<{
  id: StreamPlatform;
  name: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  supportsOAuth: boolean;
  requiresManualKey: boolean;
}> = [
  {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    icon: <Twitch size={24} color="#9146FF" />,
    description: "Stream to your Twitch channel",
    supportsOAuth: true,
    requiresManualKey: false,
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#000000",
    icon: <Music size={24} color="#FF0050" />,
    description: "Go live on TikTok",
    supportsOAuth: true,
    requiresManualKey: false,
  },
  {
    id: "kick",
    name: "Kick",
    color: "#53FC18",
    icon: <Zap size={24} color="#53FC18" />,
    description: "Stream to Kick (manual key required)",
    supportsOAuth: false,
    requiresManualKey: true,
  },
  {
    id: "custom",
    name: "Custom RTMP",
    color: "#6366F1",
    icon: <Radio size={24} color="#6366F1" />,
    description: "Use any RTMP server",
    supportsOAuth: false,
    requiresManualKey: true,
  },
];

// ============================================================================
// Component
// ============================================================================

export const StreamPlatformPicker = memo(function StreamPlatformPicker({
  selectedPlatform,
  connections,
  onSelectPlatform,
  onConnectPlatform,
  disabled = false,
}: PlatformPickerProps) {
  const isConnected = useCallback(
    (platform: StreamPlatform): boolean => {
      return connections.some((c) => c.platform === platform && c.isConnected);
    },
    [connections]
  );

  const getConnection = useCallback(
    (platform: StreamPlatform): PlatformConnection | undefined => {
      return connections.find((c) => c.platform === platform);
    },
    [connections]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Platform</Text>
      <Text style={styles.subtitle}>Choose where to stream your game</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.platformList}
      >
        {PLATFORMS.map((platform) => {
          const connected = isConnected(platform.id);
          const connection = getConnection(platform.id);
          const isSelected = selectedPlatform === platform.id;

          return (
            <TouchableOpacity
              key={platform.id}
              style={[
                styles.platformCard,
                isSelected && styles.platformCardSelected,
                disabled && styles.platformCardDisabled,
              ]}
              onPress={() => onSelectPlatform(platform.id)}
              disabled={disabled}
            >
              {/* Selection indicator */}
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Check size={12} color="#FFFFFF" />
                </View>
              )}

              {/* Platform icon */}
              <View
                style={[
                  styles.iconContainer,
                  { borderColor: platform.color },
                  isSelected && { backgroundColor: `${platform.color}20` },
                ]}
              >
                {platform.icon}
              </View>

              {/* Platform name */}
              <Text style={styles.platformName}>{platform.name}</Text>

              {/* Connection status */}
              {platform.supportsOAuth ? (
                connected ? (
                  <View style={styles.connectedBadge}>
                    <Link size={10} color="#22C55E" />
                    <Text style={styles.connectedText}>
                      {connection?.username || "Connected"}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.connectButton}
                    onPress={() => onConnectPlatform(platform.id)}
                    disabled={disabled}
                  >
                    <Text style={styles.connectButtonText}>Connect</Text>
                  </TouchableOpacity>
                )
              ) : (
                <View style={styles.manualKeyBadge}>
                  <Key size={10} color="#F59E0B" />
                  <Text style={styles.manualKeyText}>Manual Key</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Selected platform details */}
      {selectedPlatform && (
        <PlatformDetails
          platform={PLATFORMS.find((p) => p.id === selectedPlatform)!}
          connection={getConnection(selectedPlatform)}
          onConnect={() => onConnectPlatform(selectedPlatform)}
        />
      )}
    </View>
  );
});

// ============================================================================
// PlatformDetails Component
// ============================================================================

interface PlatformDetailsProps {
  platform: (typeof PLATFORMS)[number];
  connection: PlatformConnection | undefined;
  onConnect: () => void;
}

const PlatformDetails = memo(function PlatformDetails({
  platform,
  connection,
  onConnect,
}: PlatformDetailsProps) {
  const isConnected = connection?.isConnected;

  return (
    <View style={styles.detailsContainer}>
      <LinearGradient
        colors={[`${platform.color}15`, "transparent"]}
        style={styles.detailsGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.detailsHeader}>
          {platform.icon}
          <View style={styles.detailsHeaderText}>
            <Text style={styles.detailsTitle}>{platform.name}</Text>
            <Text style={styles.detailsDescription}>{platform.description}</Text>
          </View>
        </View>

        {platform.supportsOAuth ? (
          isConnected ? (
            <View style={styles.connectedInfo}>
              <View style={styles.connectedRow}>
                <Check size={16} color="#22C55E" />
                <Text style={styles.connectedInfoText}>
                  Connected as <Text style={styles.username}>{connection?.username}</Text>
                </Text>
              </View>
              {connection?.channelUrl && (
                <TouchableOpacity style={styles.channelLink}>
                  <ExternalLink size={12} color="#9CA3AF" />
                  <Text style={styles.channelLinkText}>{connection.channelUrl}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.oauthButton} onPress={onConnect}>
              <LinearGradient
                colors={[platform.color, `${platform.color}CC`]}
                style={styles.oauthButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Link size={18} color="#FFFFFF" />
                <Text style={styles.oauthButtonText}>Connect {platform.name}</Text>
                <ChevronRight size={18} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          )
        ) : (
          <View style={styles.manualKeySection}>
            <Text style={styles.manualKeyLabel}>
              Enter your {platform.name} stream key below when you're ready to go live.
            </Text>
            <View style={styles.helpLink}>
              <ExternalLink size={12} color="#6366F1" />
              <Text style={styles.helpLinkText}>
                How to find your {platform.name} stream key
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
});

// ============================================================================
// StreamKeyInput Component
// ============================================================================

interface StreamKeyInputProps {
  platform: StreamPlatform;
  value: string;
  rtmpUrl?: string;
  onChange: (key: string) => void;
  onRtmpUrlChange?: (url: string) => void;
  showRtmpUrl?: boolean;
  disabled?: boolean;
}

export const StreamKeyInput = memo(function StreamKeyInput({
  platform,
  value,
  rtmpUrl,
  onChange,
  onRtmpUrlChange,
  showRtmpUrl = false,
  disabled = false,
}: StreamKeyInputProps) {
  const platformInfo = PLATFORMS.find((p) => p.id === platform);

  return (
    <View style={keyInputStyles.container}>
      <View style={keyInputStyles.header}>
        <Key size={16} color="#FFD700" />
        <Text style={keyInputStyles.label}>Stream Key</Text>
      </View>

      <TextInput
        style={[keyInputStyles.input, disabled && keyInputStyles.inputDisabled]}
        value={value}
        onChangeText={onChange}
        placeholder={`Enter your ${platformInfo?.name || "stream"} key`}
        placeholderTextColor="#6B7280"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />

      {showRtmpUrl && onRtmpUrlChange && (
        <>
          <View style={[keyInputStyles.header, { marginTop: 16 }]}>
            <Radio size={16} color="#FFD700" />
            <Text style={keyInputStyles.label}>RTMP URL</Text>
          </View>

          <TextInput
            style={[keyInputStyles.input, disabled && keyInputStyles.inputDisabled]}
            value={rtmpUrl}
            onChangeText={onRtmpUrlChange}
            placeholder="rtmp://..."
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!disabled}
          />
        </>
      )}

      <Text style={keyInputStyles.hint}>
        Your stream key is kept secure and never shared.
      </Text>
    </View>
  );
});

const keyInputStyles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2D2D44",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 14,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  hint: {
    color: "#6B7280",
    fontSize: 12,
    marginTop: 8,
  },
});

// ============================================================================
// QualitySelector Component
// ============================================================================

interface QualitySelectorProps {
  selectedResolution: "480p" | "720p" | "1080p";
  onSelectResolution: (resolution: "480p" | "720p" | "1080p") => void;
  disabled?: boolean;
}

export const QualitySelector = memo(function QualitySelector({
  selectedResolution,
  onSelectResolution,
  disabled = false,
}: QualitySelectorProps) {
  const qualities = [
    { value: "480p" as const, label: "480p", bitrate: "1.5 Mbps", description: "Low bandwidth" },
    { value: "720p" as const, label: "720p", bitrate: "3 Mbps", description: "Recommended" },
    { value: "1080p" as const, label: "1080p", bitrate: "6 Mbps", description: "High quality" },
  ];

  return (
    <View style={qualityStyles.container}>
      <Text style={qualityStyles.title}>Stream Quality</Text>

      <View style={qualityStyles.options}>
        {qualities.map((quality) => (
          <TouchableOpacity
            key={quality.value}
            style={[
              qualityStyles.option,
              selectedResolution === quality.value && qualityStyles.optionSelected,
              disabled && qualityStyles.optionDisabled,
            ]}
            onPress={() => onSelectResolution(quality.value)}
            disabled={disabled}
          >
            {selectedResolution === quality.value && (
              <View style={qualityStyles.selectedIndicator}>
                <Check size={12} color="#FFFFFF" />
              </View>
            )}
            <Text
              style={[
                qualityStyles.optionLabel,
                selectedResolution === quality.value && qualityStyles.optionLabelSelected,
              ]}
            >
              {quality.label}
            </Text>
            <Text style={qualityStyles.optionBitrate}>{quality.bitrate}</Text>
            <Text style={qualityStyles.optionDescription}>{quality.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

const qualityStyles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  options: {
    flexDirection: "row",
    gap: 12,
  },
  option: {
    flex: 1,
    backgroundColor: "#1A1A2E",
    borderWidth: 2,
    borderColor: "#2D2D44",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  optionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  optionDisabled: {
    opacity: 0.5,
  },
  selectedIndicator: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  optionLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  optionLabelSelected: {
    color: "#FFD700",
  },
  optionBitrate: {
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 2,
  },
  optionDescription: {
    color: "#6B7280",
    fontSize: 10,
  },
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
    marginBottom: 16,
  },
  platformList: {
    gap: 12,
    paddingVertical: 8,
  },
  platformCard: {
    width: 100,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#2D2D44",
  },
  platformCardSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  platformCardDisabled: {
    opacity: 0.5,
  },
  selectedBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  platformName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  connectedText: {
    color: "#22C55E",
    fontSize: 10,
    fontWeight: "500",
  },
  connectButton: {
    backgroundColor: "#2D2D44",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  manualKeyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  manualKeyText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "500",
  },
  detailsContainer: {
    marginTop: 16,
  },
  detailsGradient: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2D2D44",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  detailsHeaderText: {
    flex: 1,
  },
  detailsTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  detailsDescription: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  connectedInfo: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 8,
    padding: 12,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectedInfoText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  username: {
    color: "#22C55E",
    fontWeight: "600",
  },
  channelLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  channelLinkText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  oauthButton: {
    borderRadius: 8,
    overflow: "hidden",
  },
  oauthButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  oauthButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  manualKeySection: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    borderRadius: 8,
    padding: 12,
  },
  manualKeyLabel: {
    color: "#9CA3AF",
    fontSize: 13,
    lineHeight: 20,
  },
  helpLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  helpLinkText: {
    color: "#6366F1",
    fontSize: 12,
    fontWeight: "500",
  },
});

export default StreamPlatformPicker;
