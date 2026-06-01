import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Chess } from "https://esm.sh/chess.js@1.3.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function evaluateObjective(
  pgn: string,
  objectiveType: string,
  objectiveValue: string,
  playerColor: string,
): boolean {
  const chess = new Chess();

  try {
    chess.loadPgn(pgn);
  } catch {
    return false;
  }

  if (!chess.isCheckmate()) {
    return false;
  }

  const history = chess.history({ verbose: true });

  if (objectiveType === "checkmate_in_moves") {
    const playerMoveCount =
      playerColor === "white"
        ? Math.ceil(history.length / 2)
        : Math.floor(history.length / 2);
    return playerMoveCount <= parseInt(objectiveValue, 10);
  }

  if (objectiveType === "checkmate_with_piece") {
    const lastMove = history[history.length - 1];
    if (!lastMove) return false;
    return (
      lastMove.piece === objectiveValue.toLowerCase() &&
      lastMove.color === playerColor[0]
    );
  }

  if (objectiveType === "sacrifice_queen") {
    // Opponent must have captured the player's queen at some point
    const captorColor = playerColor === "white" ? "b" : "w";
    return history.some(
      (m) => m.color === captorColor && m.captured === "q",
    );
  }

  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: verify JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: {
    attempt_id: string;
    final_fen: string;
    pgn: string;
    moves_made: number;
    checkmating_piece: string | null;
    queen_sacrificed: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { attempt_id, final_fen, pgn, moves_made, checkmating_piece, queen_sacrificed } = body;

  if (!attempt_id || !pgn) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Load attempt and verify ownership
  const { data: attempt, error: attemptError } = await adminClient
    .from("house_challenge_attempts")
    .select("id, user_id, challenge_id, player_color")
    .eq("id", attempt_id)
    .single();

  if (attemptError || !attempt) {
    return new Response(JSON.stringify({ error: "Attempt not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (attempt.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load challenge to get objective
  const { data: challenge, error: challengeError } = await adminClient
    .from("house_challenges")
    .select("objective_type, objective_value")
    .eq("id", attempt.challenge_id)
    .single();

  if (challengeError || !challenge) {
    return new Response(JSON.stringify({ error: "Challenge not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Evaluate objective server-side
  const objectiveMet = evaluateObjective(
    pgn,
    challenge.objective_type,
    challenge.objective_value,
    attempt.player_color,
  );

  // Call RPC with server-computed result
  const { data, error: rpcError } = await adminClient.rpc("complete_house_challenge", {
    p_attempt_id: attempt_id,
    p_objective_met: objectiveMet,
    p_moves_made: moves_made,
    p_final_fen: final_fen,
    p_pgn: pgn,
    p_checkmating_piece: checkmating_piece,
    p_queen_sacrificed: queen_sacrificed,
  });

  if (rpcError) {
    console.error("[complete-house-challenge] RPC error:", rpcError);
    return new Response(JSON.stringify({ error: rpcError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
