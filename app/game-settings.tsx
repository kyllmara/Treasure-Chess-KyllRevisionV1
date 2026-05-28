/**
 * Game Settings Screen
 *
 * Settings for board theme, piece style, and game preferences.
 * Uses settingsStore for persistence.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check, ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { FontFamily, Colors } from "@/constants/theme";
import type { BoardTheme, PieceStyle } from "@/types";

// ============================================================================
// Theme Configurations
// ============================================================================

const BOARD_THEMES: { id: BoardTheme; name: string; colors: [string, string] }[] = [
  { id: "purple", name: "Original - Purple & White", colors: ["#9B7EC8", "#FFFFFF"] },
  { id: "classic", name: "Classic - Black & White", colors: ["#000000", "#FFFFFF"] },
  { id: "eco", name: "Eco - Green & Brown", colors: ["#6B8E23", "#8B4513"] },
  { id: "retro", name: "Retro - Brown & Cream", colors: ["#A67C52", "#E8D7B8"] },
];

const PIECE_STYLES: { id: PieceStyle; name: string }[] = [
  { id: "unity", name: "Classic 3D" },
  { id: "classic", name: "Classic 2D" },
];

// ============================================================================
// Main Component
// ============================================================================

export default function GameSettingsScreen() {
  const router = useRouter();
  const { game, setGameSettings } = useSettingsStore();
  const { playToggle, playButtonPress } = useSoundAndHaptics();

  // ========================================================================
  // Handlers
  // ========================================================================

  const handleBoardThemeSelect = useCallback((theme: BoardTheme) => {
    setGameSettings({ boardTheme: theme });
    playButtonPress();
  }, [setGameSettings, playButtonPress]);

  const handlePieceStyleSelect = useCallback((style: PieceStyle) => {
    setGameSettings({ pieceStyle: style });
    playButtonPress();
  }, [setGameSettings, playButtonPress]);

  const handleToggle = useCallback((key: keyof typeof game) => {
    const currentValue = game[key];
    if (typeof currentValue === "boolean") {
      setGameSettings({ [key]: !currentValue } as Partial<typeof game>);
      playToggle();
    }
  }, [game, setGameSettings, playToggle]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Game Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Board Theme Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Board Theme</Text>
          <View style={styles.themeGrid}>
            {BOARD_THEMES.map((theme) => (
              <TouchableOpacity
                key={theme.id}
                style={[
                  styles.themeOption,
                  game.boardTheme === theme.id && styles.themeOptionSelected,
                ]}
                onPress={() => handleBoardThemeSelect(theme.id)}
              >
                <View style={styles.themePreview}>
                  <View style={[styles.themeSquare, { backgroundColor: theme.colors[0] }]} />
                  <View style={[styles.themeSquare, { backgroundColor: theme.colors[1] }]} />
                </View>
                <Text style={styles.themeLabel}>{theme.name}</Text>
                {game.boardTheme === theme.id && (
                  <View style={styles.checkMark}>
                    <Check size={16} color="#FFD700" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Piece Style Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Piece Style</Text>
          <View style={styles.pieceStyleGrid}>
            {PIECE_STYLES.map((style) => (
              <TouchableOpacity
                key={style.id}
                style={[
                  styles.pieceStyleOption,
                  game.pieceStyle === style.id && styles.pieceStyleOptionSelected,
                ]}
                onPress={() => handlePieceStyleSelect(style.id)}
              >
                <View style={styles.piecePreviewRow}>
                  <ChessPieceComponent type="k" color="w" size={40} style={style.id} />
                  <ChessPieceComponent type="q" color="w" size={40} style={style.id} />
                  <ChessPieceComponent type="r" color="b" size={40} style={style.id} />
                  <ChessPieceComponent type="n" color="b" size={40} style={style.id} />
                </View>
                <Text style={styles.pieceStyleLabel}>{style.name}</Text>
                {game.pieceStyle === style.id && (
                  <View style={styles.checkMark}>
                    <Check size={16} color="#FFD700" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Game Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Preferences</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Show Legal Moves</Text>
                <Text style={styles.settingDescription}>
                  Highlight possible moves when selecting a piece
                </Text>
              </View>
              <Switch
                value={game.showLegalMoves}
                onValueChange={() => handleToggle("showLegalMoves")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.showLegalMoves ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Promote to Queen</Text>
                <Text style={styles.settingDescription}>
                  Automatically promote pawns to queens
                </Text>
              </View>
              <Switch
                value={game.autoQueen}
                onValueChange={() => handleToggle("autoQueen")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.autoQueen ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Confirm Moves</Text>
                <Text style={styles.settingDescription}>
                  Require confirmation before making a move
                </Text>
              </View>
              <Switch
                value={game.confirmMoves}
                onValueChange={() => handleToggle("confirmMoves")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.confirmMoves ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Highlight Last Move</Text>
                <Text style={styles.settingDescription}>
                  Show the opponent's last move on the board
                </Text>
              </View>
              <Switch
                value={game.highlightLastMove}
                onValueChange={() => handleToggle("highlightLastMove")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.highlightLastMove ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Show Coordinates</Text>
                <Text style={styles.settingDescription}>
                  Display rank and file labels on the board
                </Text>
              </View>
              <Switch
                value={game.showCoordinates}
                onValueChange={() => handleToggle("showCoordinates")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.showCoordinates ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-Flip Board</Text>
                <Text style={styles.settingDescription}>
                  Flip board when playing as black
                </Text>
              </View>
              <Switch
                value={game.autoFlipBoard}
                onValueChange={() => handleToggle("autoFlipBoard")}
                trackColor={{ false: "#3E3E5E", true: "#FFD700" }}
                thumbColor={game.autoFlipBoard ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          </View>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </LinearGradient>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Clean styling - no explicit fontFamily
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 44,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Section
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },

  // Theme Grid
  themeGrid: {
    gap: 12,
  },
  themeOption: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    position: "relative",
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  themeOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  themePreview: {
    flexDirection: "row",
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  themeSquare: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  checkMark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0F0F1E",
    alignItems: "center",
    justifyContent: "center",
  },

  // Piece Style Grid
  pieceStyleGrid: {
    gap: 12,
  },
  pieceStyleOption: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    position: "relative",
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  pieceStyleOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  piecePreviewRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    height: 50,
  },
  pieceStyleLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },

  // Setting Cards
  settingCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderTopColor: "rgba(255, 255, 255, 0.2)",
    // 3D shadow effect
    shadowColor: "rgba(0, 0, 0, 0.3)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  settingDescription: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
  },

  // Bottom Padding
  bottomPadding: {
    height: 40,
  },
});
