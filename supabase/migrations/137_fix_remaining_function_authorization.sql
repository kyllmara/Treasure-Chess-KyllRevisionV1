-- =====================================================================
-- Migration 137: Fix second wave of SECURITY DEFINER authorization bugs
-- =====================================================================
-- Follow-up to migration 136. A broader sweep of the ~159 SECURITY
-- DEFINER functions exposed to `authenticated` turned up a second
-- batch of exploitable issues:
--
--   PART A — "Confused deputy" bug: admin_adjust_balance/suspend_user/
--            unban_user/unsuspend_user check is_user_admin(p_admin_id)
--            where p_admin_id is an ATTACKER-SUPPLIED parameter, not
--            the real caller. Anyone who knows ANY admin's profile UUID
--            can pass it as p_admin_id and operate as that admin against
--            arbitrary targets (mint TCT, suspend/unban anyone, etc).
--            Fix: check the REAL caller (auth_profile_id()) instead.
--
--   PART B — Missing admin checks entirely:
--            admin_update_rake_settings (rewrite platform rake/splits)
--            approve_fiat_deposit (mint arbitrary TCT by approving any
--            pending fiat deposit, including ones targeting yourself)
--
--   PART C — Missing ownership checks (any p_user_id accepted):
--            connect_streaming_platform / disconnect_streaming_platform
--            (hijack or wipe another user's stream connection + tokens)
--            mark_notifications_read (silence another user's alerts)
--            claim_dragon_reward (force-claim another user's reward)
--
--   PART D — is_user_super_admin leaks any user's super-admin flag to
--            any authenticated caller (same class of bug as
--            is_user_admin/is_user_restricted, fixed in migration 136).
--
--   PART E — Dead/dangerous functions with zero caller checks that are
--            not used by any client code path or edge function (verified
--            via grep across lib/, app/, stores/, components/, contexts/,
--            supabase/functions/). Rather than bolt on bespoke checks for
--            unused attack surface, lock them down the same way migration
--            136 Part B did: REVOKE EXECUTE FROM PUBLIC + GRANT TO
--            service_role only. (All are owned by `postgres`, so any
--            legitimate internal PERFORM/SELECT call chain — e.g.
--            claim_dragon_reward -> queue_reward_payout — keeps working,
--            since SECURITY DEFINER functions execute internal calls as
--            their owner, who has implicit EXECUTE on its own functions.)
--              finish_game            (game-complete edge function only)
--              complete_game          (replaced by finish_game; would let
--                                      anyone force any game to "complete"
--                                      with themselves as winner)
--              complete_crypto_withdrawal (replaced by complete_withdrawal;
--                                      would let anyone fake-complete any
--                                      processing withdrawal)
--              fail_withdrawal        (would let anyone fail/refund any
--                                      pending withdrawal — griefing/DoS)
--              cancel_withdrawal      (dead; ownership is implicitly
--                                      enforced by its WHERE clause, but
--                                      lock down to remove attack surface)
--              get_pending_deposits   (IDOR data leak of other users'
--                                      pending deposits)
--              upsert_user_wallet     (would let anyone overwrite another
--                                      user's wallet address/approval)
--              queue_reward_payout    (would let anyone queue arbitrary
--                                      bogus payout records to any wallet)
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A: Fix confused-deputy bug — check the REAL caller, not the
-- attacker-supplied p_admin_id parameter.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_admin_id uuid, p_target_user_id uuid, p_amount_tct numeric, p_reason text, p_adjustment_type text DEFAULT 'adjustment'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_ledger_tx_id UUID := gen_random_uuid();
    v_entry_type ledger_entry_type;
    v_treasury_id UUID;
    v_treasury_balance NUMERIC;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges of the REAL caller (not the supplied p_admin_id)
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_admin = true) THEN
        RAISE EXCEPTION 'Insufficient privileges: caller is not an admin';
    END IF;

    -- Large adjustments require the REAL caller to be a super admin
    IF ABS(p_amount_tct) > 10000 AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_super_admin = true) THEN
        RAISE EXCEPTION 'Adjustments over 10,000 TCT require super admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    -- Get current balance
    SELECT available_tct INTO v_current_balance
    FROM balances
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        -- Create balance record if doesn't exist
        INSERT INTO balances (user_id, available_tct)
        VALUES (p_target_user_id, 0);
        v_current_balance := 0;
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance + p_amount_tct;

    -- Prevent negative balance
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Adjustment would result in negative balance. Current: %, Adjustment: %', v_current_balance, p_amount_tct;
    END IF;

    -- Determine entry type
    IF p_amount_tct > 0 THEN
        IF p_adjustment_type = 'refund' THEN
            v_entry_type := 'admin_refund';
        ELSIF p_adjustment_type = 'compensation' THEN
            v_entry_type := 'compensation';
        ELSE
            v_entry_type := 'admin_credit';
        END IF;
    ELSE
        v_entry_type := 'admin_debit';
    END IF;

    -- Update user balance
    UPDATE balances
    SET
        available_tct = v_new_balance,
        updated_at = NOW()
    WHERE user_id = p_target_user_id;

    -- Record in transactions table
    INSERT INTO transactions (
        user_id, type, amount_tct,
        balance_before_tct, balance_after_tct,
        description
    ) VALUES (
        p_target_user_id,
        CASE WHEN p_amount_tct > 0 THEN 'deposit' ELSE 'withdraw' END,
        p_amount_tct,
        v_current_balance,
        v_new_balance,
        'Admin adjustment (' || p_adjustment_type || '): ' || p_reason
    );

    -- Get treasury account for ledger
    v_treasury_id := get_vault_account_id('platform_treasury');
    SELECT balance_tct INTO v_treasury_balance FROM vault_accounts WHERE id = v_treasury_id;

    -- Record in double-entry ledger
    -- User entry
    INSERT INTO rake_ledger (
        transaction_id, entry_type, user_id,
        debit_tct, credit_tct, balance_after_tct,
        description, metadata
    ) VALUES (
        v_ledger_tx_id, v_entry_type, p_target_user_id,
        CASE WHEN p_amount_tct > 0 THEN p_amount_tct ELSE 0 END,
        CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE 0 END,
        v_new_balance,
        'Admin balance adjustment: ' || p_reason,
        jsonb_build_object(
            'admin_id', v_caller_id,
            'adjustment_type', p_adjustment_type
        )
    );

    -- Treasury counter-entry
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        description, metadata
    ) VALUES (
        v_ledger_tx_id, v_entry_type, v_treasury_id,
        CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE 0 END,
        CASE WHEN p_amount_tct > 0 THEN p_amount_tct ELSE 0 END,
        v_treasury_balance + CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE -p_amount_tct END,
        'Counter-entry for admin adjustment',
        jsonb_build_object('adjustment_for', p_target_user_id)
    );

    -- Update treasury balance (credits come from treasury, debits go to treasury)
    UPDATE vault_accounts
    SET
        balance_tct = balance_tct - p_amount_tct, -- Subtract because giving to user
        total_debits_tct = CASE WHEN p_amount_tct > 0 THEN total_debits_tct + p_amount_tct ELSE total_debits_tct END,
        total_credits_tct = CASE WHEN p_amount_tct < 0 THEN total_credits_tct + ABS(p_amount_tct) ELSE total_credits_tct END,
        updated_at = NOW()
    WHERE id = v_treasury_id;

    -- Log the action against the REAL caller
    PERFORM log_admin_action(
        v_caller_id,
        'user_balance_adjust',
        CASE
            WHEN ABS(p_amount_tct) > 1000 THEN 'critical'
            WHEN ABS(p_amount_tct) > 100 THEN 'high'
            ELSE 'medium'
        END,
        p_target_user_id,
        'balances',
        p_target_user_id,
        jsonb_build_object('available_tct', v_current_balance),
        jsonb_build_object('available_tct', v_new_balance),
        p_reason,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'adjustment_amount', p_amount_tct,
        'adjustment_type', p_adjustment_type,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance,
        'ledger_transaction_id', v_ledger_tx_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_admin_id uuid, p_target_user_id uuid, p_reason text, p_duration_hours integer DEFAULT 24, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_old_values JSONB;
    v_expires_at TIMESTAMPTZ;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges of the REAL caller (not the supplied p_admin_id)
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_admin = true) THEN
        RAISE EXCEPTION 'Insufficient privileges: caller is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    -- Calculate expiration (suspensions always expire)
    v_expires_at := NOW() + (p_duration_hours || ' hours')::INTERVAL;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_suspended', v_target_profile.is_suspended,
        'suspension_reason', v_target_profile.suspension_reason
    );

    -- Suspend the user
    UPDATE profiles
    SET
        is_suspended = TRUE,
        suspension_reason = p_reason,
        suspended_at = NOW(),
        suspended_by = v_caller_id,
        suspension_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action against the REAL caller
    PERFORM log_admin_action(
        v_caller_id,
        'user_suspend',
        'medium',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object(
            'is_suspended', TRUE,
            'suspension_reason', p_reason,
            'suspension_expires_at', v_expires_at
        ),
        p_reason,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'suspension_reason', p_reason,
        'expires_at', v_expires_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_unban_user(p_admin_id uuid, p_target_user_id uuid, p_reason text DEFAULT 'Admin unbanned user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_old_values JSONB;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges of the REAL caller (not the supplied p_admin_id)
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_admin = true) THEN
        RAISE EXCEPTION 'Insufficient privileges: caller is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_banned THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not banned'
        );
    END IF;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_banned', v_target_profile.is_banned,
        'ban_reason', v_target_profile.ban_reason,
        'banned_at', v_target_profile.banned_at,
        'ban_expires_at', v_target_profile.ban_expires_at
    );

    -- Unban the user
    UPDATE profiles
    SET
        is_banned = FALSE,
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL,
        ban_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action against the REAL caller
    PERFORM log_admin_action(
        v_caller_id,
        'user_unban',
        'high',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object('is_banned', FALSE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_admin_id uuid, p_target_user_id uuid, p_reason text DEFAULT 'Admin lifted suspension'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_old_values JSONB;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges of the REAL caller (not the supplied p_admin_id)
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND is_admin = true) THEN
        RAISE EXCEPTION 'Insufficient privileges: caller is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_suspended THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not suspended'
        );
    END IF;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_suspended', v_target_profile.is_suspended,
        'suspension_reason', v_target_profile.suspension_reason
    );

    -- Unsuspend the user
    UPDATE profiles
    SET
        is_suspended = FALSE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action against the REAL caller
    PERFORM log_admin_action(
        v_caller_id,
        'user_unsuspend',
        'medium',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object('is_suspended', FALSE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username
    );
END;
$function$;

-- ---------------------------------------------------------------------
-- PART B: Add missing admin checks
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_rake_settings(p_admin_id uuid, p_rake_percentage numeric DEFAULT NULL::numeric, p_treasury_split numeric DEFAULT NULL::numeric, p_reward_pool_split numeric DEFAULT NULL::numeric, p_min_rake_tct numeric DEFAULT NULL::numeric, p_enabled boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_old_settings JSONB;
    v_new_settings JSONB;
BEGIN
    -- Verify admin privileges of the REAL caller
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_caller_id AND (is_admin = true OR is_super_admin = true)) THEN
        RAISE EXCEPTION 'Unauthorized: admin access required';
    END IF;

    -- Get current settings
    SELECT config_value INTO v_old_settings
    FROM platform_config
    WHERE config_key = 'rake_settings';

    -- Build new settings
    v_new_settings := v_old_settings;

    IF p_rake_percentage IS NOT NULL THEN
        IF p_rake_percentage < 0 OR p_rake_percentage > 0.50 THEN
            RAISE EXCEPTION 'Rake percentage must be between 0 and 0.50 (50%%)';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{rake_percentage}', to_jsonb(p_rake_percentage));
    END IF;

    IF p_treasury_split IS NOT NULL THEN
        IF p_treasury_split < 0 OR p_treasury_split > 1 THEN
            RAISE EXCEPTION 'Treasury split must be between 0 and 1';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{treasury_split}', to_jsonb(p_treasury_split));
        -- Auto-adjust reward pool split
        v_new_settings := jsonb_set(v_new_settings, '{reward_pool_split}', to_jsonb(1 - p_treasury_split));
    END IF;

    IF p_reward_pool_split IS NOT NULL THEN
        IF p_reward_pool_split < 0 OR p_reward_pool_split > 1 THEN
            RAISE EXCEPTION 'Reward pool split must be between 0 and 1';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{reward_pool_split}', to_jsonb(p_reward_pool_split));
        -- Auto-adjust treasury split
        v_new_settings := jsonb_set(v_new_settings, '{treasury_split}', to_jsonb(1 - p_reward_pool_split));
    END IF;

    IF p_min_rake_tct IS NOT NULL THEN
        v_new_settings := jsonb_set(v_new_settings, '{min_rake_tct}', to_jsonb(p_min_rake_tct));
    END IF;

    IF p_enabled IS NOT NULL THEN
        v_new_settings := jsonb_set(v_new_settings, '{enabled}', to_jsonb(p_enabled));
    END IF;

    -- Update settings
    UPDATE platform_config
    SET
        config_value = v_new_settings,
        version = version + 1,
        updated_at = NOW(),
        updated_by = v_caller_id
    WHERE config_key = 'rake_settings';

    -- Record audit against the REAL caller
    PERFORM record_vault_audit(
        'update_rake_settings',
        'admin',
        v_caller_id,
        'platform_config',
        NULL,
        v_old_settings,
        v_new_settings,
        NULL, NULL, NULL
    );

    RETURN v_new_settings;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_fiat_deposit(p_deposit_id uuid, p_admin_id uuid, p_admin_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_caller_id UUID := auth_profile_id();
  v_deposit pending_fiat_deposits%ROWTYPE;
BEGIN
  -- Verify admin privileges of the REAL caller (mirrors reject_fiat_deposit)
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller_id AND (is_admin = true OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  -- Get and lock the deposit
  SELECT * INTO v_deposit
  FROM pending_fiat_deposits
  WHERE id = p_deposit_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  -- Update deposit status
  UPDATE pending_fiat_deposits
  SET status = 'approved',
      admin_id = v_caller_id,
      admin_note = p_admin_note,
      processed_at = now()
  WHERE id = p_deposit_id;

  -- Credit the user's balance
  UPDATE balances
  SET available_tct = available_tct + v_deposit.amount_tct,
      updated_at = now()
  WHERE user_id = v_deposit.user_id;

  -- If no balance row, create one
  IF NOT FOUND THEN
    INSERT INTO balances (user_id, available_tct, locked_tct, updated_at)
    VALUES (v_deposit.user_id, v_deposit.amount_tct, 0, now());
  END IF;

  RETURN TRUE;
END;
$function$;

-- ---------------------------------------------------------------------
-- PART C: Add missing ownership checks (caller must own p_user_id)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.connect_streaming_platform(p_user_id uuid, p_platform stream_platform, p_platform_user_id character varying, p_username character varying, p_display_name character varying, p_access_token_encrypted text, p_refresh_token_encrypted text DEFAULT NULL::text, p_token_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_channel_url character varying DEFAULT NULL::character varying, p_profile_image_url character varying DEFAULT NULL::character varying, p_broadcaster_type character varying DEFAULT NULL::character varying, p_is_live_enabled boolean DEFAULT true)
 RETURNS platform_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_connection platform_connections;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot connect a streaming platform for another user';
  END IF;

  -- Upsert connection
  INSERT INTO platform_connections (
    user_id,
    platform,
    platform_user_id,
    username,
    display_name,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    channel_url,
    profile_image_url,
    broadcaster_type,
    is_live_enabled,
    is_active,
    connected_at,
    last_refreshed_at
  )
  VALUES (
    p_user_id,
    p_platform,
    p_platform_user_id,
    p_username,
    p_display_name,
    p_access_token_encrypted,
    p_refresh_token_encrypted,
    p_token_expires_at,
    p_channel_url,
    p_profile_image_url,
    p_broadcaster_type,
    p_is_live_enabled,
    true,
    now(),
    now()
  )
  ON CONFLICT (user_id, platform) DO UPDATE SET
    platform_user_id = EXCLUDED.platform_user_id,
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    token_expires_at = EXCLUDED.token_expires_at,
    channel_url = EXCLUDED.channel_url,
    profile_image_url = EXCLUDED.profile_image_url,
    broadcaster_type = EXCLUDED.broadcaster_type,
    is_live_enabled = EXCLUDED.is_live_enabled,
    is_active = true,
    disconnected_at = NULL,
    last_refreshed_at = now(),
    updated_at = now()
  RETURNING * INTO v_connection;

  RETURN v_connection;
END;
$function$;

CREATE OR REPLACE FUNCTION public.disconnect_streaming_platform(p_user_id uuid, p_platform stream_platform)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot disconnect a streaming platform for another user';
  END IF;

  UPDATE platform_connections
  SET
    is_active = false,
    disconnected_at = now(),
    -- Clear sensitive tokens
    access_token_encrypted = 'REVOKED',
    refresh_token_encrypted = NULL,
    updated_at = now()
  WHERE user_id = p_user_id
  AND platform = p_platform;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user_id uuid, p_notification_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_updated INTEGER;
BEGIN
    IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: cannot modify another user''s notifications';
    END IF;

    IF p_notification_ids IS NULL THEN
        -- Mark all as read
        UPDATE challenge_notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE user_id = p_user_id AND NOT is_read;
    ELSE
        -- Mark specific notifications as read
        UPDATE challenge_notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE user_id = p_user_id
        AND id = ANY(p_notification_ids)
        AND NOT is_read;
    END IF;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_dragon_reward(p_user_id uuid, p_reward_id uuid)
 RETURNS TABLE(success boolean, amount_claimed numeric, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reward RECORD;
  v_user_reward RECORD;
  v_username TEXT;
  v_balance_before NUMERIC;
BEGIN
  IF auth_profile_id() IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Unauthorized: cannot claim another user''s reward'::TEXT;
    RETURN;
  END IF;

  -- Get reward details
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not found or inactive'::TEXT;
    RETURN;
  END IF;

  -- Get user reward progress
  SELECT * INTO v_user_reward
  FROM user_rewards
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User reward record not found'::TEXT;
    RETURN;
  END IF;

  -- Validate reward is unlocked
  IF v_user_reward.unlocked_at IS NULL THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not yet unlocked'::TEXT;
    RETURN;
  END IF;

  -- Check not already claimed
  IF v_user_reward.tct_claimed THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward already claimed'::TEXT;
    RETURN;
  END IF;

  -- Check there is a TCT reward to claim
  IF v_reward.tct_reward <= 0 THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'No TCT reward for this milestone'::TEXT;
    RETURN;
  END IF;

  -- Get user's username for audit log
  SELECT username INTO v_username FROM profiles WHERE id = p_user_id;

  -- Get current balance (and verify balances row exists)
  SELECT available_tct INTO v_balance_before
  FROM balances
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User balance record not found'::TEXT;
    RETURN;
  END IF;

  -- Mark as claimed
  UPDATE user_rewards
  SET tct_claimed = true,
      claimed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  -- Credit TCT to user's balance
  UPDATE balances
  SET available_tct = available_tct + v_reward.tct_reward,
      total_won_tct = total_won_tct + v_reward.tct_reward,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Insert transaction record for audit trail
  INSERT INTO transactions (
    user_id,
    type,
    amount_tct,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'reward_payout',
    v_reward.tct_reward,
    v_balance_before,
    v_balance_before + v_reward.tct_reward,
    'Dragon reward claimed: ' || v_reward.name || ' (' || v_reward.tier || ')'
  );

  -- Queue on-chain USDC payout to user's embedded wallet
  PERFORM queue_reward_payout(p_user_id, p_reward_id, v_reward.tct_reward);

  -- Insert admin audit log entry
  INSERT INTO admin_audit_log (
    admin_id,
    admin_username,
    is_super_admin,
    action_type,
    action_severity,
    target_user_id,
    target_user_username,
    target_table,
    target_record_id,
    new_values,
    reason,
    notes
  ) VALUES (
    p_user_id,
    COALESCE(v_username, 'unknown'),
    false,
    'adjust_balance',
    'medium',
    p_user_id,
    COALESCE(v_username, 'unknown'),
    'user_rewards',
    p_reward_id,
    jsonb_build_object(
      'action', 'reward_tct_claimed',
      'reward_name', v_reward.name,
      'reward_type', v_reward.reward_type,
      'tct_amount', v_reward.tct_reward,
      'reward_tier', v_reward.tier,
      'balance_before', v_balance_before,
      'balance_after', v_balance_before + v_reward.tct_reward,
      'onchain_payout_queued', true
    ),
    'Dragon avatar reward TCT claimed + on-chain payout queued',
    'TCT credited to balances.available_tct and USDC payout queued for: ' || v_reward.name
  );

  RETURN QUERY SELECT true, v_reward.tct_reward, NULL::TEXT;
END;
$function$;

-- ---------------------------------------------------------------------
-- PART D: Fix is_user_super_admin data leak (mirrors is_user_admin /
-- is_user_restricted fix from migration 136 — self-or-admin check)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_user_super_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID := auth_profile_id();
    v_is_super_admin BOOLEAN;
BEGIN
    IF v_caller_id IS DISTINCT FROM p_user_id AND NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = v_caller_id AND (is_admin = true OR is_super_admin = true)
    ) THEN
        RAISE EXCEPTION 'Unauthorized: cannot view another user''s admin status';
    END IF;

    SELECT is_super_admin INTO v_is_super_admin
    FROM profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_is_super_admin, FALSE);
END;
$function$;

-- ---------------------------------------------------------------------
-- PART E: Lock down dead/dangerous functions with no caller checks that
-- are not invoked by any client code path or edge function. Matches the
-- REVOKE-FROM-PUBLIC pattern from migration 136 Part B (plain per-role
-- REVOKE is insufficient — PUBLIC grants are inherited regardless).
-- ---------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.finish_game(uuid, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_game(uuid, text, text, uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_game(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_game(uuid, uuid, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_crypto_withdrawal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_crypto_withdrawal(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fail_withdrawal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_pending_deposits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_deposits(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_user_wallet(uuid, text, integer, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_wallet(uuid, text, integer, boolean, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.queue_reward_payout(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_reward_payout(uuid, uuid, numeric) TO service_role;
