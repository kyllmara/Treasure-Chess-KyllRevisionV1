-- =====================================================
-- ALLOW SMALL TOURNAMENTS (2 and 4 players)
-- =====================================================
-- Migration: 063_allow_small_tournaments.sql
-- Purpose: Allow 2-player and 4-player tournaments for testing and small events.
--          The generate_knockout_bracket function already handles any player count >= 2.
--          We just need to update admin_create_tournament validation and min_players logic.

-- Recreate admin_create_tournament with updated validation
CREATE OR REPLACE FUNCTION admin_create_tournament(
  p_admin_id UUID,
  p_name TEXT,
  p_entry_fee INTEGER DEFAULT 100,
  p_max_players INTEGER DEFAULT 16,
  p_time_control_seconds INTEGER DEFAULT 300,
  p_increment_seconds INTEGER DEFAULT 3,
  p_start_time TIMESTAMPTZ DEFAULT NULL,
  p_is_rated BOOLEAN DEFAULT true,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament_id UUID;
  v_registration_deadline TIMESTAMPTZ;
  v_min_players INTEGER;
  v_admin_username TEXT;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Get admin username for audit
  SELECT username INTO v_admin_username FROM profiles WHERE id = p_admin_id;

  -- Validate max_players is a valid bracket size
  IF p_max_players NOT IN (2, 4, 8, 16, 32, 64) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max players must be 2, 4, 8, 16, 32, or 64');
  END IF;

  -- Default start time to 24h from now if not provided
  IF p_start_time IS NULL THEN
    p_start_time := NOW() + INTERVAL '24 hours';
  END IF;

  -- Registration deadline is 15 minutes before start
  v_registration_deadline := p_start_time - INTERVAL '15 minutes';

  -- Min players: for small tournaments use the max as min, otherwise half (minimum 2)
  IF p_max_players <= 4 THEN
    v_min_players := p_max_players;
  ELSE
    v_min_players := GREATEST(4, p_max_players / 2);
  END IF;

  -- Create tournament
  INSERT INTO tournaments (
    name,
    description,
    type,
    entry_fee_tct,
    prize_pool_tct,
    rake_percentage,
    min_players,
    max_players,
    start_time,
    registration_deadline,
    registration_opens_at,
    time_control_seconds,
    increment_seconds,
    is_rated,
    status,
    created_by
  ) VALUES (
    p_name,
    p_description,
    'knockout',
    p_entry_fee,
    0,
    5.00,
    v_min_players,
    p_max_players,
    p_start_time,
    v_registration_deadline,
    NOW(),
    p_time_control_seconds,
    p_increment_seconds,
    p_is_rated,
    'registration',
    p_admin_id
  )
  RETURNING id INTO v_tournament_id;

  -- Create prize definitions based on tournament size
  IF p_max_players <= 2 THEN
    -- 2-player: winner takes all (post-rake)
    INSERT INTO tournament_prizes (tournament_id, place, percentage) VALUES
      (v_tournament_id, 1, 100.00);
  ELSIF p_max_players <= 4 THEN
    -- 4-player: 70/30
    INSERT INTO tournament_prizes (tournament_id, place, percentage) VALUES
      (v_tournament_id, 1, 70.00),
      (v_tournament_id, 2, 30.00);
  ELSE
    -- 8+: standard 60/25/7.5/7.5
    INSERT INTO tournament_prizes (tournament_id, place, percentage) VALUES
      (v_tournament_id, 1, 60.00),
      (v_tournament_id, 2, 25.00),
      (v_tournament_id, 3, 7.50),
      (v_tournament_id, 4, 7.50);
  END IF;

  -- Audit log
  INSERT INTO admin_audit_log (
    admin_id, admin_username, action_type, action_severity,
    target_table, target_record_id, new_values
  ) VALUES (
    p_admin_id,
    COALESCE(v_admin_username, 'unknown'),
    'create_tournament',
    'medium',
    'tournaments',
    v_tournament_id,
    jsonb_build_object(
      'name', p_name,
      'entry_fee', p_entry_fee,
      'max_players', p_max_players,
      'min_players', v_min_players,
      'start_time', p_start_time
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', v_tournament_id,
    'name', p_name,
    'entry_fee', p_entry_fee,
    'max_players', p_max_players,
    'min_players', v_min_players,
    'start_time', p_start_time,
    'registration_deadline', v_registration_deadline
  );
END;
$$;

-- Also relax the check constraint on the tournaments table if it exists
-- The original constraint was: CHECK (min_players <= max_players)
-- which is fine, but we need min_players to be allowed to be 2
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS valid_player_range;
ALTER TABLE tournaments ADD CONSTRAINT valid_player_range CHECK (min_players >= 2 AND min_players <= max_players);
