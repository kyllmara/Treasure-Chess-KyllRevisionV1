-- =====================================================
-- FIX WITHDRAWAL LIMITS RLS
-- =====================================================
-- Migration: 060_fix_withdrawal_limits_rls.sql
-- Purpose: Fix RLS policy on withdrawal_limits table.
--          The check_withdrawal_eligibility function does an INSERT
--          into withdrawal_limits but only a SELECT policy existed,
--          causing "new row violates row-level security policy" error.
--
-- Solution: Make the functions SECURITY DEFINER so they bypass RLS.
--           These are controlled functions that only operate on the
--           specified user's data, so this is safe.

-- Recreate check_withdrawal_eligibility as SECURITY DEFINER
CREATE OR REPLACE FUNCTION check_withdrawal_eligibility(
  p_user_id UUID,
  p_amount_usd NUMERIC
)
RETURNS TABLE (
  eligible BOOLEAN,
  reason TEXT,
  daily_remaining NUMERIC,
  weekly_remaining NUMERIC,
  cooldown_ends_at TIMESTAMPTZ
) AS $$
DECLARE
  v_limits withdrawal_limits%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get or create limits record
  INSERT INTO withdrawal_limits (user_id, account_created_at)
  VALUES (p_user_id, (SELECT created_at FROM profiles WHERE id = p_user_id))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_limits FROM withdrawal_limits WHERE user_id = p_user_id;

  -- Reset daily limit if needed
  IF v_now >= v_limits.daily_reset_at THEN
    UPDATE withdrawal_limits
    SET daily_withdrawn_usd = 0,
        daily_reset_at = v_now + INTERVAL '1 day',
        updated_at = v_now
    WHERE user_id = p_user_id;
    v_limits.daily_withdrawn_usd := 0;
    v_limits.daily_reset_at := v_now + INTERVAL '1 day';
  END IF;

  -- Reset weekly limit if needed
  IF v_now >= v_limits.weekly_reset_at THEN
    UPDATE withdrawal_limits
    SET weekly_withdrawn_usd = 0,
        weekly_reset_at = v_now + INTERVAL '7 days',
        updated_at = v_now
    WHERE user_id = p_user_id;
    v_limits.weekly_withdrawn_usd := 0;
    v_limits.weekly_reset_at := v_now + INTERVAL '7 days';
  END IF;

  -- Check 24-hour cooldown for new accounts
  IF v_now < v_limits.first_withdrawal_allowed_at THEN
    RETURN QUERY SELECT
      FALSE,
      'New accounts must wait 24 hours before first withdrawal',
      (v_limits.daily_limit_usd - v_limits.daily_withdrawn_usd)::NUMERIC,
      (v_limits.weekly_limit_usd - v_limits.weekly_withdrawn_usd)::NUMERIC,
      v_limits.first_withdrawal_allowed_at;
    RETURN;
  END IF;

  -- Get effective limits (elevated or standard)
  DECLARE
    v_daily_limit NUMERIC := COALESCE(
      CASE WHEN v_limits.is_elevated THEN v_limits.elevated_daily_limit_usd END,
      v_limits.daily_limit_usd
    );
    v_weekly_limit NUMERIC := COALESCE(
      CASE WHEN v_limits.is_elevated THEN v_limits.elevated_weekly_limit_usd END,
      v_limits.weekly_limit_usd
    );
    v_daily_remaining NUMERIC := v_daily_limit - v_limits.daily_withdrawn_usd;
    v_weekly_remaining NUMERIC := v_weekly_limit - v_limits.weekly_withdrawn_usd;
  BEGIN
    -- Check daily limit
    IF v_limits.daily_withdrawn_usd + p_amount_usd > v_daily_limit THEN
      RETURN QUERY SELECT
        FALSE,
        'Daily withdrawal limit exceeded. Limit resets at ' || v_limits.daily_reset_at::TEXT,
        v_daily_remaining,
        v_weekly_remaining,
        NULL::TIMESTAMPTZ;
      RETURN;
    END IF;

    -- Check weekly limit
    IF v_limits.weekly_withdrawn_usd + p_amount_usd > v_weekly_limit THEN
      RETURN QUERY SELECT
        FALSE,
        'Weekly withdrawal limit exceeded. Limit resets at ' || v_limits.weekly_reset_at::TEXT,
        v_daily_remaining,
        v_weekly_remaining,
        NULL::TIMESTAMPTZ;
      RETURN;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT
      TRUE,
      'Withdrawal eligible',
      v_daily_remaining,
      v_weekly_remaining,
      NULL::TIMESTAMPTZ;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate record_withdrawal_against_limits as SECURITY DEFINER
CREATE OR REPLACE FUNCTION record_withdrawal_against_limits(
  p_user_id UUID,
  p_amount_usd NUMERIC
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE withdrawal_limits
  SET daily_withdrawn_usd = daily_withdrawn_usd + p_amount_usd,
      weekly_withdrawn_usd = weekly_withdrawn_usd + p_amount_usd,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
