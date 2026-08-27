-- increment_balance: atomic TCT credit used by the Stripe webhook.
-- Falls back to direct UPDATE if this RPC is unavailable.

CREATE OR REPLACE FUNCTION increment_balance(
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
    available_tct       = available_tct + p_amount_tct,
    total_deposited_tct = COALESCE(total_deposited_tct, 0) + p_amount_tct,
    updated_at          = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- No balance row yet — create one seeded with the purchased amount
    INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, updated_at)
    VALUES (p_user_id, p_amount_tct, 0, p_amount_tct, NOW());
  END IF;
END;
$$;

-- Only the service role (Edge Functions) may call this
REVOKE ALL ON FUNCTION increment_balance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_balance(UUID, NUMERIC) TO service_role;
