/**
 * Tournament Scheduler Edge Function
 *
 * Handles automated tournament lifecycle management:
 * - Creates tournaments from recurring templates
 * - Starts tournaments when registration period ends
 * - Advances rounds for active tournaments
 * - Finalizes completed tournaments and distributes prizes
 *
 * This function should be called via a cron job (e.g., every minute)
 * or can be triggered manually for immediate processing.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface Tournament {
  id: string;
  name: string;
  type: "knockout" | "swiss" | "arena";
  status: "draft" | "registration" | "starting" | "active" | "completed" | "cancelled";
  start_time: string;
  current_round: number;
  rounds: number | null;
  min_players: number;
  max_players: number;
  current_players: number;
}

interface TournamentTemplate {
  id: string;
  name: string;
  type: "knockout" | "swiss" | "arena";
  recurrence: "daily" | "weekly" | "monthly" | null;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  minute_utc: number;
  registration_hours_before: number;
  is_active: boolean;
  next_scheduled_at: string | null;
}

interface SchedulerResult {
  tournamentsCreated: number;
  tournamentsStarted: number;
  roundsAdvanced: number;
  tournamentsFinalized: number;
  tournamentsCancelled: number;
  errors: string[];
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional parameters
    let forceStart = false;
    let specificTournamentId: string | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        forceStart = body.forceStart === true;
        specificTournamentId = body.tournamentId || null;
      } catch {
        // No body or invalid JSON, continue with defaults
      }
    }

    const result = await runScheduler(supabase, { forceStart, specificTournamentId });

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
    console.error("Tournament scheduler error:", error);
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
// Scheduler Logic
// ============================================================================

async function runScheduler(
  supabase: any,
  options: { forceStart: boolean; specificTournamentId: string | null }
): Promise<SchedulerResult> {
  const result: SchedulerResult = {
    tournamentsCreated: 0,
    tournamentsStarted: 0,
    roundsAdvanced: 0,
    tournamentsFinalized: 0,
    tournamentsCancelled: 0,
    errors: [],
  };

  try {
    // Step 1: Create tournaments from templates that are due
    const created = await createScheduledTournaments(supabase);
    result.tournamentsCreated = created.count;
    result.errors.push(...created.errors);

    // Step 2: Start tournaments that have reached their start time
    const started = await startReadyTournaments(supabase, options);
    result.tournamentsStarted = started.count;
    result.tournamentsCancelled = started.cancelled;
    result.errors.push(...started.errors);

    // Step 3: Advance rounds for active tournaments
    const advanced = await advanceRounds(supabase, options.specificTournamentId);
    result.roundsAdvanced = advanced.count;
    result.errors.push(...advanced.errors);

    // Step 4: Finalize completed tournaments
    const finalized = await finalizeTournaments(supabase, options.specificTournamentId);
    result.tournamentsFinalized = finalized.count;
    result.errors.push(...finalized.errors);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Scheduler error");
  }

  return result;
}

// ============================================================================
// Step 1: Create Tournaments from Templates
// ============================================================================

async function createScheduledTournaments(
  supabase: any
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Get active templates that are due to create a tournament
  const now = new Date();
  const { data: templates, error: fetchError } = await supabase
    .from("tournament_templates")
    .select("*")
    .eq("is_active", true)
    .not("recurrence", "is", null)
    .or(`next_scheduled_at.is.null,next_scheduled_at.lte.${now.toISOString()}`);

  if (fetchError) {
    errors.push(`Failed to fetch templates: ${fetchError.message}`);
    return { count, errors };
  }

  for (const template of templates || []) {
    try {
      // Call the database function to create tournament from template
      const { data: createResult, error: createError } = await supabase
        .rpc("create_tournament_from_template", {
          p_template_id: template.id,
        });

      if (createError) {
        errors.push(`Failed to create tournament from template ${template.id}: ${createError.message}`);
        continue;
      }

      if (createResult?.success) {
        count++;
        console.log(`Created tournament ${createResult.tournament_id} from template ${template.id}`);

        // Calculate and update next scheduled time
        const nextScheduled = calculateNextScheduledTime(template);
        if (nextScheduled) {
          await supabase
            .from("tournament_templates")
            .update({
              next_scheduled_at: nextScheduled.toISOString(),
              last_created_tournament_id: createResult.tournament_id,
            })
            .eq("id", template.id);
        }
      }
    } catch (error) {
      errors.push(`Error processing template ${template.id}: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  return { count, errors };
}

function calculateNextScheduledTime(template: TournamentTemplate): Date | null {
  const now = new Date();
  const next = new Date(now);

  // Set to template's scheduled time
  next.setUTCHours(template.hour_utc, template.minute_utc, 0, 0);

  switch (template.recurrence) {
    case "daily":
      // If today's time has passed, schedule for tomorrow
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      break;

    case "weekly":
      if (template.day_of_week !== null) {
        // Find next occurrence of the day of week
        const currentDay = next.getUTCDay();
        let daysUntil = template.day_of_week - currentDay;
        if (daysUntil <= 0 || (daysUntil === 0 && next <= now)) {
          daysUntil += 7;
        }
        next.setUTCDate(next.getUTCDate() + daysUntil);
      }
      break;

    case "monthly":
      if (template.day_of_month !== null) {
        // Set to specified day of month
        next.setUTCDate(template.day_of_month);
        // If this month's date has passed, go to next month
        if (next <= now) {
          next.setUTCMonth(next.getUTCMonth() + 1);
        }
        // Handle months with fewer days
        const targetDay = template.day_of_month;
        while (next.getUTCDate() !== targetDay) {
          next.setUTCDate(targetDay);
        }
      }
      break;

    default:
      return null;
  }

  return next;
}

// ============================================================================
// Step 2: Start Ready Tournaments
// ============================================================================

async function startReadyTournaments(
  supabase: any,
  options: { forceStart: boolean; specificTournamentId: string | null }
): Promise<{ count: number; cancelled: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  let cancelled = 0;

  const now = new Date();

  // Build query for tournaments ready to start
  let query = supabase
    .from("tournaments")
    .select("*")
    .in("status", ["registration", "starting"]);

  if (options.specificTournamentId) {
    query = query.eq("id", options.specificTournamentId);
  } else if (!options.forceStart) {
    // Only get tournaments past their start time
    query = query.lte("start_time", now.toISOString());
  }

  const { data: tournaments, error: fetchError } = await query;

  if (fetchError) {
    errors.push(`Failed to fetch ready tournaments: ${fetchError.message}`);
    return { count, cancelled, errors };
  }

  for (const tournament of tournaments || []) {
    try {
      // Check minimum player requirement
      if (tournament.current_players < tournament.min_players) {
        // Cancel tournament due to insufficient players
        const { error: cancelError } = await supabase.rpc("cancel_tournament", {
          p_tournament_id: tournament.id,
          p_reason: `Insufficient players (${tournament.current_players}/${tournament.min_players} required)`,
        });

        if (cancelError) {
          errors.push(`Failed to cancel tournament ${tournament.id}: ${cancelError.message}`);
        } else {
          cancelled++;
          console.log(`Cancelled tournament ${tournament.id} due to insufficient players`);
        }
        continue;
      }

      // Start the tournament
      const { data: startResult, error: startError } = await supabase.rpc(
        "start_tournament",
        { p_tournament_id: tournament.id }
      );

      if (startError) {
        errors.push(`Failed to start tournament ${tournament.id}: ${startError.message}`);
        continue;
      }

      if (startResult?.success) {
        count++;
        console.log(`Started tournament ${tournament.id} (${tournament.name})`);

        // Send notifications to all participants
        await notifyTournamentStart(supabase, tournament.id);
      }
    } catch (error) {
      errors.push(`Error starting tournament ${tournament.id}: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  return { count, cancelled, errors };
}

// ============================================================================
// Step 3: Advance Rounds
// ============================================================================

async function advanceRounds(
  supabase: any,
  specificTournamentId: string | null
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Get active tournaments that may need round advancement
  let query = supabase
    .from("tournaments")
    .select("*")
    .eq("status", "active");

  if (specificTournamentId) {
    query = query.eq("id", specificTournamentId);
  }

  const { data: tournaments, error: fetchError } = await query;

  if (fetchError) {
    errors.push(`Failed to fetch active tournaments: ${fetchError.message}`);
    return { count, errors };
  }

  for (const tournament of tournaments || []) {
    try {
      // Check if all matches in current round are completed
      const { data: pendingMatches, error: matchError } = await supabase
        .from("tournament_matches")
        .select("id")
        .eq("tournament_id", tournament.id)
        .eq("round", tournament.current_round)
        .neq("status", "completed")
        .neq("status", "bye");

      if (matchError) {
        errors.push(`Failed to check matches for ${tournament.id}: ${matchError.message}`);
        continue;
      }

      // If matches still pending, skip this tournament
      if (pendingMatches && pendingMatches.length > 0) {
        continue;
      }

      // All matches complete - advance to next round
      if (tournament.type === "swiss") {
        // Swiss: Generate next round pairings
        if (tournament.rounds && tournament.current_round < tournament.rounds) {
          const { data: pairingResult, error: pairingError } = await supabase.rpc(
            "generate_swiss_pairings",
            {
              p_tournament_id: tournament.id,
              p_round: tournament.current_round + 1,
            }
          );

          if (pairingError) {
            errors.push(`Failed to generate Swiss pairings for ${tournament.id}: ${pairingError.message}`);
            continue;
          }

          if (pairingResult?.success) {
            // Update current round
            await supabase
              .from("tournaments")
              .update({ current_round: tournament.current_round + 1 })
              .eq("id", tournament.id);

            count++;
            console.log(`Advanced Swiss tournament ${tournament.id} to round ${tournament.current_round + 1}`);

            // Notify players of new round
            await notifyRoundStart(supabase, tournament.id, tournament.current_round + 1);
          }
        }
      } else if (tournament.type === "knockout") {
        // Knockout: Check if there are more rounds
        const { data: nextRoundMatches } = await supabase
          .from("tournament_matches")
          .select("id")
          .eq("tournament_id", tournament.id)
          .eq("round", tournament.current_round + 1)
          .limit(1);

        if (nextRoundMatches && nextRoundMatches.length > 0) {
          // Update to next round
          await supabase
            .from("tournaments")
            .update({ current_round: tournament.current_round + 1 })
            .eq("id", tournament.id);

          count++;
          console.log(`Advanced knockout tournament ${tournament.id} to round ${tournament.current_round + 1}`);

          // Notify advancing players
          await notifyRoundStart(supabase, tournament.id, tournament.current_round + 1);
        }
      }
    } catch (error) {
      errors.push(`Error advancing tournament ${tournament.id}: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// Step 4: Finalize Completed Tournaments
// ============================================================================

async function finalizeTournaments(
  supabase: any,
  specificTournamentId: string | null
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Get active tournaments that may be complete
  let query = supabase
    .from("tournaments")
    .select("*")
    .eq("status", "active");

  if (specificTournamentId) {
    query = query.eq("id", specificTournamentId);
  }

  const { data: tournaments, error: fetchError } = await query;

  if (fetchError) {
    errors.push(`Failed to fetch tournaments for finalization: ${fetchError.message}`);
    return { count, errors };
  }

  for (const tournament of tournaments || []) {
    try {
      let shouldFinalize = false;

      if (tournament.type === "knockout") {
        // Knockout: Check if final match is completed
        const { data: finalMatch, error: finalError } = await supabase
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", tournament.id)
          .is("next_match_id", null)
          .single();

        if (!finalError && finalMatch?.status === "completed") {
          shouldFinalize = true;
        }
      } else if (tournament.type === "swiss") {
        // Swiss: Check if all rounds are completed
        if (tournament.rounds && tournament.current_round >= tournament.rounds) {
          const { data: incompleteMatches } = await supabase
            .from("tournament_matches")
            .select("id")
            .eq("tournament_id", tournament.id)
            .neq("status", "completed")
            .neq("status", "bye")
            .limit(1);

          if (!incompleteMatches || incompleteMatches.length === 0) {
            shouldFinalize = true;
          }
        }
      }

      if (shouldFinalize) {
        // Finalize the tournament
        const { data: finalizeResult, error: finalizeError } = await supabase.rpc(
          "finalize_tournament",
          { p_tournament_id: tournament.id }
        );

        if (finalizeError) {
          errors.push(`Failed to finalize tournament ${tournament.id}: ${finalizeError.message}`);
          continue;
        }

        if (finalizeResult?.success) {
          // Distribute prizes
          const { data: prizeResult, error: prizeError } = await supabase.rpc(
            "distribute_tournament_prizes",
            { p_tournament_id: tournament.id }
          );

          if (prizeError) {
            errors.push(`Failed to distribute prizes for ${tournament.id}: ${prizeError.message}`);
          }

          count++;
          console.log(`Finalized tournament ${tournament.id} (${tournament.name})`);

          // Notify all participants of tournament completion
          await notifyTournamentComplete(supabase, tournament.id);
        }
      }
    } catch (error) {
      errors.push(`Error finalizing tournament ${tournament.id}: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  return { count, errors };
}

// ============================================================================
// Notification Helpers
// ============================================================================

async function notifyTournamentStart(supabase: any, tournamentId: string): Promise<void> {
  try {
    // Get tournament name and all registrations
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("name")
      .eq("id", tournamentId)
      .single();

    const { data: registrations } = await supabase
      .from("tournament_registrations")
      .select("user_id")
      .eq("tournament_id", tournamentId)
      .eq("is_eliminated", false);

    if (!registrations || registrations.length === 0) return;

    // Send notifications in batch
    const notifications = registrations.map((reg: { user_id: string }) => ({
      userId: reg.user_id,
      type: "tournament_started",
      title: "Tournament Starting!",
      body: `${tournament?.name || "Tournament"} is starting now. Good luck!`,
      data: { tournamentId },
    }));

    await supabase.functions.invoke("send-notification", {
      body: notifications,
    });
  } catch (error) {
    console.error("Failed to send tournament start notifications:", error);
  }
}

async function notifyRoundStart(
  supabase: any,
  tournamentId: string,
  round: number
): Promise<void> {
  try {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("name")
      .eq("id", tournamentId)
      .single();

    // Get matches for this round
    const { data: matches } = await supabase
      .from("tournament_matches")
      .select("player1_id, player2_id")
      .eq("tournament_id", tournamentId)
      .eq("round", round)
      .eq("status", "pending");

    if (!matches) return;

    // Collect unique player IDs
    const playerIds = new Set<string>();
    for (const match of matches) {
      if (match.player1_id) playerIds.add(match.player1_id);
      if (match.player2_id) playerIds.add(match.player2_id);
    }

    const notifications = Array.from(playerIds).map((userId) => ({
      userId,
      type: "tournament_round_started",
      title: `Round ${round} Starting`,
      body: `${tournament?.name || "Tournament"} round ${round} has begun. Your match is ready!`,
      data: { tournamentId, round },
    }));

    if (notifications.length > 0) {
      await supabase.functions.invoke("send-notification", {
        body: notifications,
      });
    }
  } catch (error) {
    console.error("Failed to send round start notifications:", error);
  }
}

async function notifyTournamentComplete(supabase: any, tournamentId: string): Promise<void> {
  try {
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("name")
      .eq("id", tournamentId)
      .single();

    // Get final standings
    const { data: registrations } = await supabase
      .from("tournament_registrations")
      .select("user_id, final_place")
      .eq("tournament_id", tournamentId)
      .order("final_place", { ascending: true });

    if (!registrations) return;

    const notifications = registrations.map((reg: { user_id: string; final_place: number | null }) => {
      let body: string;
      if (reg.final_place === 1) {
        body = `Congratulations! You won ${tournament?.name || "the tournament"}!`;
      } else if (reg.final_place && reg.final_place <= 3) {
        body = `You finished ${formatPlace(reg.final_place)} in ${tournament?.name || "the tournament"}!`;
      } else {
        body = `${tournament?.name || "Tournament"} has ended. Thanks for participating!`;
      }

      return {
        userId: reg.user_id,
        type: "tournament_completed",
        title: "Tournament Complete",
        body,
        data: { tournamentId, place: reg.final_place },
      };
    });

    await supabase.functions.invoke("send-notification", {
      body: notifications,
    });
  } catch (error) {
    console.error("Failed to send tournament complete notifications:", error);
  }
}

function formatPlace(place: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = place % 100;
  return place + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}
