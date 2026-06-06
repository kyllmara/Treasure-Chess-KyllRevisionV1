-- ============================================================================
-- Migration 130: Fix play-now matchmaking stuck state + Realtime errors
--
-- Bug 1: claim_play_now_match marks entries 'matched' before game creation
--   succeeds. If lock_balance_for_game throws (insufficient balance) the
--   entries are permanently stuck as 'matched' with game_id = NULL, and
--   both phones show "0 In Queue / 0 Compatible" forever.
--
--   Fix: new create_play_now_game RPC does claim + game insert + escrow +
--   balance lock in a single transaction. Either everything commits or
--   everything rolls back — entries stay 'waiting' on any failure.
--
-- Bug 2: play_now_queue and profiles lack REPLICA IDENTITY FULL, so
--   filtered postgres_changes subscriptions return CHANNEL_ERROR.
--   ProfileSync and the play_now_queue subscription both fail silently.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REPLICA IDENTITY FULL for filtered Realtime subscriptions
-- ============================================================================

ALTER TABLE profiles       REPLICA IDENTITY FULL;
ALTER TABLE play_now_queue REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. Atomic play-now game creation
--
--   Combines claim_play_now_match + game insert + escrow + balance lock into
--   one plpgsql transaction. If any step fails the whole function rolls back,
--   leaving both queue entries in 'waiting' so players keep searching.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_play_now_game(
  p_my_queue_id       UUID,
  p_opponent_queue_id UUID,
  p_my_user_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_my_entry  RECORD;
  v_opp_entry RECORD;
  v_white_id  UUID;
  v_black_id  UUID;
  v_game_id   UUID;
  v_my_avail  NUMERIC;
  v_opp_avail NUMERIC;
BEGIN
  -- Caller must be the authenticated user
  IF p_my_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock both rows in deterministic UUID order to prevent deadlocks
  IF LEAST(p_my_queue_id, p_opponent_queue_id) = p_my_queue_id THEN
    SELECT * INTO v_my_entry  FROM play_now_queue WHERE id = p_my_queue_id      FOR UPDATE;
    SELECT * INTO v_opp_entry FROM play_now_queue WHERE id = p_opponent_queue_id FOR UPDATE;
  ELSE
    SELECT * INTO v_opp_entry FROM play_now_queue WHERE id = p_opponent_queue_id FOR UPDATE;
    SELECT * INTO v_my_entry  FROM play_now_queue WHERE id = p_my_queue_id      FOR UPDATE;
  END IF;

  IF v_my_entry IS NULL OR v_opp_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue entry not found');
  END IF;

  IF v_my_entry.user_id IS DISTINCT FROM p_my_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your queue entry');
  END IF;

  -- Both must still be waiting (race-condition guard — other client may have claimed first)
  IF v_my_entry.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already claimed');
  END IF;
  IF v_opp_entry.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Opponent no longer waiting');
  END IF;

  -- Check sufficient balance for wager games BEFORE writing anything
  IF v_my_entry.wager_tct > 0 THEN
    SELECT available_tct INTO v_my_avail
      FROM balances WHERE user_id = v_my_entry.user_id;
    IF v_my_avail IS NULL OR v_my_avail < v_my_entry.wager_tct THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Insufficient balance — add TCT before wagering'
      );
    END IF;

    SELECT available_tct INTO v_opp_avail
      FROM balances WHERE user_id = v_opp_entry.user_id;
    IF v_opp_avail IS NULL OR v_opp_avail < v_opp_entry.wager_tct THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Opponent has insufficient balance'
      );
    END IF;
  END IF;

  -- Assign colors randomly
  IF random() < 0.5 THEN
    v_white_id := v_my_entry.user_id;
    v_black_id := v_opp_entry.user_id;
  ELSE
    v_white_id := v_opp_entry.user_id;
    v_black_id := v_my_entry.user_id;
  END IF;

  -- Create game record (status = 'active' — play-now skips ready-confirmation)
  INSERT INTO games (
    white_player_id, black_player_id,
    wager_tct, time_control_seconds, increment_seconds,
    status,
    initial_fen, current_fen,
    white_time_remaining, black_time_remaining,
    move_count, current_turn,
    white_elo_before, black_elo_before,
    started_at
  ) VALUES (
    v_white_id, v_black_id,
    v_my_entry.wager_tct,
    v_my_entry.time_control_seconds,
    v_my_entry.increment_seconds,
    'active',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    v_my_entry.time_control_seconds,
    v_my_entry.time_control_seconds,
    0, 'w',
    v_my_entry.elo_rating,
    v_opp_entry.elo_rating,
    NOW()
  ) RETURNING id INTO v_game_id;

  -- Create escrow + lock balances for wager games
  IF v_my_entry.wager_tct > 0 THEN
    INSERT INTO game_escrows (
      game_id,
      player_white_id, player_white_locked_tct,
      player_black_id, player_black_locked_tct,
      total_pool_tct, status
    ) VALUES (
      v_game_id,
      v_white_id, v_my_entry.wager_tct,
      v_black_id, v_my_entry.wager_tct,
      v_my_entry.wager_tct * 2,
      'active'
    );

    -- Deduct from available, add to locked — for both players atomically
    UPDATE balances
      SET available_tct = available_tct - v_my_entry.wager_tct,
          locked_tct    = locked_tct    + v_my_entry.wager_tct,
          updated_at    = NOW()
      WHERE user_id IN (v_white_id, v_black_id);
  END IF;

  -- Claim both queue entries and attach game_id — only happens if everything above succeeded
  UPDATE play_now_queue
    SET status          = 'matched',
        matched_with_id = v_opp_entry.user_id,
        matched_at      = NOW(),
        game_id         = v_game_id
    WHERE id = p_my_queue_id;

  UPDATE play_now_queue
    SET status          = 'matched',
        matched_with_id = v_my_entry.user_id,
        matched_at      = NOW(),
        game_id         = v_game_id
    WHERE id = p_opponent_queue_id;

  RETURN jsonb_build_object(
    'success',         true,
    'game_id',         v_game_id,
    'white_player_id', v_white_id,
    'black_player_id', v_black_id,
    'wager_tct',       v_my_entry.wager_tct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_play_now_game(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_play_now_game(UUID, UUID, UUID) TO service_role;

COMMIT;
