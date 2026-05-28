-- Migration: Add on-chain escrow tracking
-- This supports the new smart contract-based escrow system

-- Add on-chain tracking columns to challenges table
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS on_chain_game_id TEXT; -- bytes32 game ID on contract

-- Add on-chain tracking columns to games table
ALTER TABLE games
ADD COLUMN IF NOT EXISTS on_chain_game_id TEXT, -- bytes32 game ID on contract
ADD COLUMN IF NOT EXISTS on_chain_settled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS on_chain_tx_hash TEXT,
ADD COLUMN IF NOT EXISTS on_chain_settled_at TIMESTAMPTZ;

-- Index for finding unsettled games
CREATE INDEX IF NOT EXISTS idx_games_on_chain_unsettled
ON games (status, on_chain_settled)
WHERE status = 'completed' AND on_chain_settled = FALSE;

-- Table to log all on-chain settlements
CREATE TABLE IF NOT EXISTS settlement_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id),
    on_chain_game_id TEXT NOT NULL,
    result TEXT NOT NULL, -- white_wins, black_wins, draw
    contract_result INTEGER NOT NULL, -- 1, 2, 3 (enum)
    tx_hash TEXT NOT NULL,
    block_number BIGINT,
    gas_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tx hash lookups
CREATE INDEX IF NOT EXISTS idx_settlement_logs_tx_hash
ON settlement_logs (tx_hash);

-- Table to track user wallet addresses for on-chain games
-- Users need to have approved USDC spending before playing
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    chain_id INTEGER NOT NULL DEFAULT 137, -- Polygon mainnet
    usdc_approved BOOLEAN DEFAULT FALSE,
    approval_tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, chain_id)
);

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_user_wallets_address
ON user_wallets (wallet_address);

CREATE INDEX IF NOT EXISTS idx_user_wallets_user
ON user_wallets (user_id);

-- Function to check if user has approved USDC
CREATE OR REPLACE FUNCTION check_user_wallet_approved(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_wallets
        WHERE user_id = p_user_id
        AND usdc_approved = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to register/update user wallet
CREATE OR REPLACE FUNCTION upsert_user_wallet(
    p_user_id UUID,
    p_wallet_address TEXT,
    p_chain_id INTEGER DEFAULT 137,
    p_usdc_approved BOOLEAN DEFAULT FALSE,
    p_approval_tx_hash TEXT DEFAULT NULL
)
RETURNS user_wallets AS $$
DECLARE
    v_wallet user_wallets;
BEGIN
    INSERT INTO user_wallets (user_id, wallet_address, chain_id, usdc_approved, approval_tx_hash)
    VALUES (p_user_id, LOWER(p_wallet_address), p_chain_id, p_usdc_approved, p_approval_tx_hash)
    ON CONFLICT (user_id, chain_id)
    DO UPDATE SET
        wallet_address = LOWER(p_wallet_address),
        usdc_approved = COALESCE(p_usdc_approved, user_wallets.usdc_approved),
        approval_tx_hash = COALESCE(p_approval_tx_hash, user_wallets.approval_tx_hash),
        updated_at = NOW()
    RETURNING * INTO v_wallet;

    RETURN v_wallet;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Table to track pending on-chain games (waiting for opponent)
CREATE TABLE IF NOT EXISTS pending_on_chain_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    on_chain_game_id TEXT NOT NULL UNIQUE, -- bytes32 from contract
    creator_user_id UUID REFERENCES auth.users(id),
    creator_wallet TEXT NOT NULL,
    wager_usdc NUMERIC(20, 6) NOT NULL,
    room_code TEXT UNIQUE, -- Optional room code for private games
    is_public BOOLEAN DEFAULT TRUE,
    timeout_seconds INTEGER DEFAULT 86400,
    create_tx_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'joined', 'cancelled', 'expired'))
);

-- Index for finding available games
CREATE INDEX IF NOT EXISTS idx_pending_games_status
ON pending_on_chain_games (status, is_public)
WHERE status = 'waiting';

-- Index for room code lookups
CREATE INDEX IF NOT EXISTS idx_pending_games_room_code
ON pending_on_chain_games (room_code)
WHERE room_code IS NOT NULL;

-- Function to generate unique room code
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No I, O, 1, 0
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE settlement_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_on_chain_games ENABLE ROW LEVEL SECURITY;

-- Settlement logs: read-only for game participants
CREATE POLICY settlement_logs_read ON settlement_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM games g
            WHERE g.id = settlement_logs.game_id
            AND (g.white_player_id = auth.uid() OR g.black_player_id = auth.uid())
        )
    );

-- User wallets: users can manage their own wallets
CREATE POLICY user_wallets_own ON user_wallets
    FOR ALL USING (user_id = auth.uid());

-- Pending games: public games visible to all, private only to creator
CREATE POLICY pending_games_read ON pending_on_chain_games
    FOR SELECT USING (
        is_public = TRUE
        OR creator_user_id = auth.uid()
    );

-- Pending games: only creator can update/delete
CREATE POLICY pending_games_write ON pending_on_chain_games
    FOR ALL USING (creator_user_id = auth.uid());

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON settlement_logs TO authenticated;
GRANT ALL ON user_wallets TO authenticated;
GRANT ALL ON pending_on_chain_games TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_wallet_approved TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION generate_room_code TO authenticated;

COMMENT ON TABLE settlement_logs IS 'Audit log of all on-chain game settlements';
COMMENT ON TABLE user_wallets IS 'User wallet addresses with USDC approval status';
COMMENT ON TABLE pending_on_chain_games IS 'Games created on-chain waiting for opponent';
