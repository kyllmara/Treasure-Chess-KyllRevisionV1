-- ============================================================================
-- Migration: Wager and Escrow Functions
-- ============================================================================
-- Provides comprehensive fund locking, escrow management, and settlement logic
-- for the Treasure Chess wagering system.
-- ============================================================================

-- ============================================================================
-- CONSTANTS (Defined in functions where needed)
-- ============================================================================
-- COMMISSION_RATE = 0.10 (10% platform fee)
-- MIN_WAGER_TCT = 25
-- MAX_WAGER_TCT = 1000

-- ============================================================================
-- FUNCTION: lock_balance_for_challenge
-- ============================================================================
-- Locks a user's funds when they create or accept a wager challenge.
-- Moves funds from available_tct to locked_tct.
-- Records transaction for audit trail.
-- ============================================================================
CREATE OR REPLACE FUNCTION lock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Lock amount must be positive';
  END IF;

  -- Get current balance with row lock
  SELECT id, available_tct
  INTO v_balance_id, v_current_available
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User balance not found';
  END IF;

  -- Check sufficient funds
  IF v_current_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient available balance. Available: %, Required: %',
      v_current_available, p_amount;
  END IF;

  -- Update balance: move from available to locked
  UPDATE balances
  SET
    available_tct = available_tct - p_amount,
    locked_tct = locked_tct + p_amount,
    updated_at = NOW()
  WHERE id = v_balance_id;

  -- Record transaction
  INSERT INTO transactions (
    user_id,
    type,
    amount_tct,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'wager_lock',
    p_amount,
    v_current_available,
    v_current_available - p_amount,
    'Wager locked for challenge ' || p_challenge_id::TEXT
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: unlock_balance_for_challenge
-- ============================================================================
-- Unlocks funds when a challenge is cancelled or declined.
-- Moves funds from locked_tct back to available_tct.
-- ============================================================================
CREATE OR REPLACE FUNCTION unlock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_locked NUMERIC;
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Unlock amount must be positive';
  END IF;

  -- Get current balance with row lock
  SELECT id, available_tct, locked_tct
  INTO v_balance_id, v_current_available, v_current_locked
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User balance not found';
  END IF;

  -- Check sufficient locked funds
  IF v_current_locked < p_amount THEN
    RAISE EXCEPTION 'Insufficient locked balance. Locked: %, Required: %',
      v_current_locked, p_amount;
  END IF;

  -- Update balance: move from locked to available
  UPDATE balances
  SET
    available_tct = available_tct + p_amount,
    locked_tct = locked_tct - p_amount,
    updated_at = NOW()
  WHERE id = v_balance_id;

  -- Record transaction
  INSERT INTO transactions (
    user_id,
    type,
    amount_tct,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'wager_unlock',
    p_amount,
    v_current_available,
    v_current_available + p_amount,
    'Wager unlocked for challenge ' || p_challenge_id::TEXT
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: create_game_escrow
-- ============================================================================
-- Creates an escrow when a game with wager starts.
-- Called when a challenge is accepted or matchmaking finds a match.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_game_escrow(
  p_game_id UUID,
  p_white_player_id UUID,
  p_white_wager NUMERIC,
  p_black_player_id UUID,
  p_black_wager NUMERIC,
  p_commission_rate NUMERIC DEFAULT 0.10
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_escrow_id UUID;
  v_total_pool NUMERIC;
BEGIN
  -- Calculate total pool
  v_total_pool := p_white_wager + p_black_wager;

  -- Validate both players have locked funds
  IF NOT EXISTS (
    SELECT 1 FROM balances
    WHERE user_id = p_white_player_id AND locked_tct >= p_white_wager
  ) THEN
    RAISE EXCEPTION 'White player has insufficient locked funds';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM balances
    WHERE user_id = p_black_player_id AND locked_tct >= p_black_wager
  ) THEN
    RAISE EXCEPTION 'Black player has insufficient locked funds';
  END IF;

  -- Create escrow record
  INSERT INTO game_escrows (
    game_id,
    player_white_id,
    player_white_locked_tct,
    player_black_id,
    player_black_locked_tct,
    total_pool_tct,
    commission_rate,
    status
  ) VALUES (
    p_game_id,
    p_white_player_id,
    p_white_wager,
    p_black_player_id,
    p_black_wager,
    v_total_pool,
    p_commission_rate,
    'active'
  )
  RETURNING id INTO v_escrow_id;

  RETURN v_escrow_id;
END;
$$;

-- ============================================================================
-- FUNCTION: settle_escrow
-- ============================================================================
-- Settles an escrow when a game ends.
-- Handles: win/loss payouts, draws (full refund), and abandonment.
-- Applies 10% commission on winnings, not on stake return.
-- ============================================================================
CREATE OR REPLACE FUNCTION settle_escrow(
  p_game_id UUID,
  p_winner_id UUID,  -- NULL for draw
  p_reason TEXT DEFAULT 'checkmate'
) RETURNS TABLE (
  escrow_id UUID,
  winner_payout NUMERIC,
  loser_refund NUMERIC,
  commission NUMERIC,
  is_draw BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_escrow RECORD;
  v_winner_payout NUMERIC;
  v_loser_refund NUMERIC := 0;
  v_commission NUMERIC := 0;
  v_loser_id UUID;
  v_is_draw BOOLEAN := FALSE;
  v_winner_current_available NUMERIC;
  v_loser_current_available NUMERIC;
BEGIN
  -- Get escrow with row lock
  SELECT * INTO v_escrow
  FROM game_escrows
  WHERE game_escrows.game_id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
  END IF;

  IF v_escrow.status != 'active' THEN
    RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
  END IF;

  -- Handle draw case
  IF p_winner_id IS NULL THEN
    v_is_draw := TRUE;
    v_winner_payout := 0;

    -- Refund both players in full (no commission on draws)
    -- Refund white player
    UPDATE balances
    SET
      available_tct = available_tct + v_escrow.player_white_locked_tct,
      locked_tct = locked_tct - v_escrow.player_white_locked_tct,
      updated_at = NOW()
    WHERE user_id = v_escrow.player_white_id;

    SELECT available_tct INTO v_winner_current_available
    FROM balances WHERE user_id = v_escrow.player_white_id;

    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
      balance_before_tct, balance_after_tct, description)
    VALUES (
      v_escrow.player_white_id, 'refund', v_escrow.player_white_locked_tct,
      p_game_id, v_escrow.id,
      v_winner_current_available - v_escrow.player_white_locked_tct,
      v_winner_current_available,
      'Draw refund - ' || p_reason
    );

    -- Refund black player
    UPDATE balances
    SET
      available_tct = available_tct + v_escrow.player_black_locked_tct,
      locked_tct = locked_tct - v_escrow.player_black_locked_tct,
      updated_at = NOW()
    WHERE user_id = v_escrow.player_black_id;

    SELECT available_tct INTO v_loser_current_available
    FROM balances WHERE user_id = v_escrow.player_black_id;

    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
      balance_before_tct, balance_after_tct, description)
    VALUES (
      v_escrow.player_black_id, 'refund', v_escrow.player_black_locked_tct,
      p_game_id, v_escrow.id,
      v_loser_current_available - v_escrow.player_black_locked_tct,
      v_loser_current_available,
      'Draw refund - ' || p_reason
    );

    -- Update escrow
    UPDATE game_escrows
    SET
      status = 'settled',
      winner_id = NULL,
      winner_payout_tct = 0,
      loser_refund_tct = 0,
      commission_tct = 0,
      settled_at = NOW(),
      settled_reason = p_reason
    WHERE id = v_escrow.id;

  ELSE
    -- Handle win/loss case
    -- Determine loser
    IF p_winner_id = v_escrow.player_white_id THEN
      v_loser_id := v_escrow.player_black_id;
    ELSE
      v_loser_id := v_escrow.player_white_id;
    END IF;

    -- Calculate payouts:
    -- Winner gets: their stake back + opponent's stake - commission
    -- Commission is taken from opponent's stake only (winnings)
    v_commission := v_escrow.total_pool_tct * v_escrow.commission_rate / 2;  -- 10% of one player's stake

    -- Winner gets: full pool minus commission
    v_winner_payout := v_escrow.total_pool_tct - v_commission;

    -- Winner: unlock their stake + add winnings
    UPDATE balances
    SET
      available_tct = available_tct + v_winner_payout,
      locked_tct = locked_tct - (
        CASE WHEN p_winner_id = v_escrow.player_white_id
        THEN v_escrow.player_white_locked_tct
        ELSE v_escrow.player_black_locked_tct END
      ),
      total_won_tct = total_won_tct + (v_winner_payout - (
        CASE WHEN p_winner_id = v_escrow.player_white_id
        THEN v_escrow.player_white_locked_tct
        ELSE v_escrow.player_black_locked_tct END
      )),
      updated_at = NOW()
    WHERE user_id = p_winner_id;

    SELECT available_tct INTO v_winner_current_available
    FROM balances WHERE user_id = p_winner_id;

    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
      balance_before_tct, balance_after_tct, description)
    VALUES (
      p_winner_id, 'win_payout', v_winner_payout,
      p_game_id, v_escrow.id,
      v_winner_current_available - v_winner_payout,
      v_winner_current_available,
      'Game won - ' || p_reason || '. Received ' || v_winner_payout || ' TCT'
    );

    -- Loser: deduct locked funds (already locked, just remove from locked)
    UPDATE balances
    SET
      locked_tct = locked_tct - (
        CASE WHEN v_loser_id = v_escrow.player_white_id
        THEN v_escrow.player_white_locked_tct
        ELSE v_escrow.player_black_locked_tct END
      ),
      total_lost_tct = total_lost_tct + (
        CASE WHEN v_loser_id = v_escrow.player_white_id
        THEN v_escrow.player_white_locked_tct
        ELSE v_escrow.player_black_locked_tct END
      ),
      updated_at = NOW()
    WHERE user_id = v_loser_id;

    SELECT available_tct INTO v_loser_current_available
    FROM balances WHERE user_id = v_loser_id;

    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
      balance_before_tct, balance_after_tct, description)
    VALUES (
      v_loser_id, 'loss_deduct',
      -(CASE WHEN v_loser_id = v_escrow.player_white_id
        THEN v_escrow.player_white_locked_tct
        ELSE v_escrow.player_black_locked_tct END),
      p_game_id, v_escrow.id,
      v_loser_current_available,
      v_loser_current_available,
      'Game lost - ' || p_reason
    );

    -- Record commission transaction (for platform)
    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
      balance_before_tct, balance_after_tct, description)
    VALUES (
      p_winner_id, 'commission', -v_commission,
      p_game_id, v_escrow.id,
      v_winner_current_available,
      v_winner_current_available,
      'Platform commission (10%)'
    );

    -- Update winner's commission paid stats
    UPDATE balances
    SET total_commission_paid_tct = total_commission_paid_tct + v_commission
    WHERE user_id = p_winner_id;

    -- Update escrow
    UPDATE game_escrows
    SET
      status = 'settled',
      winner_id = p_winner_id,
      winner_payout_tct = v_winner_payout,
      loser_refund_tct = 0,
      commission_tct = v_commission,
      settled_at = NOW(),
      settled_reason = p_reason
    WHERE id = v_escrow.id;

  END IF;

  -- Return settlement details
  RETURN QUERY SELECT
    v_escrow.id,
    v_winner_payout,
    v_loser_refund,
    v_commission,
    v_is_draw;
