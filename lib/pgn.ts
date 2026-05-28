/**
 * PGN (Portable Game Notation) Generator
 *
 * Elite-level implementation featuring:
 * - Full PGN standard compliance (Seven Tag Roster)
 * - Extended headers for online play
 * - Move formatting with timestamps
 * - Result string generation
 * - PGN parsing for import
 * - Game analysis annotations
 */

import { Chess, Move } from "chess.js";

// ============================================================================
// Types
// ============================================================================

export interface PGNHeaders {
  // Seven Tag Roster (required by PGN standard)
  Event: string;
  Site: string;
  Date: string;
  Round: string;
  White: string;
  Black: string;
  Result: PGNResult;

  // Extended headers for online play
  WhiteElo?: string;
  BlackElo?: string;
  WhiteEloChange?: string;
  BlackEloChange?: string;
  TimeControl?: string;
  Increment?: string;
  ECO?: string;
  Opening?: string;
  Termination?: string;
  GameId?: string;
  UTCDate?: string;
  UTCTime?: string;
  WhiteRemainingTime?: string;
  BlackRemainingTime?: string;
  Wager?: string;
  PlatformVersion?: string;
}

export interface PGNMoveData {
  san: string;
  from: string;
  to: string;
  timeRemainingMs?: number;
  timeSpentMs?: number;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isCastle?: boolean;
  isCapture?: boolean;
  isPromotion?: boolean;
  evaluation?: number;
  depth?: number;
}

export interface PGNGameData {
  headers: Partial<PGNHeaders>;
  moves: PGNMoveData[];
  finalFen?: string;
}

export type PGNResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export interface ParsedPGN {
  headers: Record<string, string>;
  moves: string[];
  result: PGNResult;
}

// ============================================================================
// Constants
// ============================================================================

const SITE_NAME = "Treasure Chess";
const PLATFORM_VERSION = "1.0.0";

