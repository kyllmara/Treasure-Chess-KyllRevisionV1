import { create } from "zustand";
import { Chess, Square, Move } from "chess.js";
import { getFEN, getPGN, loadFEN, GameMetadata } from "@/utils/chess";

export type GameMode = "practice" | "matchmaking" | "challenge" | "tournament";
export type GameStatus = "waiting" | "playing" | "paused" | "finished";
export type GameResult = "win" | "loss" | "draw" | null;

export interface Player {
  id: string;
  username: string;
  avatarId: number;
  eloRating: number;
  country: string;
}

export interface GameState {
  // Game instance
  gameId: string | null;
  chess: Chess;
  mode: GameMode;
  status: GameStatus;
  result: GameResult;

  // Players
  playerColor: "w" | "b";
  opponent: Player | null;

  // Wager
  wagerAmount: number;
  isWagerGame: boolean;

  // Timing
  playerTime: number;
  opponentTime: number;
  timeControl: number; // seconds per side
  increment: number; // seconds added per move

  // Board state
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  isPlayerTurn: boolean;

  // History
  moveHistory: Move[];
  capturedByPlayer: Array<{ type: string; color: "w" | "b" }>;
  capturedByOpponent: Array<{ type: string; color: "w" | "b" }>;

  // Actions
  initGame: (config: {
    mode: GameMode;
    playerColor?: "w" | "b";
    opponent?: Player | null;
    wagerAmount?: number;
    timeControl?: number;
    increment?: number;
  }) => void;

  selectSquare: (square: Square | null) => void;
  makeMove: (from: Square, to: Square, promotion?: string) => boolean;
  setOpponentMove: (from: Square, to: Square, promotion?: string) => void;

  updatePlayerTime: (time: number) => void;
  updateOpponentTime: (time: number) => void;

  setStatus: (status: GameStatus) => void;
  setResult: (result: GameResult) => void;

  // FEN/PGN utilities
  exportFEN: () => string;
  importFEN: (fen: string) => boolean;
  exportPGN: (metadata?: GameMetadata) => string;

  resetGame: () => void;
}

const initialTimeControl = 120; // 2 minutes

