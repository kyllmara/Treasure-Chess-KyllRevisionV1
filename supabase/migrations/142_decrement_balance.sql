-- decrement_balance: atomic TCT deduction used by the payout webhook.
-- Raises if the user has insufficient balance (prevents overdraft).

CREATE OR REPLACE FUNCTION decrement_balance(
  p_user_id UUID,
  p_amount_tct NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE balances
  SET
    available_tct = available_tct - p_amount_tct,
    updated_at    = NOW()
  WHERE user_id = p_user_id
    AND available_tct >= p_amount_tct;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance or user not found for user %', p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION decrement_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrement_balance(UUID, NUMERIC) TO service_role;