// ECO codes for common openings (subset for basic detection)
const ECO_CODES: Record<string, { code: string; name: string }> = {
  // Sicilian variations
  "e4 c5": { code: "B20", name: "Sicilian Defense" },
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": { code: "B90", name: "Sicilian Najdorf" },

  // Italian Game
  "e4 e5 Nf3 Nc6 Bc4": { code: "C50", name: "Italian Game" },
  "e4 e5 Nf3 Nc6 Bc4 Bc5": { code: "C53", name: "Italian Game: Giuoco Piano" },

  // Ruy Lopez
  "e4 e5 Nf3 Nc6 Bb5": { code: "C60", name: "Ruy Lopez" },
  "e4 e5 Nf3 Nc6 Bb5 a6": { code: "C68", name: "Ruy Lopez: Exchange Variation" },

  // French Defense
  "e4 e6": { code: "C00", name: "French Defense" },
  "e4 e6 d4 d5": { code: "C01", name: "French Defense: Exchange Variation" },

  // Caro-Kann
  "e4 c6": { code: "B10", name: "Caro-Kann Defense" },

  // Queen's Gambit
  "d4 d5 c4": { code: "D06", name: "Queen's Gambit" },
  "d4 d5 c4 e6": { code: "D30", name: "Queen's Gambit Declined" },
  "d4 d5 c4 dxc4": { code: "D20", name: "Queen's Gambit Accepted" },

  // King's Indian
  "d4 Nf6 c4 g6": { code: "E60", name: "King's Indian Defense" },

  // London System
  "d4 d5 Bf4": { code: "D00", name: "London System" },
  "d4 Nf6 Bf4": { code: "A45", name: "Trompowsky Attack / London System" },

  // English Opening
  "c4": { code: "A10", name: "English Opening" },

  // King's Pawn Opening
  "e4": { code: "B00", name: "King's Pawn Opening" },
  "e4 e5": { code: "C20", name: "King's Pawn Game" },

  // Queen's Pawn Opening
  "d4": { code: "A40", name: "Queen's Pawn Opening" },
  "d4 d5": { code: "D00", name: "Queen's Pawn Game" },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Generate a complete PGN string from game data.
 *
 * @param data - The game data including headers and moves
 * @returns The formatted PGN string
 */
export function generatePGN(data: PGNGameData): string {
  const headers = formatHeaders(data.headers);
  const moveText = formatMoves(data.moves);
  const result = data.headers.Result || "*";

  return `${headers}\n\n${moveText} ${result}`;
}

/**
 * Format PGN headers according to the standard.
 *
 * @param headers - The headers to format
 * @returns Formatted header string
 */
export function formatHeaders(headers: Partial<PGNHeaders>): string {
  const lines: string[] = [];

  // Ensure Seven Tag Roster is present (in correct order)
  const event = headers.Event || SITE_NAME;
  const site = headers.Site || SITE_NAME;
  const date = headers.Date || formatDate(new Date());
  const round = headers.Round || "-";
  const white = headers.White || "White";
  const black = headers.Black || "Black";
  const result = headers.Result || "*";

  // Required tags in standard order
  lines.push(`[Event "${escapeString(event)}"]`);
  lines.push(`[Site "${escapeString(site)}"]`);
  lines.push(`[Date "${date}"]`);
  lines.push(`[Round "${round}"]`);
  lines.push(`[White "${escapeString(white)}"]`);
  lines.push(`[Black "${escapeString(black)}"]`);
  lines.push(`[Result "${result}"]`);

  // Optional extended headers
  if (headers.WhiteElo) lines.push(`[WhiteElo "${headers.WhiteElo}"]`);
  if (headers.BlackElo) lines.push(`[BlackElo "${headers.BlackElo}"]`);
  if (headers.WhiteEloChange) lines.push(`[WhiteEloChange "${headers.WhiteEloChange}"]`);
  if (headers.BlackEloChange) lines.push(`[BlackEloChange "${headers.BlackEloChange}"]`);
  if (headers.TimeControl) lines.push(`[TimeControl "${headers.TimeControl}"]`);
  if (headers.Increment) lines.push(`[Increment "${headers.Increment}"]`);
  if (headers.ECO) lines.push(`[ECO "${headers.ECO}"]`);
  if (headers.Opening) lines.push(`[Opening "${escapeString(headers.Opening)}"]`);
  if (headers.Termination) lines.push(`[Termination "${escapeString(headers.Termination)}"]`);
  if (headers.GameId) lines.push(`[GameId "${headers.GameId}"]`);
  if (headers.UTCDate) lines.push(`[UTCDate "${headers.UTCDate}"]`);
  if (headers.UTCTime) lines.push(`[UTCTime "${headers.UTCTime}"]`);
  if (headers.Wager) lines.push(`[Wager "${headers.Wager}"]`);
  lines.push(`[PlatformVersion "${PLATFORM_VERSION}"]`);

  return lines.join("\n");
}

/**
 * Format moves with move numbers and optional comments.
 *
 * @param moves - Array of move data
 * @returns Formatted move text
 */
export function formatMoves(moves: PGNMoveData[]): string {
  const parts: string[] = [];
  let moveNumber = 1;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const isWhiteMove = i % 2 === 0;

    if (isWhiteMove) {
      parts.push(`${moveNumber}.`);
    } else if (i === 0) {
      // Black to move first (rare, but handle it)
      parts.push(`${moveNumber}...`);
    }

    parts.push(move.san);

    // Add time comment if available
    if (move.timeRemainingMs !== undefined) {
      const timeStr = formatTimeForPGN(move.timeRemainingMs);
      parts.push(`{[%clk ${timeStr}]}`);
    }

    // Add evaluation comment if available
    if (move.evaluation !== undefined) {
      const evalStr = move.evaluation > 0 ? `+${move.evaluation.toFixed(2)}` : move.evaluation.toFixed(2);
      if (move.depth) {
        parts.push(`{[%eval ${evalStr}/${move.depth}]}`);
      } else {
        parts.push(`{[%eval ${evalStr}]}`);
      }
    }

    if (!isWhiteMove) {
      moveNumber++;
    }
  }

  // Wrap to 80 characters per line
  return wrapText(parts.join(" "), 80);
}

/**
 * Detect the opening based on the first few moves.
 *
 * @param moves - Array of SAN moves
 * @returns ECO code and opening name, or null if not detected
 */
