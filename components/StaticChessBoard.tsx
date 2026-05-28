/**
 * StaticChessBoard Component
 *
 * A simplified chess board for displaying static positions.
 * Used for game replay and position display where no interaction is needed.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Chess, Square, PieceSymbol, Color } from "chess.js";
import { ChessPieceComponent } from "./ChessPieces";
import type { BoardTheme, PieceStyle } from "@/types";

// ============================================================================
// Types
// ============================================================================

export interface StaticChessBoardProps {
  fen: string;
  size?: number;
  flipped?: boolean;
  boardTheme?: BoardTheme;
  pieceStyle?: PieceStyle;
  showCoordinates?: boolean;
  lastMove?: { from: Square; to: Square } | null;
}

interface ChessPiece {
  type: PieceSymbol;
  color: Color;
}

// ============================================================================
// Constants
// ============================================================================

const { width } = Dimensions.get("window");
const DEFAULT_BOARD_SIZE = Math.min(width - 32, 360);

const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#F0D9B5", dark: "#B58863" },
  eco: { light: "#EEEED2", dark: "#769656" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// ============================================================================
// Main Component
// ============================================================================

export function StaticChessBoard({
  fen,
  size = DEFAULT_BOARD_SIZE,
  flipped = false,
  boardTheme = "purple",
  pieceStyle = "unity",
  showCoordinates = false,
  lastMove = null,
}: StaticChessBoardProps) {
  const squareSize = size / 8;
  const pieceSize = squareSize * 0.85;
  const themeColors = BOARD_THEMES[boardTheme];

  // Parse FEN to get board state
  const board = useMemo(() => {
    try {
      const chess = new Chess(fen);
      return chess.board();
    } catch (error) {
      console.error("Invalid FEN:", error);
      return new Chess().board();
    }
  }, [fen]);

  // Check if king is in check
  const kingInCheck = useMemo(() => {
    try {
      const chess = new Chess(fen);
      if (!chess.isCheck()) return null;

      const turn = chess.turn();
      const boardState = chess.board();
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = boardState[row][col];
          if (piece && piece.type === "k" && piece.color === turn) {
            return (FILES[col] + RANKS[row]) as Square;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }, [fen]);

  // Render the board
  const rows = useMemo(() => {
    const result = [];

    for (let displayRow = 0; displayRow < 8; displayRow++) {
      const row = flipped ? 7 - displayRow : displayRow;
      const cols = [];

      for (let displayCol = 0; displayCol < 8; displayCol++) {
        const col = flipped ? 7 - displayCol : displayCol;
        const square = (FILES[col] + RANKS[row]) as Square;
        const isLight = (row + col) % 2 === 0;
        const piece = board[row][col];

        // Check if this square was part of the last move
        const isLastMoveSquare =
          lastMove &&
          (square === lastMove.from || square === lastMove.to);

        // Check if this square has the checked king
        const isCheckSquare = kingInCheck === square;

        cols.push(
          <View
            key={`${row}-${col}`}
            style={[
              styles.square,
              {
                width: squareSize,
                height: squareSize,
                backgroundColor: isLight ? themeColors.light : themeColors.dark,
              },
              isLastMoveSquare && styles.lastMoveSquare,
              isCheckSquare && styles.checkSquare,
            ]}
          >
            {piece && (
              <View style={styles.pieceContainer}>
                <ChessPieceComponent
                  type={piece.type}
                  color={piece.color}
                  size={pieceSize}
                  style={pieceStyle}
                />
              </View>
            )}

            {/* Coordinates */}
            {showCoordinates && displayCol === 0 && (
              <Text
                style={[
                  styles.rankLabel,
                  { color: isLight ? themeColors.dark : themeColors.light },
                ]}
              >
                {RANKS[row]}
              </Text>
            )}
            {showCoordinates && displayRow === 7 && (
              <Text
                style={[
                  styles.fileLabel,
                  { color: isLight ? themeColors.dark : themeColors.light },
                ]}
              >
                {FILES[col]}
              </Text>
            )}
          </View>
        );
      }

      result.push(
        <View key={`row-${row}`} style={styles.row}>
          {cols}
        </View>
      );
    }

    return result;
  }, [board, flipped, squareSize, pieceSize, themeColors, pieceStyle, showCoordinates, lastMove, kingInCheck]);

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size },
      ]}
    >
      {rows}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  pieceContainer: {
    position: "absolute",
  },
  lastMoveSquare: {
    backgroundColor: "rgba(255, 215, 0, 0.4)",
  },
  checkSquare: {
    backgroundColor: "rgba(255, 0, 0, 0.4)",
  },
  rankLabel: {
    position: "absolute",
    top: 2,
    left: 4,
    fontSize: 10,
    fontWeight: "600",
    opacity: 0.7,
  },
  fileLabel: {
    position: "absolute",
    bottom: 2,
    right: 4,
    fontSize: 10,
    fontWeight: "600",
    opacity: 0.7,
  },
});

export default StaticChessBoard;
