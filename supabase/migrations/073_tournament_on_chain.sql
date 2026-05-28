-- ============================================================================
-- 073: Tournament On-Chain Entry Fees & Prize Distribution
-- ============================================================================
-- Adds on-chain USDC support for tournament entry fees, prizes, and refunds.
-- The backend signer wallet (vault) collects entry fees via permit+transferFrom
-- and distributes prizes/refunds via direct transfer.
-- ============================================================================

-- Schema changes
ALTER TABLE tournament_registrations
  ADD COLUMN IF NOT EXISTS entry_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS entry_usdc_amount NUMERIC(20,6),
  ADD COLUMN IF NOT EXISTS refund_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS wallet_address TEXT;

ALTER TABLE tournament_prizes
  ADD COLUMN IF NOT EXISTS payout_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS payout_usdc_amount NUMERIC(20,6);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS on_chain_pool_usdc NUMERIC(20,6) DEFAULT 0;

-- Unique constraint to prevent replay of entry tx hashes
CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_reg_entry_tx_hash
  ON tournament_registrations (entry_tx_hash)
  WHERE entry_tx_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- register_for_tournament_on_chain
-- ----------------------------------------------------------------------------
-- Same logic as register_for_tournament but:
--   - Skips DB balance check and balances deduction (funds are on-chain)
--   - Stores entry_tx_hash, entry_usdc_amount, wallet_address
--   - Increments on_chain_pool_usdc
--   - Still increments prize_pool_tct (for standings/prize calculation)
--   - Still handles auto-start when full
--   - Validates entry_tx_hash uniqueness (prevent replay)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_for_tournament_on_chain(
  p_tournament_id UUID,
  p_user_id UUID,
  p_entry_tx_hash TEXT,
  p_entry_usdc_amount NUMERIC(20,6),
  p_wallet_address TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration_id UUID;
  v_current_seed INTEGER;
  v_new_player_count INTEGER;
  v_start_result JSONB;
  v_reg RECORD;
BEGIN
  -- Check for replay: if this tx hash already registered, return idempotent success
  SELECT id INTO v_registration_id
  FROM tournament_registrations
  WHERE entry_tx_hash = p_entry_tx_hash;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'registration_id', v_registration_id,
      'idempotent', true
    );
  END IF;

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

  -- Calculate seed based on current registrations
  SELECT COALESCE(MAX(seed), 0) + 1 INTO v_current_seed
  FROM tournament_registrations
  WHERE tournament_id = p_tournament_id;

  -- Create registration with on-chain fields
  INSERT INTO tournament_registrations (
    tournament_id,
    user_id,
    seed,
    entry_fee_paid,
    entry_tx_hash,
    entry_usdc_amount,
    wallet_address
  ) VALUES (
    p_tournament_id,
    p_user_id,
    v_current_seed,
    v_tournament.entry_fee_tct,
    p_entry_tx_hash,
    p_entry_usdc_amount,
    p_wallet_address
  )
  RETURNING id INTO v_registration_id;

  -- Update player count
  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = p_tournament_id
  RETURNING current_players INTO v_new_player_count;

  -- Add to prize pool (minus rake) — same as DB path
  IF v_tournament.entry_fee_tct > 0 THEN
    UPDATE tournaments
    SET prize_pool_tct = prize_pool_tct +
        (v_tournament.entry_fee_tct * (100 - v_tournament.rake_percentage) / 100)::INTEGER,
        on_chain_pool_usdc = on_chain_pool_usdc + p_entry_usdc_amount
    WHERE id = p_tournament_id;
  END IF;

  -- Auto-start if tournament is now full
  IF v_new_player_count >= v_tournament.max_players THEN
    BEGIN
      v_start_result := start_tournament(p_tournament_id);

      -- Notify all registered players that tournament is starting
      IF v_start_result IS NOT NULL AND (v_start_result->>'success')::boolean THEN
        FOR v_reg IN
          SELECT user_id FROM tournament_registrations
          WHERE tournament_id = p_tournament_id
        LOOP
          PERFORM call_notification_function(jsonb_build_object(
            'userId', v_reg.user_id,
            'type', 'tournament_started',
            'title', 'Tournament Starting!',
            'body', v_tournament.name || ' is full and starting now. Good luck!',
            'data', jsonb_build_object(
              'tournament_id', p_tournament_id,
              'tournament_name', v_tournament.name
            )
          ));
        END LOOP;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'registration_id', v_registration_id,
        'seed', v_current_seed,
        'entry_fee_paid', v_tournament.entry_fee_tct,
        'tournament_started', true,
        'start_result', v_start_result
      );
    EXCEPTION WHEN OTHERS THEN
      -- Auto-start failed, but registration succeeded — don't roll back registration
      RAISE WARNING 'Auto-start failed for tournament %: %', p_tournament_id, SQLERRM;
      RETURN jsonb_build_object(
        'success', true,
        'registration_id', v_registration_id,
        'seed', v_current_seed,
        'entry_fee_paid', v_tournament.entry_fee_tct,
        'auto_start_error', SQLERRM
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'seed', v_current_seed,
    'entry_fee_paid', v_tournament.entry_fee_tct
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- unregister_from_tournament_on_chain
-- ----------------------------------------------------------------------------
-- For on-chain entries (entry_tx_hash IS NOT NULL):
--   - Skips DB balance restore (refund happens on-chain via edge function)
--   - Marks registration with refund_tx_hash after edge function confirms
--   - Decrements on_chain_pool_usdc
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unregister_from_tournament_on_chain(
  p_tournament_id UUID,
  p_user_id UUID,
  p_refund_tx_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
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

  -- Verify this is an on-chain registration
  IF v_registration.entry_tx_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an on-chain registration');
  END IF;

  -- Check if already refunded
  IF v_registration.refund_tx_hash IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already refunded');
  END IF;

  -- Mark refund tx hash and entry_fee_refunded
  UPDATE tournament_registrations
  SET refund_tx_hash = p_refund_tx_hash,
      entry_fee_refunded = true
  WHERE id = v_registration.id;

  -- Decrement on_chain_pool_usdc and prize_pool_tct
  UPDATE tournaments
  SET on_chain_pool_usdc = GREATEST(0, on_chain_pool_usdc - v_registration.entry_usdc_amount),
      prize_pool_tct = GREATEST(0, prize_pool_tct -
          (v_registration.entry_fee_paid * (100 - v_tournament.rake_percentage) / 100)::INTEGER)
  WHERE id = p_tournament_id;

  -- Delete registration
  DELETE FROM tournament_registrations
  WHERE id = v_registration.id;

  -- Update player count
  UPDATE tournaments
  SET current_players = GREATEST(0, current_players - 1)
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'refund_amount', v_registration.entry_fee_paid
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Override finalize_tournament for on-chain tournaments
-- ----------------------------------------------------------------------------
-- Replace finalize_tournament to handle on-chain pool:
--   - If on_chain_pool_usdc > 0: skip crediting balances and unlocking locked_tct
--   - Records amount_tct on tournament_prizes with paid_at = NULL (pending on-chain)
--   - Marks entry_fee_refunded = true (entry fee consumed, not DB-refundable)
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

  -- Update tournament status
  UPDATE tournaments
  SET status = 'completed', completed_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'total_distributed', v_total_distributed,
    'on_chain', v_is_on_chain
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_for_tournament_on_chain TO service_role;
GRANT EXECUTE ON FUNCTION unregister_from_tournament_on_chain TO service_role;
