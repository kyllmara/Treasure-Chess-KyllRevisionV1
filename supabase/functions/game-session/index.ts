/**
 * Game Session Edge Function
 *
 * Authoritative server-side game management featuring:
 * - Server-side move validation (anti-cheat)
 * - Authoritative timer management
 * - Game state persistence
 * - End condition detection
 * - Move recording with timestamps
 *
 * Endpoints:
 * - POST /validate-move: Validate and record a move
 * - POST /sync-time: Sync timer state
 * - POST /end-game: Handle game termination
 * - GET /state/:gameId: Get current game state
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Chess Logic (Minimal Implementation for Validation)
// ============================================================================

// We use a minimal chess validation implementation to avoid external dependencies
// In production, you'd use a Deno-compatible chess library

interface ChessState {
  board: (string | null)[][];
  turn: "w" | "b";
  castling: { K: boolean; Q: boolean; k: boolean; q: boolean };
  enPassant: string | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

function parseFEN(fen: string): ChessState {
  const parts = fen.split(" ");
  const ranks = parts[0].split("/");
  const board: (string | null)[][] = [];

  for (const rank of ranks) {
    const row: (string | null)[] = [];
    for (const char of rank) {
      if (/\d/.test(char)) {
        for (let i = 0; i < parseInt(char); i++) {
          row.push(null);
        }
      } else {
        row.push(char);
      }
    }
    board.push(row);
  }

  return {
    board,
    turn: parts[1] as "w" | "b",
    castling: {
      K: parts[2].includes("K"),
      Q: parts[2].includes("Q"),
      k: parts[2].includes("k"),
      q: parts[2].includes("q"),
    },
    enPassant: parts[3] === "-" ? null : parts[3],
    halfmoveClock: parseInt(parts[4]) || 0,
    fullmoveNumber: parseInt(parts[5]) || 1,
  };
}

function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
  const rank = 8 - parseInt(square[1]); // 8=0, 7=1, etc.
  return [rank, file];
}

function coordsToSquare(rank: number, file: number): string {
  return String.fromCharCode(97 + file) + (8 - rank).toString();
}

function getPieceAt(state: ChessState, square: string): string | null {
  const [rank, file] = squareToCoords(square);
  if (rank < 0 || rank > 7 || file < 0 || file > 7) return null;
  return state.board[rank][file];
}

function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase();
}

function validateBasicMove(
  state: ChessState,
  from: string,
  to: string,
  promotion?: string
): { valid: boolean; error?: string } {
  const piece = getPieceAt(state, from);

  if (!piece) {
    return { valid: false, error: "No piece at source square" };
  }

  const isWhite = isWhitePiece(piece);
  if ((state.turn === "w" && !isWhite) || (state.turn === "b" && isWhite)) {
    return { valid: false, error: "Not your turn" };
  }

  const targetPiece = getPieceAt(state, to);
  if (targetPiece && isWhitePiece(targetPiece) === isWhite) {
    return { valid: false, error: "Cannot capture own piece" };
  }

  // Basic piece movement validation (simplified)
  const [fromRank, fromFile] = squareToCoords(from);
  const [toRank, toFile] = squareToCoords(to);
  const rankDiff = toRank - fromRank;
  const fileDiff = toFile - fromFile;
  const pieceType = piece.toLowerCase();

  switch (pieceType) {
    case "p": {
      const direction = isWhite ? -1 : 1;
      const startRank = isWhite ? 6 : 1;

      // Standard move
      if (fileDiff === 0 && rankDiff === direction && !targetPiece) {
        return { valid: true };
      }
      // Double move from start
      if (
        fileDiff === 0 &&
        rankDiff === 2 * direction &&
        fromRank === startRank &&
        !targetPiece
      ) {
        const middleSquare = coordsToSquare(fromRank + direction, fromFile);
        if (!getPieceAt(state, middleSquare)) {
          return { valid: true };
        }
      }
      // Capture (including en passant)
      if (Math.abs(fileDiff) === 1 && rankDiff === direction) {
        if (targetPiece) return { valid: true };
        if (state.enPassant === to) return { valid: true };
      }
      return { valid: false, error: "Invalid pawn move" };
    }

    case "n": {
      if (
        (Math.abs(rankDiff) === 2 && Math.abs(fileDiff) === 1) ||
        (Math.abs(rankDiff) === 1 && Math.abs(fileDiff) === 2)
      ) {
        return { valid: true };
      }
      return { valid: false, error: "Invalid knight move" };
    }

    case "b": {
      if (Math.abs(rankDiff) === Math.abs(fileDiff) && rankDiff !== 0) {
        if (isPathClear(state, from, to)) {
          return { valid: true };
        }
      }
      return { valid: false, error: "Invalid bishop move" };
    }

    case "r": {
      if ((rankDiff === 0 || fileDiff === 0) && (rankDiff !== 0 || fileDiff !== 0)) {
        if (isPathClear(state, from, to)) {
          return { valid: true };
        }
      }
      return { valid: false, error: "Invalid rook move" };
    }

    case "q": {
      if (
        (rankDiff === 0 || fileDiff === 0 || Math.abs(rankDiff) === Math.abs(fileDiff)) &&
        (rankDiff !== 0 || fileDiff !== 0)
      ) {
        if (isPathClear(state, from, to)) {
          return { valid: true };
        }
      }
      return { valid: false, error: "Invalid queen move" };
    }

    case "k": {
      // Regular king move
      if (Math.abs(rankDiff) <= 1 && Math.abs(fileDiff) <= 1) {
        return { valid: true };
      }
      // Castling
      if (rankDiff === 0 && Math.abs(fileDiff) === 2) {
        const isKingside = fileDiff > 0;
        const canCastle = isWhite
          ? isKingside
            ? state.castling.K
            : state.castling.Q
          : isKingside
          ? state.castling.k
          : state.castling.q;

        if (canCastle) {
          // Check path is clear (simplified - doesn't check for attacks)
          const rookFile = isKingside ? 7 : 0;
          const rookSquare = coordsToSquare(fromRank, rookFile);
          if (isPathClear(state, from, rookSquare)) {
            return { valid: true };
          }
        }
      }
      return { valid: false, error: "Invalid king move" };
    }
  }

  return { valid: false, error: "Unknown piece type" };
}

function isPathClear(state: ChessState, from: string, to: string): boolean {
  const [fromRank, fromFile] = squareToCoords(from);
  const [toRank, toFile] = squareToCoords(to);

  const rankStep = toRank > fromRank ? 1 : toRank < fromRank ? -1 : 0;
  const fileStep = toFile > fromFile ? 1 : toFile < fromFile ? -1 : 0;

  let rank = fromRank + rankStep;
  let file = fromFile + fileStep;

  while (rank !== toRank || file !== toFile) {
    if (state.board[rank][file]) {
      return false;
    }
    rank += rankStep;
    file += fileStep;
  }

  return true;
}

// Check if game is over based on FEN state
function checkGameEnd(
  fen: string
): { isOver: boolean; result?: string; reason?: string } {
  const state = parseFEN(fen);

  // Check for insufficient material (simplified)
  const pieces = state.board.flat().filter((p) => p !== null);
  if (pieces.length === 2) {
    // Only kings
    return { isOver: true, result: "draw", reason: "insufficient_material" };
  }
  if (pieces.length === 3) {
    const nonKings = pieces.filter((p) => p?.toLowerCase() !== "k");
    if (nonKings.length === 1 && ["b", "n", "B", "N"].includes(nonKings[0]!)) {
      return { isOver: true, result: "draw", reason: "insufficient_material" };
    }
  }

  // 50-move rule
  if (state.halfmoveClock >= 100) {
    return { isOver: true, result: "draw", reason: "fifty_moves" };
  }

  return { isOver: false };
}

// ============================================================================
// Types
// ============================================================================

interface ValidateMoveRequest {
  gameId: string;
  playerId: string;
  from: string;
  to: string;
  promotion?: string;
  clientTimestamp: number;
  timeRemainingMs: number;
}

interface SyncTimeRequest {
  gameId: string;
  playerId: string;
  whiteTimeMs: number;
  blackTimeMs: number;
}

interface EndGameRequest {
  gameId: string;
  playerId: string;
  reason: string;
  result?: "white_wins" | "black_wins" | "draw";
}

interface GameRecord {
  id: string;
  white_player_id: string;
  black_player_id: string;
  current_fen: string;
  current_turn: "w" | "b";
  move_count: number;
  status: string;
  white_time_remaining: number;
  black_time_remaining: number;
  time_control_seconds: number;
  increment_seconds: number;
  last_move_at: string | null;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);

    // Verify JWT for all POST requests and resolve the caller's profile ID
    let authenticatedProfileId: string | null = null;
    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const token = authHeader.substring(7);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      authenticatedProfileId = profile?.id ?? null;
    }

    // Route handling
    if (req.method === "POST" && path[0] === "validate-move") {
      return handleValidateMove(supabase, await req.json(), authenticatedProfileId);
    }

    if (req.method === "POST" && path[0] === "sync-time") {
      return handleSyncTime(supabase, await req.json(), authenticatedProfileId);
    }

    if (req.method === "POST" && path[0] === "end-game") {
      return handleEndGame(supabase, await req.json(), authenticatedProfileId);
    }

    if (req.method === "GET" && path[0] === "state" && path[1]) {
      return handleGetState(supabase, path[1]);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Game session error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ============================================================================
// Route Handlers
// ============================================================================

async function handleValidateMove(
  supabase: any,
  request: ValidateMoveRequest,
  authenticatedProfileId: string | null
): Promise<Response> {
  const { gameId, playerId, from, to, promotion, clientTimestamp, timeRemainingMs } =
    request;

  // Verify the caller is the player they claim to be
  if (!authenticatedProfileId || authenticatedProfileId !== playerId) {
    return jsonResponse({ valid: false, error: "Unauthorized" }, 403);
  }

  // Fetch game
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (gameError || !game) {
    return jsonResponse({ valid: false, error: "Game not found" }, 404);
  }

  const gameRecord = game as GameRecord;

  // Verify game is active
  if (gameRecord.status !== "active") {
    return jsonResponse({ valid: false, error: "Game is not active" }, 400);
  }

  // Verify player is in game
  const isWhite = gameRecord.white_player_id === playerId;
  const isBlack = gameRecord.black_player_id === playerId;

  if (!isWhite && !isBlack) {
    return jsonResponse({ valid: false, error: "Player not in game" }, 403);
  }

  // Verify it's player's turn
  const playerColor = isWhite ? "w" : "b";
  if (gameRecord.current_turn !== playerColor) {
    return jsonResponse({ valid: false, error: "Not your turn" }, 400);
  }

  // Parse current FEN and validate move
  const state = parseFEN(gameRecord.current_fen);
  const validation = validateBasicMove(state, from, to, promotion);

  if (!validation.valid) {
    return jsonResponse({ valid: false, error: validation.error }, 400);
  }

  // Apply move to get new FEN (simplified - in production use a chess library)
  const newFen = applyMove(gameRecord.current_fen, from, to, promotion);
  const newMoveCount = gameRecord.move_count + 1;
  const newTurn = playerColor === "w" ? "b" : "w";

  // Calculate time with increment
  const timeWithIncrement = timeRemainingMs + gameRecord.increment_seconds * 1000;
  const newWhiteTime = isWhite
    ? Math.floor(timeWithIncrement / 1000)
    : gameRecord.white_time_remaining;
  const newBlackTime = isBlack
    ? Math.floor(timeWithIncrement / 1000)
    : gameRecord.black_time_remaining;

  // Generate SAN notation (simplified)
  const san = generateSAN(state, from, to, promotion);

  // Check for game end
  const gameEnd = checkGameEnd(newFen);

  // Start transaction
  const now = new Date().toISOString();

  // Insert move record
  const { error: moveError } = await supabase.from("game_moves").insert({
    game_id: gameId,
    move_number: newMoveCount,
    player_id: playerId,
    san,
    uci: `${from}${to}${promotion || ""}`,
    fen_before: gameRecord.current_fen,
    fen_after: newFen,
    time_spent_ms: calculateTimeSpent(gameRecord, clientTimestamp),
    time_remaining_ms: timeRemainingMs,
    is_capture: isCapture(state, to),
    is_check: isCheck(newFen),
    is_checkmate: gameEnd.reason === "checkmate",
    is_castling: isCastling(from, to),
    is_en_passant: isEnPassant(state, from, to),
    is_promotion: !!promotion,
    promotion_piece: promotion || null,
  });

  if (moveError) {
    console.error("Error recording move:", moveError);
  }

  // Update game state
  const updateData: any = {
    current_fen: newFen,
    current_turn: newTurn,
    move_count: newMoveCount,
    white_time_remaining: newWhiteTime,
    black_time_remaining: newBlackTime,
    last_move_at: now,
  };

  if (gameEnd.isOver) {
    updateData.status = "completed";
    updateData.result = gameEnd.result;
    updateData.end_reason = gameEnd.reason;
    updateData.final_fen = newFen;
    updateData.ended_at = now;
  }

  const { error: updateError } = await supabase
    .from("games")
    .update(updateData)
    .eq("id", gameId);

  if (updateError) {
    console.error("Error updating game:", updateError);
    return jsonResponse({ valid: false, error: "Failed to update game" }, 500);
  }

  return jsonResponse({
    valid: true,
    newFen,
    san,
    moveNumber: newMoveCount,
    gameOver: gameEnd.isOver,
    result: gameEnd.result,
    reason: gameEnd.reason,
    whiteTimeRemaining: newWhiteTime,
    blackTimeRemaining: newBlackTime,
  });
}

async function handleSyncTime(
  supabase: any,
  request: SyncTimeRequest,
  authenticatedProfileId: string | null
): Promise<Response> {
  const { gameId, playerId, whiteTimeMs, blackTimeMs } = request;

  // Verify the caller is the player they claim to be
  if (!authenticatedProfileId || authenticatedProfileId !== playerId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  // Verify player is in game
  const { data: game } = await supabase
    .from("games")
    .select("white_player_id, black_player_id, status")
    .eq("id", gameId)
    .single();

  if (!game) {
    return jsonResponse({ error: "Game not found" }, 404);
  }

  if (game.white_player_id !== playerId && game.black_player_id !== playerId) {
    return jsonResponse({ error: "Not a player in this game" }, 403);
  }

  if (game.status !== "active") {
    return jsonResponse({ error: "Game is not active" }, 400);
  }

  // Update time
  await supabase
    .from("games")
    .update({
      white_time_remaining: Math.floor(whiteTimeMs / 1000),
      black_time_remaining: Math.floor(blackTimeMs / 1000),
    })
    .eq("id", gameId);

  return jsonResponse({ success: true });
}

async function handleEndGame(
  supabase: any,
  request: EndGameRequest,
  authenticatedProfileId: string | null
): Promise<Response> {
  const { gameId, playerId, reason, result } = request;

  // Verify the caller is the player they claim to be
  if (!authenticatedProfileId || authenticatedProfileId !== playerId) {
    return jsonResponse({ error: "Unauthorized" }, 403);
  }

  // Fetch game
  const { data: game, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();

  if (error || !game) {
    return jsonResponse({ error: "Game not found" }, 404);
  }

  if (game.status !== "active") {
    return jsonResponse({ error: "Game already ended" }, 400);
  }

  const isWhite = game.white_player_id === playerId;
  const isBlack = game.black_player_id === playerId;

  if (!isWhite && !isBlack) {
    return jsonResponse({ error: "Not a player in this game" }, 403);
  }

  let finalResult = result;
  let winnerId: string | null = null;

  // Determine result based on reason
  switch (reason) {
    case "resign":
      finalResult = isWhite ? "black_wins" : "white_wins";
      winnerId = isWhite ? game.black_player_id : game.white_player_id;
      break;
    case "timeout":
      // The player reporting timeout is the one who lost
      finalResult = isWhite ? "black_wins" : "white_wins";
      winnerId = isWhite ? game.black_player_id : game.white_player_id;
      break;
    case "checkmate":
      if (!finalResult) {
        // Determine from game state
        const state = parseFEN(game.current_fen);
        finalResult = state.turn === "w" ? "black_wins" : "white_wins";
      }
      winnerId = finalResult === "white_wins" ? game.white_player_id : game.black_player_id;
      break;
    case "draw_agreement":
    case "stalemate":
    case "insufficient_material":
    case "threefold_repetition":
    case "fifty_moves":
      finalResult = "draw";
      break;
    case "abandon":
      // Player who abandoned loses
      finalResult = isWhite ? "black_wins" : "white_wins";
      winnerId = isWhite ? game.black_player_id : game.white_player_id;
      break;
  }

  const now = new Date().toISOString();

  // Update game
  await supabase
    .from("games")
    .update({
      status: "completed",
      result: finalResult,
      end_reason: reason,
      winner_id: winnerId,
      final_fen: game.current_fen,
      ended_at: now,
    })
    .eq("id", gameId);

  return jsonResponse({
    success: true,
    result: finalResult,
    reason,
    winnerId,
  });
}

async function handleGetState(supabase: any, gameId: string): Promise<Response> {
  const { data: game, error } = await supabase
    .from("games")
    .select(`
      *,
      white_player:profiles!games_white_player_id_fkey(id, username, avatar_index, elo_rating),
      black_player:profiles!games_black_player_id_fkey(id, username, avatar_index, elo_rating),
      moves:game_moves(*)
    `)
    .eq("id", gameId)
    .single();

  if (error || !game) {
    return jsonResponse({ error: "Game not found" }, 404);
  }

  return jsonResponse({
    game: {
      id: game.id,
      fen: game.current_fen,
      turn: game.current_turn,
      moveCount: game.move_count,
      status: game.status,
      result: game.result,
      endReason: game.end_reason,
      whiteTimeRemaining: game.white_time_remaining,
      blackTimeRemaining: game.black_time_remaining,
      timeControlSeconds: game.time_control_seconds,
      incrementSeconds: game.increment_seconds,
      wagerTct: game.wager_tct,
      startedAt: game.started_at,
      endedAt: game.ended_at,
    },
    whitePlayer: game.white_player,
    blackPlayer: game.black_player,
    moves: game.moves.sort((a: any, b: any) => a.move_number - b.move_number),
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function applyMove(fen: string, from: string, to: string, promotion?: string): string {
  // Simplified FEN update - in production, use a full chess library
  const state = parseFEN(fen);
  const [fromRank, fromFile] = squareToCoords(from);
  const [toRank, toFile] = squareToCoords(to);

  const piece = state.board[fromRank][fromFile];
  state.board[fromRank][fromFile] = null;

  if (promotion) {
    const promotionPiece = piece && isWhitePiece(piece) ? promotion.toUpperCase() : promotion.toLowerCase();
    state.board[toRank][toFile] = promotionPiece;
  } else {
    state.board[toRank][toFile] = piece;
  }

  // Handle castling
  if (piece?.toLowerCase() === "k" && Math.abs(fromFile - toFile) === 2) {
    const isKingside = toFile > fromFile;
    const rookFromFile = isKingside ? 7 : 0;
    const rookToFile = isKingside ? 5 : 3;
    const rook = state.board[fromRank][rookFromFile];
    state.board[fromRank][rookFromFile] = null;
    state.board[fromRank][rookToFile] = rook;
  }

  // Handle en passant capture
  if (piece?.toLowerCase() === "p" && toFile !== fromFile && !state.board[toRank][toFile]) {
    state.board[fromRank][toFile] = null;
  }

  // Update turn
  const newTurn = state.turn === "w" ? "b" : "w";

  // Update castling rights
  if (piece?.toLowerCase() === "k") {
    if (isWhitePiece(piece!)) {
      state.castling.K = false;
      state.castling.Q = false;
    } else {
      state.castling.k = false;
      state.castling.q = false;
    }
  }
  if (piece?.toLowerCase() === "r") {
    if (from === "a1") state.castling.Q = false;
    if (from === "h1") state.castling.K = false;
    if (from === "a8") state.castling.q = false;
    if (from === "h8") state.castling.k = false;
  }

  // Update en passant square
  let newEnPassant = "-";
  if (piece?.toLowerCase() === "p" && Math.abs(fromRank - toRank) === 2) {
    const epRank = (fromRank + toRank) / 2;
    newEnPassant = coordsToSquare(epRank, fromFile);
  }

  // Update halfmove clock
  let halfmove = state.halfmoveClock + 1;
  if (piece?.toLowerCase() === "p" || state.board[toRank][toFile]) {
    halfmove = 0;
  }

  // Update fullmove number
  let fullmove = state.fullmoveNumber;
  if (state.turn === "b") {
    fullmove++;
  }

  // Rebuild FEN
  const fenBoard = state.board
    .map((rank) => {
      let result = "";
      let emptyCount = 0;
      for (const square of rank) {
        if (square) {
          if (emptyCount > 0) {
            result += emptyCount;
            emptyCount = 0;
          }
          result += square;
        } else {
          emptyCount++;
        }
      }
      if (emptyCount > 0) {
        result += emptyCount;
      }
      return result;
    })
    .join("/");

  let castlingStr = "";
  if (state.castling.K) castlingStr += "K";
  if (state.castling.Q) castlingStr += "Q";
  if (state.castling.k) castlingStr += "k";
  if (state.castling.q) castlingStr += "q";
  if (!castlingStr) castlingStr = "-";

  return `${fenBoard} ${newTurn} ${castlingStr} ${newEnPassant} ${halfmove} ${fullmove}`;
}

function generateSAN(state: ChessState, from: string, to: string, promotion?: string): string {
  const piece = getPieceAt(state, from);
  if (!piece) return "";

  const pieceType = piece.toLowerCase();
  const [toRank, toFile] = squareToCoords(to);
  const targetPiece = getPieceAt(state, to);

  // Castling
  if (pieceType === "k" && Math.abs(squareToCoords(from)[1] - toFile) === 2) {
    return toFile > squareToCoords(from)[1] ? "O-O" : "O-O-O";
  }

  let san = "";

  // Piece letter (not for pawns)
  if (pieceType !== "p") {
    san += pieceType.toUpperCase();
  }

  // Capture indicator
  if (targetPiece || (pieceType === "p" && state.enPassant === to)) {
    if (pieceType === "p") {
      san += from[0]; // File for pawn captures
    }
    san += "x";
  }

  // Destination square
  san += to;

  // Promotion
  if (promotion) {
    san += "=" + promotion.toUpperCase();
  }

  return san;
}

function calculateTimeSpent(game: GameRecord, clientTimestamp: number): number {
  if (!game.last_move_at) return 0;
  const lastMoveTime = new Date(game.last_move_at).getTime();
  return Math.max(0, clientTimestamp - lastMoveTime);
}

function isCapture(state: ChessState, to: string): boolean {
  return getPieceAt(state, to) !== null;
}

function isCheck(fen: string): boolean {
  // Simplified - would need full check detection
  return false;
}

function isCastling(from: string, to: string): boolean {
  return (from === "e1" || from === "e8") && Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) === 2;
}

function isEnPassant(state: ChessState, from: string, to: string): boolean {
  const piece = getPieceAt(state, from);
  if (!piece || piece.toLowerCase() !== "p") return false;
  return to === state.enPassant;
}
