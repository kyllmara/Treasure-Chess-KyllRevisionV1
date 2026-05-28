/**
 * Game Complete Edge Function
 *
 * Handles game completion and post-game processing:
 * - ELO rating calculations and updates
 * - Wager settlement (escrow release)
 * - PGN generation and storage
 * - Statistics updates
 * - Game history recording
 *
 * This function should be called when a game ends,
 * either via the game-session function or as a database trigger.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// ELO Calculation (Embedded for Edge Function)
// ============================================================================

const K_FACTOR_NEW = 32;
const K_FACTOR_INTERMEDIATE = 24;
const K_FACTOR_ESTABLISHED = 16;
const K_FACTOR_EXPERT = 10;
const GAMES_THRESHOLD_NEW = 30;
const GAMES_THRESHOLD_INTERMEDIATE = 100;
const RATING_THRESHOLD_EXPERT = 2400;
const RATING_FLOOR = 100;

function getKFactor(gamesPlayed: number, rating?: number): number {
  if (rating !== undefined && rating >= RATING_THRESHOLD_EXPERT) {
    return K_FACTOR_EXPERT;
  }
  if (gamesPlayed < GAMES_THRESHOLD_NEW) {
    return K_FACTOR_NEW;
  }
  if (gamesPlayed < GAMES_THRESHOLD_INTERMEDIATE) {
    return K_FACTOR_INTERMEDIATE;
  }
  return K_FACTOR_ESTABLISHED;
}

function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  const ratingDiff = Math.max(-400, Math.min(400, opponentRating - playerRating));
  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

function resultToScore(result: "win" | "loss" | "draw"): number {
  switch (result) {
    case "win": return 1;
    case "draw": return 0.5;
    case "loss": return 0;
  }
}

interface EloResult {
  newRating: number;
  ratingChange: number;
  kFactor: number;
}

function calculateNewRating(
  playerRating: number,
  opponentRating: number,
  result: "win" | "loss" | "draw",
  gamesPlayed: number
): EloResult {
  const kFactor = getKFactor(gamesPlayed, playerRating);
  const expectedScore = calculateExpectedScore(playerRating, opponentRating);
  const actualScore = resultToScore(result);
  const ratingChange = Math.round(kFactor * (actualScore - expectedScore));
  const newRating = Math.max(RATING_FLOOR, playerRating + ratingChange);

  return {
    newRating,
    ratingChange: newRating - playerRating,
    kFactor,
  };
}

// ============================================================================
// PGN Generation (Embedded for Edge Function)
// ============================================================================

interface PGNMove {
  san: string;
  time_remaining_ms?: number;
}

function generatePGN(
  gameId: string,
  whiteUsername: string,
  blackUsername: string,
  whiteElo: number,
  blackElo: number,
  whiteEloChange: number,
  blackEloChange: number,
  moves: PGNMove[],
  result: string,
  endReason: string,
  timeControlSeconds: number,
  incrementSeconds: number,
  wagerTct: number,
  startedAt: Date
): string {
  const lines: string[] = [];

  // Headers
  const eventName = wagerTct > 0 ? `Treasure Chess Wager (${wagerTct} TCT)` : "Treasure Chess Game";
  const dateStr = formatPGNDate(startedAt);
  const pgnResult = gameResultToPGN(result);
  const termination = formatTermination(endReason, result);
  const timeControl = incrementSeconds > 0 ? `${timeControlSeconds}+${incrementSeconds}` : `${timeControlSeconds}`;

  lines.push(`[Event "${eventName}"]`);
  lines.push(`[Site "Treasure Chess"]`);
  lines.push(`[Date "${dateStr}"]`);
  lines.push(`[Round "-"]`);
  lines.push(`[White "${escapeString(whiteUsername)}"]`);
  lines.push(`[Black "${escapeString(blackUsername)}"]`);
  lines.push(`[Result "${pgnResult}"]`);
  lines.push(`[WhiteElo "${whiteElo}"]`);
  lines.push(`[BlackElo "${blackElo}"]`);
  lines.push(`[WhiteEloChange "${whiteEloChange > 0 ? '+' : ''}${whiteEloChange}"]`);
  lines.push(`[BlackEloChange "${blackEloChange > 0 ? '+' : ''}${blackEloChange}"]`);
  lines.push(`[TimeControl "${timeControl}"]`);
  lines.push(`[Termination "${termination}"]`);
  lines.push(`[GameId "${gameId}"]`);
  if (wagerTct > 0) {
    lines.push(`[Wager "${wagerTct} TCT"]`);
  }

  lines.push("");

  // Moves
  const moveParts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const isWhiteMove = i % 2 === 0;
    const moveNumber = Math.floor(i / 2) + 1;

    if (isWhiteMove) {
      moveParts.push(`${moveNumber}.`);
    }

    moveParts.push(move.san);

    // Add clock annotation if available
    if (move.time_remaining_ms !== undefined) {
      const timeStr = formatClockTime(move.time_remaining_ms);
      moveParts.push(`{[%clk ${timeStr}]}`);
    }
  }

  moveParts.push(pgnResult);

  // Wrap move text
  const moveText = wrapText(moveParts.join(" "), 80);
  lines.push(moveText);

  return lines.join("\n");
}

function formatPGNDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatClockTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function gameResultToPGN(result: string): string {
  switch (result) {
    case "white_wins": return "1-0";
    case "black_wins": return "0-1";
    case "draw": return "1/2-1/2";
    default: return "*";
  }
}

function formatTermination(reason: string, result: string): string {
  const winner = result === "white_wins" ? "White" : result === "black_wins" ? "Black" : null;

  switch (reason) {
    case "checkmate": return `${winner} wins by checkmate`;
    case "timeout": return `${winner} wins on time`;
    case "resign": return `${winner} wins by resignation`;
    case "abandon": return `${winner} wins by abandonment`;
    case "draw_agreement": return "Draw by agreement";
    case "stalemate": return "Draw by stalemate";
    case "insufficient_material": return "Draw by insufficient material";
    case "threefold_repetition": return "Draw by threefold repetition";
    case "fifty_moves": return "Draw by fifty-move rule";
    default: return "Game ended";
  }
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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

// ============================================================================
// Types
// ============================================================================

interface GameCompleteRequest {
  gameId: string;
  // Optional fields for client-initiated game completion
  result?: "white_wins" | "black_wins" | "draw";
  winnerId?: string | null;
  endReason?: string;
  finalFen?: string;
}

interface GameRecord {
  id: string;
  white_player_id: string;
  black_player_id: string;
  white_elo_before: number;
  black_elo_before: number;
  result: string;
  end_reason: string;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  started_at: string;
  ended_at: string;
  status: string;
  current_fen: string;
  on_chain_game_id?: string;
  on_chain_settled?: boolean;
}

interface PlayerProfile {
  id: string;
  username: string;
  elo_rating: number;
  games_played: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  console.log("[game-complete] Handler started, method:", req.method);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[game-complete] Missing env vars");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    // Use service role with auth bypass to update game status
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("[game-complete] JSON parse error:", parseErr);
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    console.log("[game-complete] Request body:", JSON.stringify(body));

    const { gameId, result, winnerId, endReason, finalFen }: GameCompleteRequest = body;

    if (!gameId) {
      return jsonResponse({ error: "gameId is required" }, 400);
    }

    console.log(`[game-complete] Processing game: ${gameId}, result: ${result}, winnerId: ${winnerId}`);

    // Fetch game with player profiles
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return jsonResponse({ error: "Game not found" }, 404);
    }

    let gameRecord = game as GameRecord;

    // If game is not yet completed but client provided result, complete it now
    if (gameRecord.status !== "completed" && result) {
      console.log(`[game-complete] Completing game ${gameId} with result: ${result}`);

      // Use RPC function to bypass trigger restrictions
      const { error: updateError } = await supabase.rpc("finish_game", {
        p_game_id: gameId,
        p_status: "completed",
        p_result: result,
        p_winner_id: winnerId || null,
        p_end_reason: endReason || "unknown",
        p_final_fen: finalFen || gameRecord.current_fen || null,
      });

      if (updateError) {
        console.error("[game-complete] Failed to update game status:", updateError);
        return jsonResponse({ error: "Failed to complete game: " + updateError.message }, 500);
      }

      // Refetch the game with updated status
      const { data: updatedGame, error: refetchError } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .single();

      if (refetchError || !updatedGame) {
        return jsonResponse({ error: "Failed to refetch game" }, 500);
      }

      gameRecord = updatedGame as GameRecord;
    }

    // Verify game is now completed
    if (gameRecord.status !== "completed") {
      return jsonResponse({ error: "Game is not completed" }, 400);
    }

    // Check if already processed (ELO already calculated)
    const { data: existingElo } = await supabase
      .from("games")
      .select("white_elo_after, black_elo_after, on_chain_settled, on_chain_game_id, wager_tct")
      .eq("id", gameId)
      .single();

    // Only skip if we successfully fetched the game AND white_elo_after is set (not null)
    // HOWEVER: If on-chain settlement is pending, we should still try to settle it!
    const eloAlreadyProcessed = existingElo && existingElo.white_elo_after !== null && existingElo.white_elo_after !== undefined;
    const needsOnChainSettlement = existingElo?.on_chain_game_id && !existingElo?.on_chain_settled && existingElo?.wager_tct > 0;

    if (eloAlreadyProcessed && !needsOnChainSettlement) {
      console.log(`[game-complete] Game ${gameId} already fully processed, white_elo_after:`, existingElo.white_elo_after);
      return jsonResponse({ error: "Game already processed", alreadyProcessed: true }, 400);
    }

    // If ELO is done but on-chain settlement is pending, just do the settlement
    if (eloAlreadyProcessed && needsOnChainSettlement) {
      console.log(`[game-complete] Game ${gameId} ELO done, but on-chain settlement pending. Retrying settlement...`);

      try {
        const onChainSettlement = await settleOnChainEscrow(gameRecord);
        console.log("[game-complete] Retry on-chain settlement result:", onChainSettlement);

        return jsonResponse({
          success: true,
          gameId,
          message: "On-chain settlement retried",
          onChainSettlement,
          eloAlreadyProcessed: true,
        });
      } catch (e) {
        console.error("[game-complete] Retry on-chain settlement failed:", e);
        return jsonResponse({
          success: false,
          error: e instanceof Error ? e.message : "Settlement retry failed",
          eloAlreadyProcessed: true,
        }, 500);
      }
    }

    // Fetch player profiles
    const { data: whitePlayer, error: whiteError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", gameRecord.white_player_id)
      .single();

    const { data: blackPlayer, error: blackError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", gameRecord.black_player_id)
      .single();

    if (whiteError || blackError || !whitePlayer || !blackPlayer) {
      return jsonResponse({ error: "Failed to fetch player profiles" }, 500);
    }

    const whiteProfile = whitePlayer as PlayerProfile;
    const blackProfile = blackPlayer as PlayerProfile;

    // Use ELO from game record, or fall back to current profile ELO
    const whiteEloBefore = gameRecord.white_elo_before ?? whiteProfile.elo_rating ?? 1200;
    const blackEloBefore = gameRecord.black_elo_before ?? blackProfile.elo_rating ?? 1200;

    console.log(`[game-complete] ELO before - White: ${whiteEloBefore}, Black: ${blackEloBefore}`);

    // Determine results for each player
    let whiteResult: "win" | "loss" | "draw";
    let blackResult: "win" | "loss" | "draw";

    switch (gameRecord.result) {
      case "white_wins":
        whiteResult = "win";
        blackResult = "loss";
        break;
      case "black_wins":
        whiteResult = "loss";
        blackResult = "win";
        break;
      default:
        whiteResult = "draw";
        blackResult = "draw";
    }

    // Calculate ELO changes
    const whiteEloCalc = calculateNewRating(
      whiteEloBefore,
      blackEloBefore,
      whiteResult,
      whiteProfile.games_played ?? 0
    );

    const blackEloCalc = calculateNewRating(
      blackEloBefore,
      whiteEloBefore,
      blackResult,
      blackProfile.games_played ?? 0
    );

    // Fetch moves for PGN
    const { data: moves } = await supabase
      .from("game_moves")
      .select("san, time_remaining_ms")
      .eq("game_id", gameId)
      .order("move_number", { ascending: true });

    // Generate PGN
    const pgn = generatePGN(
      gameId,
      whiteProfile.username || "White",
      blackProfile.username || "Black",
      whiteEloBefore,
      blackEloBefore,
      whiteEloCalc.ratingChange,
      blackEloCalc.ratingChange,
      moves || [],
      gameRecord.result,
      gameRecord.end_reason || "unknown",
      gameRecord.time_control_seconds || 300,
      gameRecord.increment_seconds || 0,
      gameRecord.wager_tct || 0,
      new Date(gameRecord.started_at || Date.now())
    );

    // Begin updates - wrap in try-catch to continue even if some fail

    // 1. Update game with ELO results and PGN
    try {
      const { error: gameUpdateErr } = await supabase
        .from("games")
        .update({
          white_elo_after: whiteEloCalc.newRating,
          black_elo_after: blackEloCalc.newRating,
          white_elo_change: whiteEloCalc.ratingChange,
          black_elo_change: blackEloCalc.ratingChange,
          pgn,
        })
        .eq("id", gameId);
      if (gameUpdateErr) console.error("[game-complete] Game ELO update error:", gameUpdateErr);
    } catch (e) {
      console.error("[game-complete] Game ELO update exception:", e);
    }

    // 2. Update white player profile
    try {
      const { error: whiteUpdateErr } = await supabase
        .from("profiles")
        .update({
          elo_rating: whiteEloCalc.newRating,
          games_played: (whiteProfile.games_played || 0) + 1,
          games_won: (whiteProfile.games_won || 0) + (whiteResult === "win" ? 1 : 0),
          games_lost: (whiteProfile.games_lost || 0) + (whiteResult === "loss" ? 1 : 0),
          games_drawn: (whiteProfile.games_drawn || 0) + (whiteResult === "draw" ? 1 : 0),
        })
        .eq("id", gameRecord.white_player_id);
      if (whiteUpdateErr) console.error("[game-complete] White profile update error:", whiteUpdateErr);
    } catch (e) {
      console.error("[game-complete] White profile update exception:", e);
    }

    // 3. Update black player profile
    try {
      const { error: blackUpdateErr } = await supabase
        .from("profiles")
        .update({
          elo_rating: blackEloCalc.newRating,
          games_played: (blackProfile.games_played || 0) + 1,
          games_won: (blackProfile.games_won || 0) + (blackResult === "win" ? 1 : 0),
          games_lost: (blackProfile.games_lost || 0) + (blackResult === "loss" ? 1 : 0),
          games_drawn: (blackProfile.games_drawn || 0) + (blackResult === "draw" ? 1 : 0),
        })
        .eq("id", gameRecord.black_player_id);
      if (blackUpdateErr) console.error("[game-complete] Black profile update error:", blackUpdateErr);
    } catch (e) {
      console.error("[game-complete] Black profile update exception:", e);
    }

    // 4. Settle wager if applicable
    let wagerSettlement = null;
    let onChainSettlement = null;

    console.log("[game-complete] Wager check:", {
      wager_tct: gameRecord.wager_tct,
      on_chain_game_id: gameRecord.on_chain_game_id,
      on_chain_settled: gameRecord.on_chain_settled,
    });

    if (gameRecord.wager_tct && gameRecord.wager_tct > 0) {
      // ALWAYS do DB settlement first — this is the authoritative payout.
      // DB balances were locked at game creation, so this always works
      // regardless of on-chain escrow state.
      try {
        console.log("[game-complete] Settling database escrow (always runs first)");
        wagerSettlement = await settleWager(supabase, gameRecord);
        console.log("[game-complete] Database settlement result:", wagerSettlement);
      } catch (e) {
        console.error("[game-complete] DB wager settlement exception:", e);
      }

      // Additionally attempt on-chain settlement if escrow exists and isn't settled.
      // This is a best-effort operation — DB settlement above already handled payouts.
      if (gameRecord.on_chain_game_id && !gameRecord.on_chain_settled) {
        try {
          console.log("[game-complete] Additionally settling on-chain escrow");
          onChainSettlement = await settleOnChainEscrow(gameRecord);
          console.log("[game-complete] On-chain settlement result:", onChainSettlement);
        } catch (e) {
          console.error("[game-complete] On-chain settlement exception (non-fatal, DB settlement already done):", e);
        }
      }
    } else {
      console.log("[game-complete] No wager to settle");
    }

    // 5. Record game in history (already wrapped in try-catch)
    await recordGameHistory(supabase, gameRecord, whiteProfile, blackProfile, whiteEloCalc, blackEloCalc, whiteEloBefore, blackEloBefore);

    return jsonResponse({
      success: true,
      gameId,
      eloChanges: {
        white: {
          playerId: gameRecord.white_player_id,
          oldRating: whiteEloBefore,
          newRating: whiteEloCalc.newRating,
          change: whiteEloCalc.ratingChange,
          kFactor: whiteEloCalc.kFactor,
        },
        black: {
          playerId: gameRecord.black_player_id,
          oldRating: blackEloBefore,
          newRating: blackEloCalc.newRating,
          change: blackEloCalc.ratingChange,
          kFactor: blackEloCalc.kFactor,
        },
      },
      wagerSettlement,
      onChainSettlement,
      pgn,
    });
  } catch (error) {
    console.error("Game complete error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ============================================================================
// On-Chain Escrow Settlement
// ============================================================================

interface OnChainSettlement {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  result?: string;
  error?: string;
  alreadySettled?: boolean;
}

async function settleOnChainEscrow(game: GameRecord): Promise<OnChainSettlement> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    console.log(`[game-complete] Settling on-chain escrow for game ${game.id}`);
    console.log(`[game-complete] on_chain_game_id: ${game.on_chain_game_id}`);
    console.log(`[game-complete] supabaseUrl: ${supabaseUrl}`);

    const requestBody = {
      gameId: game.id,
      onChainGameId: game.on_chain_game_id,
    };
    console.log(`[game-complete] Request body:`, JSON.stringify(requestBody));

    // Call the submit-game-result edge function
    const response = await fetch(
      `${supabaseUrl}/functions/v1/submit-game-result`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    console.log(`[game-complete] Response status: ${response.status}`);

    const resultText = await response.text();
    console.log(`[game-complete] Response body: ${resultText}`);

    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error(`[game-complete] Failed to parse response: ${resultText}`);
      return {
        success: false,
        error: `Invalid response: ${resultText.substring(0, 100)}`,
      };
    }

    if (!response.ok) {
      console.error(`[game-complete] On-chain settlement failed:`, result);
      return {
        success: false,
        error: result.error || `On-chain settlement failed (${response.status})`,
      };
    }

    console.log(`[game-complete] On-chain settlement successful:`, result);

    return {
      success: true,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      result: result.result,
      alreadySettled: result.alreadySettled,
    };
  } catch (error) {
    console.error(`[game-complete] Error settling on-chain escrow:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// Wager Settlement with Rake System
// ============================================================================

interface WagerSettlement {
  winnerId: string | null;
  winnerPayout: number;
  platformFee: number;
  rakeAmount: number;
  treasuryAmount: number;
  rewardPoolAmount: number;
  refunded: boolean;
  ledgerTransactionId: string | null;
}

async function settleWager(
  supabase: any,
  game: GameRecord
): Promise<WagerSettlement> {
  // Determine winner ID
  let winnerId: string | null = null;
  if (game.result === "white_wins") {
    winnerId = game.white_player_id;
  } else if (game.result === "black_wins") {
    winnerId = game.black_player_id;
  }
  // For draws, winnerId remains null which triggers refund logic (no rake)

  // Use the settle_escrow_with_rake database function for atomic settlement
  // This function handles:
  // - Winner payout with 5% rake deducted
  // - Rake split: 80% treasury, 20% reward pool
  // - Full refund on draws (no rake taken)
  // - Double-entry ledger recording
  // - Balance updates
  // Falls back to settle_escrow for backward compatibility
  let settlementData;
  let settlementError;

  // Try the new rake function first
  const rakeResult = await supabase.rpc(
    "settle_escrow_with_rake",
    {
      p_game_id: game.id,
      p_winner_id: winnerId,
      p_reason: game.end_reason || "unknown",
    }
  );

  if (rakeResult.error) {
    // Fall back to legacy settle_escrow
    console.log("Falling back to legacy settle_escrow");
    const legacyResult = await supabase.rpc(
      "settle_escrow",
      {
        p_game_id: game.id,
        p_winner_id: winnerId,
        p_reason: game.end_reason || "unknown",
      }
    );
    settlementData = legacyResult.data;
    settlementError = legacyResult.error;
  } else {
    settlementData = rakeResult.data;
    settlementError = rakeResult.error;
  }

  if (settlementError) {
    console.error("Settlement error:", settlementError);
    return {
      winnerId: null,
      winnerPayout: 0,
      platformFee: 0,
      rakeAmount: 0,
      treasuryAmount: 0,
      rewardPoolAmount: 0,
      refunded: false,
      ledgerTransactionId: null,
    };
  }

  // settle_escrow returns a table, get first row
  const result = Array.isArray(settlementData) ? settlementData[0] : settlementData;

  if (!result) {
    console.error("No settlement result returned");
    return {
      winnerId: null,
      winnerPayout: 0,
      platformFee: 0,
      rakeAmount: 0,
      treasuryAmount: 0,
      rewardPoolAmount: 0,
      refunded: false,
      ledgerTransactionId: null,
    };
  }

  // Handle both new rake format and legacy format
  const rakeAmount = Number(result.rake_amount ?? result.commission ?? 0);
  const treasuryAmount = Number(result.treasury_amount ?? rakeAmount * 0.80);
  const rewardPoolAmount = Number(result.reward_pool_amount ?? rakeAmount * 0.20);

  return {
    winnerId: result.is_draw ? null : winnerId,
    winnerPayout: Number(result.winner_payout) || 0,
    platformFee: rakeAmount, // Alias for backward compatibility
    rakeAmount,
    treasuryAmount,
    rewardPoolAmount,
    refunded: result.is_draw || false,
    ledgerTransactionId: result.ledger_transaction_id || null,
  };
}

// ============================================================================
// Game History
// ============================================================================

async function recordGameHistory(
  supabase: any,
  game: GameRecord,
  whiteProfile: PlayerProfile,
  blackProfile: PlayerProfile,
  whiteElo: EloResult,
  blackElo: EloResult,
  whiteEloBefore: number,
  blackEloBefore: number
): Promise<void> {
  try {
    // Record for white player
    await supabase.from("game_history").insert({
      player_id: game.white_player_id,
      game_id: game.id,
      opponent_id: game.black_player_id,
      opponent_username: blackProfile.username || "Opponent",
      played_as: "white",
      result: game.result === "white_wins" ? "win" : game.result === "black_wins" ? "loss" : "draw",
      elo_before: whiteEloBefore,
      elo_after: whiteElo.newRating,
      elo_change: whiteElo.ratingChange,
      wager_tct: game.wager_tct || 0,
      time_control_seconds: game.time_control_seconds || 300,
      increment_seconds: game.increment_seconds || 0,
      played_at: game.started_at || new Date().toISOString(),
    });

    // Record for black player
    await supabase.from("game_history").insert({
      player_id: game.black_player_id,
      game_id: game.id,
      opponent_id: game.white_player_id,
      opponent_username: whiteProfile.username || "Opponent",
      played_as: "black",
      result: game.result === "black_wins" ? "win" : game.result === "white_wins" ? "loss" : "draw",
      elo_before: blackEloBefore,
      elo_after: blackElo.newRating,
      elo_change: blackElo.ratingChange,
      wager_tct: game.wager_tct || 0,
      time_control_seconds: game.time_control_seconds || 300,
      increment_seconds: game.increment_seconds || 0,
      played_at: game.started_at || new Date().toISOString(),
    });
  } catch (err) {
    // Log but don't fail - game history is non-critical
    console.error("[game-complete] Failed to record game history:", err);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
