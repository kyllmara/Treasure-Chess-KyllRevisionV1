/**
 * UnityChessBoard Component
 *
 * Wrapper component for Unity-powered 3D chess board.
 * Provides seamless integration between React Native and Unity game engine.
 *
 * When Unity is not available, automatically falls back to the native
 * React Native 3D implementation (ChessBoard3D).
 *
 * @module components/UnityChessBoard
 */

import React, { memo, useEffect, useRef, useCallback, useState } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { ChessBoard3D } from "./ChessBoard3D";
import {
  UnityBridge,
  getUnityBridge,
  useUnityBridge,
} from "@/lib/chess3d/unityBridge";
import { useChess3DStore } from "@/lib/chess3d/store";
import type { ChessBoard3DConfig, PieceStyle } from "@/lib/chess3d/types";

// ============================================================================
// Types
// ============================================================================

interface ChessPiece {
  type: PieceSymbol;
  color: Color;
}

interface UnityChessBoardProps {
  // Game state
  game: Chess;
  board: (ChessPiece | null)[][];
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;

  // Options
  boardSize?: number;
  isFlipped?: boolean;
  isInteractive?: boolean;
  pieceStyle?: PieceStyle;

  // Callbacks
  onSquarePress?: (square: Square, row: number, col: number) => void;
  onMoveAnimationComplete?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;

  // Animation
  animatingMove?: { from: Square; to: Square } | null;
  isCheck?: boolean;
  checkSquare?: Square | null;
}

type LoadingState = "loading" | "ready" | "fallback" | "error";

// ============================================================================
// Unity View Component (Placeholder)
// ============================================================================

/**
 * Placeholder for the actual Unity view component.
 * In a real implementation, this would import from @azesmway/react-native-unity
 * or similar Unity integration package.
 */
const UnityView = memo(function UnityView({
  style,
  onUnityMessage,
}: {
  style?: object;
  onUnityMessage?: (message: string) => void;
}) {
  // This is a placeholder - actual Unity view would be imported from native module
  return (
    <View style={[styles.unityPlaceholder, style]}>
      <Text style={styles.unityPlaceholderText}>
        Unity View Not Available
      </Text>
      <Text style={styles.unityPlaceholderSubtext}>
        Install react-native-unity to enable Unity rendering
      </Text>
    </View>
  );
});

// ============================================================================
// UnityChessBoard Component
// ============================================================================

