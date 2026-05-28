-- ============================================================================
-- Migration: 070_tournament_game_completion_trigger.sql
-- Description: When a chess game linked to a tournament match completes,
--              automatically record the match result, advance the bracket,
--              and finalize the tournament if it's the last match.
-- ============================================================================

CREATE OR REPLACE FUNCTION on_tournament_game_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_result JSONB;
BEGIN
  -- Only act when a game transitions to 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Check if this game is linked to a tournament match
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE game_id = NEW.id
    AND status = 'in_progress'
  FOR UPDATE;

  -- Not a tournament game, nothing to do
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Record the tournament match result
  -- This handles: updating match status, eliminating loser (knockout),
  -- updating scores (swiss), advancing winner to next match,
  -- and checking if the round/tournament is complete
  v_result := record_tournament_match_result(
    v_match.id,
    NEW.winner_id,
    NEW.id
  );

  IF NOT (v_result->>'success')::boolean THEN
    RAISE WARNING 'Failed to record tournament match result for match % game %: %',
      v_match.id, NEW.id, v_result->>'error';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on games table: fire when status changes to completed
DROP TRIGGER IF EXISTS on_game_completed_tournament ON games;
CREATE TRIGGER on_game_completed_tournament
  AFTER UPDATE OF status ON games
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION on_tournament_game_completed();
