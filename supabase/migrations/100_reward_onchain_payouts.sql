-- ============================================================================
-- Migration 100: On-Chain Reward Payouts
--
-- Tracks on-chain USDC transfers for dragon/TCT reward claims.
-- After a reward is claimed in-app, a payout record is created
-- for the server-side process to send USDC on-chain.
-- ============================================================================

-- 1. Create reward_payouts table to track on-chain transfers
CREATE TABLE IF NOT EXISTS reward_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  reward_id UUID NOT NULL REFERENCES rewards(id),
  amount_tct NUMERIC NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  tx_hash TEXT,
  chain_id INTEGER NOT NULL DEFAULT 80002,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 2. Index for processing queue
CREATE INDEX IF NOT EXISTS idx_reward_payouts_status ON reward_payouts(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reward_payouts_user ON reward_payouts(user_id);

-- 3. RLS policies
ALTER TABLE reward_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payouts" ON reward_payouts
  FOR SELECT
  USING (user_id = auth.uid() OR true);

CREATE POLICY "System can insert payouts" ON reward_payouts
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update payouts" ON reward_payouts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 4. Function to queue on-chain payout after reward claim
CREATE OR REPLACE FUNCTION queue_reward_payout(
  p_user_id UUID,
  p_reward_id UUID,
  p_amount_tct NUMERIC
)
RETURNS TABLE(success BOOLEAN, payout_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_address TEXT;
  v_amount_usdc NUMERIC;
  v_payout_id UUID;
BEGIN
  -- Get user's wallet address
  SELECT embedded_wallet_address INTO v_wallet_address
  FROM profiles
  WHERE id = p_user_id;

  IF v_wallet_address IS NULL OR v_wallet_address = '' THEN
    RETURN QUERY SELECT false, NULL::UUID, 'No wallet address found for user'::TEXT;
    RETURN;
  END IF;

  -- Convert TCT to USDC (1 TCT = $0.04, or 25 TCT = 1 USDC)
  v_amount_usdc := p_amount_tct / 25.0;

  -- Skip if amount too small (less than 0.01 USDC)
  IF v_amount_usdc < 0.01 THEN
    RETURN QUERY SELECT true, NULL::UUID, 'Amount too small for on-chain transfer'::TEXT;
    RETURN;
  END IF;

  -- Insert payout record
  INSERT INTO reward_payouts (user_id, reward_id, amount_tct, amount_usdc, destination_address)
  VALUES (p_user_id, p_reward_id, p_amount_tct, v_amount_usdc, v_wallet_address)
  RETURNING id INTO v_payout_id;

  RETURN QUERY SELECT true, v_payout_id, NULL::TEXT;
END;
$$;

-- 5. Update claim_dragon_reward to also queue an on-chain payout
CREATE OR REPLACE FUNCTION claim_dragon_reward(
  p_user_id UUID,
  p_reward_id UUID
)
RETURNS TABLE(success BOOLEAN, amount_claimed NUMERIC, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward RECORD;
  v_user_reward RECORD;
  v_username TEXT;
  v_balance_before NUMERIC;
BEGIN
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
$$;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION queue_reward_payout(UUID, UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_dragon_reward(UUID, UUID) TO authenticated;
