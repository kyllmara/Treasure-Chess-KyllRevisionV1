-- ============================================================================
-- Migration: 075_fix_locked_tct_drift.sql
-- Description: Fix locked_tct balance drift caused by finalize_tournament and
--   cancel_tournament not distinguishing between DB-path registrations (which
--   lock TCT in the balances table) and on-chain registrations (which don't).
--
-- Root cause: register_for_tournament (DB path) adds to locked_tct, but
--   register_for_tournament_on_chain does NOT. However, finalize_tournament's
--   on-chain branch skips the unlock step entirely, and cancel_tournament
--   tries to unlock ALL registrations regardless of path. Over time this
--   causes locked_tct to drift upward.
--
-- Fix: All unlock paths now filter on entry_tx_hash IS NULL (DB-path only).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- finalize_tournament: unlock locked_tct for DB-path registrations even when
-- the tournament has an on-chain pool. On-chain registrations (entry_tx_hash
-- IS NOT NULL) never locked TCT in the DB, so they are skipped.
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
          -- DB PATH: Credit balances directly
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

  -- Unlock entry fees for DB-path registrations (entry_tx_hash IS NULL).
  -- These are the only registrations that locked TCT in the balances table.
  -- On-chain registrations (entry_tx_hash IS NOT NULL) never touched locked_tct.
  UPDATE balances b
  SET locked_tct = GREATEST(0, locked_tct - tr.entry_fee_paid)
  FROM tournament_registrations tr
  WHERE tr.tournament_id = p_tournament_id
    AND tr.entry_fee_paid > 0
    AND NOT tr.entry_fee_refunded
    AND tr.entry_tx_hash IS NULL  -- DB-path only
    AND b.user_id = tr.user_id;

  -- Mark all entry fees as handled (both DB and on-chain)
  UPDATE tournament_registrations
  SET entry_fee_refunded = true
  WHERE tournament_id = p_tournament_id
    AND entry_fee_paid > 0
    AND NOT entry_fee_refunded;

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
-- cancel_tournament: only unlock locked_tct for DB-path registrations.
-- On-chain registrations need refunds via the tournament-refund-entry edge
-- function, not via DB balance manipulation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_total_refunded INTEGER := 0;
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
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel completed tournament');
  END IF;

  -- Refund DB-path entry fees (entry_tx_hash IS NULL)
  -- These are the only ones that moved TCT from available to locked
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND NOT entry_fee_refunded
      AND entry_fee_paid > 0
      AND entry_tx_hash IS NULL  -- DB-path only
  LOOP
    UPDATE balances
    SET available_tct = available_tct + v_registration.entry_fee_paid,
        locked_tct = GREATEST(0, locked_tct - v_registration.entry_fee_paid)
    WHERE user_id = v_registration.user_id;

    UPDATE tournament_registrations
    SET entry_fee_refunded = true
    WHERE id = v_registration.id;

    v_total_refunded := v_total_refunded + v_registration.entry_fee_paid;
  END LOOP;

  -- Mark on-chain registrations as needing refund (but don't touch DB balances)
  -- The tournament-refund-entry edge function handles on-chain USDC refunds separately
  -- We do NOT set entry_fee_refunded = true here; the edge function does that after
  -- the on-chain transfer succeeds.

  -- Update tournament status
  UPDATE tournaments
  SET status = 'cancelled'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_refunded', v_total_refunded,
    'on_chain_refunds_pending', (
      SELECT COUNT(*)::INTEGER FROM tournament_registrations
      WHERE tournament_id = p_tournament_id
        AND NOT entry_fee_refunded
        AND entry_fee_paid > 0
        AND entry_tx_hash IS NOT NULL
    )
  );
END;
$$;
