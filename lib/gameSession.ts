/**
 * Game Session Service
 *
 * Client-side service for interacting with game session Edge Functions.
 * Provides a clean API for:
 * - Server-side move validation
 * - Timer synchronization
 * - Game ending
 * - State recovery
 * - Game completion processing
 */

import { supabase } from "./supabase";
import type { Game } from "@/types/supabase";

// ============================================================================
// Types
// ============================================================================

export interface GameState {
  id: string;
  fen: string;
  turn: "w" | "b";
  moveCount: number;
  status: "active" | "completed" | "abandoned";
  result: "white_wins" | "black_wins" | "draw" | null;
  endReason: string | null;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  timeControlSeconds: number;
  incrementSeconds: number;
  wagerTct: number;
  startedAt: string;
  endedAt: string | null;
}

export interface PlayerInfo {
  id: string;
  username: string;
  avatarIndex: number;
  eloRating: number;
}

export interface MoveRecord {
  moveNumber: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  timeSpentMs: number;
  timeRemainingMs: number;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastling: boolean;
  isEnPassant: boolean;
  isPromotion: boolean;
  promotionPiece: string | null;
}

export interface ValidateMoveResult {
  valid: boolean;
  error?: string;
  newFen?: string;
  san?: string;
  moveNumber?: number;
  gameOver?: boolean;
  result?: string;
  reason?: string;
  whiteTimeRemaining?: number;
  blackTimeRemaining?: number;
}

export interface EndGameResult {
  success: boolean;
  result?: string;
  reason?: string;
  winnerId?: string | null;
  error?: string;
}

export interface GameCompleteResult {
  success: boolean;
  eloChanges?: {
    white: {
      playerId: string;
      oldRating: number;
      newRating: number;
      change: number;
      kFactor: number;
    };
    black: {
      playerId: string;
      oldRating: number;
      newRating: number;
      change: number;
      kFactor: number;
    };
  };
  wagerSettlement?: {
    winnerId: string | null;
    winnerPayout: number;
    platformFee: number;
    refunded: boolean;
  };
  pgn?: string;
  error?: string;
}

export interface FullGameState {
  game: GameState;
  whitePlayer: PlayerInfo;
  blackPlayer: PlayerInfo;
  moves: MoveRecord[];
}

// ============================================================================
// Game Session Service Class
// ============================================================================

export class GameSessionService {
  private gameId: string;
  private playerId: string;
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor(gameId: string, playerId: string) {
    this.gameId = gameId;
    this.playerId = playerId;
    // Read env variables in constructor to allow tests to set them
    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
    this.supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
  }

  // --------------------------------------------------------------------------
  // Move Validation
  // --------------------------------------------------------------------------