export function detectOpening(moves: string[]): { code: string; name: string } | null {
  // Build the move sequence string
  let sequence = "";
  let bestMatch: { code: string; name: string } | null = null;
  let bestMatchLength = 0;

  for (let i = 0; i < Math.min(moves.length, 10); i++) {
    if (sequence) sequence += " ";
    sequence += moves[i];

    // Check for exact match
    if (ECO_CODES[sequence] && sequence.length > bestMatchLength) {
      bestMatch = ECO_CODES[sequence];
      bestMatchLength = sequence.length;
    }
  }

  return bestMatch;
}

/**
 * Generate the result string from game outcome.
 *
 * @param result - The game result (white_wins, black_wins, draw)
 * @returns PGN result string
 */
export function gameResultToPGN(result: "white_wins" | "black_wins" | "draw" | null): PGNResult {
  switch (result) {
    case "white_wins":
      return "1-0";
    case "black_wins":
      return "0-1";
    case "draw":
      return "1/2-1/2";
    default:
      return "*";
  }
}

/**
 * Convert termination reason to PGN termination string.
 *
 * @param reason - The end reason
 * @param winnerColor - The winning color if applicable
 * @returns Termination string for PGN header
 */
export function formatTermination(
  reason: string,
  winnerColor?: "w" | "b" | null
): string {
  switch (reason) {
    case "checkmate":
      return winnerColor === "w" ? "White wins by checkmate" : "Black wins by checkmate";
    case "timeout":
      return winnerColor === "w" ? "White wins on time" : "Black wins on time";
    case "resign":
      return winnerColor === "w" ? "White wins by resignation" : "Black wins by resignation";
    case "abandon":
      return winnerColor === "w" ? "White wins by abandonment" : "Black wins by abandonment";
    case "draw_agreement":
      return "Draw by agreement";
    case "stalemate":
      return "Draw by stalemate";
    case "insufficient_material":
      return "Draw by insufficient material";
    case "threefold_repetition":
      return "Draw by threefold repetition";
    case "fifty_moves":
      return "Draw by fifty-move rule";
    default:
      return "Game ended";
  }
}

/**
 * Generate time control string in PGN format.
 *
 * @param seconds - Base time in seconds
 * @param increment - Increment in seconds
 * @returns Time control string (e.g., "180+2")
 */
export function formatTimeControl(seconds: number, increment: number): string {
  if (increment === 0) {
    return seconds.toString();
  }
  return `${seconds}+${increment}`;
}

// ============================================================================
// Complete Game PGN Generation
// ============================================================================

export interface CompleteGamePGNInput {
  gameId: string;
  whitePlayer: { username: string; elo: number; eloChange?: number };
  blackPlayer: { username: string; elo: number; eloChange?: number };
  moves: PGNMoveData[];
  result: "white_wins" | "black_wins" | "draw" | null;
  endReason: string;
  timeControlSeconds: number;
  incrementSeconds: number;
  wagerTct?: number;
  startedAt: Date;
  endedAt?: Date;
}

/**
 * Generate a complete PGN from all game data.
 *
 * @param input - Complete game data
 * @returns Full PGN string
 */
