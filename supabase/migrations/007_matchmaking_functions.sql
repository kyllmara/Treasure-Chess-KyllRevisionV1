-- ============================================================================
-- Migration: Matchmaking Functions
-- ============================================================================
-- Provides missing functions for matchmaking queue and game balance locking.
-- ============================================================================

-- ============================================================================
-- FUNCTION: lock_balance_for_game
-- ============================================================================
-- Locks a user's funds when they are matched and a game starts.
-- Similar to lock_balance_for_challenge but references a game_id.
-- Called by matchmaking service when match is found.
-- ============================================================================
CREATE OR REPLACE FUNCTION lock_balance_for_game(
  p_user_id UUID,
  p_amount NUMERIC,
  p_game_id UUID
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
    game_id,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'wager_lock',
    p_amount,
    p_game_id,
    v_current_available,
    v_current_available - p_amount,
    'Wager locked for game ' || p_game_id::TEXT
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: unlock_balance_for_game
-- ============================================================================
-- Unlocks funds when a game is cancelled before it starts.
-- Moves funds from locked_tct back to available_tct.
-- ============================================================================
CREATE OR REPLACE FUNCTION unlock_balance_for_game(
  p_user_id UUID,
  p_amount NUMERIC,
  p_game_id UUID
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
    game_id,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'wager_unlock',
    p_amount,
    p_game_id,
    v_current_available,
    v_current_available + p_amount,
    'Wager unlocked for game ' || p_game_id::TEXT
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- FUNCTION: complete_game
-- ============================================================================
-- Completes a game and settles the escrow.
-- Updates ELO ratings, game stats, and handles payouts.
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_game(
  p_game_id UUID,
  p_winner_id UUID,  -- NULL for draw
  p_result TEXT,     -- 'checkmate', 'timeout', 'resignation', 'draw', 'stalemate'
  p_final_fen TEXT,
  p_pgn TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  winner_payout NUMERIC,
  loser_refund NUMERIC,
  commission NUMERIC,
  new_white_elo INTEGER,
  new_black_elo INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game RECORD;
  v_escrow_result RECORD;
  v_white_elo INTEGER;
  v_black_elo INTEGER;
  v_new_white_elo INTEGER;
  v_new_black_elo INTEGER;
  v_elo_k_factor INTEGER := 32;
  v_expected_white NUMERIC;
  v_expected_black NUMERIC;
  v_white_score NUMERIC;
  v_black_score NUMERIC;
BEGIN
  -- Get game with row lock
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_game.status = 'completed' THEN
    RAISE EXCEPTION 'Game already completed';
  END IF;

  -- Get current ELO ratings
  SELECT elo_rating INTO v_white_elo FROM profiles WHERE id = v_game.white_player_id;
  SELECT elo_rating INTO v_black_elo FROM profiles WHERE id = v_game.black_player_id;

  -- Calculate expected scores
  v_expected_white := 1.0 / (1.0 + POWER(10.0, (v_black_elo - v_white_elo)::NUMERIC / 400.0));
  v_expected_black := 1.0 - v_expected_white;

  -- Determine actual scores
  IF p_winner_id IS NULL THEN
    -- Draw
    v_white_score := 0.5;
    v_black_score := 0.5;
  ELSIF p_winner_id = v_game.white_player_id THEN
    v_white_score := 1.0;
    v_black_score := 0.0;
  ELSE
    v_white_score := 0.0;
    v_black_score := 1.0;
  END IF;

  -- Calculate new ELO ratings
  v_new_white_elo := v_white_elo + ROUND(v_elo_k_factor * (v_white_score - v_expected_white));
  v_new_black_elo := v_black_elo + ROUND(v_elo_k_factor * (v_black_score - v_expected_black));

  -- Ensure minimum ELO of 100
  v_new_white_elo := GREATEST(v_new_white_elo, 100);
  v_new_black_elo := GREATEST(v_new_black_elo, 100);

  -- Update game record
  UPDATE games
  SET
    status = 'completed',
    winner_id = p_winner_id,
    result = p_result,
    current_fen = p_final_fen,
    pgn = COALESCE(p_pgn, pgn),
    white_elo_after = v_new_white_elo,
    black_elo_after = v_new_black_elo,
    ended_at = NOW(),
    updated_at = NOW()
  WHERE id = p_game_id;

  -- Update player ELO ratings
  UPDATE profiles SET elo_rating = v_new_white_elo, updated_at = NOW()
  WHERE id = v_game.white_player_id;

  UPDATE profiles SET elo_rating = v_new_black_elo, updated_at = NOW()
  WHERE id = v_game.black_player_id;

  -- Update game stats
  IF p_winner_id IS NOT NULL THEN
    -- Winner stats
    UPDATE profiles
    SET
      games_won = games_won + 1,
      games_played = games_played + 1,
      updated_at = NOW()
    WHERE id = p_winner_id;

    -- Loser stats
    UPDATE profiles
    SET
      games_lost = games_lost + 1,
      games_played = games_played + 1,
      updated_at = NOW()
    WHERE id = CASE
      WHEN p_winner_id = v_game.white_player_id THEN v_game.black_player_id
      ELSE v_game.white_player_id
    END;
  ELSE
    -- Draw - update both players
    UPDATE profiles
    SET
      games_drawn = games_drawn + 1,
      games_played = games_played + 1,
      updated_at = NOW()
    WHERE id IN (v_game.white_player_id, v_game.black_player_id);
  END IF;

  -- Settle escrow if there's a wager
  IF v_game.wager_tct > 0 THEN
    SELECT * INTO v_escrow_result
    FROM settle_escrow(p_game_id, p_winner_id, p_result);

    RETURN QUERY SELECT
      TRUE,
      v_escrow_result.winner_payout,
      v_escrow_result.loser_refund,
      v_escrow_result.commission,
      v_new_white_elo,
      v_new_black_elo;
  ELSE
    RETURN QUERY SELECT
      TRUE,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      v_new_white_elo,
      v_new_black_elo;
  END IF;
END;
$$;

-- ============================================================================
-- FUNCTION: find_match
-- ============================================================================
-- Finds a matching player in the queue based on ELO range.
-- Returns the matched player's queue entry or NULL.
-- ============================================================================
CREATE OR REPLACE FUNCTION find_match(
  p_user_id UUID,
  p_wager_tct NUMERIC,
  p_elo_rating INTEGER,
  p_elo_range INTEGER DEFAULT 200
) RETURNS TABLE (
  queue_id UUID,
  user_id UUID,
  username TEXT,
  elo_rating INTEGER,
  avatar_url TEXT,
  country TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mq.id AS queue_id,
    mq.user_id,
    p.username,
    p.elo_rating,
    p.avatar_url,
    p.country
  FROM matchmaking_queue mq
  JOIN profiles p ON p.id = mq.user_id
  WHERE mq.status = 'waiting'
    AND mq.wager_tct = p_wager_tct
    AND mq.user_id != p_user_id
    AND ABS(p.elo_rating - p_elo_rating) <= p_elo_range
    AND mq.expires_at > NOW()
  ORDER BY mq.created_at ASC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- FUNCTION: cleanup_expired_queue_entries
-- ============================================================================
-- Removes expired entries from the matchmaking queue.
-- Should be called periodically by a cron job or edge function.
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_queue_entries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM matchmaking_queue
    WHERE status = 'waiting' AND expires_at < NOW()
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- FUNCTION: initialize_platform_vault
-- ============================================================================
-- Initializes the platform vault if it doesn't exist.
-- Called once during deployment setup.
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_platform_vault(
  p_vault_address TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vault_id UUID;
BEGIN
  -- Check if vault already exists
  SELECT id INTO v_vault_id FROM platform_vault WHERE status = 'active' LIMIT 1;

  IF FOUND THEN
    RETURN v_vault_id;
  END IF;

  -- Create new vault
  INSERT INTO platform_vault (
    wallet_address,
    balance_tct,
    total_commission_collected_tct,
    total_deposits_received_tct,
    total_withdrawals_sent_tct,
    status
  ) VALUES (
    p_vault_address,
    0,
    0,
    0,
    0,
    'active'
  )
  RETURNING id INTO v_vault_id;

  RETURN v_vault_id;
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION lock_balance_for_game(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_balance_for_game(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_game(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION find_match(UUID, NUMERIC, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_queue_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_platform_vault(TEXT) TO authenticated;

-- Also grant to service_role for edge functions
GRANT EXECUTE ON FUNCTION lock_balance_for_game(UUID, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_balance_for_game(UUID, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_game(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION find_match(UUID, NUMERIC, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_queue_entries() TO service_role;
GRANT EXECUTE ON FUNCTION initialize_platform_vault(TEXT) TO service_role;
