-- ============================================================================
-- Fix tournament functions to use balances table instead of profiles.tct_balance
-- The profiles table does not have a tct_balance column.
-- Balance is stored in the balances table (available_tct, locked_tct).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix: register_for_tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_for_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_user_balance INTEGER;
  v_user_elo INTEGER;
  v_registration_id UUID;
  v_current_seed INTEGER;
BEGIN
  -- Lock tournament row to prevent race conditions
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Check tournament status
  IF v_tournament.status != 'registration' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is not open for registration');
  END IF;

  -- Check max players
  IF v_tournament.current_players >= v_tournament.max_players THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is full');
  END IF;

  -- Check if already registered
  IF EXISTS (
    SELECT 1 FROM tournament_registrations
    WHERE tournament_id = p_tournament_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already registered for this tournament');
  END IF;

  -- Get user balance from balances table and ELO from profiles
  SELECT COALESCE(b.available_tct, 0)::INTEGER, p.elo_rating
  INTO v_user_balance, v_user_elo
  FROM profiles p
  LEFT JOIN balances b ON b.user_id = p.id
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Check balance for entry fee
  IF v_user_balance < v_tournament.entry_fee_tct THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'required', v_tournament.entry_fee_tct,
      'available', v_user_balance
    );
  END IF;

  -- Deduct entry fee from balances table
  IF v_tournament.entry_fee_tct > 0 THEN
    UPDATE balances
    SET available_tct = available_tct - v_tournament.entry_fee_tct,
        locked_tct = locked_tct + v_tournament.entry_fee_tct
    WHERE user_id = p_user_id;

    -- Add to prize pool (minus rake)
    UPDATE tournaments
    SET prize_pool_tct = prize_pool_tct +
        (v_tournament.entry_fee_tct * (100 - v_tournament.rake_percentage) / 100)::INTEGER
    WHERE id = p_tournament_id;
  END IF;

  -- Calculate seed based on current registrations
  SELECT COALESCE(MAX(seed), 0) + 1 INTO v_current_seed
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id;

  -- Create registration
  INSERT INTO tournament_registrations (
    tournament_id,
    user_id,
    seed,
    entry_fee_paid
  ) VALUES (
    p_tournament_id,
    p_user_id,
    v_current_seed,
    v_tournament.entry_fee_tct
  )
  RETURNING id INTO v_registration_id;

  -- Update player count
  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'seed', v_current_seed,
    'entry_fee_paid', v_tournament.entry_fee_tct
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Fix: unregister_from_tournament
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unregister_from_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_refund_amount INTEGER;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Get registration
  SELECT * INTO v_registration
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not registered for this tournament');
  END IF;

  -- Check if tournament has started
  IF v_tournament.status NOT IN ('draft', 'registration') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot unregister after tournament has started');
  END IF;

  -- Check if already refunded
  IF v_registration.entry_fee_refunded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entry fee already refunded');
  END IF;

  -- Calculate refund (full refund if before deadline, no refund after)
  IF v_tournament.registration_deadline IS NULL
     OR NOW() <= v_tournament.registration_deadline THEN
    v_refund_amount := v_registration.entry_fee_paid;
  ELSE
    v_refund_amount := 0;
  END IF;

  -- Refund entry fee to balances table
  IF v_refund_amount > 0 THEN
    UPDATE balances
    SET available_tct = available_tct + v_refund_amount,
        locked_tct = GREATEST(0, locked_tct - v_refund_amount)
    WHERE user_id = p_user_id;

    -- Remove from prize pool
    UPDATE tournaments
    SET prize_pool_tct = GREATEST(0, prize_pool_tct -
        (v_refund_amount * (100 - v_tournament.rake_percentage) / 100)::INTEGER)
    WHERE id = p_tournament_id;
  END IF;

  -- Delete registration
  DELETE FROM tournament_registrations
  WHERE id = v_registration.id;

  -- Update player count
  UPDATE tournaments
  SET current_players = GREATEST(0, current_players - 1)
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_refund_amount
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Fix: finalize_tournament (prize distribution)
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

  -- Distribute prizes
  FOR v_prize_record IN
    SELECT tp.*, ts.user_id AS winner_user_id
    FROM tournament_prizes tp
    LEFT JOIN tournament_standings ts ON ts.tournament_id = tp.tournament_id AND ts.place = tp.place
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

      -- Record payment
      UPDATE tournament_prizes
      SET
        user_id = v_prize_record.winner_user_id,
        amount_tct = v_prize_amount,
        paid_at = NOW()
      WHERE id = v_prize_record.id;

      v_total_distributed := v_total_distributed + v_prize_amount;
    END IF;
  END LOOP;

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

-- ----------------------------------------------------------------------------
-- Fix: cancel_tournament (refund all entry fees)
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

  -- Refund all entry fees
  FOR v_registration IN
    SELECT * FROM tournament_registrations
    WHERE tournament_id = p_tournament_id
      AND NOT entry_fee_refunded
      AND entry_fee_paid > 0
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

  -- Update tournament status
  UPDATE tournaments
  SET status = 'cancelled'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_refunded', v_total_refunded
  );
END;
$$;
