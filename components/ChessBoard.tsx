import React, { useCallback, useMemo, useRef, useEffect, memo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { Chess, Square, Move, PieceSymbol, Color } from "chess.js";
import { ChessPieceComponent } from "./ChessPieces";
import type { BoardTheme, PieceStyle } from "@/types";

const { width } = Dimensions.get("window");
const DEFAULT_BOARD_SIZE = Math.min(width - 40, 360);

export interface ChessPiece {
  type: PieceSymbol;
  color: Color;
}

export interface ChessBoardProps {
  game: Chess;
  board: (ChessPiece | null)[][];
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  boardSize?: number;
  isFlipped?: boolean;
  isInteractive?: boolean;
  onSquarePress?: (square: Square, row: number, col: number) => void;
  animatingMove?: { from: Square; to: Square } | null;
}

const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  purple: { light: "#FFFFFF", dark: "#9B7EC8" },
  classic: { light: "#F0D9B5", dark: "#B58863" },
  eco: { light: "#EEEED2", dark: "#769656" },
  retro: { light: "#E8D7B8", dark: "#A67C52" },
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// Memoized square component to prevent unnecessary re-renders
interface BoardSquareProps {
  displayRow: number;
  displayCol: number;
  squareSize: number;
  pieceSize: number;
  themeColors: { light: string; dark: string };
  piece: ChessPiece | null;
  pieceStyle: PieceStyle;
  isLight: boolean;
  isSelected: boolean;
  isLastMove: boolean;
  isPossibleMove: boolean;
  isInCheck: boolean;
  isInteractive: boolean;
  onPress: () => void;
}

const BoardSquare = memo(({
  displayRow,
  displayCol,
  squareSize,
  pieceSize,
  themeColors,
  piece,
  pieceStyle,
  isLight,
  isSelected,
  isLastMove,
  isPossibleMove,
  isInCheck,
  isInteractive,
  onPress,
}: BoardSquareProps) => {
  const hasPiece = piece !== null;

  return (
    <TouchableOpacity
      style={[
        styles.square,
        {
          width: squareSize,
          height: squareSize,
          backgroundColor: isLight ? themeColors.light : themeColors.dark,
        },
        isSelected && styles.selectedSquare,
        isLastMove && styles.lastMoveSquare,
        isInCheck && styles.checkSquare,
      ]}
      onPress={onPress}
      activeOpacity={isInteractive ? 0.7 : 1}
      disabled={!isInteractive}
    >
      {/* Possible move indicator */}
      {isPossibleMove && (
        <View
          style={[
            styles.possibleMoveIndicator,
            hasPiece ? styles.captureIndicator : styles.moveIndicator,
            {
              width: hasPiece ? squareSize - 4 : squareSize * 0.35,
              height: hasPiece ? squareSize - 4 : squareSize * 0.35,
            }
          ]}
        />
      )}

      {/* Chess piece */}
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
    </TouchableOpacity>
  );
});

BoardSquare.displayName = 'BoardSquare';

function ChessBoardInner({
  game,
  board,
  selectedSquare,
  possibleMoves,
  lastMove,
  boardTheme,
  pieceStyle,
  boardSize = DEFAULT_BOARD_SIZE,
  isFlipped = false,
  isInteractive = true,
  onSquarePress,
  animatingMove,
}: ChessBoardProps) {
  const squareSize = boardSize / 8;
  const pieceSize = squareSize * 0.85;
  const themeColors = BOARD_THEMES[boardTheme];

  // Animation values for piece movement
  const animX = useRef(new Animated.Value(0)).current;
  const animY = useRef(new Animated.Value(0)).current;

  // Check if king is in check
  const kingInCheck = useMemo(() => {
    if (!game.inCheck()) return null;

    const turn = game.turn();
    // Find the king's position
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece && piece.type === "k" && piece.color === turn) {
          const square = (FILES[col] + RANKS[row]) as Square;
          return square;
        }
      }
    }
    return null;
  }, [game, board]);

  // Get display indices based on board flip
  const getDisplayIndices = useCallback((row: number, col: number) => {
    if (isFlipped) {
      return { displayRow: 7 - row, displayCol: 7 - col };
    }
    return { displayRow: row, displayCol: col };
  }, [isFlipped]);

  // Convert display indices to board indices
  const getBoardIndices = useCallback((displayRow: number, displayCol: number) => {
    if (isFlipped) {
      return { row: 7 - displayRow, col: 7 - displayCol };
    }
    return { row: displayRow, col: displayCol };
  }, [isFlipped]);

  const handleSquarePress = useCallback((displayRow: number, displayCol: number) => {
    if (!isInteractive || !onSquarePress) return;

    const { row, col } = getBoardIndices(displayRow, displayCol);
    const square = (FILES[col] + RANKS[row]) as Square;
    onSquarePress(square, row, col);
  }, [isInteractive, onSquarePress, getBoardIndices]);

  const isSquareHighlighted = useCallback((square: Square, type: "selected" | "lastMove" | "possibleMove" | "check") => {
    switch (type) {
      case "selected":
        return selectedSquare === square;
      case "lastMove":
        return lastMove ? (lastMove.from === square || lastMove.to === square) : false;
      case "possibleMove":
        return possibleMoves.includes(square);
      case "check":
        return kingInCheck === square;
      default:
        return false;
    }
  }, [selectedSquare, lastMove, possibleMoves, kingInCheck]);

  // Create memoized press handlers for each square
  const handleSquarePressCallbacks = useMemo(() => {
    const callbacks: (() => void)[][] = [];
    for (let displayRow = 0; displayRow < 8; displayRow++) {
      callbacks[displayRow] = [];
      for (let displayCol = 0; displayCol < 8; displayCol++) {
        callbacks[displayRow][displayCol] = () => handleSquarePress(displayRow, displayCol);
      }
    }
    return callbacks;
  }, [handleSquarePress]);

  // Memoized board rendering with optimized square updates
  const boardRows = useMemo(() => {
    const rows = [];

    for (let displayRow = 0; displayRow < 8; displayRow++) {
      const squares = [];

      for (let displayCol = 0; displayCol < 8; displayCol++) {
        const { row, col } = getBoardIndices(displayRow, displayCol);
        const square = (FILES[col] + RANKS[row]) as Square;
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;

        const isSelected = isSquareHighlighted(square, "selected");
        const isLastMove = isSquareHighlighted(square, "lastMove");
        const isPossibleMove = isSquareHighlighted(square, "possibleMove");
        const isInCheck = isSquareHighlighted(square, "check");

        squares.push(
          <BoardSquare
            key={`${displayRow}-${displayCol}`}
            displayRow={displayRow}
            displayCol={displayCol}
            squareSize={squareSize}
            pieceSize={pieceSize}
            themeColors={themeColors}
            piece={piece}
            pieceStyle={pieceStyle}
            isLight={isLight}
            isSelected={isSelected}
            isLastMove={isLastMove}
            isPossibleMove={isPossibleMove}
            isInCheck={isInCheck}
            isInteractive={isInteractive}
            onPress={handleSquarePressCallbacks[displayRow][displayCol]}
          />
        );
      }

      rows.push(
        <View key={displayRow} style={styles.row}>
          {squares}
        </View>
      );
    }

    return rows;
  }, [
    board,
    squareSize,
    pieceSize,
    themeColors,
    pieceStyle,
    isInteractive,
    getBoardIndices,
    isSquareHighlighted,
    handleSquarePressCallbacks,
  ]);

  return (
    <View style={[styles.board, { width: boardSize, height: boardSize }]}>
      {boardRows}
    </View>
  );
}

// Memoized ChessBoard export
export const ChessBoard = memo(ChessBoardInner);

ChessBoard.displayName = 'ChessBoard';

const styles = StyleSheet.create({
  board: {
    alignSelf: "center",
    borderRadius: 4,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
  },
  selectedSquare: {
    backgroundColor: "rgba(255, 255, 0, 0.5)",
  },
  lastMoveSquare: {
    backgroundColor: "rgba(255, 255, 0, 0.3)",
  },
  checkSquare: {
    backgroundColor: "rgba(255, 0, 0, 0.5)",
  },
  possibleMoveIndicator: {
    position: "absolute",
    borderRadius: 100,
  },
  moveIndicator: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  captureIndicator: {
    backgroundColor: "transparent",
    borderWidth: 3,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  pieceContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ChessBoard;
