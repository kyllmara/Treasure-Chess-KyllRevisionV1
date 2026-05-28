-- ============================================================================
-- Relay System Migration
-- ============================================================================
-- Creates tables for the custodial gasless relay system
--
-- The relay system allows users to play without holding MATIC:
-- 1. Users deposit USDC to platform (tracked in balances table as TCT)
-- 2. Platform wallet executes on-chain transactions on their behalf
-- 3. Nonces prevent replay attacks
-- 4. All relay transactions are logged for audit
-- ============================================================================

-- ============================================================================
-- relay_nonces: Track used nonces to prevent replay attacks
-- ============================================================================
CREATE TABLE IF NOT EXISTS relay_nonces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nonce BIGINT NOT NULL,
    operation VARCHAR(50) NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure each user can only use each nonce once
    UNIQUE(user_id, nonce)
);

-- Index for fast nonce lookup
CREATE INDEX IF NOT EXISTS idx_relay_nonces_user_nonce
    ON relay_nonces(user_id, nonce);

-- ============================================================================
-- relay_transactions: Log all relay transactions for audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS relay_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    operation VARCHAR(50) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}',
    tx_hash VARCHAR(66),
    success BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    gas_used VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for relay transactions
CREATE INDEX IF NOT EXISTS idx_relay_transactions_user
    ON relay_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_relay_transactions_created
    ON relay_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relay_transactions_tx_hash
    ON relay_transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- ============================================================================
-- relay_game_mappings: Map users to on-chain games
-- ============================================================================
-- Since the platform wallet creates games on behalf of users,
-- we need to track which user owns which on-chain game
-- ============================================================================
CREATE TABLE IF NOT EXISTS relay_game_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    off_chain_game_id UUID NOT NULL,
    on_chain_game_id VARCHAR(66) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('player1', 'player2')),
    wager_tct INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,

    -- Each user can only have one role per on-chain game
    UNIQUE(user_id, on_chain_game_id, role)
);

-- Indexes for relay game mappings
CREATE INDEX IF NOT EXISTS idx_relay_game_mappings_user
    ON relay_game_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_relay_game_mappings_on_chain
    ON relay_game_mappings(on_chain_game_id);
CREATE INDEX IF NOT EXISTS idx_relay_game_mappings_off_chain
    ON relay_game_mappings(off_chain_game_id);

-- ============================================================================
-- Add on-chain columns to games table if they don't exist
-- ============================================================================
DO $$
BEGIN
    -- Add on_chain_player1 column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'games' AND column_name = 'on_chain_player1'
    ) THEN
        ALTER TABLE games ADD COLUMN on_chain_player1 VARCHAR(42);
    END IF;

    -- Add on_chain_player2 column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'games' AND column_name = 'on_chain_player2'
    ) THEN
        ALTER TABLE games ADD COLUMN on_chain_player2 VARCHAR(42);
    END IF;

    -- Add on_chain_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'games' AND column_name = 'on_chain_status'
    ) THEN
        ALTER TABLE games ADD COLUMN on_chain_status VARCHAR(20);
    END IF;

    -- Add on_chain_tx_hash column (for creation tx)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'games' AND column_name = 'on_chain_tx_hash'
    ) THEN
        ALTER TABLE games ADD COLUMN on_chain_tx_hash VARCHAR(66);
    END IF;
END $$;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE relay_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_game_mappings ENABLE ROW LEVEL SECURITY;

-- relay_nonces: Users can only see their own nonces
DROP POLICY IF EXISTS "Users can view own relay nonces" ON relay_nonces;
CREATE POLICY "Users can view own relay nonces" ON relay_nonces
    FOR SELECT USING (auth.uid() = user_id);

-- relay_transactions: Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own relay transactions" ON relay_transactions;
CREATE POLICY "Users can view own relay transactions" ON relay_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- relay_game_mappings: Users can view their own mappings
DROP POLICY IF EXISTS "Users can view own relay game mappings" ON relay_game_mappings;
CREATE POLICY "Users can view own relay game mappings" ON relay_game_mappings
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
DROP POLICY IF EXISTS "Service role full access to relay_nonces" ON relay_nonces;
CREATE POLICY "Service role full access to relay_nonces" ON relay_nonces
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role full access to relay_transactions" ON relay_transactions;
CREATE POLICY "Service role full access to relay_transactions" ON relay_transactions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role full access to relay_game_mappings" ON relay_game_mappings;
CREATE POLICY "Service role full access to relay_game_mappings" ON relay_game_mappings
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Function to get next nonce for a user
-- ============================================================================
CREATE OR REPLACE FUNCTION get_next_relay_nonce(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_next_nonce BIGINT;
BEGIN
    -- Get the max nonce for this user and add 1
    SELECT COALESCE(MAX(nonce), 0) + 1 INTO v_next_nonce
    FROM relay_nonces
    WHERE user_id = p_user_id;

    RETURN v_next_nonce;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_next_relay_nonce(UUID) TO authenticated;

-- ============================================================================
-- Function to get user's relay transaction history
-- ============================================================================
CREATE OR REPLACE FUNCTION get_relay_history(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    operation VARCHAR(50),
    params JSONB,
    tx_hash VARCHAR(66),
    success BOOLEAN,
    error TEXT,
    gas_used VARCHAR(50),
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rt.id,
        rt.operation,
        rt.params,
        rt.tx_hash,
        rt.success,
        rt.error,
        rt.gas_used,
        rt.created_at
    FROM relay_transactions rt
    WHERE rt.user_id = p_user_id
    ORDER BY rt.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_relay_history(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE relay_nonces IS 'Tracks used nonces to prevent relay replay attacks';
COMMENT ON TABLE relay_transactions IS 'Audit log of all relay transactions';
COMMENT ON TABLE relay_game_mappings IS 'Maps users to their on-chain games (platform wallet acts on their behalf)';
COMMENT ON FUNCTION get_next_relay_nonce IS 'Returns the next available nonce for a user';
COMMENT ON FUNCTION get_relay_history IS 'Returns paginated relay transaction history for a user';
