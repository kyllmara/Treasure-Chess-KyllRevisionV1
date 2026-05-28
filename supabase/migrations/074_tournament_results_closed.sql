-- ============================================================================
-- 074: Tournament "Closed" Status + Results Availability Window
-- ============================================================================
-- 1. Adds 'closed' status, results_available_until, closed_at columns
-- 2. Updates finalize_tournament to set results_available_until = NOW() + 24h
-- 3. Adds close_tournament() and close_expired_tournaments() functions
-- ============================================================================

-- Schema changes
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS results_available_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Update the tournament status CHECK constraint to include 'closed'
-- First drop the old constraint (if it exists), then add the new one.
-- If using an enum instead, ALTER TYPE would be needed.
-- This is safe because 'closed' doesn't conflict with existing values.
DO $$
BEGIN
  -- Try dropping existing check constraint (name may vary)
  BEGIN
    ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- ignore if not found
  END;

  -- Try dropping enum-based constraint
  BEGIN
    ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS chk_tournament_status;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- If tournament_status is an enum type, add the new value
DO $$
BEGIN
  -- Check if tournament_status enum type exists and add 'closed' if so
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tournament_status') THEN
    BEGIN
      ALTER TYPE tournament_status ADD VALUE IF NOT EXISTS 'closed';
    EXCEPTION WHEN OTHERS THEN
      NULL; -- already exists or not an enum
    END;
  END IF;
END $$;

-- If status is a text column with a CHECK constraint, re-add it with 'closed'
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'tournaments' AND column_name = 'status';

  IF col_type IN ('text', 'character varying') THEN
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
      CHECK (status IN ('draft', 'registration', 'starting', 'active', 'completed', 'cancelled', 'closed'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Update finalize_tournament to set results_available_until
-- ----------------------------------------------------------------------------
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
  v_is_on_chain BOOLEAN := false;
BEGIN
  -- Get tournament with FOR UPDATE lock
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

  IF v_tournament.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament already closed');
  END IF;

  -- Determine if this is an on-chain tournament
  v_is_on_chain := COALESCE(v_tournament.on_chain_pool_usdc, 0) > 0;

  -- Calculate final standings: non-eliminated first, then by score/tiebreakers
  v_place := 1;
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
    ORDER BY
      is_eliminated ASC,
      score DESC,
      buchholz_score DESC,
      sonneborn_berger DESC,
      seed ASC
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
      IF v_prize_record.fixed_amount IS NOT NULL THEN
        v_prize_amount := v_prize_record.fixed_amount;
      ELSE
        v_prize_amount := (v_tournament.prize_pool_tct * v_prize_record.percentage / 100)::INTEGER;
      END IF;

      IF v_prize_amount > 0 THEN
        IF v_is_on_chain THEN
          -- ON-CHAIN: Record prize amount but do NOT credit balances
          -- Payout happens via tournament-distribute-prizes edge function
          UPDATE tournament_prizes
          SET
            user_id = v_prize_record.winner_user_id,
            amount_tct = v_prize_amount,
            paid_at = NULL  -- pending on-chain payout
          WHERE id = v_prize_record.id;
        ELSE
          -- DB PATH: Credit balances directly (existing behavior)
          INSERT INTO balances (user_id, available_tct, locked_tct)
          VALUES (v_prize_record.winner_user_id, v_prize_amount, 0)
          ON CONFLICT (user_id) DO UPDATE
          SET available_tct = balances.available_tct + EXCLUDED.available_tct;

          UPDATE tournament_prizes
          SET
            user_id = v_prize_record.winner_user_id,
            amount_tct = v_prize_amount,
            paid_at = NOW()
          WHERE id = v_prize_record.id;
        END IF;

        v_total_distributed := v_total_distributed + v_prize_amount;
      END IF;
    END IF;
  END LOOP;

  IF v_is_on_chain THEN
    -- ON-CHAIN: Mark entry fees as consumed (not DB-refundable)
    UPDATE tournament_registrations
    SET entry_fee_refunded = true
    WHERE tournament_id = p_tournament_id
      AND entry_fee_paid > 0
      AND NOT entry_fee_refunded;
  ELSE
    -- DB PATH: Unlock entry fees (move from locked to zero)
    UPDATE balances b
    SET locked_tct = GREATEST(0, locked_tct - tr.entry_fee_paid)
    FROM tournament_registrations tr
    WHERE tr.tournament_id = p_tournament_id
      AND tr.entry_fee_paid > 0
      AND NOT tr.entry_fee_refunded
      AND b.user_id = tr.user_id;

    -- Mark entry fees as handled to prevent double-unlock
    UPDATE tournament_registrations
    SET entry_fee_refunded = true
    WHERE tournament_id = p_tournament_id
      AND entry_fee_paid > 0
      AND NOT entry_fee_refunded;
  END IF;

  -- Update tournament status with results availability window
  UPDATE tournaments
  SET status = 'completed',
      completed_at = NOW(),
      results_available_until = NOW() + INTERVAL '24 hours'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_distributed', v_total_distributed,
    'on_chain', v_is_on_chain
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- close_tournament: Manually close a completed tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only completed tournaments can be closed');
  END IF;

  UPDATE tournaments
  SET status = 'closed',
      closed_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'tournament_id', p_tournament_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- close_expired_tournaments: Close all completed tournaments past their window
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_expired_tournaments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_count INTEGER := 0;
  v_tournament RECORD;
BEGIN
  FOR v_tournament IN
    SELECT id FROM tournaments
    WHERE status = 'completed'
      AND results_available_until IS NOT NULL
      AND results_available_until < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE tournaments
    SET status = 'closed',
        closed_at = NOW()
    WHERE id = v_tournament.id;
    v_closed_count := v_closed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'closed_count', v_closed_count);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION close_tournament TO service_role;
GRANT EXECUTE ON FUNCTION close_expired_tournaments TO service_role;