export const UnityChessBoard = memo(function UnityChessBoard({
  game,
  board,
  selectedSquare,
  possibleMoves,
  lastMove,
  boardSize,
  isFlipped = false,
  isInteractive = true,
  pieceStyle = "classic",
  onSquarePress,
  onMoveAnimationComplete,
  onReady,
  onError,
  animatingMove,
  isCheck,
  checkSquare,
}: UnityChessBoardProps) {
  const { enable3D, enableUnity, config } = useChess3DStore();
  const unityBridge = useUnityBridge();
  const unityViewRef = useRef<any>(null);

  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if we should use Unity or fall back to native 3D
  const shouldUseUnity = enableUnity && unityBridge !== null;

  // ==========================================================================
  // Unity Initialization
  // ==========================================================================

  useEffect(() => {
    async function initUnity() {
      if (!shouldUseUnity) {
        // Fall back to native 3D rendering
        setLoadingState("fallback");
        onReady?.();
        return;
      }

      try {
        setLoadingState("loading");

        if (unityBridge && unityViewRef.current) {
          const connected = await unityBridge.connect(unityViewRef.current);

          if (connected) {
            // Configure Unity with current settings
            unityBridge.setConfig(config);
            setLoadingState("ready");
            onReady?.();
          } else {
            throw new Error("Failed to connect to Unity");
          }
        } else {
          // Unity not available, use fallback
          setLoadingState("fallback");
          onReady?.();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setErrorMessage(err.message);
        setLoadingState("error");
        onError?.(err);

        // Fall back to native rendering after error
        setTimeout(() => {
          setLoadingState("fallback");
        }, 2000);
      }
    }

    initUnity();

    return () => {
      // Cleanup Unity connection
      if (unityBridge) {
        unityBridge.disconnect();
      }
    };
  }, [shouldUseUnity, unityBridge, config, onReady, onError]);

  // ==========================================================================
  // Unity Event Handlers
  // ==========================================================================

  useEffect(() => {
    if (!unityBridge || loadingState !== "ready") return;

    // Listen for square press events from Unity
    const unsubSquare = unityBridge.addEventListener("SQUARE_PRESSED", (event) => {
      const { square, row, col } = event.payload as {
        square: Square;
        row: number;
        col: number;
      };
      onSquarePress?.(square, row, col);
    });

    // Listen for animation complete events
    const unsubAnim = unityBridge.addEventListener("ANIMATION_COMPLETE", () => {
      onMoveAnimationComplete?.();
    });

    // Listen for errors
    const unsubError = unityBridge.addEventListener("ERROR", (event) => {
      const { message } = event.payload as { message: string };
      onError?.(new Error(message));
    });

    return () => {
      unsubSquare();
      unsubAnim();
      unsubError();
    };
  }, [unityBridge, loadingState, onSquarePress, onMoveAnimationComplete, onError]);

  // ==========================================================================
  // Sync State to Unity
  // ==========================================================================

  // Sync board position
  useEffect(() => {
    if (unityBridge && loadingState === "ready") {
      unityBridge.setPosition(game.fen());
    }
  }, [unityBridge, loadingState, game]);

  // Sync selection
  useEffect(() => {
    if (unityBridge && loadingState === "ready") {
      if (selectedSquare) {
        unityBridge.selectSquare(selectedSquare);
      } else {
        unityBridge.deselect();
      }
    }
  }, [unityBridge, loadingState, selectedSquare]);

  // Sync possible moves
  useEffect(() => {
    if (unityBridge && loadingState === "ready") {
      const captures = possibleMoves.filter((move) => {
        const moves = game.moves({ square: selectedSquare!, verbose: true });
        return moves.some((m) => m.to === move && m.captured);
      });
      unityBridge.setPossibleMoves(possibleMoves, captures);
    }
  }, [unityBridge, loadingState, possibleMoves, selectedSquare, game]);

  // Sync last move highlight
  useEffect(() => {
    if (unityBridge && loadingState === "ready" && lastMove) {
      unityBridge.highlightLastMove(lastMove.from, lastMove.to);
    }
  }, [unityBridge, loadingState, lastMove]);

  // Sync check state
  useEffect(() => {
    if (unityBridge && loadingState === "ready") {
      unityBridge.setCheck(checkSquare || null);
    }
  }, [unityBridge, loadingState, checkSquare]);

  // Handle animating move
  useEffect(() => {
    if (unityBridge && loadingState === "ready" && animatingMove) {
      unityBridge.makeMove(animatingMove.from, animatingMove.to);
    }
  }, [unityBridge, loadingState, animatingMove]);

  // Handle Unity messages
  const handleUnityMessage = useCallback(
    (message: string) => {
      if (unityBridge) {
        unityBridge.handleUnityEvent(message);
      }
    },
    [unityBridge]
  );

  // ==========================================================================
  // Render
  // ==========================================================================

  // Loading state
  if (loadingState === "loading") {
    return (
      <View style={[styles.container, { width: boardSize, height: boardSize }]}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={styles.loadingText}>Loading 3D Board...</Text>
      </View>
    );
  }

  // Error state (brief display before fallback)
  if (loadingState === "error") {
    return (
      <View style={[styles.container, { width: boardSize, height: boardSize }]}>
        <Text style={styles.errorText}>Unity Error</Text>
        <Text style={styles.errorSubtext}>{errorMessage}</Text>
        <Text style={styles.fallbackText}>Falling back to native rendering...</Text>
      </View>
    );
  }

  // Fallback to native 3D rendering
  if (loadingState === "fallback" || !shouldUseUnity) {
    return (
      <ChessBoard3D
        game={game}
        board={board}
        selectedSquare={selectedSquare}
        possibleMoves={possibleMoves}
        lastMove={lastMove}
        boardSize={boardSize}
        isFlipped={isFlipped}
        isInteractive={isInteractive}
        pieceStyle={pieceStyle}
        onSquarePress={onSquarePress}
        animatingMove={animatingMove}
        isCheck={isCheck}
        checkSquare={checkSquare}
      />
    );
  }

  // Unity rendering
  return (
    <View style={[styles.container, { width: boardSize, height: boardSize }]}>
      <UnityView
        ref={unityViewRef}
        style={styles.unityView}
        onUnityMessage={handleUnityMessage}
      />
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 15, 30, 0.5)",
    borderRadius: 8,
  },
  unityView: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  unityPlaceholder: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A2E",
    borderRadius: 8,
  },
  unityPlaceholderText: {
    color: "#FFD700",
    fontSize: 16,
    fontWeight: "600",
  },
  unityPlaceholderSubtext: {
    color: "#888",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  loadingText: {
    color: "#FFD700",
    fontSize: 14,
    marginTop: 16,
  },
  errorText: {
    color: "#E05C5C",
    fontSize: 16,
    fontWeight: "600",
  },
  errorSubtext: {
    color: "#888",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  fallbackText: {
    color: "#4CAF82",
    fontSize: 12,
    marginTop: 16,
  },
});

// Set display name
UnityChessBoard.displayName = "UnityChessBoard";

export default UnityChessBoard;
