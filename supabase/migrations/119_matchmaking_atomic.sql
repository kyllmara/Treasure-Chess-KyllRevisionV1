-- ============================================================================
-- Migration 119: Atomic Matchmaking Functions
-- ============================================================================
-- Fixes the matchmaking race condition by moving game creation into a single
-- server-side transaction. Also adds ready-confirmation state to the DB so
-- it survives reconnections, and provides an atomic cancel/refund for the
-- ready-timeout path.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Extend enums to support per-player ready states and ready-timeout reason
-- ============================================================================

-- Add ready_white and ready_black to game_status (IF NOT EXISTS requires
-- a DO block because ALTER TYPE … ADD VALUE cannot be conditional otherwise)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ready_white'
      AND enumtypid = 'game_status'::regtype
  ) THEN
    ALTER TYPE game_status ADD VALUE 'ready_white' AFTER 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ready_black'
      AND enumtypid = 'game_status'::regtype
  ) THEN
    ALTER TYPE game_status ADD VALUE 'ready_black' AFTER 'ready_white';
  END IF;
END;
$$;

-- Add ready_timeout to end_reason
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ready_timeout'
      AND enumtypid = 'end_reason'::regtype
  ) THEN
    ALTER TYPE end_reason ADD VALUE 'ready_timeout' AFTER 'abandon';
  END IF;
END;
$$;

