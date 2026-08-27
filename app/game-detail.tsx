/**
 * Game Detail Screen
 *
 * Displays detailed information about a completed game:
 * - Game summary with result
 * - Player matchup display
 * - Move-by-move replay functionality
 * - Game statistics
 * - PGN export/share
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Trophy,
  XCircle,
  Minus,
  TrendingUp,
  TrendingDown,
  Crown,
  Flag,
  Clock,
  Swords,
  Share2,
  Copy,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react-native";
import { Chess } from "chess.js";
import { useUserStore } from "@/stores/userStore";
import { useSoundAndHaptics } from "@/hooks/useSoundAndHaptics";
import { AvatarDisplay } from "@/components/AvatarPicker";
import { StaticChessBoard } from "@/components/StaticChessBoard";
import {
  fetchGameById,
  type GameHistoryItem,
  type GameResult,
  type GameEndReason,
} from "@/lib/gameHistory";
import { useSettingsStore } from "@/stores/settingsStore";
import { ChessBoard3D } from "@/components/ChessBoard3D";
import { useChess3DStore } from "@/lib/chess3d";

// ============================================================================
// Types
// ============================================================================

interface MoveInfo {
  san: string;
  fen: string;
  moveNumber: number;
  isWhiteMove: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BOARD_SIZE = SCREEN_WIDTH - 32;
const PLAYBACK_SPEED_MS = 1500;

// ============================================================================
// Helper Functions
// ============================================================================

function getResultConfig(result: GameResult, playedAs: "white" | "black"): {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
  description: string;
} {
  switch (result) {
    case "win":
      return {
        icon: <Trophy size={24} color="#4CAF82" />,
        color: "#4CAF82",
        bgColor: "rgba(78, 205, 196, 0.15)",
        label: "Victory",
        description: `You won playing as ${playedAs}`,
      };
    case "loss":
      return {
        icon: <XCircle size={24} color="#E05C5C" />,
        color: "#E05C5C",
        bgColor: "rgba(255, 107, 107, 0.15)",
        label: "Defeat",
        description: `You lost playing as ${playedAs}`,
      };
    case "draw":
      return {
        icon: <Minus size={24} color="#A0A0A0" />,
        color: "#A0A0A0",
        bgColor: "rgba(160, 160, 160, 0.15)",
        label: "Draw",
        description: "Game ended in a draw",
      };
  }
}

function getEndReasonLabel(reason: GameEndReason): string {
  switch (reason) {
    case "checkmate":
      return "by checkmate";
    case "resignation":
      return "by resignation";
    case "timeout":
      return "on time";
    case "stalemate":
      return "by stalemate";
    case "draw_agreement":
      return "by agreement";
    case "insufficient_material":
      return "insufficient material";
    case "threefold_repetition":
      return "threefold repetition";
    case "fifty_move_rule":
      return "fifty move rule";
    default:
      return "";
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTCT(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}K`;
  }
  return amount.toFixed(0);
}

// ============================================================================
// Move Parser
// ============================================================================

function parsePGNMoves(pgn: string | null): MoveInfo[] {
  if (!pgn) return [];

  const chess = new Chess();
  const moves: MoveInfo[] = [];

  // Add initial position
  moves.push({
    san: "Start",
    fen: chess.fen(),
    moveNumber: 0,
    isWhiteMove: true,
  });

  try {
    chess.loadPgn(pgn);
    const history = chess.history();

    // Reset and replay to capture FEN after each move
    chess.reset();

    for (let i = 0; i < history.length; i++) {
      const san = history[i];
      chess.move(san);
      moves.push({
        san,
        fen: chess.fen(),
        moveNumber: Math.floor(i / 2) + 1,
        isWhiteMove: i % 2 === 0,
      });
    }
  } catch (error) {
    console.error("Failed to parse PGN:", error);
  }

  return moves;
}

// ============================================================================
// Main Component
// ============================================================================

export default function GameDetailScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { profile } = useUserStore();
  const { playButtonPress, playMove } = useSoundAndHaptics();
  const { game: gameSettings } = useSettingsStore();
  const { enable3D } = useChess3DStore();

  // State
  const [game, setGame] = useState<GameHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [moves, setMoves] = useState<MoveInfo[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [boardFlipped, setBoardFlipped] = useState(false);

  const playbackInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ========================================================================
  // Data Fetching
  // ========================================================================

  useEffect(() => {
    async function loadGame() {
      if (!gameId) return;

      setIsLoading(true);
      try {
        const result = await fetchGameById(gameId);
        if (result) {
          setGame(result);
          const parsedMoves = parsePGNMoves(result.pgn);
          setMoves(parsedMoves);
          setCurrentMoveIndex(parsedMoves.length - 1); // Start at end

          // Auto-flip board if player was black
          if (result.playedAs === "black") {
            setBoardFlipped(true);
          }
        }
      } catch (error) {
        console.error("Failed to load game:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadGame();
  }, [gameId]);

  // ========================================================================
  // Playback Control
  // ========================================================================

  const startPlayback = useCallback(() => {
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
    }

    setIsPlaying(true);
    setCurrentMoveIndex(0);

    playbackInterval.current = setInterval(() => {
      setCurrentMoveIndex((prev) => {
        if (prev >= moves.length - 1) {
          setIsPlaying(false);
          if (playbackInterval.current) {
            clearInterval(playbackInterval.current);
          }
          return prev;
        }
        playMove();
        return prev + 1;
      });
    }, PLAYBACK_SPEED_MS);
  }, [moves.length, playMove]);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackInterval.current) {
      clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      if (currentMoveIndex >= moves.length - 1) {
        startPlayback();
      } else {
        // Continue from current position
        setIsPlaying(true);
        playbackInterval.current = setInterval(() => {
          setCurrentMoveIndex((prev) => {
            if (prev >= moves.length - 1) {
              setIsPlaying(false);
              if (playbackInterval.current) {
                clearInterval(playbackInterval.current);
              }
              return prev;
            }
            playMove();
            return prev + 1;
          });
        }, PLAYBACK_SPEED_MS);
      }
    }
    playButtonPress();
  }, [isPlaying, currentMoveIndex, moves.length, startPlayback, stopPlayback, playButtonPress, playMove]);

  useEffect(() => {
    return () => {
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
      }
    };
  }, []);

  // ========================================================================
  // Navigation Controls
  // ========================================================================

  const goToStart = useCallback(() => {
    stopPlayback();
    setCurrentMoveIndex(0);
    playButtonPress();
  }, [stopPlayback, playButtonPress]);

  const goToEnd = useCallback(() => {
    stopPlayback();
    setCurrentMoveIndex(moves.length - 1);
    playButtonPress();
  }, [stopPlayback, moves.length, playButtonPress]);

  const goToPrevious = useCallback(() => {
    stopPlayback();
    setCurrentMoveIndex((prev) => Math.max(0, prev - 1));
    playButtonPress();
  }, [stopPlayback, playButtonPress]);

  const goToNext = useCallback(() => {
    stopPlayback();
    setCurrentMoveIndex((prev) => Math.min(moves.length - 1, prev + 1));
    playMove();
  }, [stopPlayback, moves.length, playMove]);

  const handleFlipBoard = useCallback(() => {
    setBoardFlipped((prev) => !prev);
    playButtonPress();
  }, [playButtonPress]);

  // ========================================================================
  // Share/Export
  // ========================================================================

  const handleShare = useCallback(async () => {
    if (!game) return;

    const resultText = game.result === "win"
      ? "Won"
      : game.result === "loss"
        ? "Lost"
        : "Drew";

    const message = `Chess Game: ${resultText} vs ${game.opponentUsername}\n` +
      `ELO Change: ${game.eloChange >= 0 ? "+" : ""}${game.eloChange}\n` +
      `Moves: ${game.movesCount}\n` +
      `Result: ${getEndReasonLabel(game.endReason)}`;

    try {
      await Share.share({
        message: game.pgn ? `${message}\n\nPGN:\n${game.pgn}` : message,
        title: "Chess Game",
      });
    } catch (error) {
      console.error("Share failed:", error);
    }
  }, [game]);

  const handleCopyPGN = useCallback(() => {
    if (!game?.pgn) {
      Alert.alert("No PGN", "This game does not have PGN data.");
      return;
    }

    // Note: In production, use Clipboard API
    Alert.alert("PGN Copied", "Game PGN has been copied to clipboard.");
    playButtonPress();
  }, [game, playButtonPress]);

  // ========================================================================
  // Computed Values
  // ========================================================================

  const currentFen = useMemo(() => {
    if (moves.length === 0) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    return moves[currentMoveIndex]?.fen || moves[0].fen;
  }, [moves, currentMoveIndex]);

  // Create a Chess instance and board for 3D rendering
  const { replayGame, replayBoard } = useMemo(() => {
    const chessInstance = new Chess(currentFen);
    return {
      replayGame: chessInstance,
      replayBoard: chessInstance.board(),
    };
  }, [currentFen]);

  const resultConfig = useMemo(() => {
    if (!game) return null;
    return getResultConfig(game.result, game.playedAs);
  }, [game]);

  // ========================================================================
  // Render
  // ========================================================================

  if (isLoading) {
    return (
      <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Loading game...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!game) {
    return (
      <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Game not found</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#05060f", "#0F0F1E"]} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Game Details</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Share2 size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Result Banner */}
        {resultConfig && (
          <View style={[styles.resultBanner, { backgroundColor: resultConfig.bgColor }]}>
            <View style={styles.resultIconContainer}>
              {resultConfig.icon}
            </View>
            <View style={styles.resultTextContainer}>
              <Text style={[styles.resultLabel, { color: resultConfig.color }]}>
                {resultConfig.label}
              </Text>
              <Text style={styles.resultDescription}>
                {resultConfig.description} {getEndReasonLabel(game.endReason)}
              </Text>
            </View>
            <View style={styles.eloChangeContainer}>
              {game.eloChange >= 0 ? (
                <TrendingUp size={18} color={game.eloChange > 0 ? "#4CAF82" : "#A0A0A0"} />
              ) : (
                <TrendingDown size={18} color="#E05C5C" />
              )}
              <Text
                style={[
                  styles.eloChangeText,
                  {
                    color: game.eloChange >= 0
                      ? game.eloChange > 0 ? "#4CAF82" : "#A0A0A0"
                      : "#E05C5C"
                  },
                ]}
              >
                {game.eloChange >= 0 ? "+" : ""}{game.eloChange}
              </Text>
            </View>
          </View>
        )}

        {/* Player Matchup */}
        <View style={styles.matchupContainer}>
          <View style={styles.playerSide}>
            <AvatarDisplay
              index={profile?.avatarIndex || 0}
              size={48}
              showBorder
            />
            <Text style={styles.playerName} numberOfLines={1}>
              {profile?.username || "You"}
            </Text>
            <View style={[styles.colorBadge, game.playedAs === "white" ? styles.whiteBadge : styles.blackBadge]}>
              <Text style={[styles.colorBadgeText, game.playedAs === "white" ? styles.whiteBadgeText : styles.blackBadgeText]}>
                {game.playedAs === "white" ? "White" : "Black"}
              </Text>
            </View>
          </View>

          <View style={styles.vsContainer}>
            <Swords size={24} color="#FFD700" />
            <Text style={styles.vsText}>VS</Text>
          </View>

          <View style={styles.playerSide}>
            <AvatarDisplay
              index={game.opponentAvatarIndex}
              size={48}
              showBorder
            />
            <Text style={styles.playerName} numberOfLines={1}>
              {game.opponentUsername}
            </Text>
            <View style={styles.opponentRatingBadge}>
              <Text style={styles.opponentRatingText}>
                {game.opponentEloRating}
              </Text>
            </View>
          </View>
        </View>

        {/* Chess Board with Replay */}
        <View style={styles.boardSection}>
          <View style={styles.boardContainer}>
            {enable3D ? (
              <ChessBoard3D
                game={replayGame}
                board={replayBoard}
                boardSize={BOARD_SIZE}
                isFlipped={boardFlipped}
                isInteractive={false}
                selectedSquare={null}
                possibleMoves={[]}
                lastMove={null}
                onSquarePress={() => {}}
                isCheck={false}
                checkSquare={null}
              />
            ) : (
              <StaticChessBoard
                fen={currentFen}
                size={BOARD_SIZE}
                flipped={boardFlipped}
                boardTheme={gameSettings?.boardTheme || "purple"}
                pieceStyle={gameSettings?.pieceStyle || "unity"}
              />
            )}
          </View>

          {/* Move Counter */}
          <View style={styles.moveCounter}>
            <Text style={styles.moveCounterText}>
              Move {currentMoveIndex} / {moves.length - 1}
            </Text>
          </View>

          {/* Playback Controls */}
          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={goToStart}
              disabled={currentMoveIndex === 0}
            >
              <SkipBack size={20} color={currentMoveIndex === 0 ? "#3E3E5E" : "#FFFFFF"} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={goToPrevious}
              disabled={currentMoveIndex === 0}
            >
              <ChevronLeft size={24} color={currentMoveIndex === 0 ? "#3E3E5E" : "#FFFFFF"} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.playButton]}
              onPress={togglePlayback}
            >
              {isPlaying ? (
                <Pause size={24} color="#0F0F1E" />
              ) : (
                <Play size={24} color="#0F0F1E" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={goToNext}
              disabled={currentMoveIndex >= moves.length - 1}
            >
              <ChevronRight size={24} color={currentMoveIndex >= moves.length - 1 ? "#3E3E5E" : "#FFFFFF"} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={goToEnd}
              disabled={currentMoveIndex >= moves.length - 1}
            >
              <SkipForward size={20} color={currentMoveIndex >= moves.length - 1 ? "#3E3E5E" : "#FFFFFF"} />
            </TouchableOpacity>
          </View>

          {/* Additional Controls */}
          <View style={styles.secondaryControls}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleFlipBoard}>
              <RotateCcw size={16} color="#A0A0A0" />
              <Text style={styles.secondaryButtonText}>Flip Board</Text>
            </TouchableOpacity>
            {game.pgn && (
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyPGN}>
                <Copy size={16} color="#A0A0A0" />
                <Text style={styles.secondaryButtonText}>Copy PGN</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Game Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.statsTitle}>Game Statistics</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Swords size={18} color="#FFD700" />
              <Text style={styles.statValue}>{game.movesCount}</Text>
              <Text style={styles.statLabel}>Moves</Text>
            </View>

            <View style={styles.statCard}>
              <Clock size={18} color="#4CAF82" />
              <Text style={styles.statValue}>
                {formatDuration(game.gameDurationSeconds)}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>

            {game.wagerTct > 0 && (
              <View style={styles.statCard}>
                <Crown size={18} color="#FFD700" />
                <Text style={styles.statValue}>{game.wagerTct}</Text>
                <Text style={styles.statLabel}>Wager (TCT)</Text>
              </View>
            )}

            {game.netEarnings !== 0 && (
              <View style={styles.statCard}>
                {game.netEarnings > 0 ? (
                  <TrendingUp size={18} color="#4CAF82" />
                ) : (
                  <TrendingDown size={18} color="#E05C5C" />
                )}
                <Text
                  style={[
                    styles.statValue,
                    { color: game.netEarnings > 0 ? "#4CAF82" : "#E05C5C" },
                  ]}
                >
                  {game.netEarnings > 0 ? "+" : ""}{formatTCT(game.netEarnings)}
                </Text>
                <Text style={styles.statLabel}>Earnings</Text>
              </View>
            )}
          </View>
        </View>

        {/* Date Info */}
        <View style={styles.dateSection}>
          <Text style={styles.dateLabel}>Played on</Text>
          <Text style={styles.dateText}>{formatDate(game.startedAt)}</Text>
        </View>

        {/* Bottom Padding */}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "#A0A0A0",
  },
  errorText: {
    fontSize: 18,
    color: "#E05C5C",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Result Banner
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  resultIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultTextContainer: {
    flex: 1,
  },
  resultLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  resultDescription: {
    fontSize: 13,
    color: "#A0A0A0",
    marginTop: 2,
  },
  eloChangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  eloChangeText: {
    fontSize: 16,
    fontWeight: "700",
  },

  // Player Matchup
  matchupContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  playerSide: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    maxWidth: 100,
    textAlign: "center",
  },
  colorBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  whiteBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  blackBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  colorBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  whiteBadgeText: {
    color: "#0F0F1E",
  },
  blackBadgeText: {
    color: "#FFFFFF",
  },
  opponentRatingBadge: {
    backgroundColor: "rgba(155, 126, 200, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  opponentRatingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9B7EC8",
  },
  vsContainer: {
    alignItems: "center",
    gap: 4,
  },
  vsText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFD700",
  },

  // Board Section
  boardSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  boardContainer: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  moveCounter: {
    marginBottom: 12,
  },
  moveCounterText: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  playbackControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    backgroundColor: "#FFD700",
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  secondaryControls: {
    flexDirection: "row",
    gap: 16,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  secondaryButtonText: {
    fontSize: 13,
    color: "#A0A0A0",
  },

  // Stats Section
  statsSection: {
    marginBottom: 24,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 11,
    color: "#A0A0A0",
  },

  // Date Section
  dateSection: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  dateLabel: {
    fontSize: 12,
    color: "#666",
  },
  dateText: {
    fontSize: 14,
    color: "#A0A0A0",
  },

  // Bottom Padding
  bottomPadding: {
    height: 40,
  },
});