export function generateCompletePGN(input: CompleteGamePGNInput): string {
  const {
    gameId,
    whitePlayer,
    blackPlayer,
    moves,
    result,
    endReason,
    timeControlSeconds,
    incrementSeconds,
    wagerTct,
    startedAt,
    endedAt,
  } = input;

  // Detect opening
  const sanMoves = moves.map((m) => m.san);
  const opening = detectOpening(sanMoves);

  // Determine winner color for termination string
  let winnerColor: "w" | "b" | null = null;
  if (result === "white_wins") winnerColor = "w";
  else if (result === "black_wins") winnerColor = "b";

  const headers: Partial<PGNHeaders> = {
    Event: wagerTct && wagerTct > 0 ? `Treasure Chess Wager (${wagerTct} TCT)` : "Treasure Chess Game",
    Site: SITE_NAME,
    Date: formatDate(startedAt),
    Round: "-",
    White: whitePlayer.username,
    Black: blackPlayer.username,
    Result: gameResultToPGN(result),
    WhiteElo: whitePlayer.elo.toString(),
    BlackElo: blackPlayer.elo.toString(),
    TimeControl: formatTimeControl(timeControlSeconds, incrementSeconds),
    Termination: formatTermination(endReason, winnerColor),
    GameId: gameId,
    UTCDate: formatDate(startedAt),
    UTCTime: formatTime(startedAt),
  };

  if (whitePlayer.eloChange !== undefined) {
    headers.WhiteEloChange = whitePlayer.eloChange > 0
      ? `+${whitePlayer.eloChange}`
      : whitePlayer.eloChange.toString();
  }

  if (blackPlayer.eloChange !== undefined) {
    headers.BlackEloChange = blackPlayer.eloChange > 0
      ? `+${blackPlayer.eloChange}`
      : blackPlayer.eloChange.toString();
  }

  if (opening) {
    headers.ECO = opening.code;
    headers.Opening = opening.name;
  }

  if (wagerTct && wagerTct > 0) {
    headers.Wager = `${wagerTct} TCT`;
  }

  return generatePGN({ headers, moves });
}

// ============================================================================
// PGN Parsing
// ============================================================================

/**
 * Parse a PGN string into structured data.
 *
 * @param pgn - The PGN string to parse
 * @returns Parsed PGN data
 */
export function parsePGN(pgn: string): ParsedPGN {
  const headers: Record<string, string> = {};
  const lines = pgn.split("\n");
  let moveSection = "";
  let inMoveSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[")) {
      // Parse header
      const match = trimmed.match(/\[(\w+)\s+"(.*)"\]/);
      if (match) {
        headers[match[1]] = match[2];
      }
    } else if (trimmed.length > 0) {
      inMoveSection = true;
      moveSection += " " + trimmed;
    }
  }

  // Parse moves from move section
  const moves = extractMoves(moveSection);

  // Extract result
  const result = (headers.Result as PGNResult) || "*";

  return { headers, moves, result };
}

/**
 * Extract SAN moves from PGN move text.
 *
 * @param moveText - The move text section of a PGN
 * @returns Array of SAN move strings
 */
export function extractMoves(moveText: string): string[] {
  const moves: string[] = [];

  // Remove comments
  let clean = moveText.replace(/\{[^}]*\}/g, "");

  // Remove move numbers
  clean = clean.replace(/\d+\.\s*/g, "");
  clean = clean.replace(/\.\.\./g, "");

  // Remove result
  clean = clean.replace(/1-0|0-1|1\/2-1\/2|\*/g, "");

  // Split into moves
  const parts = clean.split(/\s+/).filter((p) => p.length > 0);

  for (const part of parts) {
    // Validate as a chess move (basic check)
    if (/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$/.test(part) ||
        part === "O-O" || part === "O-O-O") {
      moves.push(part);
    }
  }

  return moves;
}

/**
 * Validate a PGN by replaying all moves.
 *
 * @param pgn - The PGN string to validate
 * @returns True if the PGN is valid
 */
export function validatePGN(pgn: string): { valid: boolean; error?: string; moveCount: number } {
  try {
    const parsed = parsePGN(pgn);
    const chess = new Chess();

    for (let i = 0; i < parsed.moves.length; i++) {
      const result = chess.move(parsed.moves[i]);
      if (!result) {
        return {
          valid: false,
          error: `Invalid move at position ${i + 1}: ${parsed.moves[i]}`,
          moveCount: i,
        };
      }
    }

    return { valid: true, moveCount: parsed.moves.length };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Parse error",
      moveCount: 0,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a date for PGN (YYYY.MM.DD).
 */
function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

/**
 * Format a time for PGN (HH:MM:SS).
 */
function formatTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format time for PGN clock annotation (H:MM:SS).
 */
function formatTimeForPGN(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Escape special characters in PGN strings.
 */
function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Wrap text to specified line width.
 */
function wrapText(text: string, maxWidth: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join("\n");
}

export default {
  generatePGN,
  generateCompletePGN,
  parsePGN,
  validatePGN,
  formatHeaders,
  formatMoves,
  detectOpening,
  gameResultToPGN,
  formatTermination,
  formatTimeControl,
  extractMoves,
};
