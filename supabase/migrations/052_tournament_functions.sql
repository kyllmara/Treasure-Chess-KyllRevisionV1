-- ============================================================================
-- Migration: 052_tournament_functions.sql
-- Description: Admin tournament management RPC functions with audit logging
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Admin: Create Tournament
-- Creates a tournament with prize definitions and audit log entry
-- ----------------------------------------------------------------------------
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
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Validate max_players is power of 2 (8, 16, 32)
  IF p_max_players NOT IN (8, 16, 32, 64) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max players must be 8, 16, 32, or 64');
  END IF;

  -- Default start time to 24h from now if not provided
  IF p_start_time IS NULL THEN
    p_start_time := NOW() + INTERVAL '24 hours';
  END IF;

  -- Registration deadline is 15 minutes before start
  v_registration_deadline := p_start_time - INTERVAL '15 minutes';

  -- Min players is half of max (minimum 4)
  v_min_players := GREATEST(4, p_max_players / 2);

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
    NOW(), -- Registration opens immediately
    p_time_control_seconds,
    p_increment_seconds,
    p_is_rated,
    'registration',
    p_admin_id
  )
  RETURNING id INTO v_tournament_id;

  -- Create prize definitions: 60% / 25% / 7.5% / 7.5%
  INSERT INTO tournament_prizes (tournament_id, place, percentage) VALUES
    (v_tournament_id, 1, 60.00),
    (v_tournament_id, 2, 25.00),
    (v_tournament_id, 3, 7.50),
    (v_tournament_id, 4, 7.50);

  -- Audit log
  INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    p_admin_id,
    'create_tournament',
    'tournament',
    v_tournament_id,
    jsonb_build_object(
      'name', p_name,
      'entry_fee', p_entry_fee,
      'max_players', p_max_players,
      'start_time', p_start_time
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', v_tournament_id,
    'name', p_name,
    'entry_fee', p_entry_fee,
    'max_players', p_max_players,
    'start_time', p_start_time,
    'registration_deadline', v_registration_deadline
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Admin: Start Tournament
-- Validates admin, seeds players by ELO, generates bracket, creates round 1
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_start_tournament(
  p_tournament_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Use existing start_tournament function
  v_result := start_tournament(p_tournament_id);

  -- Audit log on success
  IF (v_result->>'success')::boolean THEN
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
    VALUES (
      p_admin_id,
      'start_tournament',
      'tournament',
      p_tournament_id,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- Admin: Cancel Tournament
-- Validates admin, refunds all entry fees, sets cancelled status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_cancel_tournament(
  p_tournament_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Use existing cancel_tournament function
  v_result := cancel_tournament(p_tournament_id);

  -- Audit log on success
  IF (v_result->>'success')::boolean THEN
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
    VALUES (
      p_admin_id,
      'cancel_tournament',
      'tournament',
      p_tournament_id,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- Complete Tournament
-- Wrapper around finalize_tournament for external calls
-- Calculates prizes, distributes payouts, deducts rake
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN finalize_tournament(p_tournament_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- Forfeit Tournament Match
-- Auto-forfeits a no-show player after 30 minutes
-- Called by scheduled job or admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forfeit_tournament_match(
  p_match_id UUID,
  p_forfeit_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_winner_id UUID;
BEGIN
  -- Get match
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF v_match.status NOT IN ('pending', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already completed');
  END IF;

  -- Determine winner (the other player)
  IF p_forfeit_player_id = v_match.player1_id THEN
    v_winner_id := v_match.player2_id;
  ELSIF p_forfeit_player_id = v_match.player2_id THEN
    v_winner_id := v_match.player1_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Player not in this match');
  END IF;

  -- Record result using existing function
  RETURN record_tournament_match_result(p_match_id, v_winner_id, NULL);
END;
$$;

-- ----------------------------------------------------------------------------
-- Check for No-Show Forfeits
-- Finds matches pending for over 30 minutes and auto-forfeits
-- Designed to be called by a pg_cron job or edge function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_tournament_no_shows()
RETURNS TABLE(match_id UUID, forfeit_result JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
BEGIN
  FOR v_match IN
    SELECT tm.*
    FROM tournament_matches tm
    JOIN tournaments t ON t.id = tm.tournament_id
    WHERE tm.status = 'pending'
      AND tm.player1_id IS NOT NULL
      AND tm.player2_id IS NOT NULL
      AND t.status = 'active'
      AND tm.scheduled_at IS NOT NULL
      AND tm.scheduled_at < NOW() - INTERVAL '30 minutes'
  LOOP
    match_id := v_match.id;

    -- For no-shows, forfeit the lower-seeded player (higher seed number)
    -- This is a simple heuristic; in production you'd check who connected
    IF COALESCE(v_match.player1_seed, 999) > COALESCE(v_match.player2_seed, 999) THEN
      forfeit_result := forfeit_tournament_match(v_match.id, v_match.player1_id);
    ELSE
      forfeit_result := forfeit_tournament_match(v_match.id, v_match.player2_id);
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Set scheduled_at for new matches when both players are assigned
-- This trigger sets scheduled_at when a match becomes ready to play
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_match_scheduled_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When both players are assigned and match is pending, set scheduled_at
  IF NEW.player1_id IS NOT NULL
     AND NEW.player2_id IS NOT NULL
     AND NEW.status = 'pending'
     AND NEW.scheduled_at IS NULL THEN
    NEW.scheduled_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for setting scheduled_at
DROP TRIGGER IF EXISTS on_match_players_assigned ON tournament_matches;
CREATE TRIGGER on_match_players_assigned
  BEFORE INSERT OR UPDATE ON tournament_matches
  FOR EACH ROW
  EXECUTE FUNCTION set_match_scheduled_at();

-- ----------------------------------------------------------------------------
-- GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin_create_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION admin_start_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION complete_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION forfeit_tournament_match TO authenticated;
GRANT EXECUTE ON FUNCTION check_tournament_no_shows TO authenticated;
GRANT EXECUTE ON FUNCTION start_tournament TO authenticated;
GRANT EXECUTE ON FUNCTION record_tournament_match_result TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_tournament TO authenticated;
