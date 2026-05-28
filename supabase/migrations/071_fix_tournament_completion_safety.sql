-- ============================================================================
-- Migration: 071_fix_tournament_completion_safety.sql
-- Description: Fix two critical issues with tournament game completion:
--   1. The trigger on_tournament_game_completed runs inside finish_game's
--      transaction. If record_tournament_match_result or finalize_tournament
--      throws any exception, it rolls back the ENTIRE game completion —
--      the game stays "active" and nothing gets processed.
--   2. finalize_tournament (069) doesn't handle the case where the balance
--      row is missing for a winner (IF NOT FOUND after UPDATE doesn't work
--      reliably for INSERT in all cases).
--
-- Fix: Wrap the trigger body in EXCEPTION handler so tournament errors
--      don't break game completion. The game-complete Edge Function will
--      handle tournament finalization as a separate step.
-- ============================================================================

-- 1. Make the trigger exception-safe
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

  -- Wrap everything in exception handler so tournament errors
  -- never prevent the game from being marked as completed
  BEGIN
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
    v_result := record_tournament_match_result(
      v_match.id,
      NEW.winner_id,
      NEW.id
    );

    IF v_result IS NULL OR NOT (v_result->>'success')::boolean THEN
      RAISE WARNING 'Failed to record tournament match result for match % game %: %',
        v_match.id, NEW.id, COALESCE(v_result->>'error', 'null result');
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log the error but DO NOT re-raise — let the game completion proceed
    RAISE WARNING 'Tournament trigger error for game %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- 2. Fix finalize_tournament to use INSERT ON CONFLICT for balance upsert
--    and ensure locked_tct is properly released
CREATE OR REPLACE FUNCTION finalize_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_place INTEGER := 1;
  v_prize_record RECORD;
  v_prize_amount INTEGER;
  v_total_distributed INTEGER := 0;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament already completed');
  END IF;

  -- Calculate final standings and assign places
  -- For knockout: non-eliminated first (winner), then eliminated in reverse order of elimination
  -- For swiss: by score, then tiebreakers
  v_place := 1;
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
    ORDER BY
      is_eliminated ASC,        -- Non-eliminated first (the winner)
      score DESC,               -- Then by score
      buchholz_score DESC,      -- Tiebreak 1
      sonneborn_berger DESC,    -- Tiebreak 2
      seed ASC                  -- Tiebreak 3: higher seed (lower number) wins
  LOOP
    UPDATE tournament_registrations
    SET final_place = v_place
    WHERE id = v_registration.id;

    v_place := v_place + 1;
  END LOOP;

  -- Distribute prizes based on final_place
  FOR v_prize_record IN
    SELECT tp.*, tr.user_id AS winner_user_id
    FROM tournament_prizes tp
    LEFT JOIN tournament_registrations tr
      ON tr.tournament_id = tp.tournament_id
      AND tr.final_place = tp.place
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY tp.place
  LOOP
    IF v_prize_record.winner_user_id IS NOT NULL THEN
      -- Calculate prize amount
      IF v_prize_record.fixed_amount IS NOT NULL THEN
        v_prize_amount := v_prize_record.fixed_amount;
      ELSE
        v_prize_amount := (v_tournament.prize_pool_tct * v_prize_record.percentage / 100)::INTEGER;
      END IF;

      -- Skip if prize is 0
      IF v_prize_amount > 0 THEN
        -- Pay prize using INSERT ON CONFLICT for safety
        INSERT INTO balances (user_id, available_tct, locked_tct)
        VALUES (v_prize_record.winner_user_id, v_prize_amount, 0)
        ON CONFLICT (user_id) DO UPDATE
        SET available_tct = balances.available_tct + EXCLUDED.available_tct;

        -- Record payment on the prize record
        UPDATE tournament_prizes
        SET
          user_id = v_prize_record.winner_user_id,
          amount_tct = v_prize_amount,
          paid_at = NOW()
        WHERE id = v_prize_record.id;

        v_total_distributed := v_total_distributed + v_prize_amount;
      END IF;
    END IF;
  END LOOP;

  -- Unlock entry fees (move from locked to zero since prizes are paid from pool)
  UPDATE balances b
  SET locked_tct = GREATEST(0, locked_tct - tr.entry_fee_paid)
  FROM tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id
    AND tr.entry_fee_paid > 0
    AND NOT tr.entry_fee_refunded
    AND b.user_id = tr.user_id;

  -- Mark entry fees as handled so they don't get double-unlocked
  UPDATE tournament_registrations
  SET entry_fee_refunded = true
  WHERE tournament_id = p_tournament_id
    AND entry_fee_paid > 0
    AND NOT entry_fee_refunded;

  -- Update tournament status
  UPDATE tournaments
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_tournament_id;

  RAISE NOTICE 'Tournament % finalized: distributed % TCT to winners',
    p_tournament_id, v_total_distributed;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_distributed', v_total_distributed
  );
END;
$$;