END;
$$;

-- ============================================================================
-- FUNCTION: refund_escrow
-- ============================================================================
-- Refunds an escrow when a game is abandoned or cancelled before completion.
-- Both players receive their locked funds back.
-- ============================================================================
CREATE OR REPLACE FUNCTION refund_escrow(
  p_game_id UUID,
  p_reason TEXT DEFAULT 'game_cancelled'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_escrow RECORD;
  v_white_available NUMERIC;
  v_black_available NUMERIC;
BEGIN
  -- Get escrow with row lock
  SELECT * INTO v_escrow
  FROM game_escrows
  WHERE game_escrows.game_id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
  END IF;

  IF v_escrow.status != 'active' THEN
    RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
  END IF;

  -- Refund white player
  UPDATE balances
  SET
    available_tct = available_tct + v_escrow.player_white_locked_tct,
    locked_tct = locked_tct - v_escrow.player_white_locked_tct,
    updated_at = NOW()
  WHERE user_id = v_escrow.player_white_id;

  SELECT available_tct INTO v_white_available
  FROM balances WHERE user_id = v_escrow.player_white_id;

  INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
    balance_before_tct, balance_after_tct, description)
  VALUES (
    v_escrow.player_white_id, 'refund', v_escrow.player_white_locked_tct,
    p_game_id, v_escrow.id,
    v_white_available - v_escrow.player_white_locked_tct,
    v_white_available,
    'Escrow refund - ' || p_reason
  );

  -- Refund black player
  UPDATE balances
  SET
    available_tct = available_tct + v_escrow.player_black_locked_tct,
    locked_tct = locked_tct - v_escrow.player_black_locked_tct,
    updated_at = NOW()
  WHERE user_id = v_escrow.player_black_id;

  SELECT available_tct INTO v_black_available
  FROM balances WHERE user_id = v_escrow.player_black_id;

  INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
    balance_before_tct, balance_after_tct, description)
  VALUES (
    v_escrow.player_black_id, 'refund', v_escrow.player_black_locked_tct,
    p_game_id, v_escrow.id,
    v_black_available - v_escrow.player_black_locked_tct,
    v_black_available,
    'Escrow refund - ' || p_reason
  );

  -- Update escrow status
  UPDATE game_escrows
  SET
    status = 'refunded',
    settled_at = NOW(),
    settled_reason = p_reason
  WHERE id = v_escrow.id;

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: get_escrow_status
-- ============================================================================
-- Gets the current status of an escrow for a game.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_escrow_status(p_game_id UUID)
RETURNS TABLE (
  escrow_id UUID,
  status TEXT,
  total_pool NUMERIC,
  commission_rate NUMERIC,
  winner_id UUID,
  winner_payout NUMERIC,
  commission NUMERIC,
  settled_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.id,
    ge.status::TEXT,
    ge.total_pool_tct,
    ge.commission_rate,
    ge.winner_id,
    ge.winner_payout_tct,
    ge.commission_tct,
    ge.settled_at
  FROM game_escrows ge
  WHERE ge.game_id = p_game_id;
END;
$$;

-- ============================================================================
-- FUNCTION: validate_wager_balance
-- ============================================================================
-- Validates that a user has sufficient balance for a wager.
-- Used before creating a challenge or joining matchmaking.
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_wager_balance(
  p_user_id UUID,
  p_wager_amount NUMERIC
) RETURNS TABLE (
  is_valid BOOLEAN,
  available_balance NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available NUMERIC;
  v_min_wager NUMERIC := 25;
  v_max_wager NUMERIC := 1000;
BEGIN
  -- Get current available balance
  SELECT available_tct INTO v_available
  FROM balances
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'User balance not found'::TEXT;
    RETURN;
  END IF;

  -- Validate wager amount
  IF p_wager_amount < v_min_wager AND p_wager_amount > 0 THEN
    RETURN QUERY SELECT FALSE, v_available,
      ('Minimum wager is ' || v_min_wager || ' TCT')::TEXT;
    RETURN;
  END IF;

  IF p_wager_amount > v_max_wager THEN
    RETURN QUERY SELECT FALSE, v_available,
      ('Maximum wager is ' || v_max_wager || ' TCT')::TEXT;
    RETURN;
  END IF;

  -- Check sufficient funds
  IF v_available < p_wager_amount THEN
    RETURN QUERY SELECT FALSE, v_available,
      ('Insufficient balance. Available: ' || v_available || ' TCT')::TEXT;
    RETURN;
  END IF;

  -- All validations passed
  RETURN QUERY SELECT TRUE, v_available, NULL::TEXT;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION lock_balance_for_challenge(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_balance_for_challenge(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_game_escrow(UUID, UUID, NUMERIC, UUID, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_escrow(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION refund_escrow(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_escrow_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_wager_balance(UUID, NUMERIC) TO authenticated;

-- Also grant to service_role for edge functions
GRANT EXECUTE ON FUNCTION lock_balance_for_challenge(UUID, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_balance_for_challenge(UUID, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION create_game_escrow(UUID, UUID, NUMERIC, UUID, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION settle_escrow(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION refund_escrow(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_escrow_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION validate_wager_balance(UUID, NUMERIC) TO service_role;
