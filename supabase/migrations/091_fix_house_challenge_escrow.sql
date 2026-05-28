-- Fix lock_balance_for_challenge and unlock_balance_for_challenge to accept
-- TEXT instead of UUID for the challenge_id parameter.
-- House challenges use string IDs like "house_1_1770057653425" which are not UUIDs.

CREATE OR REPLACE FUNCTION lock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Lock amount must be positive';
  END IF;

  SELECT id, available_tct INTO v_balance_id, v_current_available
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance record not found for user %', p_user_id;
  END IF;

  IF v_current_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', v_current_available, p_amount;
  END IF;

  UPDATE balances
  SET available_tct = available_tct - p_amount,
      locked_tct = locked_tct + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount_tct, description, balance_before_tct, balance_after_tct)
  VALUES (
    p_user_id,
    'lock',
    p_amount,
    'Funds locked for challenge ' || p_challenge_id,
    v_current_available,
    v_current_available - p_amount
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION unlock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_locked NUMERIC;
  v_current_available NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Unlock amount must be positive';
  END IF;

  SELECT available_tct, locked_tct INTO v_current_available, v_current_locked
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance record not found for user %', p_user_id;
  END IF;

  UPDATE balances
  SET available_tct = available_tct + p_amount,
      locked_tct = GREATEST(locked_tct - p_amount, 0),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount_tct, description, balance_before_tct, balance_after_tct)
  VALUES (
    p_user_id,
    'unlock',
    p_amount,
    'Funds unlocked for challenge ' || p_challenge_id,
    v_current_available,
    v_current_available + p_amount
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION lock_balance_for_challenge(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_balance_for_challenge(UUID, NUMERIC, TEXT) TO authenticated;