-- ============================================================================
-- Add is_rated column to games if it was never added
-- ============================================================================
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_rated BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================================
-- FUNCTION: create_matched_game
-- ============================================================================
-- Atomically claims a match, creates the game record, creates the escrow, and
-- locks balances — all in a single transaction.  If another client already
-- claimed the same pair of queue entries the function returns
-- { success: false, error: "Match already claimed" } rather than raising.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_matched_game(
  p_my_queue_id      UUID,
  p_opponent_queue_id UUID,
  p_my_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_my_entry  RECORD;
  v_opp_entry RECORD;
  v_white_id  UUID;
  v_black_id  UUID;
  v_game_id   UUID;
  v_result    JSONB;
BEGIN
  -- Ownership check: the caller must be authenticated as p_my_user_id
  IF p_my_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock both rows in a deterministic order (smaller UUID first) to prevent
  -- deadlocks when two clients race on the same pair.
  IF LEAST(p_my_queue_id, p_opponent_queue_id) = p_my_queue_id THEN
    SELECT * INTO v_my_entry  FROM matchmaking_queue WHERE id = p_my_queue_id      FOR UPDATE;
    SELECT * INTO v_opp_entry FROM matchmaking_queue WHERE id = p_opponent_queue_id FOR UPDATE;
  ELSE
    SELECT * INTO v_opp_entry FROM matchmaking_queue WHERE id = p_opponent_queue_id FOR UPDATE;
    SELECT * INTO v_my_entry  FROM matchmaking_queue WHERE id = p_my_queue_id      FOR UPDATE;
  END IF;

  -- Both must still be waiting (race-condition guard)
  IF v_my_entry.status  IS DISTINCT FROM 'waiting'::queue_status
  OR v_opp_entry.status IS DISTINCT FROM 'waiting'::queue_status THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already claimed');
  END IF;

  -- Caller must own their queue entry
  IF v_my_entry.user_id IS DISTINCT FROM p_my_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify same stake + time control
  IF v_my_entry.wager_tct              != v_opp_entry.wager_tct
  OR v_my_entry.time_control_seconds   != v_opp_entry.time_control_seconds
  OR v_my_entry.increment_seconds      != v_opp_entry.increment_seconds THEN
    RETURN jsonb_build_object('success', false, 'error', 'Incompatible queue entries');
  END IF;

  -- Verify sufficient available balance for both players (skip for free games)
  IF v_my_entry.wager_tct > 0 THEN
    PERFORM 1 FROM balances
      WHERE user_id = v_my_entry.user_id
        AND available_tct >= v_my_entry.wager_tct;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance (player 1)');
    END IF;

    PERFORM 1 FROM balances
      WHERE user_id = v_opp_entry.user_id
        AND available_tct >= v_opp_entry.wager_tct;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance (player 2)');
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

  -- Create game record (status = 'pending' until both players confirm ready)
  INSERT INTO games (
    white_player_id, black_player_id,
    wager_tct, time_control_seconds, increment_seconds,
    status, is_rated,
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
    'pending', true,
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    v_my_entry.time_control_seconds,
    v_my_entry.time_control_seconds,
    0, 'w',
    v_my_entry.user_elo,
    v_opp_entry.user_elo,
    NOW()
  )
  RETURNING id INTO v_game_id;

  -- Create escrow and lock balances (only for wager games)
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
      v_my_entry.wager_tct * 2, 'active'
    );

    -- Move funds: available → locked for both players atomically
    UPDATE balances
      SET available_tct = available_tct - v_my_entry.wager_tct,
          locked_tct    = locked_tct    + v_my_entry.wager_tct,
          updated_at    = NOW()
      WHERE user_id IN (v_white_id, v_black_id);
  END IF;

  -- Mark both queue entries as matched
  UPDATE matchmaking_queue
    SET status          = 'matched',
        matched_with_id = v_opp_entry.user_id,
        matched_at      = NOW(),
        game_id         = v_game_id
    WHERE id = v_my_entry.id;

  UPDATE matchmaking_queue
    SET status          = 'matched',
        matched_with_id = v_my_entry.user_id,
        matched_at      = NOW(),
        game_id         = v_game_id
    WHERE id = v_opp_entry.id;

  -- Return game info to the caller
  v_result := jsonb_build_object(
    'success',              true,
    'game_id',              v_game_id,
    'white_player_id',      v_white_id,
    'black_player_id',      v_black_id,
    'wager_tct',            v_my_entry.wager_tct,
    'time_control_seconds', v_my_entry.time_control_seconds,
    'increment_seconds',    v_my_entry.increment_seconds
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_matched_game(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_matched_game(UUID, UUID, UUID) TO service_role;

-- ============================================================================
-- FUNCTION: confirm_game_ready
-- ============================================================================
-- Persists each player's ready-confirmation to the DB.
-- Transitions: pending → ready_white/ready_black → active
-- Returns { success, game_status, both_ready } so the client knows whether
-- to start the game.
-- ============================================================================
CREATE OR REPLACE FUNCTION confirm_game_ready(p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game   RECORD;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF v_game.status NOT IN (
    'pending'::game_status,
    'ready_white'::game_status,
    'ready_black'::game_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not in pending state');
  END IF;

  -- Advance status based on which player confirmed
  IF v_caller = v_game.white_player_id THEN
    UPDATE games
      SET status = CASE
        WHEN status = 'ready_black'::game_status THEN 'active'::game_status
        ELSE 'ready_white'::game_status
      END
      WHERE id = p_game_id;

  ELSIF v_caller = v_game.black_player_id THEN
    UPDATE games
      SET status = CASE
        WHEN status = 'ready_white'::game_status THEN 'active'::game_status
        ELSE 'ready_black'::game_status
      END
      WHERE id = p_game_id;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  -- Re-read updated status
  SELECT status INTO v_game FROM games WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'success',     true,
    'game_status', v_game.status,
    'both_ready',  (v_game.status = 'active'::game_status)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_game_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_game_ready(UUID) TO service_role;

-- ============================================================================
-- FUNCTION: cancel_pending_game
-- ============================================================================
-- Cancels a pending/pre-ready game and refunds both players' locked balances.
-- Called when the ready-confirmation window expires without both players ready.
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_pending_game(p_game_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game   RECORD;
  v_escrow RECORD;
  v_caller UUID := auth.uid();
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF v_game.status NOT IN (
    'pending'::game_status,
    'ready_white'::game_status,
    'ready_black'::game_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is already active or completed');
  END IF;

  -- Only participants (or service role, which bypasses RLS) may cancel
  IF v_caller IS NOT NULL
  AND v_caller NOT IN (v_game.white_player_id, v_game.black_player_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Refund locked balances and mark escrow refunded
  SELECT * INTO v_escrow FROM game_escrows WHERE game_id = p_game_id;
  IF FOUND AND v_game.wager_tct > 0 THEN
    UPDATE balances
      SET available_tct = available_tct + v_game.wager_tct,
          locked_tct    = locked_tct    - v_game.wager_tct,
          updated_at    = NOW()
      WHERE user_id IN (v_game.white_player_id, v_game.black_player_id);

    UPDATE game_escrows SET status = 'refunded' WHERE game_id = p_game_id;
  END IF;

  UPDATE games
    SET status     = 'abandoned'::game_status,
        end_reason = 'ready_timeout'::end_reason,
        ended_at   = NOW()
    WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_pending_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_pending_game(UUID) TO service_role;

COMMIT;