export const useGameStore = create<GameState>()((set, get) => ({
  gameId: null,
  chess: new Chess(),
  mode: "practice",
  status: "waiting",
  result: null,

  playerColor: "w",
  opponent: null,

  wagerAmount: 0,
  isWagerGame: false,

  playerTime: initialTimeControl,
  opponentTime: initialTimeControl,
  timeControl: initialTimeControl,
  increment: 0,

  selectedSquare: null,
  possibleMoves: [],
  lastMove: null,
  isPlayerTurn: true,

  moveHistory: [],
  capturedByPlayer: [],
  capturedByOpponent: [],

  initGame: (config) => {
    const chess = new Chess();
    const playerColor = config.playerColor || "w";
    const timeControl = config.timeControl || initialTimeControl;

    set({
      gameId: `game_${Date.now()}`,
      chess,
      mode: config.mode,
      status: "playing",
      result: null,
      playerColor,
      opponent: config.opponent || null,
      wagerAmount: config.wagerAmount || 0,
      isWagerGame: (config.wagerAmount || 0) > 0,
      playerTime: timeControl,
      opponentTime: timeControl,
      timeControl,
      increment: config.increment || 0,
      selectedSquare: null,
      possibleMoves: [],
      lastMove: null,
      isPlayerTurn: playerColor === "w",
      moveHistory: [],
      capturedByPlayer: [],
      capturedByOpponent: [],
    });
  },

  selectSquare: (square) => {
    const { chess, playerColor, isPlayerTurn, status } = get();

    if (status !== "playing" || !isPlayerTurn) {
      set({ selectedSquare: null, possibleMoves: [] });
      return;
    }

    if (!square) {
      set({ selectedSquare: null, possibleMoves: [] });
      return;
    }

    const piece = chess.get(square);

    // If clicking on own piece, select it
    if (piece && piece.color === playerColor) {
      const moves = chess.moves({ square, verbose: true });
      set({
        selectedSquare: square,
        possibleMoves: moves.map((m) => m.to as Square),
      });
    } else {
      set({ selectedSquare: null, possibleMoves: [] });
    }
  },

  makeMove: (from, to, promotion = "q") => {
    const { chess, playerColor, capturedByPlayer, capturedByOpponent } = get();

    try {
      const targetPiece = chess.get(to);
      const move = chess.move({ from, to, promotion });

      if (move) {
        // Track captured piece
        let newCapturedByPlayer = [...capturedByPlayer];
        let newCapturedByOpponent = [...capturedByOpponent];

        if (targetPiece) {
          if (move.color === playerColor) {
            newCapturedByPlayer.push({ type: targetPiece.type, color: targetPiece.color });
          } else {
            newCapturedByOpponent.push({ type: targetPiece.type, color: targetPiece.color });
          }
        }

        set((state) => ({
          chess: state.chess, // Same reference, mutated
          selectedSquare: null,
          possibleMoves: [],
          lastMove: { from, to },
          isPlayerTurn: false,
          moveHistory: [...state.moveHistory, move],
          capturedByPlayer: newCapturedByPlayer,
          capturedByOpponent: newCapturedByOpponent,
        }));

        // Check for game end
        if (chess.isGameOver()) {
          let result: GameResult = "draw";
          if (chess.isCheckmate()) {
            result = chess.turn() !== playerColor ? "win" : "loss";
          }
          set({ status: "finished", result });
        }

        return true;
      }
    } catch (e) {
      // Invalid move
    }

    return false;
  },

  setOpponentMove: (from, to, promotion = "q") => {
    const { chess, playerColor, capturedByOpponent } = get();

    try {
      const targetPiece = chess.get(to);
      const move = chess.move({ from, to, promotion });

      if (move) {
        let newCapturedByOpponent = [...capturedByOpponent];
        if (targetPiece) {
          newCapturedByOpponent.push({ type: targetPiece.type, color: targetPiece.color });
        }

        set((state) => ({
          chess: state.chess,
          lastMove: { from, to },
          isPlayerTurn: true,
          moveHistory: [...state.moveHistory, move],
          capturedByOpponent: newCapturedByOpponent,
        }));

        if (chess.isGameOver()) {
          let result: GameResult = "draw";
          if (chess.isCheckmate()) {
            result = chess.turn() !== playerColor ? "win" : "loss";
          }
          set({ status: "finished", result });
        }
      }
    } catch (e) {
      // Invalid move
    }
  },

  updatePlayerTime: (time) => set({ playerTime: time }),
  updateOpponentTime: (time) => set({ opponentTime: time }),

  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result, status: "finished" }),

  exportFEN: () => {
    const { chess } = get();
    return getFEN(chess);
  },

  importFEN: (fen) => {
    const { chess } = get();
    const success = loadFEN(chess, fen);
    if (success) {
      set({
        chess,
        selectedSquare: null,
        possibleMoves: [],
        lastMove: null,
        moveHistory: [],
        capturedByPlayer: [],
        capturedByOpponent: [],
        isPlayerTurn: chess.turn() === get().playerColor,
      });
    }
    return success;
  },

  exportPGN: (metadata) => {
    const { chess, opponent } = get();
    return getPGN(chess, {
      ...metadata,
      white: metadata?.white || "Player",
      black: metadata?.black || opponent?.username || "Opponent",
    });
  },

  resetGame: () => {
    set({
      gameId: null,
      chess: new Chess(),
      status: "waiting",
      result: null,
      selectedSquare: null,
      possibleMoves: [],
      lastMove: null,
      moveHistory: [],
      capturedByPlayer: [],
      capturedByOpponent: [],
    });
  },
}));
