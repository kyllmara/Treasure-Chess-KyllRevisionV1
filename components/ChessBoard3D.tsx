/**
 * ChessBoard3D Component
 *
 * A sophisticated 3D chess board using React Native Reanimated for
 * hardware-accelerated animations and 3D transforms.
 *
 * Features:
 * - Isometric/3D perspective view
 * - Smooth piece movement animations
 * - Selection glow and pulse effects
 * - Check/checkmate visual indicators
 * - Multiple theme support
 * - Performance optimized with memoization
 *
 * @module components/ChessBoard3D
 */

import React, { memo, useCallback, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
  cancelAnimation,
  runOnJS,
} from "react-native-reanimated";
import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { LinearGradient } from "expo-linear-gradient";
import { ChessPieceComponent } from "./ChessPieces";
import { useChess3DStore } from "@/lib/chess3d/store";
import { getTheme } from "@/lib/chess3d/themes";
import type { Theme3D, PieceStyle } from "@/lib/chess3d/types";

// ============================================================================
// Types
// ============================================================================

interface ChessPiece {
  type: PieceSymbol;
  color: Color;
}

interface ChessBoard3DProps {
  game: Chess;
  board: (ChessPiece | null)[][];
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  boardSize?: number;
  isFlipped?: boolean;
  isInteractive?: boolean;
  pieceStyle?: PieceStyle;
  onSquarePress?: (square: Square, row: number, col: number) => void;
  animatingMove?: { from: Square; to: Square } | null;
  isCheck?: boolean;
  checkSquare?: Square | null;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DEFAULT_BOARD_SIZE = Math.min(SCREEN_WIDTH - 32, 400);
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// 3D Transform constants
const PERSPECTIVE = 800;
const BOARD_ROTATION_X = -25; // Tilt angle in degrees
const SQUARE_DEPTH = 4; // Depth of 3D squares

// ============================================================================
// Animated Square Component
// ============================================================================

interface AnimatedSquareProps {
  row: number;
  col: number;
  squareSize: number;
  isLight: boolean;
  isSelected: boolean;
  isPossibleMove: boolean;
  isCapture: boolean;
  isLastMoveFrom: boolean;
  isLastMoveTo: boolean;
  isCheck: boolean;
  piece: ChessPiece | null;
  pieceStyle: PieceStyle;
  theme: Theme3D;
  isInteractive: boolean;
  onPress: () => void;
}

const AnimatedSquare = memo(function AnimatedSquare({
  row,
  col,
  squareSize,
  isLight,
  isSelected,
  isPossibleMove,
  isCapture,
  isLastMoveFrom,
  isLastMoveTo,
  isCheck,
  piece,
  pieceStyle,
  theme,
  isInteractive,
  onPress,
}: AnimatedSquareProps) {
  // Shared values for animations
  const selectionGlow = useSharedValue(0);
  const checkPulse = useSharedValue(0);
  const pieceScale = useSharedValue(1);
  const pieceElevation = useSharedValue(0);
  const moveIndicatorScale = useSharedValue(0);

  // Selection glow animation
  useEffect(() => {
    if (isSelected) {
      selectionGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      pieceScale.value = withSpring(1.08);
      pieceElevation.value = withSpring(8);
    } else {
      cancelAnimation(selectionGlow);
      selectionGlow.value = withTiming(0, { duration: 200 });
      pieceScale.value = withSpring(1);
      pieceElevation.value = withSpring(0);
    }
  }, [isSelected]);

  // Check pulse animation
  useEffect(() => {
    if (isCheck) {
      checkPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(checkPulse);
      checkPulse.value = withTiming(0, { duration: 200 });
    }
  }, [isCheck]);

  // Possible move indicator animation
  useEffect(() => {
    if (isPossibleMove || isCapture) {
      moveIndicatorScale.value = withSpring(1, { damping: 12 });
    } else {
      moveIndicatorScale.value = withTiming(0, { duration: 150 });
    }
  }, [isPossibleMove, isCapture]);

  // Animated styles
  const squareAnimatedStyle = useAnimatedStyle(() => {
    const glowOpacity = interpolate(selectionGlow.value, [0, 1], [0, 0.6]);
    const checkOpacity = interpolate(checkPulse.value, [0, 1], [0, 0.7]);

    return {
      shadowColor: isSelected
        ? theme.whitePieceColor
        : isCheck
        ? "#FF0000"
        : "transparent",
      shadowOpacity: isSelected ? glowOpacity : isCheck ? checkOpacity : 0,
      shadowRadius: isSelected ? 15 : isCheck ? 20 : 0,
      shadowOffset: { width: 0, height: 0 },
    };
  });

  const pieceAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pieceScale.value },
      { translateY: -pieceElevation.value },
    ],
  }));

  const moveIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ scale: moveIndicatorScale.value }],
    opacity: moveIndicatorScale.value,
  }));

  // Calculate 3D position offset for isometric effect
  const depthOffset = (7 - row) * SQUARE_DEPTH * 0.5;

  // Determine square background color
  const getBackgroundColor = () => {
    if (isCheck) return "rgba(255, 0, 0, 0.5)";
    if (isSelected) return "rgba(255, 215, 0, 0.5)";
    if (isLastMoveFrom || isLastMoveTo) return "rgba(255, 215, 0, 0.3)";
    return isLight ? theme.lightSquareColor : theme.darkSquareColor;
  };

  return (
    <Pressable
      onPress={isInteractive ? onPress : undefined}
      style={({ pressed }) => [
        styles.squareContainer,
        {
          width: squareSize,
          height: squareSize,
          transform: [{ translateY: depthOffset }],
        },
        pressed && isInteractive && styles.squarePressed,
      ]}
    >
      <Animated.View
        style={[
          styles.square,
          { backgroundColor: getBackgroundColor() },
          squareAnimatedStyle,
        ]}
      >
        {/* 3D depth effect - bottom edge */}
        <View
          style={[
            styles.squareDepthBottom,
            {
              backgroundColor: isLight
                ? darkenColor(theme.lightSquareColor, 0.2)
                : darkenColor(theme.darkSquareColor, 0.2),
              height: SQUARE_DEPTH,
            },
          ]}
        />

        {/* 3D depth effect - right edge */}
        <View
          style={[
            styles.squareDepthRight,
            {
              backgroundColor: isLight
                ? darkenColor(theme.lightSquareColor, 0.15)
                : darkenColor(theme.darkSquareColor, 0.15),
              width: SQUARE_DEPTH,
            },
          ]}
        />

        {/* Possible move indicator */}
        {(isPossibleMove || isCapture) && (
          <Animated.View style={[styles.moveIndicatorContainer, moveIndicatorStyle]}>
            {isCapture ? (
              <View
                style={[
                  styles.captureIndicator,
                  {
                    width: squareSize * 0.9,
                    height: squareSize * 0.9,
                    borderRadius: squareSize * 0.45,
                    borderColor: "rgba(255, 107, 107, 0.8)",
                  },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.moveIndicator,
                  {
                    width: squareSize * 0.35,
                    height: squareSize * 0.35,
                    borderRadius: squareSize * 0.175,
                    backgroundColor: "rgba(0, 0, 0, 0.25)",
                  },
                ]}
              />
            )}
          </Animated.View>
        )}

        {/* Chess piece */}
        {piece && (
          <Animated.View style={[styles.pieceContainer, pieceAnimatedStyle]}>
            <ChessPieceComponent
              type={piece.type}
              color={piece.color}
              size={squareSize * 0.85}
              style={pieceStyle}
            />
            {/* Piece shadow */}
            <View
              style={[
                styles.pieceShadow,
                {
                  width: squareSize * 0.6,
                  height: squareSize * 0.15,
                  borderRadius: squareSize * 0.3,
                  bottom: -squareSize * 0.05,
                },
              ]}
            />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// ============================================================================
// Main ChessBoard3D Component
// ============================================================================

export const ChessBoard3D = memo(function ChessBoard3D({
  game,
  board,
  selectedSquare,
  possibleMoves,
  lastMove,
  boardSize = DEFAULT_BOARD_SIZE,
  isFlipped = false,
  isInteractive = true,
  pieceStyle = "classic",
  onSquarePress,
  animatingMove,
  isCheck = false,
  checkSquare,
}: ChessBoard3DProps) {
  const { themeId, enable3D, effects } = useChess3DStore();
  const theme = useMemo(() => getTheme(themeId), [themeId]);

  const squareSize = boardSize / 8;

  // Calculate check square if in check
  const computedCheckSquare = useMemo(() => {
    if (!isCheck) return null;
    if (checkSquare) return checkSquare;

    // Find the king's position
    const turn = game.turn();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === "k" && piece.color === turn) {
          const file = FILES[c];
          const rank = RANKS[r];
          return `${file}${rank}` as Square;
        }
      }
    }
    return null;
  }, [isCheck, checkSquare, board, game]);

  // Create possible moves set for O(1) lookup
  const possibleMovesSet = useMemo(
    () => new Set(possibleMoves),
    [possibleMoves]
  );

  // Create capture moves set
  const captureMoves = useMemo(() => {
    if (!selectedSquare) return new Set<string>();
    const moves = game.moves({ square: selectedSquare, verbose: true });
    return new Set(
      moves.filter((m) => m.captured).map((m) => m.to)
    );
  }, [selectedSquare, game]);

  // Handle square press
  const handleSquarePress = useCallback(
    (row: number, col: number) => {
      const displayRow = isFlipped ? 7 - row : row;
      const displayCol = isFlipped ? 7 - col : col;
      const file = FILES[displayCol];
      const rank = RANKS[displayRow];
      const square = `${file}${rank}` as Square;

      onSquarePress?.(square, displayRow, displayCol);
    },
    [isFlipped, onSquarePress]
  );

  // Render the board
  const renderBoard = useMemo(() => {
    const rows = [];

    for (let row = 0; row < 8; row++) {
      const cols = [];
      const displayRow = isFlipped ? 7 - row : row;

      for (let col = 0; col < 8; col++) {
        const displayCol = isFlipped ? 7 - col : col;
        const file = FILES[displayCol];
        const rank = RANKS[displayRow];
        const square = `${file}${rank}` as Square;

        const isLight = (displayRow + displayCol) % 2 === 0;
        const piece = board[displayRow][displayCol];
        const isSelected = selectedSquare === square;
        const isPossibleMove = possibleMovesSet.has(square);
        const isCapture = captureMoves.has(square);
        const isLastMoveFrom = lastMove?.from === square;
        const isLastMoveTo = lastMove?.to === square;
        const isCheckSquare = computedCheckSquare === square;

        cols.push(
          <AnimatedSquare
            key={square}
            row={displayRow}
            col={displayCol}
            squareSize={squareSize}
            isLight={isLight}
            isSelected={isSelected}
            isPossibleMove={isPossibleMove}
            isCapture={isCapture}
            isLastMoveFrom={isLastMoveFrom}
            isLastMoveTo={isLastMoveTo}
            isCheck={isCheckSquare}
            piece={piece}
            pieceStyle={pieceStyle}
            theme={theme}
            isInteractive={isInteractive}
            onPress={() => handleSquarePress(row, col)}
          />
        );
      }

      rows.push(
        <View key={`row-${row}`} style={styles.row}>
          {cols}
        </View>
      );
    }

    return rows;
  }, [
    board,
    selectedSquare,
    possibleMovesSet,
    captureMoves,
    lastMove,
    computedCheckSquare,
    isFlipped,
    squareSize,
    pieceStyle,
    theme,
    isInteractive,
    handleSquarePress,
  ]);

  return (
    <View style={[styles.container, { width: boardSize, height: boardSize + 20 }]}>
      {/* Board shadow */}
      <View
        style={[
          styles.boardShadow,
          {
            width: boardSize + 10,
            height: boardSize + 10,
          },
        ]}
      />

      {/* 3D perspective container */}
      <View
        style={[
          styles.perspectiveContainer,
          {
            width: boardSize,
            height: boardSize,
            transform: enable3D
              ? [
                  { perspective: PERSPECTIVE },
                  { rotateX: `${BOARD_ROTATION_X}deg` },
                ]
              : [],
          },
        ]}
      >
        {/* Board border */}
        <LinearGradient
          colors={[
            lightenColor(theme.boardBorderColor, 0.2),
            theme.boardBorderColor,
            darkenColor(theme.boardBorderColor, 0.2),
          ]}
          style={[
            styles.boardBorder,
            {
              padding: theme.boardBorderWidth,
              borderRadius: 4,
            },
          ]}
        >
          {/* Board surface */}
          <View style={styles.boardSurface}>{renderBoard}</View>
        </LinearGradient>
      </View>

      {/* Reflection effect (subtle) */}
      {enable3D && effects.enableReflections && (
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]}
          style={[
            styles.reflection,
            {
              width: boardSize * 0.8,
              height: 30,
              bottom: -35,
            },
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      )}
    </View>
  );
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Darken a color by a percentage
 */
function darkenColor(color: string, amount: number): string {
  if (color.startsWith("rgba")) return color;

  const hex = color.replace("#", "");
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) * (1 - amount));

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * Lighten a color by a percentage
 */
function lightenColor(color: string, amount: number): string {
  if (color.startsWith("rgba")) return color;

  const hex = color.replace("#", "");
  const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 255 * amount);
  const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 255 * amount);
  const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 255 * amount);

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  perspectiveContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  boardShadow: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 8,
    top: 15,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  boardBorder: {
    overflow: "hidden",
  },
  boardSurface: {
    backgroundColor: "#000",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  squareContainer: {
    position: "relative",
  },
  square: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  squarePressed: {
    opacity: 0.8,
  },
  squareDepthBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  squareDepthRight: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
  },
  pieceContainer: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  pieceShadow: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    transform: [{ scaleX: 1.2 }],
  },
  moveIndicatorContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  moveIndicator: {
    // Style applied dynamically
  },
  captureIndicator: {
    borderWidth: 4,
    backgroundColor: "transparent",
  },
  reflection: {
    position: "absolute",
    borderRadius: 100,
    alignSelf: "center",
  },
});

// Set display name for debugging
ChessBoard3D.displayName = "ChessBoard3D";
