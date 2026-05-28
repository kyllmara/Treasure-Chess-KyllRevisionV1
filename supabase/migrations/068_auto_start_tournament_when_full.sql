-- ============================================================================
-- Migration: 068_auto_start_tournament_when_full.sql
-- Description: Auto-start tournament when it reaches max_players and notify
--              all registered players.
-- ============================================================================

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
  v_new_player_count INTEGER;
  v_start_result JSONB;
  v_reg RECORD;
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
  WHERE id = p_tournament_id
  RETURNING current_players INTO v_new_player_count;

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

-- ============================================================================
-- Function: create_tournament_game
-- Creates an actual chess game for a tournament match so players can play.
-- Called by either player when they press "Play Now".
-- Idempotent: returns existing game_id if already created.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_tournament_game(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_game_id UUID;
  v_white_id UUID;
  v_black_id UUID;
  v_white_elo INTEGER;
  v_black_elo INTEGER;
BEGIN
  -- Get match with lock
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Verify user is a player in this match
  IF p_user_id != v_match.player1_id AND p_user_id != v_match.player2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a player in this match');
  END IF;

  -- If game already exists, return it
  IF v_match.game_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'game_id', v_match.game_id,
      'already_exists', true
    );
  END IF;

  -- Match must be pending and have both players
  IF v_match.status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not in pending status');
  END IF;

  IF v_match.player1_id IS NULL OR v_match.player2_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match does not have both players assigned');
  END IF;

  -- Get tournament for time control settings
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = v_match.tournament_id;

  -- Randomly assign colors
  IF random() < 0.5 THEN
    v_white_id := v_match.player1_id;
    v_black_id := v_match.player2_id;
  ELSE
    v_white_id := v_match.player2_id;
    v_black_id := v_match.player1_id;
  END IF;

  -- Get ELO ratings
  SELECT elo_rating INTO v_white_elo FROM profiles WHERE id = v_white_id;
  SELECT elo_rating INTO v_black_elo FROM profiles WHERE id = v_black_id;

  -- Create the game
  INSERT INTO games (
    white_player_id,
    black_player_id,
    wager_tct,
    time_control_seconds,
    increment_seconds,
    status,
    initial_fen,
    current_fen,
    white_time_remaining,
    black_time_remaining,
    move_count,
    current_turn,
    white_elo_before,
    black_elo_before,
    started_at
  ) VALUES (
    v_white_id,
    v_black_id,
    0, -- Tournament games don't have individual wagers
    v_tournament.time_control_seconds,
    v_tournament.increment_seconds,
    'active',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    v_tournament.time_control_seconds,
    v_tournament.time_control_seconds,
    0,
    'w',
    v_white_elo,
    v_black_elo,
    NOW()
  )
  RETURNING id INTO v_game_id;

  -- Link game to tournament match and mark as in_progress
  UPDATE tournament_matches
  SET game_id = v_game_id,
      status = 'in_progress',
      started_at = NOW()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', v_game_id,
    'white_player_id', v_white_id,
    'black_player_id', v_black_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_tournament_game TO authenticated;
