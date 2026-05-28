import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Chess, Square, Move, Color } from "chess.js";
import { chessAI, Difficulty } from "@/lib/chessAI";

export interface PracticeGameState {
  // Game instance
  chess: Chess;
  fen: string;
  playerColor: Color;
  difficulty: Difficulty;

  // Game state
  isPlayerTurn: boolean;
  isAIThinking: boolean;
  isGameOver: boolean;
  gameResult: string | null;

  // UI state
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  hintMove: { from: Square; to: Square } | null;

  // History for undo/redo
  moveHistory: Move[];
  positionHistory: string[];
  currentPositionIndex: number;

  // Actions
  initGame: (playerColor: Color, difficulty: Difficulty) => void;
  selectSquare: (square: Square | null) => void;
  makeMove: (from: Square, to: Square, promotion?: string) => Promise<boolean>;
  makeAIMove: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  showHint: () => Promise<void>;
  hideHint: () => void;
  setDifficulty: (difficulty: Difficulty) => void;
  resetGame: () => void;
  resign: () => void;
}

const initialFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const usePracticeStore = create<PracticeGameState>()(
  persist(
    (set, get) => ({
      chess: new Chess(),
      fen: initialFEN,
      playerColor: "w",
      difficulty: "medium",

      isPlayerTurn: true,
      isAIThinking: false,
      isGameOver: false,
      gameResult: null,

      selectedSquare: null,
      possibleMoves: [],
      lastMove: null,
      hintMove: null,

      moveHistory: [],
      positionHistory: [initialFEN],
      currentPositionIndex: 0,

      initGame: (playerColor, difficulty) => {
        const chess = new Chess();
        set({
          chess,
          fen: chess.fen(),
          playerColor,
          difficulty,
          isPlayerTurn: playerColor === "w",
          isAIThinking: false,
          isGameOver: false,
          gameResult: null,
          selectedSquare: null,
          possibleMoves: [],
          lastMove: null,
          hintMove: null,
          moveHistory: [],
          positionHistory: [chess.fen()],
          currentPositionIndex: 0,
        });

        // If player is black, AI moves first
        if (playerColor === "b") {
          setTimeout(() => get().makeAIMove(), 500);
        }
      },

      selectSquare: (square) => {
        const { chess, playerColor, isPlayerTurn, isGameOver, isAIThinking } =
          get();

        if (isGameOver || isAIThinking || !isPlayerTurn) {
          set({ selectedSquare: null, possibleMoves: [] });
          return;
        }

        if (!square) {
          set({ selectedSquare: null, possibleMoves: [] });
          return;
        }

        const piece = chess.get(square);

        if (piece && piece.color === playerColor) {
          const moves = chess.moves({ square, verbose: true });
          set({
            selectedSquare: square,
            possibleMoves: moves.map((m) => m.to as Square),
            hintMove: null,
          });
        } else {
          set({ selectedSquare: null, possibleMoves: [] });
        }
      },

      makeMove: async (from, to, promotion = "q") => {
        const {
          chess,
          playerColor,
          positionHistory,
          currentPositionIndex,
          moveHistory,
        } = get();

        try {
          const move = chess.move({ from, to, promotion });

          if (move) {
            // Truncate future history if we're not at the end
            const newPositionHistory = positionHistory.slice(
              0,
              currentPositionIndex + 1
            );
            const newMoveHistory = moveHistory.slice(
              0,
              currentPositionIndex
            );

            newPositionHistory.push(chess.fen());
            newMoveHistory.push(move);

            let gameResult: string | null = null;
            let isGameOver = false;

            if (chess.isCheckmate()) {
              isGameOver = true;
              gameResult =
                chess.turn() === playerColor
                  ? "You lost by checkmate"
                  : "You won by checkmate!";
            } else if (chess.isDraw()) {
              isGameOver = true;
              if (chess.isStalemate()) {
                gameResult = "Draw by stalemate";
              } else if (chess.isThreefoldRepetition()) {
                gameResult = "Draw by threefold repetition";
              } else if (chess.isInsufficientMaterial()) {
                gameResult = "Draw by insufficient material";
              } else {
                gameResult = "Draw";
              }
            }

            set({
              chess,
              fen: chess.fen(),
              selectedSquare: null,
              possibleMoves: [],
              lastMove: { from, to },
              hintMove: null,
              isPlayerTurn: false,
              isGameOver,
              gameResult,
              positionHistory: newPositionHistory,
              moveHistory: newMoveHistory,
              currentPositionIndex: newPositionHistory.length - 1,
            });

            // Trigger AI move if game is not over
            if (!isGameOver) {
              setTimeout(() => get().makeAIMove(), 300);
            }

            return true;
          }
        } catch (e) {
          console.log("Invalid move:", e);
        }

        return false;
      },

      makeAIMove: async () => {
        const {
          chess,
          playerColor,
          difficulty,
          isGameOver,
          positionHistory,
          currentPositionIndex,
          moveHistory,
        } = get();

        if (isGameOver) return;

        set({ isAIThinking: true });

        try {
          const aiMove = await chessAI.getBestMove(chess.fen(), difficulty);

          if (aiMove) {
            chess.move(aiMove);

            const newPositionHistory = [...positionHistory, chess.fen()];
            const newMoveHistory = [...moveHistory, aiMove];

            let gameResult: string | null = null;
            let isGameOverNow = false;

            if (chess.isCheckmate()) {
              isGameOverNow = true;
              gameResult =
                chess.turn() === playerColor
                  ? "You lost by checkmate"
                  : "You won by checkmate!";
            } else if (chess.isDraw()) {
              isGameOverNow = true;
              if (chess.isStalemate()) {
                gameResult = "Draw by stalemate";
              } else if (chess.isThreefoldRepetition()) {
                gameResult = "Draw by threefold repetition";
              } else if (chess.isInsufficientMaterial()) {
                gameResult = "Draw by insufficient material";
              } else {
                gameResult = "Draw";
              }
            }

            set({
              chess,
              fen: chess.fen(),
              lastMove: { from: aiMove.from, to: aiMove.to },
              isPlayerTurn: true,
              isAIThinking: false,
              isGameOver: isGameOverNow,
              gameResult,
              positionHistory: newPositionHistory,
              moveHistory: newMoveHistory,
              currentPositionIndex: newPositionHistory.length - 1,
            });
          } else {
            set({ isAIThinking: false });
          }
        } catch (e) {
          console.error("AI move error:", e);
          set({ isAIThinking: false });
        }
      },

      undo: () => {
        const { currentPositionIndex, positionHistory, playerColor } = get();

        // Need to undo both player and AI move
        const newIndex = Math.max(0, currentPositionIndex - 2);

        if (newIndex !== currentPositionIndex) {
          const chess = new Chess(positionHistory[newIndex]);
          set({
            chess,
            fen: positionHistory[newIndex],
            currentPositionIndex: newIndex,
            selectedSquare: null,
            possibleMoves: [],
            lastMove: null,
            hintMove: null,
            isPlayerTurn: chess.turn() === playerColor,
            isGameOver: false,
            gameResult: null,
          });
        }
      },

      redo: () => {
        const { currentPositionIndex, positionHistory, playerColor } = get();

        // Redo both moves
        const newIndex = Math.min(
          positionHistory.length - 1,
          currentPositionIndex + 2
        );

        if (newIndex !== currentPositionIndex) {
          const chess = new Chess(positionHistory[newIndex]);
          set({
            chess,
            fen: positionHistory[newIndex],
            currentPositionIndex: newIndex,
            isPlayerTurn: chess.turn() === playerColor,
          });
        }
      },

      canUndo: () => {
        const { currentPositionIndex, isAIThinking } = get();
        return currentPositionIndex >= 2 && !isAIThinking;
      },

      canRedo: () => {
        const { currentPositionIndex, positionHistory, isAIThinking } = get();
        return currentPositionIndex < positionHistory.length - 1 && !isAIThinking;
      },

      showHint: async () => {
        const { chess, isAIThinking, isGameOver, isPlayerTurn } = get();

        if (isAIThinking || isGameOver || !isPlayerTurn) return;

        const hintMoveResult = await chessAI.getHint(chess.fen());
        if (hintMoveResult) {
          set({
            hintMove: { from: hintMoveResult.from, to: hintMoveResult.to },
          });
        }
      },

      hideHint: () => {
        set({ hintMove: null });
      },

      setDifficulty: (difficulty) => {
        set({ difficulty });
      },

      resetGame: () => {
        const { playerColor, difficulty } = get();
        get().initGame(playerColor, difficulty);
      },

      resign: () => {
        set({
          isGameOver: true,
          gameResult: "You resigned",
          isAIThinking: false,
          selectedSquare: null,
          possibleMoves: [],
          hintMove: null,
        });
      },
    }),
    {
      name: "practice-game-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        fen: state.fen,
        playerColor: state.playerColor,
        difficulty: state.difficulty,
        moveHistory: state.moveHistory,
        positionHistory: state.positionHistory,
        currentPositionIndex: state.currentPositionIndex,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.fen) {
          // Recreate Chess instance from saved FEN
          state.chess = new Chess(state.fen);
          state.isPlayerTurn = state.chess.turn() === state.playerColor;
          // Reset game state flags that aren't persisted
          state.isGameOver = state.chess.isGameOver();
          state.isAIThinking = false;
          state.selectedSquare = null;
          state.possibleMoves = [];
          state.hintMove = null;
          // Set game result if game is actually over
          if (state.isGameOver) {
            if (state.chess.isCheckmate()) {
              state.gameResult = state.chess.turn() === state.playerColor
                ? "You lost by checkmate"
                : "You won by checkmate!";
            } else if (state.chess.isDraw()) {
              state.gameResult = "Draw";
            } else {
              state.gameResult = "Game over";
            }
          } else {
            state.gameResult = null;
          }
        }
      },
    }
  )
);
