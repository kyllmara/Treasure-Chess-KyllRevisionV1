-- ============================================================================
-- Migration: Add withdrawals table and related functions
-- ============================================================================

-- Create withdrawals table
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('crypto', 'bank')),

  -- Amounts
  amount_tct INTEGER NOT NULL,
  fee_tct INTEGER NOT NULL DEFAULT 0,
  net_amount_tct INTEGER NOT NULL,
  net_amount_usdc DECIMAL(18, 6),
  net_amount_usd DECIMAL(18, 2),

  -- Crypto fields
  destination_address TEXT,
  signature TEXT,
  tx_hash TEXT,

  -- Bank fields
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_sort_code TEXT,
  bank_iban TEXT,
  bank_bic TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_crypto_withdrawal CHECK (
    type != 'crypto' OR (destination_address IS NOT NULL AND signature IS NOT NULL)
  ),
  CONSTRAINT valid_bank_withdrawal CHECK (
    type != 'bank' OR (bank_account_name IS NOT NULL AND bank_account_number IS NOT NULL AND bank_sort_code IS NOT NULL)
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON public.withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_tx_hash ON public.withdrawals(tx_hash) WHERE tx_hash IS NOT NULL;

-- Add withdrawal_id to transactions table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'withdrawal_id'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN withdrawal_id UUID REFERENCES public.withdrawals(id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS policies for withdrawals
CREATE POLICY "Users can view their own withdrawals"
  ON public.withdrawals FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can insert withdrawals"
  ON public.withdrawals FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can update withdrawals"
  ON public.withdrawals FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to get user withdrawals
CREATE OR REPLACE FUNCTION get_user_withdrawals(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  amount_tct INTEGER,
  fee_tct INTEGER,
  net_amount_tct INTEGER,
  net_amount_usdc DECIMAL(18, 6),
  net_amount_usd DECIMAL(18, 2),
  destination_address TEXT,
  tx_hash TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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
$$;

-- Function to process crypto withdrawal (for admin/cron use)
CREATE OR REPLACE FUNCTION complete_crypto_withdrawal(
  p_withdrawal_id UUID,
  p_tx_hash TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.withdrawals
  SET
    status = 'completed',
    tx_hash = p_tx_hash,
    completed_at = NOW()
  WHERE id = p_withdrawal_id
  AND status = 'processing';
END;
$$;

-- Function to mark withdrawal as failed
CREATE OR REPLACE FUNCTION fail_withdrawal(
  p_withdrawal_id UUID,
  p_error_message TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_amount_tct INTEGER;
BEGIN
  -- Get withdrawal details
  SELECT user_id, amount_tct INTO v_user_id, v_amount_tct
  FROM public.withdrawals
  WHERE id = p_withdrawal_id AND status IN ('pending', 'processing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;

  -- Mark as failed
  UPDATE public.withdrawals
  SET
    status = 'failed',
    error_message = p_error_message
  WHERE id = p_withdrawal_id;

  -- Refund user balance
  UPDATE public.balances
  SET
    available_tct = available_tct + v_amount_tct,
    updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Record refund transaction
  INSERT INTO public.transactions (user_id, type, amount_tct, description, withdrawal_id)
  VALUES (v_user_id, 'refund', v_amount_tct, 'Withdrawal refund: ' || p_error_message, p_withdrawal_id);
END;
$$;

-- Function to cancel pending withdrawal
CREATE OR REPLACE FUNCTION cancel_withdrawal(
  p_user_id UUID,
  p_withdrawal_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_amount_tct INTEGER;
BEGIN
  -- Get withdrawal if it belongs to user and is pending
  SELECT amount_tct INTO v_amount_tct
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
  AND user_id = p_user_id
  AND status = 'pending';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Mark as cancelled
  UPDATE public.withdrawals
  SET status = 'cancelled'
  WHERE id = p_withdrawal_id;

  -- Refund balance
  UPDATE public.balances
  SET
    available_tct = available_tct + v_amount_tct,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Record refund
  INSERT INTO public.transactions (user_id, type, amount_tct, description, withdrawal_id)
  VALUES (p_user_id, 'refund', v_amount_tct, 'Withdrawal cancelled by user', p_withdrawal_id);

  RETURN TRUE;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_withdrawals(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_withdrawal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_crypto_withdrawal(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_withdrawal(UUID, TEXT) TO service_role;
