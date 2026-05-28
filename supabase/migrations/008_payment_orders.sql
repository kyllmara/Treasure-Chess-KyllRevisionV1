-- =====================================================
-- TREASURE CHESS - PAYMENT ORDERS FOR FIAT RAMP
-- =====================================================
-- Migration: 008_payment_orders.sql
-- Purpose: Track MoonPay/Transak payment orders for fiat on/off ramp

-- =====================================================
-- ENUMS
-- =====================================================
DO $$ BEGIN
  CREATE TYPE payment_provider AS ENUM ('moonpay', 'transak');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_order_type AS ENUM ('buy', 'sell');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_order_status AS ENUM (
    'pending',           -- Order created, waiting for user to complete
    'waiting_payment',   -- User initiated, waiting for payment
    'processing',        -- Payment received, processing
    'completed',         -- Order completed, funds credited/debited
    'failed',            -- Order failed
    'cancelled',         -- User cancelled
    'refunded'           -- Order refunded
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('not_started', 'pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PAYMENT ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Provider info
  provider payment_provider NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_transaction_id TEXT,

  -- Order details
  order_type payment_order_type NOT NULL,
  status payment_order_status NOT NULL DEFAULT 'pending',

  -- Amounts
  fiat_currency TEXT NOT NULL DEFAULT 'USD',
  fiat_amount NUMERIC(20, 2) NOT NULL,
  crypto_currency TEXT NOT NULL DEFAULT 'USDC',
  crypto_amount NUMERIC(20, 8),
  tct_amount NUMERIC(20, 8),

  -- Exchange rates at time of order
  exchange_rate NUMERIC(20, 8),

  -- Fees
  provider_fee NUMERIC(20, 2) DEFAULT 0,
  network_fee NUMERIC(20, 8) DEFAULT 0,
  platform_fee NUMERIC(20, 8) DEFAULT 0,

  -- User's wallet address for buy orders
  destination_wallet_address TEXT,

  -- For sell orders - bank details or crypto address
  payout_method TEXT,
  payout_destination TEXT,

  -- Webhook tracking
  webhook_received_at TIMESTAMPTZ,
  webhook_payload JSONB,

  -- Error handling
  failure_reason TEXT,

  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE(provider, provider_order_id)
);

-- =====================================================
-- USER KYC STATUS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_kyc_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

  -- MoonPay KYC
  moonpay_customer_id TEXT,
  moonpay_kyc_status kyc_status NOT NULL DEFAULT 'not_started',
  moonpay_kyc_level INTEGER DEFAULT 0,
  moonpay_verified_at TIMESTAMPTZ,

  -- Transak KYC
  transak_customer_id TEXT,
  transak_kyc_status kyc_status NOT NULL DEFAULT 'not_started',
  transak_verified_at TIMESTAMPTZ,

  -- Region detection
  detected_country TEXT,
  detected_region TEXT, -- State/province
  region_detected_at TIMESTAMPTZ,

  -- Preferred provider (auto-selected based on region)
  preferred_provider payment_provider,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- WITHDRAWAL LIMITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS withdrawal_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

  -- Daily limits
  daily_withdrawn_usd NUMERIC(20, 2) NOT NULL DEFAULT 0,
  daily_limit_usd NUMERIC(20, 2) NOT NULL DEFAULT 500,
  daily_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 day',

  -- Weekly limits
  weekly_withdrawn_usd NUMERIC(20, 2) NOT NULL DEFAULT 0,
  weekly_limit_usd NUMERIC(20, 2) NOT NULL DEFAULT 2000,
  weekly_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',

  -- Account age restriction
  account_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_withdrawal_allowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',

  -- VIP/elevated limits (future use)
  is_elevated BOOLEAN NOT NULL DEFAULT FALSE,
  elevated_daily_limit_usd NUMERIC(20, 2),
  elevated_weekly_limit_usd NUMERIC(20, 2),
  elevated_at TIMESTAMPTZ,
  elevated_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to check if user can withdraw
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
$$ LANGUAGE plpgsql;

-- Function to record a withdrawal against limits
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
$$ LANGUAGE plpgsql;

-- Function to process payment order completion
CREATE OR REPLACE FUNCTION process_payment_order_completion(
  p_order_id UUID,
  p_tct_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_order payment_orders%ROWTYPE;
  v_balance_before NUMERIC;
BEGIN
  -- Get the order
  SELECT * INTO v_order FROM payment_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status = 'completed' THEN
    -- Already processed
    RETURN TRUE;
  END IF;

  -- Get current balance
  SELECT available_tct INTO v_balance_before
  FROM balances WHERE user_id = v_order.user_id;

  IF NOT FOUND THEN
    -- Create balance record if it doesn't exist
    INSERT INTO balances (user_id, available_tct)
    VALUES (v_order.user_id, 0);
    v_balance_before := 0;
  END IF;

  -- Process based on order type
  IF v_order.order_type = 'buy' THEN
    -- Credit TCT to user
    UPDATE balances
    SET available_tct = available_tct + p_tct_amount,
        total_deposited_tct = total_deposited_tct + p_tct_amount,
        updated_at = NOW()
    WHERE user_id = v_order.user_id;

    -- Record transaction
    INSERT INTO transactions (
      user_id,
      type,
      amount_tct,
      balance_before_tct,
      balance_after_tct,
      description
    ) VALUES (
      v_order.user_id,
      'deposit',
      p_tct_amount,
      v_balance_before,
      v_balance_before + p_tct_amount,
      'Fiat deposit via ' || v_order.provider || ' - ' || v_order.fiat_currency || ' ' || v_order.fiat_amount
    );

  ELSIF v_order.order_type = 'sell' THEN
    -- Debit TCT from user (should already be locked)
    UPDATE balances
    SET locked_tct = locked_tct - p_tct_amount,
        total_withdrawn_tct = total_withdrawn_tct + p_tct_amount,
        updated_at = NOW()
    WHERE user_id = v_order.user_id;

    -- Record transaction
    INSERT INTO transactions (
      user_id,
      type,
      amount_tct,
      balance_before_tct,
      balance_after_tct,
      description
    ) VALUES (
      v_order.user_id,
      'withdraw',
      p_tct_amount,
      v_balance_before,
      v_balance_before - p_tct_amount,
      'Fiat withdrawal via ' || v_order.provider || ' - ' || v_order.fiat_currency || ' ' || v_order.fiat_amount
    );
  END IF;

  -- Update order status
  UPDATE payment_orders
  SET status = 'completed',
      tct_amount = p_tct_amount,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE TRIGGER update_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_user_kyc_status_updated_at
  BEFORE UPDATE ON user_kyc_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_withdrawal_limits_updated_at
  BEFORE UPDATE ON withdrawal_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider ON payment_orders(provider);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id ON payment_orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders(created_at);

CREATE INDEX IF NOT EXISTS idx_user_kyc_status_user_id ON user_kyc_status(user_id);
CREATE INDEX IF NOT EXISTS idx_user_kyc_status_moonpay_customer_id ON user_kyc_status(moonpay_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_kyc_status_transak_customer_id ON user_kyc_status(transak_customer_id);

CREATE INDEX IF NOT EXISTS idx_withdrawal_limits_user_id ON withdrawal_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_limits_daily_reset ON withdrawal_limits(daily_reset_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_limits_weekly_reset ON withdrawal_limits(weekly_reset_at);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_kyc_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_limits ENABLE ROW LEVEL SECURITY;

-- Payment orders: Users can only see their own orders
CREATE POLICY "Users can view own payment orders" ON payment_orders
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- KYC status: Users can only see their own status
CREATE POLICY "Users can view own kyc status" ON user_kyc_status
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- Withdrawal limits: Users can only see their own limits
CREATE POLICY "Users can view own withdrawal limits" ON withdrawal_limits
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON payment_orders TO authenticated;
GRANT ALL ON user_kyc_status TO authenticated;
GRANT ALL ON withdrawal_limits TO authenticated;
