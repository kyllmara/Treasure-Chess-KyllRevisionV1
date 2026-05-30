/**
 * Matchmaking Edge Function
 *
 * Background matchmaking processor that:
 * - Expires timed-out queue entries
 * - Matches compatible players
 * - Creates game records
 * - Locks wagers in escrow
 *
 * This function can be called periodically via a cron job
 * or triggered on queue changes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface QueueEntry {
  id: string;
  user_id: string;
  wager_tct: number;
  time_control_seconds: number;
  increment_seconds: number;
  elo_range_min: number;
  elo_range_max: number;
  user_elo: number;
  status: string;
  created_at: string;
  expires_at: string;
}

interface MatchPair {
  player1: QueueEntry;
  player2: QueueEntry;
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Auth: accept either the service-role bearer token or a pre-shared cron secret
    const authHeader = req.headers.get("Authorization");
    const cronHeader = req.headers.get("X-Cron-Secret");

    const authorized =
      authHeader === `Bearer ${supabaseServiceKey}` ||
      (!!cronSecret && cronHeader === cronSecret);

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for optional filters
    let wagerFilter: number | null = null;
    let timeControlFilter: number | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        wagerFilter = body.wager_tct || null;
        timeControlFilter = body.time_control_seconds || null;
      } catch {
        // Ignore parse errors, process all
      }
    }

    // Step 1: Expire timed-out entries
    const expiredCount = await expireTimedOutEntries(supabase);

    // Step 2: Find and create matches
    const matches = await findAndCreateMatches(
      supabase,
      wagerFilter,
      timeControlFilter
    );

    return new Response(
      JSON.stringify({
        success: true,
        expiredCount,
        matchesCreated: matches.length,
        matches: matches.map((m) => ({
          gameId: m.gameId,
          player1: m.player1Id,
          player2: m.player2Id,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Matchmaking error:", error);
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
// Helper Functions
// ============================================================================

async function expireTimedOutEntries(supabase: any): Promise<number> {
  const { data, error } = await supabase
    .from("matchmaking_queue")
    .update({ status: "expired" })
    .eq("status", "waiting")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("Error expiring entries:", error);
    return 0;
  }

  return data?.length || 0;
}

async function findAndCreateMatches(
  supabase: any,
  wagerFilter: number | null,
  timeControlFilter: number | null
): Promise<Array<{ gameId: string; player1Id: string; player2Id: string }>> {
  // Get all waiting entries
  let query = supabase
    .from("matchmaking_queue")
    .select("*")
    .eq("status", "waiting")
    .order("created_at", { ascending: true });

  if (wagerFilter !== null) {
    query = query.eq("wager_tct", wagerFilter);
  }
  if (timeControlFilter !== null) {
    query = query.eq("time_control_seconds", timeControlFilter);
  }

  const { data: entries, error } = await query;

  if (error || !entries || entries.length < 2) {
    return [];
  }

  // Group by wager and time control
  const groups = groupEntries(entries);
  const matches: Array<{ gameId: string; player1Id: string; player2Id: string }> = [];

  for (const group of Object.values(groups)) {
    const groupMatches = findMatchesInGroup(group as QueueEntry[]);

    for (const pair of groupMatches) {
      const result = await createMatch(supabase, pair);
      if (result) {
        matches.push(result);
      }
    }
  }

  return matches;
}

function groupEntries(
  entries: QueueEntry[]
): Record<string, QueueEntry[]> {
  const groups: Record<string, QueueEntry[]> = {};

  for (const entry of entries) {
    const key = `${entry.wager_tct}-${entry.time_control_seconds}-${entry.increment_seconds}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  }

  return groups;
}

function findMatchesInGroup(entries: QueueEntry[]): MatchPair[] {
  const matches: MatchPair[] = [];
  const used = new Set<string>();

  // Sort by creation time (FIFO)
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].id)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].id)) continue;

      if (areCompatible(sorted[i], sorted[j])) {
        matches.push({ player1: sorted[i], player2: sorted[j] });
        used.add(sorted[i].id);
        used.add(sorted[j].id);
        break;
      }
    }
  }

  return matches;
}

function areCompatible(a: QueueEntry, b: QueueEntry): boolean {
  // Check if each player's ELO is within the other's range
  const aInBRange = a.user_elo >= b.elo_range_min && a.user_elo <= b.elo_range_max;
  const bInARange = b.user_elo >= a.elo_range_min && b.user_elo <= a.elo_range_max;

  return aInBRange && bInARange;
}

async function createMatch(
  supabase: any,
  pair: MatchPair
): Promise<{ gameId: string; player1Id: string; player2Id: string } | null> {
  const { player1, player2 } = pair;

  try {
    // Atomically update both queue entries
    const { error: updateError } = await supabase
      .from("matchmaking_queue")
      .update({
        status: "matched",
        matched_with_id: player2.user_id,
        matched_at: new Date().toISOString(),
      })
      .eq("id", player1.id)
      .eq("status", "waiting");

    if (updateError) {
      console.error("Error updating player1:", updateError);
      return null;
    }

    await supabase
      .from("matchmaking_queue")
      .update({
        status: "matched",
        matched_with_id: player1.user_id,
        matched_at: new Date().toISOString(),
      })
      .eq("id", player2.id)
      .eq("status", "waiting");

    // Randomly assign colors
    const player1IsWhite = Math.random() < 0.5;
    const whitePlayerId = player1IsWhite ? player1.user_id : player2.user_id;
    const blackPlayerId = player1IsWhite ? player2.user_id : player1.user_id;
    const whiteElo = player1IsWhite ? player1.user_elo : player2.user_elo;
    const blackElo = player1IsWhite ? player2.user_elo : player1.user_elo;

    // Create game record
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        white_player_id: whitePlayerId,
        black_player_id: blackPlayerId,
        wager_tct: player1.wager_tct,
        time_control_seconds: player1.time_control_seconds,
        increment_seconds: player1.increment_seconds,
        status: "active",
        initial_fen: INITIAL_FEN,
        current_fen: INITIAL_FEN,
        white_time_remaining: player1.time_control_seconds,
        black_time_remaining: player1.time_control_seconds,
        move_count: 0,
        current_turn: "w",
        white_elo_before: whiteElo,
        black_elo_before: blackElo,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (gameError || !game) {
      console.error("Error creating game:", gameError);
      // Rollback queue status
      await supabase
        .from("matchmaking_queue")
        .update({ status: "waiting", matched_with_id: null, matched_at: null })
        .in("id", [player1.id, player2.id]);
      return null;
    }

    // Update queue entries with game ID
    await supabase
      .from("matchmaking_queue")
      .update({ game_id: game.id })
      .in("id", [player1.id, player2.id]);

    // Create escrow
    await supabase.from("game_escrows").insert({
      game_id: game.id,
      player_white_id: whitePlayerId,
      player_white_locked_tct: player1.wager_tct,
      player_black_id: blackPlayerId,
      player_black_locked_tct: player1.wager_tct,
      total_pool_tct: player1.wager_tct * 2,
      status: "active",
    });

    // Lock funds for both players
    for (const playerId of [whitePlayerId, blackPlayerId]) {
      // Deduct from available, add to locked
      await supabase.rpc("lock_balance_for_game", {
        p_user_id: playerId,
        p_amount: player1.wager_tct,
        p_game_id: game.id,
      });
    }

    console.log(
      `Match created: Game ${game.id} - ${whitePlayerId} (W) vs ${blackPlayerId} (B)`
    );

    return {
      gameId: game.id,
      player1Id: player1.user_id,
      player2Id: player2.user_id,
    };
  } catch (error) {
    console.error("Error creating match:", error);
    return null;
  }
}
