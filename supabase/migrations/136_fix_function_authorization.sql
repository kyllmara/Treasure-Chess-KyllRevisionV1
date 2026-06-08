-- Critical fix: a large class of SECURITY DEFINER RPC functions were directly
-- callable by ANY holder of the public anon key (anon/authenticated roles)
-- with ZERO caller-identity verification. SECURITY DEFINER functions run with
-- the owner's privileges and bypass RLS entirely, so a missing ownership/admin
-- check here is a direct BOLA/IDOR vulnerability (OWASP API #1).
--
-- This migration is split into two parts:
--   PART A — re-create actively-used functions with proper
--            "caller must own this resource" / "caller must be admin" checks,
--            using the auth_profile_id() helper introduced in migration 134
--            (NOT auth.uid(), which is a different UUID space — see 134).
--   PART B — revoke EXECUTE from anon/authenticated on functions that should
--            only ever be invoked by trusted backend code (edge functions
--            using the service_role key, which bypasses RLS and grants).
--            Verified: every one of these is exclusively called from
--            supabase/functions/* (service-role context), never from the app.

-- ============================================================================
-- PART A1 — financial functions: caller must act only on their own balance
-- ============================================================================

-- request_withdrawal: previously anyone could drain any user's balance into
-- their own withdrawal address by passing an arbitrary p_user_id.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_user_id uuid, p_amount_tct numeric, p_to_address text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(request_id uuid, success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_available_balance NUMERIC;
    v_locked_balance NUMERIC;
    v_amount_usdc NUMERIC;
    v_request_id UUID;
BEGIN
    IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: cannot request withdrawal for another user';
    END IF;

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_request_id
        FROM withdrawal_requests
        WHERE idempotency_key = p_idempotency_key;

        IF v_request_id IS NOT NULL THEN
            RETURN QUERY SELECT v_request_id, TRUE, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Get user balance
    SELECT available_tct, COALESCE(locked_tct, 0)
    INTO v_available_balance, v_locked_balance
    FROM balances
    WHERE user_id = p_user_id;

    IF v_available_balance IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'No balance found'::TEXT;
        RETURN;
    END IF;

    -- Check sufficient balance
    IF v_available_balance < p_amount_tct THEN
        RETURN QUERY SELECT NULL::UUID, FALSE,
            ('Insufficient balance. Available: ' || v_available_balance || ' TCT')::TEXT;
        RETURN;
    END IF;

    -- Calculate USDC amount (1 USDC = 25 TCT)
    v_amount_usdc := p_amount_tct / 25.0;

    -- Validate minimum withdrawal
    IF v_amount_usdc < 1 THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'Minimum withdrawal is 25 TCT ($1 USDC)'::TEXT;
        RETURN;
    END IF;

    -- Lock the funds
    UPDATE balances
    SET
        available_tct = available_tct - p_amount_tct,
        locked_tct = COALESCE(locked_tct, 0) + p_amount_tct,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Create withdrawal request
    INSERT INTO withdrawal_requests (
        user_id,
        amount_tct,
        amount_usdc,
        to_address,
        status,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_amount_tct,
        v_amount_usdc,
        p_to_address,
        'pending',
        p_idempotency_key
    )
    RETURNING id INTO v_request_id;

    RETURN QUERY SELECT v_request_id, TRUE, NULL::TEXT;
END;
$function$;

-- update_user_profile: previously anyone could rewrite any other user's
-- username / avatar / profile picture by passing an arbitrary p_profile_id.
CREATE OR REPLACE FUNCTION public.update_user_profile(p_profile_id uuid, p_username text DEFAULT NULL::text, p_avatar_index integer DEFAULT NULL::integer, p_profile_picture_url text DEFAULT NULL::text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile profiles;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_profile_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot update another user''s profile';
  END IF;

  -- Check if username is being changed and if so, check uniqueness
  IF p_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE username = p_username
      AND id != p_profile_id
    ) THEN
      RAISE EXCEPTION 'Username already taken';
    END IF;
  END IF;

  -- Update the profile
  UPDATE profiles
  SET
    username = COALESCE(p_username, username),
    avatar_index = COALESCE(p_avatar_index, avatar_index),
    profile_picture_url = COALESCE(p_profile_picture_url, profile_picture_url),
    updated_at = NOW()
  WHERE id = p_profile_id
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN v_profile;
END;
$function$;

-- ============================================================================
-- PART A2 — challenge wager lock/unlock
--
-- These existed as TWO overloads: (uuid, numeric, text) and (uuid, numeric, uuid).
-- The text overload's auth check used the broken `auth.uid() = p_user_id`
-- comparison (always false — see migration 134) AND inserted an invalid
-- transaction_type ('lock'/'unlock' are not in the enum, only 'wager_lock'/
-- 'wager_unlock' are) — i.e. it always errors. The uuid overload had NO check
-- at all. Overload ambiguity also meant PostgREST likely could not reliably
-- resolve which to call. We drop the broken text overload and fix the uuid
-- overload in place — leaving exactly one, correctly-checked function.
-- ============================================================================

DROP FUNCTION IF EXISTS public.lock_balance_for_challenge(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.unlock_balance_for_challenge(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.lock_balance_for_challenge(p_user_id uuid, p_amount numeric, p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot lock balance for another user';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.unlock_balance_for_challenge(p_user_id uuid, p_amount numeric, p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_locked NUMERIC;
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot unlock balance for another user';
  END IF;

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
$function$;

-- ============================================================================
-- PART A3 — tournaments: caller must act only as themselves
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_for_tournament(p_tournament_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: cannot register another user for a tournament');
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
$function$;

CREATE OR REPLACE FUNCTION public.unregister_from_tournament(p_tournament_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament RECORD;
  v_registration RECORD;
  v_refund_amount INTEGER;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: cannot unregister another user from a tournament');
  END IF;

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
$function$;

-- start_tournament: invoked two ways — (a) internally via PERFORM from
-- register_for_tournament when a tournament fills up (legitimate, no admin
-- in context), and (b) as an admin "force start" RPC. We allow it when the
-- tournament has reached capacity (the only condition under which the
-- internal auto-start path calls it) OR when the caller is an admin.
CREATE OR REPLACE FUNCTION public.start_tournament(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament RECORD;
  v_result JSONB;
BEGIN
  -- Get and lock tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.current_players < v_tournament.max_players
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id = auth_profile_id() AND (is_admin = true OR is_super_admin = true)
     )
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only admins can start a tournament before it is full');
  END IF;

  -- Check status
  IF v_tournament.status NOT IN ('registration', 'starting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament cannot be started from current status');
  END IF;

  -- Check minimum players
  IF v_tournament.current_players < v_tournament.min_players THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not enough players',
      'current', v_tournament.current_players,
      'required', v_tournament.min_players
    );
  END IF;

  -- Update seeds based on ELO
  WITH ranked AS (
    SELECT
      tr.id,
      ROW_NUMBER() OVER (ORDER BY p.elo_rating DESC) as new_seed
    FROM tournament_registrations tr
    JOIN profiles p ON p.id = tr.user_id
    WHERE tr.tournament_id = p_tournament_id
  )
  UPDATE tournament_registrations tr
  SET seed = ranked.new_seed
  FROM ranked
  WHERE tr.id = ranked.id;

  -- Generate bracket/pairings based on tournament type
  IF v_tournament.type = 'knockout' THEN
    v_result := generate_knockout_bracket(p_tournament_id);
  ELSIF v_tournament.type = 'swiss' THEN
    v_result := generate_swiss_pairings(p_tournament_id, 1);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported tournament type');
  END IF;

  IF NOT (v_result->>'success')::boolean THEN
    RETURN v_result;
  END IF;

  -- Update tournament status
  UPDATE tournaments
  SET
    status = 'active',
    started_at = NOW(),
    current_round = 1
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'type', v_tournament.type,
    'players', v_tournament.current_players,
    'bracket_result', v_result
  );
END;
$function$;

-- ============================================================================
-- PART A4 — house challenges: caller must act only as themselves
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_house_challenge(p_user_id uuid, p_challenge_id uuid)
 RETURNS TABLE(success boolean, attempt_id uuid, player_color text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_challenge RECORD;
    v_user_attempt_count INTEGER;
    v_user_monthly_count INTEGER;
    v_attempt_id UUID;
    v_player_color TEXT;
    v_month_start TIMESTAMPTZ;
BEGIN
    IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Unauthorized: cannot start a house challenge for another user';
        RETURN;
    END IF;

    -- Lock and fetch challenge
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge not found';
        RETURN;
    END IF;

    -- Check if challenge is active
    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge is not active';
        RETURN;
    END IF;

    -- Check start date
    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has not started yet';
        RETURN;
    END IF;

    -- Check end date
    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has ended';
        RETURN;
    END IF;

    -- Check total lifetime entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum lifetime attempts reached for this challenge';
            RETURN;
        END IF;
    END IF;

    -- Check monthly entries per user
    IF v_challenge.max_entries_per_user_per_month IS NOT NULL THEN
        v_month_start := date_trunc('month', NOW());

        SELECT COUNT(*) INTO v_user_monthly_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id
          AND challenge_id = p_challenge_id
          AND created_at >= v_month_start;

        IF v_user_monthly_count >= v_challenge.max_entries_per_user_per_month THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum monthly attempts reached. Resets next month.';
            RETURN;
        END IF;
    END IF;

    -- Check max total entries
    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has reached maximum total entries';
            RETURN;
        END IF;
    END IF;

    -- Determine player color
    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    -- Create attempt record
    INSERT INTO house_challenge_attempts (
        challenge_id, user_id, entry_fee_paid_tct, status, player_color, game_started_at
    ) VALUES (
        p_challenge_id, p_user_id, v_challenge.entry_fee_tct, 'in_progress', v_player_color, NOW()
    ) RETURNING id INTO v_attempt_id;

    -- Update challenge stats
    UPDATE house_challenges
    SET total_attempts = total_attempts + 1,
        total_entry_fees_collected = total_entry_fees_collected + v_challenge.entry_fee_tct
    WHERE id = p_challenge_id;

    RETURN QUERY SELECT TRUE, v_attempt_id, v_player_color, NULL::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_house_challenge(p_user_id uuid, p_challenge_id uuid, p_entry_session_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, attempt_id uuid, player_color text, error_message text, new_entry_session_id uuid, attempt_number integer, attempts_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_challenge RECORD;
    v_user_attempt_count INTEGER;
    v_user_monthly_count INTEGER;
    v_attempt_id UUID;
    v_player_color TEXT;
    v_month_start TIMESTAMPTZ;
    v_session_id UUID;
    v_attempt_num INTEGER;
    v_session_attempts INTEGER;
BEGIN
    IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Unauthorized: cannot start a house challenge for another user', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Lock and fetch challenge
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge not found', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check if challenge is active
    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge is not active', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check start date
    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has not started yet', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check end date
    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has ended', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check total lifetime entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum lifetime attempts reached', NULL::UUID, 0, 0;
            RETURN;
        END IF;
    END IF;

    -- Check monthly entries per user
    IF v_challenge.max_entries_per_user_per_month IS NOT NULL THEN
        v_month_start := date_trunc('month', NOW());

        SELECT COUNT(*) INTO v_user_monthly_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id
          AND challenge_id = p_challenge_id
          AND created_at >= v_month_start;

        IF v_user_monthly_count >= v_challenge.max_entries_per_user_per_month THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum monthly attempts reached', NULL::UUID, 0, 0;
            RETURN;
        END IF;
    END IF;

    -- Check max total entries
    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has reached maximum entries', NULL::UUID, 0, 0;
            RETURN;
        END IF;
    END IF;

    -- Handle entry session
    IF p_entry_session_id IS NOT NULL THEN
        -- Continuing existing session
        v_session_id := p_entry_session_id;

        -- Count attempts in this session
        SELECT COUNT(*) INTO v_session_attempts
        FROM house_challenge_attempts
        WHERE entry_session_id = v_session_id;

        IF v_session_attempts >= v_challenge.attempts_per_entry THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'No attempts remaining in this session', NULL::UUID, 0, 0;
            RETURN;
        END IF;

        v_attempt_num := v_session_attempts + 1;
    ELSE
        -- New session (new payment)
        v_session_id := gen_random_uuid();
        v_attempt_num := 1;
    END IF;

    -- Determine player color
    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    -- Create attempt record
    INSERT INTO house_challenge_attempts (
        challenge_id, user_id, entry_fee_paid_tct, status, player_color,
        game_started_at, entry_session_id, attempt_number_in_session
    ) VALUES (
        p_challenge_id, p_user_id,
        CASE WHEN v_attempt_num = 1 THEN v_challenge.entry_fee_tct ELSE 0 END,  -- Only first attempt in session has fee
        'in_progress', v_player_color, NOW(),
        v_session_id, v_attempt_num
    ) RETURNING id INTO v_attempt_id;

    -- Update challenge stats (only count unique entry sessions for fee collection)
    IF v_attempt_num = 1 THEN
        UPDATE house_challenges
        SET total_attempts = total_attempts + 1,
            total_entry_fees_collected = total_entry_fees_collected + v_challenge.entry_fee_tct
        WHERE id = p_challenge_id;
    ELSE
        UPDATE house_challenges
        SET total_attempts = total_attempts + 1
        WHERE id = p_challenge_id;
    END IF;

    RETURN QUERY SELECT
        TRUE,
        v_attempt_id,
        v_player_color,
        NULL::TEXT,
        v_session_id,
        v_attempt_num,
        (v_challenge.attempts_per_entry - v_attempt_num)::INTEGER;
END;
$function$;

-- ============================================================================
-- PART A5 — support tickets & admin actions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_support_ticket_read_user(p_ticket_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot mark another user''s ticket as read';
  END IF;

  UPDATE support_tickets
  SET user_last_read_at = now()
  WHERE id = p_ticket_id AND user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_ticket_read_admin(p_ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth_profile_id() AND (is_admin = true OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE support_tickets
  SET admin_last_read_at = now()
  WHERE id = p_ticket_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_fiat_deposit(p_deposit_id uuid, p_admin_id uuid, p_admin_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth_profile_id() AND (is_admin = true OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE pending_fiat_deposits
  SET status = 'rejected',
      admin_id = p_admin_id,
      admin_note = COALESCE(p_admin_note, 'Rejected by admin'),
      processed_at = now()
  WHERE id = p_deposit_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  RETURN TRUE;
END;
$function$;

-- ============================================================================
-- PART A6 — read-only "get my data" RPCs: caller may only read their own data
-- (these previously let anyone read any user's reward progress, unread
-- support count, or full withdrawal history including destination addresses)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_reward_progress(p_user_id uuid)
 RETURNS TABLE(reward_id uuid, reward_name text, criteria_type criteria_type, criteria_value integer, current_progress integer, is_unlocked boolean, tct_reward numeric, tct_claimed boolean, avatar_url text, reward_type text, tier reward_tier)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_games_played INTEGER;
  v_total_wins INTEGER;
  v_challenges_completed INTEGER;
  v_tournaments_played INTEGER;
  v_tournament_wins INTEGER;
  v_current_streak INTEGER;
  v_elo_rating INTEGER;
  v_total_earnings NUMERIC;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot view another user''s reward progress';
  END IF;

  -- Compute stats from profiles
  SELECT COALESCE(p.games_played, 0), COALESCE(p.games_won, 0),
         COALESCE(p.current_streak, 0), COALESCE(p.elo_rating, 1200)
  INTO v_games_played, v_total_wins, v_current_streak, v_elo_rating
  FROM profiles p WHERE p.id = p_user_id;

  -- Compute challenges_completed from challenges table
  SELECT COUNT(*)::INTEGER INTO v_challenges_completed
  FROM challenges
  WHERE (creator_id = p_user_id OR opponent_id = p_user_id)
    AND status = 'accepted'
    AND game_id IS NOT NULL;

  -- Compute tournaments_played from tournament_registrations
  SELECT COUNT(*)::INTEGER INTO v_tournaments_played
  FROM tournament_registrations
  WHERE user_id = p_user_id;

  -- Compute tournament_wins from tournament_registrations (final_place = 1)
  SELECT COUNT(*)::INTEGER INTO v_tournament_wins
  FROM tournament_registrations
  WHERE user_id = p_user_id
    AND final_place = 1;

  -- Compute total_earnings from transactions (win_payout type)
  SELECT COALESCE(SUM(amount_tct), 0) INTO v_total_earnings
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'win_payout';

  -- ========================================================================
  -- Auto-unlock: set unlocked_at on any user_rewards row where the user
  -- has met the criteria but unlocked_at is still NULL.
  -- First, ensure user_rewards rows exist for all active rewards.
  -- ========================================================================

  INSERT INTO user_rewards (user_id, reward_id, progress)
  SELECT p_user_id, r.id, 0
  FROM rewards r
  WHERE r.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_rewards ur
      WHERE ur.user_id = p_user_id AND ur.reward_id = r.id
    );

  UPDATE user_rewards ur
  SET unlocked_at = NOW(),
      progress = r.criteria_value,
      updated_at = NOW()
  FROM rewards r
  WHERE ur.reward_id = r.id
    AND ur.user_id = p_user_id
    AND ur.unlocked_at IS NULL
    AND r.is_active = true
    AND (
      (r.criteria_type = 'games_played'         AND v_games_played >= r.criteria_value)
      OR (r.criteria_type = 'total_wins'        AND v_total_wins >= r.criteria_value)
      OR (r.criteria_type = 'challenges_completed' AND v_challenges_completed >= r.criteria_value)
      OR (r.criteria_type = 'tournaments_played' AND v_tournaments_played >= r.criteria_value)
      OR (r.criteria_type = 'tournament_wins'    AND v_tournament_wins >= r.criteria_value)
      OR (r.criteria_type = 'win_streak'         AND v_current_streak >= r.criteria_value)
      OR (r.criteria_type = 'elo_rating'         AND v_elo_rating >= r.criteria_value)
      OR (r.criteria_type = 'total_earnings'     AND v_total_earnings >= r.criteria_value)
    );

  -- Return all rewards with computed progress
  RETURN QUERY
  SELECT
    r.id AS reward_id,
    r.name AS reward_name,
    r.criteria_type,
    r.criteria_value,
    CASE r.criteria_type
      WHEN 'games_played' THEN v_games_played
      WHEN 'total_wins' THEN v_total_wins
      WHEN 'challenges_completed' THEN v_challenges_completed
      WHEN 'tournaments_played' THEN v_tournaments_played
      WHEN 'tournament_wins' THEN v_tournament_wins
      WHEN 'win_streak' THEN v_current_streak
      WHEN 'elo_rating' THEN v_elo_rating
      WHEN 'total_earnings' THEN v_total_earnings::INTEGER
      ELSE 0
    END AS current_progress,
    (ur.unlocked_at IS NOT NULL) AS is_unlocked,
    r.tct_reward,
    COALESCE(ur.tct_claimed, false) AS tct_claimed,
    r.avatar_url,
    r.reward_type,
    r.tier
  FROM rewards r
  LEFT JOIN user_rewards ur ON ur.reward_id = r.id AND ur.user_id = p_user_id
  WHERE r.is_active = true
  ORDER BY r.sort_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_unread_support_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  unread_count INTEGER;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot view another user''s support ticket count';
  END IF;

  SELECT COUNT(DISTINCT t.id)::INTEGER INTO unread_count
  FROM support_tickets t
  WHERE t.user_id = p_user_id
    AND t.status != 'resolved'
    AND EXISTS (
      SELECT 1 FROM support_messages m
      WHERE m.ticket_id = t.id
        AND m.is_admin = true
        AND m.created_at > COALESCE(t.user_last_read_at, '1970-01-01'::timestamptz)
    );
  RETURN unread_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_withdrawals(p_user_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, type text, amount_tct integer, fee_tct integer, net_amount_tct integer, net_amount_usdc numeric, net_amount_usd numeric, destination_address text, tx_hash text, status text, created_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot view another user''s withdrawal history';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.type,
    w.amount_tct,
    w.fee_tct,
    w.net_amount_tct,
    w.net_amount_usdc,
    w.net_amount_usd,
    w.destination_address,
    w.tx_hash,
    w.status,
    w.created_at,
    w.completed_at
  FROM public.withdrawals w
  WHERE w.user_id = p_user_id
  ORDER BY w.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- is_user_admin / is_user_restricted: caller may check their own status, or
-- (since these are also useful for an admin panel) an admin may check anyone's.
CREATE OR REPLACE FUNCTION public.is_user_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_is_admin BOOLEAN;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth_profile_id();

    IF v_caller_id IS DISTINCT FROM p_user_id AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = v_caller_id AND (is_admin = true OR is_super_admin = true)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: cannot view another user''s admin status';
    END IF;

    SELECT is_admin OR is_super_admin INTO v_is_admin
    FROM profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_is_admin, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_restricted(p_user_id uuid)
 RETURNS TABLE(is_restricted boolean, restriction_type text, reason text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_profile profiles%ROWTYPE;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth_profile_id();

    IF v_caller_id IS DISTINCT FROM p_user_id AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = v_caller_id AND (is_admin = true OR is_super_admin = true)
    ) THEN
      RAISE EXCEPTION 'Unauthorized: cannot view another user''s restriction status';
    END IF;

    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF v_profile.is_banned AND (v_profile.ban_expires_at IS NULL OR v_profile.ban_expires_at > NOW()) THEN
        RETURN QUERY SELECT TRUE, 'banned'::TEXT, v_profile.ban_reason, v_profile.ban_expires_at;
        RETURN;
    END IF;

    IF v_profile.is_suspended AND (v_profile.suspension_expires_at IS NULL OR v_profile.suspension_expires_at > NOW()) THEN
        RETURN QUERY SELECT TRUE, 'suspended'::TEXT, v_profile.suspension_reason, v_profile.suspension_expires_at;
        RETURN;
    END IF;

    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$function$;

-- ============================================================================
-- PART A7 — livestream session control: caller must own the session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_stream_session(p_user_id uuid, p_platform stream_platform, p_rtmp_url character varying, p_stream_key_encrypted text, p_resolution stream_resolution, p_video_bitrate integer, p_title character varying, p_description text DEFAULT NULL::text, p_tags text[] DEFAULT NULL::text[], p_game_id uuid DEFAULT NULL::uuid)
 RETURNS stream_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session stream_sessions;
  v_existing_active integer;
  v_connection_id uuid;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot start a stream session for another user';
  END IF;

  -- Check for existing active stream
  SELECT COUNT(*) INTO v_existing_active
  FROM stream_sessions
  WHERE user_id = p_user_id
  AND connection_state IN ('initializing', 'connecting', 'connected', 'streaming', 'reconnecting');

  IF v_existing_active > 0 THEN
    RAISE EXCEPTION 'User already has an active stream session';
  END IF;

  -- Get platform connection if exists
  SELECT id INTO v_connection_id
  FROM platform_connections
  WHERE user_id = p_user_id
  AND platform = p_platform
  AND is_active = true
  LIMIT 1;

  -- Create session
  INSERT INTO stream_sessions (
    user_id,
    game_id,
    platform,
    platform_connection_id,
    rtmp_url,
    stream_key_encrypted,
    resolution,
    video_bitrate,
    title,
    description,
    tags,
    connection_state,
    started_at
  )
  VALUES (
    p_user_id,
    p_game_id,
    p_platform,
    v_connection_id,
    p_rtmp_url,
    p_stream_key_encrypted,
    p_resolution,
    p_video_bitrate,
    p_title,
    p_description,
    p_tags,
    'initializing',
    now()
  )
  RETURNING * INTO v_session;

  -- Log event
  INSERT INTO stream_events (session_id, event_type, current_state)
  VALUES (v_session.id, 'stream_started', 'initializing');

  -- Ensure statistics record exists
  INSERT INTO stream_statistics (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_stream_health(p_session_id uuid, p_bitrate integer, p_fps numeric, p_dropped_frames integer, p_total_frames bigint, p_latency_ms integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_quality stream_quality;
  v_drop_rate numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stream_sessions WHERE id = p_session_id AND user_id = auth_profile_id()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: cannot update health for a stream session you do not own';
  END IF;

  -- Calculate quality based on metrics
  v_drop_rate := CASE
    WHEN p_total_frames > 0 THEN (p_dropped_frames::numeric / p_total_frames) * 100
    ELSE 0
  END;

  v_quality := CASE
    WHEN v_drop_rate < 0.1 AND p_latency_ms < 1000 AND p_fps >= 29 THEN 'excellent'
    WHEN v_drop_rate < 0.5 AND p_latency_ms < 2000 AND p_fps >= 25 THEN 'good'
    WHEN v_drop_rate < 2.0 AND p_latency_ms < 5000 AND p_fps >= 20 THEN 'fair'
    ELSE 'poor'
  END;

  UPDATE stream_sessions
  SET
    last_bitrate = p_bitrate,
    last_fps = p_fps,
    dropped_frames = p_dropped_frames,
    total_frames = p_total_frames,
    last_latency_ms = p_latency_ms,
    health_quality = v_quality,
    updated_at = now()
  WHERE id = p_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_stream_state(p_session_id uuid, p_new_state stream_connection_state, p_error_code character varying DEFAULT NULL::character varying, p_error_message text DEFAULT NULL::text)
 RETURNS stream_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session stream_sessions;
  v_old_state stream_connection_state;
BEGIN
  -- Get current session
  SELECT * INTO v_session
  FROM stream_sessions
  WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Stream session not found';
  END IF;

  IF v_session.user_id IS DISTINCT FROM auth_profile_id() THEN
    RAISE EXCEPTION 'Unauthorized: cannot update state for a stream session you do not own';
  END IF;

  v_old_state := v_session.connection_state;

  -- Update session
  UPDATE stream_sessions
  SET
    connection_state = p_new_state,
    error_code = COALESCE(p_error_code, error_code),
    error_message = COALESCE(p_error_message, error_message),
    reconnect_attempts = CASE
      WHEN p_new_state = 'reconnecting' THEN reconnect_attempts + 1
      WHEN p_new_state = 'streaming' THEN 0
      ELSE reconnect_attempts
    END,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Log state change
  INSERT INTO stream_events (
    session_id,
    event_type,
    previous_state,
    current_state,
    error_code,
    error_message
  )
  VALUES (
    p_session_id,
    'connection_state_changed',
    v_old_state,
    p_new_state,
    p_error_code,
    p_error_message
  );

  RETURN v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_viewer_count(p_session_id uuid, p_viewer_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stream_sessions WHERE id = p_session_id AND user_id = auth_profile_id()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: cannot update viewer count for a stream session you do not own';
  END IF;

  UPDATE stream_sessions
  SET
    viewer_count = p_viewer_count,
    peak_viewer_count = GREATEST(peak_viewer_count, p_viewer_count),
    updated_at = now()
  WHERE id = p_session_id;

  -- Log if significant change (every 10 viewers or peak)
  IF p_viewer_count % 10 = 0 OR p_viewer_count > (
    SELECT peak_viewer_count FROM stream_sessions WHERE id = p_session_id
  ) THEN
    INSERT INTO stream_events (session_id, event_type, viewer_count)
    VALUES (p_session_id, 'viewer_count_updated', p_viewer_count);
  END IF;
END;
$function$;

-- ============================================================================
-- PART B — lock down service-role-only functions
--
-- Verified: every function below is exclusively invoked from
-- supabase/functions/* edge functions (which authenticate with the
-- service_role key — bypasses RLS and grants), and NEVER from app/lib client
-- code. EXECUTE was granted to PUBLIC (inherited by anon/authenticated, i.e.
-- callable by anyone holding the public anon key) which served no purpose and
-- let anyone mint TCT, settle/rig games, freeze other users' funds, fabricate
-- vault deposits, or impersonate admins directly via raw supabase.rpc() calls.
-- We revoke from PUBLIC and re-grant explicitly to service_role only.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.increment_balance_field(uuid, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_escrow_to_winner(uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_escrow_refund(uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_vault_deposit(uuid, numeric, numeric, text, bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_ledger_balance(text, text, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settle_escrow(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.settle_escrow_with_rake(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_escrow_funds(uuid, uuid, uuid, boolean, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_escrow(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_escrow_both_players(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_balance_for_game(uuid, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unlock_balance_for_game(uuid, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_admin_status_by_email(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initialize_platform_vault(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_vault_reconciliation() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_balance_field(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_escrow_to_winner(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_escrow_refund(uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_vault_deposit(uuid, numeric, numeric, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_ledger_balance(text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_escrow(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_escrow_with_rake(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_escrow_funds(uuid, uuid, uuid, boolean, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_escrow(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_escrow_both_players(uuid, uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_balance_for_game(uuid, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_balance_for_game(uuid, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_admin_status_by_email(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_platform_vault(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_vault_reconciliation() TO service_role;
