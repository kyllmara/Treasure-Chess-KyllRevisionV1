/**
 * Game Timeout Cron Edge Function
 *
 * Finds and force-settles orphaned active games — games where both players
 * have disconnected and the game has not progressed for an extended period.
 *
 * Two conditions are checked:
 *   1. Game has been active for 3+ hours without a move (last_move_at stale)
 *   2. Game was created 4+ hours ago and never received its first move
 *      (last_move_at IS NULL, game stuck in active state)
 *
 * Winner is determined by whose turn it currently is — the player who failed
 * to move loses:
 *   current_turn = 'w'  →  white failed to move  →  black_wins
 *   current_turn = 'b'  →  black failed to move  →  white_wins
 *
 * Authentication:
 *   Bearer {SUPABASE_SERVICE_ROLE_KEY}  OR  X-Cron-Secret: {CRON_SECRET}
 *
 * Called every 30 minutes by the Supabase Dashboard cron scheduler.
 * See migration 125_game_timeout_cron.sql for setup instructions.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface StuckGame {
  id: string;
  white_player_id: string;
  black_player_id: string;
  current_turn: string;
  wager_tct: number;
  created_at: string;
  last_move_at: string | null;
  status: string;
}

interface TimeoutResult {
  gamesSettled: number;
  errors: string[];
  details: Array<{
    gameId: string;
    result: string;
    success: boolean;
    error?: string;
  }>;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    // Support both POST (manual trigger) and GET (cron job)
    if (req.method !== "POST" && req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Auth check: service role key or shared cron secret
    const authHeader = req.headers.get("Authorization");
    const cronHeader = req.headers.get("X-Cron-Secret");
    const authorized =
      authHeader === `Bearer ${supabaseServiceKey}` ||
      (!!cronSecret && cronHeader === cronSecret);

    if (!authorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const result = await resolveTimedOutGames(supabase, supabaseUrl, supabaseServiceKey);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[game-timeout-cron] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// ============================================================================
// Core Logic
// ============================================================================

async function resolveTimedOutGames(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<TimeoutResult> {
  const result: TimeoutResult = {
    gamesSettled: 0,
    errors: [],
    details: [],
  };

  // ------------------------------------------------------------------
  // Find all stuck active games using two conditions combined with OR:
  //
  //   Condition A — game received at least one move but has been idle
  //   for 3+ hours (covers mid-game disconnects):
  //     status = 'active'
  //     AND last_move_at IS NOT NULL
  //     AND last_move_at < NOW() - INTERVAL '3 hours'
  //
  //   Condition B — game never received a first move and is 4+ hours
  //   old (covers lobby disconnects where both players never started):
  //     status = 'active'
  //     AND last_move_at IS NULL
  //     AND created_at < NOW() - INTERVAL '4 hours'
  //
  // The index on (status, last_move_at) added by migration 125 keeps
  // these queries fast even as the games table grows.
  // ------------------------------------------------------------------

  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

  // Condition A: games with a stale last move
  const { data: staleMoveGames, error: staleMoveError } = await supabase
    .from("games")
    .select("id, white_player_id, black_player_id, current_turn, wager_tct, created_at, last_move_at, status")
    .eq("status", "active")
    .not("last_move_at", "is", null)
    .lt("last_move_at", threeHoursAgo);

  if (staleMoveError) {
    const msg = `Failed to query stale-move games: ${staleMoveError.message}`;
    console.error("[game-timeout-cron]", msg);
    result.errors.push(msg);
  }

  // Condition B: games that never received a move
  const { data: noMoveGames, error: noMoveError } = await supabase
    .from("games")
    .select("id, white_player_id, black_player_id, current_turn, wager_tct, created_at, last_move_at, status")
    .eq("status", "active")
    .is("last_move_at", null)
    .lt("created_at", fourHoursAgo);

  if (noMoveError) {
    const msg = `Failed to query no-move games: ${noMoveError.message}`;
    console.error("[game-timeout-cron]", msg);
    result.errors.push(msg);
  }

  // Deduplicate by ID in case a game somehow appears in both result sets
  const seenIds = new Set<string>();
  const stuckGames: StuckGame[] = [];

  for (const game of [...(staleMoveGames ?? []), ...(noMoveGames ?? [])]) {
    if (!seenIds.has(game.id)) {
      seenIds.add(game.id);
      stuckGames.push(game as StuckGame);
    }
  }

  if (stuckGames.length === 0) {
    console.log("[game-timeout-cron] No stuck games found.");
    return result;
  }

  console.log(`[game-timeout-cron] Found ${stuckGames.length} stuck game(s). Settling...`);

  // ------------------------------------------------------------------
  // Settle each stuck game individually.
  // A single failure must not prevent the remaining games from being
  // processed — log the error and continue to the next game.
  // ------------------------------------------------------------------

  for (const game of stuckGames) {
    const gameResult = determineResult(game.current_turn);
    const detail: TimeoutResult["details"][number] = {
      gameId: game.id,
      result: gameResult,
      success: false,
    };

    console.log(
      `[game-timeout-cron] Settling game ${game.id}: current_turn=${game.current_turn}, result=${gameResult}, ` +
      `last_move_at=${game.last_move_at ?? "never"}, created_at=${game.created_at}`
    );

    try {
      const { error: invokeError } = await supabase.functions.invoke("game-complete", {
        body: {
          gameId: game.id,
          result: gameResult,
          endReason: "timeout",
        },
      });

      if (invokeError) {
        const msg = `game-complete failed for game ${game.id}: ${invokeError.message}`;
        console.error("[game-timeout-cron]", msg);
        detail.error = invokeError.message;
        result.errors.push(msg);
      } else {
        detail.success = true;
        result.gamesSettled++;
        console.log(`[game-timeout-cron] Successfully settled game ${game.id} as ${gameResult}`);
      }
    } catch (err) {
      const msg = `Exception settling game ${game.id}: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[game-timeout-cron]", msg);
      detail.error = msg;
      result.errors.push(msg);
    }

    result.details.push(detail);
  }

  console.log(
    `[game-timeout-cron] Done. Settled ${result.gamesSettled}/${stuckGames.length} game(s). ` +
    `Errors: ${result.errors.length}`
  );

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determines the game result based on whose turn it is.
 *
 * The player whose turn it is failed to move — they lose.
 *   current_turn = 'w'  →  white failed to move  →  black wins
 *   current_turn = 'b'  →  black failed to move  →  white wins
 *
 * If current_turn is somehow neither 'w' nor 'b' (corrupt data), we default
 * to 'draw' so that funds are refunded rather than incorrectly awarded.
 */
function determineResult(currentTurn: string): "white_wins" | "black_wins" | "draw" {
  if (currentTurn === "w") {
    return "black_wins"; // White was supposed to move and didn't
  }
  if (currentTurn === "b") {
    return "white_wins"; // Black was supposed to move and didn't
  }
  // Unexpected value — refund both players rather than guess
  console.warn(`[game-timeout-cron] Unexpected current_turn value: "${currentTurn}", defaulting to draw`);
  return "draw";
}
