-- ============================================================================
-- Pending Fiat Deposits (Revolut / Bank Transfer)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_fiat_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reference_code TEXT NOT NULL UNIQUE,
  amount_usd NUMERIC NOT NULL CHECK (amount_usd >= 10),
  amount_tct NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_id UUID REFERENCES profiles(id),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_fiat_deposits_user_id ON pending_fiat_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_fiat_deposits_status ON pending_fiat_deposits(status);
CREATE INDEX IF NOT EXISTS idx_pending_fiat_deposits_reference ON pending_fiat_deposits(reference_code);

-- Enable RLS
ALTER TABLE pending_fiat_deposits ENABLE ROW LEVEL SECURITY;

-- Users can view their own deposits
CREATE POLICY "Users can view own fiat deposits"
  ON pending_fiat_deposits FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create deposit requests
CREATE POLICY "Users can create fiat deposit requests"
  ON pending_fiat_deposits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all deposits
CREATE POLICY "Admins can view all fiat deposits"
  ON pending_fiat_deposits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- Admins can update deposit status
CREATE POLICY "Admins can update fiat deposits"
  ON pending_fiat_deposits FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- RPC: Approve a fiat deposit (credits user balance)
CREATE OR REPLACE FUNCTION approve_fiat_deposit(
  p_deposit_id UUID,
  p_admin_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit pending_fiat_deposits%ROWTYPE;
BEGIN
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
      admin_id = p_admin_id,
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
$$;

-- RPC: Reject a fiat deposit
CREATE OR REPLACE FUNCTION reject_fiat_deposit(
  p_deposit_id UUID,
  p_admin_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
$$;
