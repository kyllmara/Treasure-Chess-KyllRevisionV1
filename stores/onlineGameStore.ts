/**
 * Online Game Store
 *
 * Zustand store for managing online multiplayer chess games
 * with Supabase Realtime integration.
 *
 * Features:
 * - Real-time move synchronization
 * - Timer management with server sync
 * - Draw offer/accept flow
 * - Resign handling
 * - Connection state management
 * - Automatic reconnection with state recovery
 */

import { create } from "zustand";
import { Chess, Square, Move, Color } from "chess.js";
import { supabase } from "@/lib/supabase";
import {
  GameChannel,
  createGameChannel,
  ConnectionState,
  MovePayload,
  ResignPayload,
  DrawOfferPayload,
  DrawResponsePayload,
  TimeSyncPayload,
  GameEndPayload,
} from "@/lib/realtime";
import {
  GameSessionService,
  createGameSession,
} from "@/lib/gameSession";
import type { Game } from "@/types/supabase";

// ============================================================================
// Types
// ============================================================================

export type OnlineGameStatus =
  | "idle"
  | "connecting"
  | "waiting_for_opponent"
  | "playing"
  | "paused"
  | "finished";

export type GameResult = "win" | "loss" | "draw" | null;
export type EndReason =
  | "checkmate"
  | "timeout"
  | "resign"
  | "draw_agreement"
  | "stalemate"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_moves"
  | "abandon"
  | null;

export interface Opponent {
  id: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
  isOnline: boolean;
}

export interface OnlineGameState {
  // Game identity
  gameId: string | null;
  gameDbRecord: Game | null;

  // Chess instance
  chess: Chess;
  fen: string;

  // Players
  playerId: string | null;
  playerColor: Color | null;
  opponent: Opponent | null;

  // Game status
  status: OnlineGameStatus;
  result: GameResult;
  endReason: EndReason;

  // Board state
  selectedSquare: Square | null;
  possibleMoves: Square[];
  lastMove: { from: Square; to: Square } | null;
  isPlayerTurn: boolean;

  // Timing
  whiteTimeMs: number;
  blackTimeMs: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  lastMoveTimestamp: number | null;

  // Move history
  moveHistory: Move[];
  moveCount: number;

  // Wager
  wagerTct: number;

  // Draw offer state
  hasIncomingDrawOffer: boolean;
  hasSentDrawOffer: boolean;
  drawOfferFromId: string | null;

  // Connection
  connectionState: ConnectionState;
  connectionError: Error | null;

  // Channel reference (internal)
  _channel: GameChannel | null;

  // Game session service (internal)
  _sessionService: GameSessionService | null;

  // ELO change data (populated after game ends)
  eloChange: {
    before: number;
    after: number;
    change: number;
  } | null;

  // =========================================================================
  // Actions
  // =========================================================================

  // Initialization
  initGame: (config: {
    gameId: string;
    playerId: string;
    playerName: string;
    playerColor: Color;
    opponent: Opponent;
    timeControlSeconds: number;
    incrementSeconds: number;
    wagerTct?: number;
    initialFen?: string;
  }) => Promise<void>;

  // Board interaction
  selectSquare: (square: Square | null) => void;
  makeMove: (from: Square, to: Square, promotion?: string) => Promise<boolean>;

  // Timer updates (called from useGameTimer)
  updateTimers: (whiteMs: number, blackMs: number) => void;
  handleTimeout: (color: Color) => Promise<void>;

  // Draw offer
  offerDraw: () => Promise<boolean>;
  acceptDraw: () => Promise<boolean>;
  declineDraw: () => Promise<boolean>;

  // Resign
  resign: () => Promise<boolean>;

  // Connection
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // State recovery
  syncWithServer: () => Promise<void>;

  // Game completion
  processGameComplete: () => Promise<void>;

  // Cleanup
  resetGame: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  gameId: null,
  gameDbRecord: null,
  chess: new Chess(),
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playerId: null,
  playerColor: null,
  opponent: null,
  status: "idle" as OnlineGameStatus,
  result: null,
  endReason: null,
  selectedSquare: null,
  possibleMoves: [],
  lastMove: null,
  isPlayerTurn: false,
  whiteTimeMs: 0,
  blackTimeMs: 0,
  timeControlSeconds: 180,
  incrementSeconds: 0,
  lastMoveTimestamp: null,
  moveHistory: [],
  moveCount: 0,
  wagerTct: 0,
  hasIncomingDrawOffer: false,
  hasSentDrawOffer: false,
  drawOfferFromId: null,
  connectionState: "disconnected" as ConnectionState,
  connectionError: null,
  _channel: null,
  _sessionService: null,
  eloChange: null,
};

