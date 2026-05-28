-- =====================================================
-- FIX TOURNAMENT ADMIN FUNCTIONS AUDIT LOG
-- =====================================================
-- Migration: 062_fix_tournament_audit_log.sql
-- Purpose: The tournament admin functions (from 052) insert into admin_audit_log
--          using wrong column names (action, target_type, target_id, details)
--          instead of the actual columns (action_type, target_table, target_record_id, new_values).
--          Also, the action types used ('create_tournament', etc.) don't exist in the
--          admin_action_type enum.
--
-- Fix: Add tournament action types to the enum and recreate the functions
--      with correct column names. Use admin_username from profiles lookup.

-- Add tournament action types to the enum
ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'create_tournament';
ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'start_tournament';
ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'cancel_tournament';

-- Recreate admin_create_tournament with correct audit log columns
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
    NOW(),
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

  -- Audit log with correct column names
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

-- Recreate admin_start_tournament with correct audit log columns
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
  v_admin_username TEXT;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT username INTO v_admin_username FROM profiles WHERE id = p_admin_id;

  -- Use existing start_tournament function
  v_result := start_tournament(p_tournament_id);

  -- Audit log on success
  IF (v_result->>'success')::boolean THEN
    INSERT INTO admin_audit_log (
      admin_id, admin_username, action_type, action_severity,
      target_table, target_record_id, new_values
    ) VALUES (
      p_admin_id,
      COALESCE(v_admin_username, 'unknown'),
      'start_tournament',
      'medium',
      'tournaments',
      p_tournament_id,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Recreate admin_cancel_tournament with correct audit log columns
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
  v_admin_username TEXT;
BEGIN
  -- Verify admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_admin_id AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT username INTO v_admin_username FROM profiles WHERE id = p_admin_id;

  -- Use existing cancel_tournament function
  v_result := cancel_tournament(p_tournament_id);

  -- Audit log on success
  IF (v_result->>'success')::boolean THEN
    INSERT INTO admin_audit_log (
      admin_id, admin_username, action_type, action_severity,
      target_table, target_record_id, new_values
    ) VALUES (
      p_admin_id,
      COALESCE(v_admin_username, 'unknown'),
      'cancel_tournament',
      'high',
      'tournaments',
      p_tournament_id,
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;
