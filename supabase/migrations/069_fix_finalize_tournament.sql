-- ============================================================================
-- Migration: 069_fix_finalize_tournament.sql
-- Description: Fix finalize_tournament to properly calculate standings and
--              distribute prizes. The version in 066 referenced a non-existent
--              tournament_standings table, so prizes were never distributed.
-- ============================================================================

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

      -- Pay prize to balances table
      UPDATE balances
      SET available_tct = available_tct + v_prize_amount
      WHERE user_id = v_prize_record.winner_user_id;

      -- If no balances row exists, create one
      IF NOT FOUND THEN
        INSERT INTO balances (user_id, available_tct, locked_tct)
        VALUES (v_prize_record.winner_user_id, v_prize_amount, 0);
      END IF;

      -- Record payment on the prize record
      UPDATE tournament_prizes
      SET
        user_id = v_prize_record.winner_user_id,
        amount_tct = v_prize_amount,
        paid_at = NOW()
      WHERE id = v_prize_record.id;

      v_total_distributed := v_total_distributed + v_prize_amount;
    END IF;
  END LOOP;

  -- Unlock remaining entry fees (move from locked to zero since prizes are paid from pool)
  UPDATE balances b
  SET locked_tct = GREATEST(0, locked_tct - tr.entry_fee_paid)
  FROM tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id
    AND tr.entry_fee_paid > 0
    AND NOT tr.entry_fee_refunded
    AND b.user_id = tr.user_id;

  -- Update tournament status
  UPDATE tournaments
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_distributed', v_total_distributed
  );
END;
$$;
