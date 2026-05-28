import { Chess, Move } from "chess.js";

export interface GameMetadata {
  event?: string;
  site?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  whiteElo?: number;
  blackElo?: number;
  timeControl?: string;
}

/**
 * Get the current FEN (Forsyth-Edwards Notation) string from a Chess instance
 */
export function getFEN(game: Chess): string {
  return game.fen();
}

/**
 * Load a position from a FEN string
 * Returns true if successful, false if FEN is invalid
 */
export function loadFEN(game: Chess, fen: string): boolean {
  try {
    game.load(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new Chess instance from a FEN string
 * Returns null if FEN is invalid
 */
export function createFromFEN(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/**
 * Validate a FEN string
 */
export function isValidFEN(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get PGN (Portable Game Notation) string from a Chess instance
 */
export function getPGN(game: Chess, metadata?: GameMetadata): string {
  const headers: string[] = [];

  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

  headers.push(`[Event "${metadata?.event || "Treasure Chess Game"}"]`);
  headers.push(`[Site "${metadata?.site || "Treasure Chess App"}"]`);
  headers.push(`[Date "${metadata?.date || dateStr}"]`);
  headers.push(`[Round "${metadata?.round || "-"}"]`);
  headers.push(`[White "${metadata?.white || "Player"}"]`);
  headers.push(`[Black "${metadata?.black || "Opponent"}"]`);

  let result = "*";
  if (game.isCheckmate()) {
    result = game.turn() === "w" ? "0-1" : "1-0";
  } else if (game.isDraw()) {
    result = "1/2-1/2";
  } else if (game.isGameOver()) {
    result = metadata?.result || "*";
  }
  headers.push(`[Result "${result}"]`);

  if (metadata?.whiteElo) {
    headers.push(`[WhiteElo "${metadata.whiteElo}"]`);
  }
  if (metadata?.blackElo) {
    headers.push(`[BlackElo "${metadata.blackElo}"]`);
  }
  if (metadata?.timeControl) {
    headers.push(`[TimeControl "${metadata.timeControl}"]`);
  }

  const history = game.history();
  const moves: string[] = [];

  for (let i = 0; i < history.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = history[i];
    const blackMove = history[i + 1];

    if (blackMove) {
      moves.push(`${moveNum}. ${whiteMove} ${blackMove}`);
    } else {
      moves.push(`${moveNum}. ${whiteMove}`);
    }
  }

  const movesText = moves.join(" ");
  const fullPGN = `${headers.join("\n")}\n\n${movesText} ${result}`;

  return fullPGN;
}

/**
 * Parse a PGN string and create a Chess instance
 * Returns null if PGN is invalid
 */
export function loadPGN(pgn: string): Chess | null {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    return game;
  } catch {
    return null;
  }
}

/**
 * Get game result string
 */
export function getGameResult(game: Chess): string {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? "Black wins by checkmate" : "White wins by checkmate";
  }
  if (game.isStalemate()) {
    return "Draw by stalemate";
  }
  if (game.isThreefoldRepetition()) {
    return "Draw by threefold repetition";
  }
  if (game.isInsufficientMaterial()) {
    return "Draw by insufficient material";
  }
  if (game.isDraw()) {
    return "Draw";
  }
  return "Game in progress";
}

/**
 * Get the game phase based on material and position
 */
export function getGamePhase(game: Chess): "opening" | "middlegame" | "endgame" {
  const fen = game.fen();
  const pieceSection = fen.split(" ")[0];

  let queenCount = 0;
  let minorPieceCount = 0;
  let rookCount = 0;

  for (const char of pieceSection) {
    if (char === "q" || char === "Q") queenCount++;
    if (char === "b" || char === "B" || char === "n" || char === "N") minorPieceCount++;
    if (char === "r" || char === "R") rookCount++;
  }

  const moveCount = game.history().length;

  if (moveCount < 10) {
    return "opening";
  }

  if (queenCount === 0 || (queenCount <= 1 && minorPieceCount <= 2 && rookCount <= 2)) {
    return "endgame";
  }

  return "middlegame";
}

/**
 * Calculate material balance (positive = white ahead, negative = black ahead)
 */
export function getMaterialBalance(game: Chess): number {
  const pieceValues: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
  };

  const board = game.board();
  let balance = 0;

  for (const row of board) {
    for (const square of row) {
      if (square) {
        const value = pieceValues[square.type] || 0;
        balance += square.color === "w" ? value : -value;
      }
    }
  }

  return balance;
}

/**
 * Get move history in algebraic notation
 */
export function getMoveList(game: Chess): string[] {
  return game.history();
}

/**
 * Get verbose move history with full details
 */
export function getVerboseMoveList(game: Chess): Move[] {
  return game.history({ verbose: true });
}

/**
 * Check if a specific move is legal
 */
export function isMoveLegal(game: Chess, from: string, to: string, promotion?: string): boolean {
  const moves = game.moves({ verbose: true });
  return moves.some(
    (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion)
  );
}

/**
 * Get all legal moves from a specific square
 */
export function getLegalMovesFromSquare(game: Chess, square: string): string[] {
  try {
    const moves = game.moves({ square: square as any, verbose: true });
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
}

/**
 * Count total legal moves for the current player
 */
export function countLegalMoves(game: Chess): number {
  return game.moves().length;
}

/**
 * Check if the game has ended
 */
export function isGameOver(game: Chess): boolean {
  return game.isGameOver();
}

/**
 * Get the reason why the game ended
 */
export function getGameOverReason(game: Chess): string | null {
  if (!game.isGameOver()) return null;

  if (game.isCheckmate()) return "checkmate";
  if (game.isStalemate()) return "stalemate";
  if (game.isThreefoldRepetition()) return "threefold repetition";
  if (game.isInsufficientMaterial()) return "insufficient material";
  if (game.isDraw()) return "50-move rule";

  return "unknown";
}