  /**
   * Validate a move on the server and record it if valid.
   * This provides anti-cheat protection by having the server verify all moves.
   */
  async validateMove(
    from: string,
    to: string,
    timeRemainingMs: number,
    promotion?: string
  ): Promise<ValidateMoveResult> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/game-session/validate-move`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken || this.supabaseAnonKey}`,
          },
          body: JSON.stringify({
            gameId: this.gameId,
            playerId: this.playerId,
            from,
            to,
            promotion,
            clientTimestamp: Date.now(),
            timeRemainingMs,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return { valid: false, error: result.error || "Server validation failed" };
      }

      return result;
    } catch (error) {
      console.error("Move validation error:", error);
      // Fall back to client-side validation
      return { valid: true };
    }
  }

  // --------------------------------------------------------------------------
  // Timer Synchronization
  // --------------------------------------------------------------------------

  /**
   * Sync timer state with the server.
   * Called periodically to ensure server has accurate time data.
   */
  async syncTime(whiteTimeMs: number, blackTimeMs: number): Promise<boolean> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/game-session/sync-time`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken || this.supabaseAnonKey}`,
          },
          body: JSON.stringify({
            gameId: this.gameId,
            playerId: this.playerId,
            whiteTimeMs,
            blackTimeMs,
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("Time sync error:", error);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Game Ending
  // --------------------------------------------------------------------------

  /**
   * End the game with the specified reason.
   */
  async endGame(
    reason: string,
    result?: "white_wins" | "black_wins" | "draw"
  ): Promise<EndGameResult> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/game-session/end-game`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken || this.supabaseAnonKey}`,
          },
          body: JSON.stringify({
            gameId: this.gameId,
            playerId: this.playerId,
            reason,
            result,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Trigger game completion processing
      await this.processGameComplete();

      return data;
    } catch (error) {
      console.error("End game error:", error);
      return { success: false, error: "Failed to end game" };
    }
  }

  // --------------------------------------------------------------------------
  // Game Completion Processing
  // --------------------------------------------------------------------------

  /**
   * Process game completion (ELO updates, wager settlement, PGN generation).
   * Called automatically after game ends, but can be called manually for recovery.
   */
  async processGameComplete(): Promise<GameCompleteResult> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/game-complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken || this.supabaseAnonKey}`,
          },
          body: JSON.stringify({ gameId: this.gameId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return data;
    } catch (error) {
      console.error("Game complete error:", error);
      return { success: false, error: "Failed to process game completion" };
    }
  }

  // --------------------------------------------------------------------------
  // State Recovery
  // --------------------------------------------------------------------------

  /**
   * Fetch the full game state from the server.
   * Useful for reconnection or state verification.
   */
  async getGameState(): Promise<FullGameState | null> {
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session?.session?.access_token;

      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/game-session/state/${this.gameId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken || this.supabaseAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("Get game state error:", error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Direct Database Operations (Fallback)
  // --------------------------------------------------------------------------

  /**
   * Fetch game record directly from database.
   * Used as fallback when Edge Functions are unavailable.
   */
  async fetchGameFromDatabase(): Promise<Game | null> {
    try {
      const { data, error } = await supabase
        .from("games")
        .select(`
          *,
          white_player:profiles!games_white_player_id_fkey(id, username, avatar_index, elo_rating),
          black_player:profiles!games_black_player_id_fkey(id, username, avatar_index, elo_rating)
        `)
        .eq("id", this.gameId)
        .single();

      if (error) {
        console.error("Database fetch error:", error);
        return null;
      }

      return data as Game;
    } catch (error) {
      console.error("Database fetch error:", error);
      return null;
    }
  }

  /**
   * Fetch moves directly from database.
   */
  async fetchMovesFromDatabase(): Promise<MoveRecord[]> {
    try {
      const { data, error } = await supabase
        .from("game_moves")
        .select("*")
        .eq("game_id", this.gameId)
        .order("move_number", { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map((move) => ({
        moveNumber: move.move_number,
        san: move.san,
        uci: move.uci,
        fenBefore: move.fen_before,
        fenAfter: move.fen_after,
        timeSpentMs: move.time_spent_ms,
        timeRemainingMs: move.time_remaining_ms,
        isCapture: move.is_capture,
        isCheck: move.is_check,
        isCheckmate: move.is_checkmate,
        isCastling: move.is_castling,
        isEnPassant: move.is_en_passant,
        isPromotion: move.is_promotion,
        promotionPiece: move.promotion_piece,
      }));
    } catch (error) {
      console.error("Moves fetch error:", error);
      return [];
    }
  }

  /**
   * Update game state directly in database.
   * Used as fallback when Edge Functions are unavailable.
   */
  async updateGameDirect(updates: Partial<Game>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("games")
        .update(updates)
        .eq("id", this.gameId);

      return !error;
    } catch (error) {
      console.error("Direct update error:", error);
      return false;
    }
  }

  /**
   * Record a move directly in database.
   * Used as fallback when Edge Functions are unavailable.
   */
  async recordMoveDirect(move: {
    moveNumber: number;
    san: string;
    uci: string;
    fenBefore: string;
    fenAfter: string;
    timeRemainingMs: number;
    isCapture?: boolean;
    isCheck?: boolean;
    isCheckmate?: boolean;
    isCastling?: boolean;
    isEnPassant?: boolean;
    isPromotion?: boolean;
    promotionPiece?: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabase.from("game_moves").insert({
        game_id: this.gameId,
        move_number: move.moveNumber,
        player_id: this.playerId,
        san: move.san,
        uci: move.uci,
        fen_before: move.fenBefore,
        fen_after: move.fenAfter,
        time_remaining_ms: move.timeRemainingMs,
        is_capture: move.isCapture || false,
        is_check: move.isCheck || false,
        is_checkmate: move.isCheckmate || false,
        is_castling: move.isCastling || false,
        is_en_passant: move.isEnPassant || false,
        is_promotion: move.isPromotion || false,
        promotion_piece: move.promotionPiece || null,
      });

      return !error;
    } catch (error) {
      console.error("Record move error:", error);
      return false;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGameSession(gameId: string, playerId: string): GameSessionService {
  return new GameSessionService(gameId, playerId);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fetch game result for display on result screen.
 */
export async function fetchGameResult(gameId: string): Promise<{
  game: Game | null;
  whitePlayer: PlayerInfo | null;
  blackPlayer: PlayerInfo | null;
  eloChanges: {
    white: { before: number; after: number; change: number };
    black: { before: number; after: number; change: number };
  } | null;
  wagerResult: { winnerPayout: number; refunded: boolean } | null;
}> {
  try {
    const { data, error } = await supabase
      .from("games")
      .select(`
        *,
        white_player:profiles!games_white_player_id_fkey(id, username, avatar_index, elo_rating),
        black_player:profiles!games_black_player_id_fkey(id, username, avatar_index, elo_rating),
        escrow:game_escrows(*)
      `)
      .eq("id", gameId)
      .single();

    if (error || !data) {
      return {
        game: null,
        whitePlayer: null,
        blackPlayer: null,
        eloChanges: null,
        wagerResult: null,
      };
    }

    const game = data as any;

    return {
      game: game as Game,
      whitePlayer: game.white_player as PlayerInfo,
      blackPlayer: game.black_player as PlayerInfo,
      eloChanges: game.white_elo_after
        ? {
            white: {
              before: game.white_elo_before,
              after: game.white_elo_after,
              change: game.white_elo_change,
            },
            black: {
              before: game.black_elo_before,
              after: game.black_elo_after,
              change: game.black_elo_change,
            },
          }
        : null,
      wagerResult: game.escrow?.[0]
        ? {
            winnerPayout: game.escrow[0].winner_payout_tct || 0,
            refunded: game.escrow[0].status === "refunded",
          }
        : null,
    };
  } catch (error) {
    console.error("Fetch game result error:", error);
    return {
      game: null,
      whitePlayer: null,
      blackPlayer: null,
      eloChanges: null,
      wagerResult: null,
    };
  }
}

/**
 * Fetch PGN for a completed game.
 */
export async function fetchGamePGN(gameId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("games")
      .select("pgn")
      .eq("id", gameId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.pgn;
  } catch (error) {
    console.error("Fetch PGN error:", error);
    return null;
  }
}

export default {
  GameSessionService,
  createGameSession,
  fetchGameResult,
  fetchGamePGN,
};
