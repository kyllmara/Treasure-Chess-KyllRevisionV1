-- ============================================================================
-- Migration: Add pending_deposits table for crypto deposit tracking
-- ============================================================================

-- Create pending_deposits table
CREATE TABLE IF NOT EXISTS public.pending_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  amount_usdc DECIMAL(18, 6) NOT NULL,
  amount_tct INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  confirmations INTEGER NOT NULL DEFAULT 0,
  required_confirmations INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  error_message TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pending_deposits_user_id ON public.pending_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_deposits_status ON public.pending_deposits(status);
CREATE INDEX IF NOT EXISTS idx_pending_deposits_wallet_address ON public.pending_deposits(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pending_deposits_tx_hash ON public.pending_deposits(tx_hash);

-- Create platform_fees table for tracking revenue
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES public.games(id),
  deposit_id UUID REFERENCES public.pending_deposits(id),
  amount_tct INTEGER NOT NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('wager', 'withdrawal', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_fees_game_id ON public.platform_fees(game_id);
CREATE INDEX IF NOT EXISTS idx_platform_fees_created_at ON public.platform_fees(created_at);

-- Create game_history table for player game records
CREATE TABLE IF NOT EXISTS public.game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES public.profiles(id),
  opponent_username TEXT NOT NULL,
  played_as TEXT NOT NULL CHECK (played_as IN ('white', 'black')),
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  elo_change INTEGER NOT NULL,
  wager_tct INTEGER NOT NULL DEFAULT 0,
  time_control_seconds INTEGER NOT NULL,
  increment_seconds INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_history_player_id ON public.game_history(player_id);
CREATE INDEX IF NOT EXISTS idx_game_history_played_at ON public.game_history(played_at DESC);

-- Add deposit tracking columns to games table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'white_elo_change'
  ) THEN
    ALTER TABLE public.games ADD COLUMN white_elo_change INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'black_elo_change'
  ) THEN
    ALTER TABLE public.games ADD COLUMN black_elo_change INTEGER;
  END IF;
END $$;

-- Add platform_fee_tct column to game_escrows if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_escrows' AND column_name = 'platform_fee_tct'
  ) THEN
    ALTER TABLE public.game_escrows ADD COLUMN platform_fee_tct INTEGER;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE public.pending_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for pending_deposits
CREATE POLICY "Users can view their own pending deposits"
  ON public.pending_deposits FOR SELECT
  USING (auth.uid()::text = user_id::text OR auth.jwt() ->> 'role' = 'service_role');

-- RLS policies for platform_fees (admin only)
CREATE POLICY "Only service role can access platform fees"
  ON public.platform_fees FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS policies for game_history
CREATE POLICY "Users can view their own game history"
  ON public.game_history FOR SELECT
  USING (auth.uid()::text = player_id::text OR auth.jwt() ->> 'role' = 'service_role');

-- Function to get user pending deposits
CREATE OR REPLACE FUNCTION get_pending_deposits(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  tx_hash TEXT,
  amount_usdc DECIMAL(18, 6),
  amount_tct INTEGER,
  confirmations INTEGER,
  required_confirmations INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.id,
    pd.tx_hash,
    pd.amount_usdc,
    pd.amount_tct,
    pd.confirmations,
    pd.required_confirmations,
    pd.status,
    pd.created_at
  FROM public.pending_deposits pd
  WHERE pd.user_id = p_user_id
  ORDER BY pd.created_at DESC
  LIMIT 20;
END;
$$;

-- Function to release escrow to winner
CREATE OR REPLACE FUNCTION release_escrow_to_winner(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Add to available balance
  UPDATE public.balances
  SET
    available_tct = available_tct + p_amount,
    total_won_tct = total_won_tct + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount_tct, game_id, balance_before_tct, balance_after_tct, description)
  SELECT
    p_user_id,
    'win_payout',
    p_amount,
    p_game_id,
    available_tct - p_amount,
    available_tct,
    'Game win payout'
  FROM public.balances
  WHERE user_id = p_user_id;
END;
$$;

-- Function to release escrow refund (for draws)
CREATE OR REPLACE FUNCTION release_escrow_refund(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Add back to available balance and remove from locked
  UPDATE public.balances
  SET
    available_tct = available_tct + p_amount,
    locked_tct = GREATEST(0, locked_tct - p_amount),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount_tct, game_id, balance_before_tct, balance_after_tct, description)
  SELECT
    p_user_id,
    'refund',
    p_amount,
    p_game_id,
    available_tct - p_amount,
    available_tct,
    'Game draw refund'
  FROM public.balances
  WHERE user_id = p_user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_pending_deposits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_escrow_to_winner(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION release_escrow_refund(UUID, INTEGER, UUID) TO service_role;