// ============================================================================
// Store
// ============================================================================

export const useOnlineGameStore = create<OnlineGameState>()((set, get) => ({
  ...initialState,

  // =========================================================================
  // Initialization
  // =========================================================================

  initGame: async (config) => {
    const {
      gameId,
      playerId,
      playerName,
      playerColor,
      opponent,
      timeControlSeconds,
      incrementSeconds,
      wagerTct = 0,
      initialFen,
    } = config;

    // Clean up existing channel
    const existingChannel = get()._channel;
    if (existingChannel) {
      await existingChannel.disconnect();
    }

    // Initialize chess with FEN if provided
    const chess = new Chess(initialFen);
    const timeMs = timeControlSeconds * 1000;

    // Create new channel with callbacks
    const channel = createGameChannel(gameId, playerId, playerName, {
      onMove: (payload: MovePayload) => {
        get()._handleOpponentMove(payload);
      },
      onResign: (payload: ResignPayload) => {
        get()._handleOpponentResign(payload);
      },
      onDrawOffer: (payload: DrawOfferPayload) => {
        if (payload.playerId !== playerId) {
          set({
            hasIncomingDrawOffer: true,
            drawOfferFromId: payload.playerId,
          });
        }
      },
      onDrawResponse: (payload: DrawResponsePayload) => {
        if (payload.type === "draw_accept") {
          get()._handleDrawAccepted();
        } else {
          set({ hasSentDrawOffer: false });
        }
      },
      onTimeSync: (payload: TimeSyncPayload) => {
        set({
          whiteTimeMs: payload.whiteTimeMs,
          blackTimeMs: payload.blackTimeMs,
        });
      },
      onGameEnd: (payload: GameEndPayload) => {
        get()._handleGameEnd(payload);
      },
      onPresenceSync: (state) => {
        const opponentOnline = Object.keys(state).includes(opponent.id);
        set((prev) => ({
          opponent: prev.opponent ? { ...prev.opponent, isOnline: opponentOnline } : null,
        }));
      },
      onPresenceJoin: (key) => {
        if (key === opponent.id) {
          set((prev) => ({
            opponent: prev.opponent ? { ...prev.opponent, isOnline: true } : null,
          }));
        }
      },
      onPresenceLeave: (key) => {
        if (key === opponent.id) {
          set((prev) => ({
            opponent: prev.opponent ? { ...prev.opponent, isOnline: false } : null,
          }));
        }
      },
      onConnectionStateChange: (state: ConnectionState) => {
        set({ connectionState: state });
        if (state === "connected") {
          set({ connectionError: null });
        }
      },
      onError: (error: Error) => {
        set({ connectionError: error });
      },
    });

    // Set initial state
    set({
      gameId,
      chess,
      fen: chess.fen(),
      playerId,
      playerColor,
      opponent: { ...opponent, isOnline: false },
      status: "connecting",
      result: null,
      endReason: null,
      selectedSquare: null,
      possibleMoves: [],
      lastMove: null,
      isPlayerTurn: playerColor === chess.turn(),
      whiteTimeMs: timeMs,
      blackTimeMs: timeMs,
      timeControlSeconds,
      incrementSeconds,
      lastMoveTimestamp: null,
      moveHistory: [],
      moveCount: 0,
      wagerTct,
      hasIncomingDrawOffer: false,
      hasSentDrawOffer: false,
      drawOfferFromId: null,
      connectionError: null,
      _channel: channel,
      _sessionService: createGameSession(gameId, playerId),
      eloChange: null,
    });

    // Connect to channel
    try {
      await channel.connect();
      set({ status: "playing" });
    } catch (error) {
      set({
        status: "idle",
        connectionError: error instanceof Error ? error : new Error(String(error)),
      });
    }
  },

  // =========================================================================
  // Board Interaction
  // =========================================================================

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

  makeMove: async (from, to, promotion = "q") => {
    const {
      chess,
      playerId,
      playerColor,
      incrementSeconds,
      moveCount,
      _channel,
    } = get();

    if (!_channel || !playerId || !playerColor) return false;

    try {
      const move = chess.move({ from, to, promotion });

      if (!move) return false;

      const newMoveCount = moveCount + 1;
      const playerTimeMs =
        playerColor === "w" ? get().whiteTimeMs : get().blackTimeMs;

      // Add increment after move
      const newPlayerTimeMs = playerTimeMs + incrementSeconds * 1000;

      // Update local state immediately (optimistic update)
      set((state) => ({
        chess: state.chess,
        fen: chess.fen(),
        selectedSquare: null,
        possibleMoves: [],
        lastMove: { from, to },
        isPlayerTurn: false,
        moveHistory: [...state.moveHistory, move],
        moveCount: newMoveCount,
        lastMoveTimestamp: Date.now(),
        hasIncomingDrawOffer: false,
        hasSentDrawOffer: false,
        whiteTimeMs: playerColor === "w" ? newPlayerTimeMs : state.whiteTimeMs,
        blackTimeMs: playerColor === "b" ? newPlayerTimeMs : state.blackTimeMs,
      }));

      // Broadcast move to opponent
      await _channel.sendMove(
        from,
        to,
        move.san,
        chess.fen(),
        newMoveCount,
        newPlayerTimeMs,
        promotion !== "q" ? promotion : undefined
      );

      // Check for game end
      if (chess.isGameOver()) {
        await get()._checkGameEnd();
      }

      // Persist to database
      await get()._persistMove(move, newMoveCount, newPlayerTimeMs);

      return true;
    } catch (error) {
      console.error("Move error:", error);
      return false;
    }
  },

  // =========================================================================
  // Timer Updates
  // =========================================================================

  updateTimers: (whiteMs, blackMs) => {
    set({ whiteTimeMs: whiteMs, blackTimeMs: blackMs });
  },

  handleTimeout: async (color) => {
    const { playerColor, _channel, gameId } = get();
    if (!_channel || !gameId) return;

    const result: "white_wins" | "black_wins" = color === "w" ? "black_wins" : "white_wins";
    const playerResult: GameResult = color === playerColor ? "loss" : "win";

    set({
      status: "finished",
      result: playerResult,
      endReason: "timeout",
    });

    await _channel.sendGameEnd(result, "timeout");
    await get()._persistGameEnd(result, "timeout");
  },

  // =========================================================================
  // Draw Offer Flow
  // =========================================================================

  offerDraw: async () => {
    const { _channel, hasSentDrawOffer } = get();
    if (!_channel || hasSentDrawOffer) return false;

    const success = await _channel.sendDrawOffer();
    if (success) {
      set({ hasSentDrawOffer: true });
    }
    return success;
  },

  acceptDraw: async () => {
    const { _channel } = get();
    if (!_channel) return false;

    const success = await _channel.sendDrawAccept();
    if (success) {
      get()._handleDrawAccepted();
    }
    return success;
  },

  declineDraw: async () => {
    const { _channel } = get();
    if (!_channel) return false;

    const success = await _channel.sendDrawDecline();
    if (success) {
      set({
        hasIncomingDrawOffer: false,
        drawOfferFromId: null,
      });
    }
    return success;
  },

  // =========================================================================
  // Resign
  // =========================================================================

  resign: async () => {
    const { _channel, playerId, playerColor, gameId } = get();
    if (!_channel || !playerId || !playerColor || !gameId) return false;

    const success = await _channel.sendResign();
    if (success) {
      const result: "white_wins" | "black_wins" = playerColor === "w" ? "black_wins" : "white_wins";

      set({
        status: "finished",
        result: "loss",
        endReason: "resign",
      });

      await _channel.sendGameEnd(result, "resign");
      await get()._persistGameEnd(result, "resign");
    }
    return success;
  },

  // =========================================================================
  // Connection Management
  // =========================================================================

  reconnect: async () => {
    const { _channel } = get();
    if (_channel) {
      await _channel.connect();
      await get().syncWithServer();
    }
  },

  disconnect: async () => {
    const { _channel } = get();
    if (_channel) {
      await _channel.disconnect();
    }
  },

  // =========================================================================
  // State Recovery
  // =========================================================================

  syncWithServer: async () => {
    const { _channel, moveCount, chess, playerColor } = get();
    if (!_channel) return;

    // Fetch latest game state
    const gameState = await _channel.fetchLatestGameState();
    if (!gameState) return;

    // If we're behind, fetch missed moves
    if (gameState.moveCount > moveCount) {
      const missedMoves = await _channel.fetchMovesSince(moveCount);

      for (const move of missedMoves) {
        try {
          chess.move({ from: move.from, to: move.to });
        } catch {
          // If move fails, reload from FEN
          chess.load(gameState.fen);
          break;
        }
      }

      set({
        fen: chess.fen(),
        moveCount: gameState.moveCount,
        whiteTimeMs: gameState.whiteTimeMs,
        blackTimeMs: gameState.blackTimeMs,
        isPlayerTurn: chess.turn() === playerColor,
        lastMove: missedMoves.length > 0
          ? { from: missedMoves[missedMoves.length - 1].from, to: missedMoves[missedMoves.length - 1].to }
          : get().lastMove,
      });
    }
  },

  // =========================================================================
  // Game Completion
  // =========================================================================

  processGameComplete: async () => {
    const { _sessionService, playerColor } = get();
    if (!_sessionService) return;

    try {
      const result = await _sessionService.processGameComplete();

      if (result.success && result.eloChanges) {
        const playerEloChange = playerColor === "w"
          ? result.eloChanges.white
          : result.eloChanges.black;

        set({
          eloChange: {
            before: playerEloChange.oldRating,
            after: playerEloChange.newRating,
            change: playerEloChange.change,
          },
        });
      }
    } catch (error) {
      console.error("Error processing game completion:", error);
    }
  },

  // =========================================================================
  // Cleanup
  // =========================================================================

  resetGame: () => {
    const { _channel } = get();
    if (_channel) {
      _channel.disconnect();
    }
    set({ ...initialState, chess: new Chess(), _sessionService: null });
  },

  // =========================================================================
  // Internal Handlers (prefixed with _)
  // =========================================================================

  _handleOpponentMove: (payload: MovePayload) => {
    const { chess, playerColor, incrementSeconds } = get();

    try {
      const move = chess.move({
        from: payload.from,
        to: payload.to,
        promotion: payload.promotion,
      });

      if (!move) return;

      // Update opponent's time (with their increment already added)
      const opponentColor = playerColor === "w" ? "b" : "w";

      set((state) => ({
        chess: state.chess,
        fen: chess.fen(),
        lastMove: { from: payload.from, to: payload.to },
        isPlayerTurn: true,
        moveHistory: [...state.moveHistory, move],
        moveCount: payload.moveNumber,
        lastMoveTimestamp: payload.timestamp,
        hasIncomingDrawOffer: false,
        whiteTimeMs: opponentColor === "w" ? payload.timeRemainingMs : state.whiteTimeMs,
        blackTimeMs: opponentColor === "b" ? payload.timeRemainingMs : state.blackTimeMs,
      }));

      // Check for game end
      if (chess.isGameOver()) {
        get()._checkGameEnd();
      }
    } catch (error) {
      console.error("Error applying opponent move:", error);
      get().syncWithServer();
    }
  },

  _handleOpponentResign: (payload: ResignPayload) => {
    const { playerId } = get();
    if (payload.playerId !== playerId) {
      set({
        status: "finished",
        result: "win",
        endReason: "resign",
      });
    }
  },

  _handleDrawAccepted: () => {
    set({
      status: "finished",
      result: "draw",
      endReason: "draw_agreement",
      hasIncomingDrawOffer: false,
      hasSentDrawOffer: false,
    });

    const { gameId } = get();
    if (gameId) {
      get()._persistGameEnd("draw", "draw_agreement");
    }
  },

  _handleGameEnd: (payload: GameEndPayload) => {
    const { playerColor } = get();
    let result: GameResult = "draw";

    if (payload.result === "draw") {
      result = "draw";
    } else if (
      (payload.result === "white_wins" && playerColor === "w") ||
      (payload.result === "black_wins" && playerColor === "b")
    ) {
      result = "win";
    } else {
      result = "loss";
    }

    set({
      status: "finished",
      result,
      endReason: payload.reason as EndReason,
    });
  },

  _checkGameEnd: async () => {
    const { chess, playerColor, _channel, gameId } = get();
    if (!_channel || !gameId) return;

    let result: "white_wins" | "black_wins" | "draw" = "draw";
    let reason: EndReason = null;
    let playerResult: GameResult = "draw";

    if (chess.isCheckmate()) {
      const loserColor = chess.turn();
      result = loserColor === "w" ? "black_wins" : "white_wins";
      reason = "checkmate";
      playerResult = loserColor === playerColor ? "loss" : "win";
    } else if (chess.isStalemate()) {
      result = "draw";
      reason = "stalemate";
      playerResult = "draw";
    } else if (chess.isThreefoldRepetition()) {
      result = "draw";
      reason = "threefold_repetition";
      playerResult = "draw";
    } else if (chess.isInsufficientMaterial()) {
      result = "draw";
      reason = "insufficient_material";
      playerResult = "draw";
    } else if (chess.isDraw()) {
      result = "draw";
      reason = "fifty_moves";
      playerResult = "draw";
    }

    if (reason) {
      set({
        status: "finished",
        result: playerResult,
        endReason: reason,
      });

      await _channel.sendGameEnd(result, reason);
      await get()._persistGameEnd(result, reason);
    }
  },

  _persistMove: async (move: Move, moveNumber: number, timeRemainingMs: number) => {
    const { gameId, playerId, chess } = get();
    if (!gameId || !playerId) return;

    try {
      // Insert move record
      await supabase.from("game_moves").insert({
        game_id: gameId,
        move_number: moveNumber,
        player_id: playerId,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion || ""}`,
        fen_before: move.before,
        fen_after: move.after,
        time_spent_ms: 0, // TODO: Calculate from timestamps
        time_remaining_ms: timeRemainingMs,
        is_capture: !!move.captured,
        is_check: chess.isCheck(),
        is_checkmate: chess.isCheckmate(),
        is_castling: move.flags.includes("k") || move.flags.includes("q"),
        is_en_passant: move.flags.includes("e"),
        is_promotion: !!move.promotion,
        promotion_piece: move.promotion || null,
      });

      // Update game record
      const { playerColor, whiteTimeMs, blackTimeMs } = get();
      await supabase
        .from("games")
        .update({
          current_fen: chess.fen(),
          move_count: moveNumber,
          current_turn: chess.turn(),
          white_time_remaining: Math.floor(whiteTimeMs / 1000),
          black_time_remaining: Math.floor(blackTimeMs / 1000),
          last_move_at: new Date().toISOString(),
        })
        .eq("id", gameId);
    } catch (error) {
      console.error("Error persisting move:", error);
    }
  },

  _persistGameEnd: async (result: "white_wins" | "black_wins" | "draw", reason: string) => {
    const { gameId, playerId, playerColor, chess, whiteTimeMs, blackTimeMs } = get();
    if (!gameId) return;

    try {
      let winnerId: string | null = null;

      if (result !== "draw") {
        // Determine winner ID based on result
        const { data: game } = await supabase
          .from("games")
          .select("white_player_id, black_player_id")
          .eq("id", gameId)
          .single();

        if (game) {
          winnerId = result === "white_wins" ? game.white_player_id : game.black_player_id;
        }
      }

      await supabase
        .from("games")
        .update({
          status: "completed",
          result,
          end_reason: reason,
          winner_id: winnerId,
          final_fen: chess.fen(),
          white_time_remaining: Math.floor(whiteTimeMs / 1000),
          black_time_remaining: Math.floor(blackTimeMs / 1000),
          ended_at: new Date().toISOString(),
        })
        .eq("id", gameId);
    } catch (error) {
      console.error("Error persisting game end:", error);
    }
  },
}));

// ============================================================================
// Selector Hooks
// ============================================================================

export const useOnlineGameStatus = () => useOnlineGameStore((s) => s.status);
export const useOnlineGameConnectionState = () => useOnlineGameStore((s) => s.connectionState);
export const useOnlineGameIsPlayerTurn = () => useOnlineGameStore((s) => s.isPlayerTurn);
export const useOnlineGameOpponent = () => useOnlineGameStore((s) => s.opponent);
export const useOnlineGameDrawOffer = () =>
  useOnlineGameStore((s) => ({
    hasIncoming: s.hasIncomingDrawOffer,
    hasSent: s.hasSentDrawOffer,
  }));
