-- ============================================================================
-- Security Audit Migration: Double-Entry Ledger and Enhanced RLS
--
-- This migration adds:
-- 1. Ledger tables for double-entry accounting
-- 2. Atomic escrow functions
-- 3. Enhanced RLS policies
-- 4. Rate limiting support
-- 5. Audit logging
-- ============================================================================

-- ============================================================================
-- LEDGER TABLES
-- ============================================================================

-- Ledger transactions table
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN (
        'deposit', 'withdrawal', 'game_stake', 'game_win', 'game_loss',
        'escrow_lock', 'escrow_release', 'platform_fee', 'refund', 'bonus', 'adjustment'
    )),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'reversed'
    )),
    total_debits NUMERIC(18, 8) NOT NULL DEFAULT 0,
    total_credits NUMERIC(18, 8) NOT NULL DEFAULT 0,
    is_balanced BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT NOT NULL DEFAULT 'system',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    reversal_transaction_id TEXT REFERENCES ledger_transactions(id)
);

-- Ledger entries table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN (
        'user_balance', 'user_escrow', 'platform_fees', 'platform_escrow',
        'external_deposit', 'external_withdraw', 'game_pool', 'rake_pool',
        'promotional', 'adjustment'
    )),
    account_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(18, 8),
    currency TEXT NOT NULL DEFAULT 'TCT',
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ledger balances table (running totals)
CREATE TABLE IF NOT EXISTS ledger_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_type TEXT NOT NULL,
    account_id TEXT NOT NULL,
    balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
    pending_debits NUMERIC(18, 8) NOT NULL DEFAULT 0,
    pending_credits NUMERIC(18, 8) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'TCT',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_type, account_id, currency)
);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    user_id UUID REFERENCES auth.users(id),
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
    failure_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RATE LIMITING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT NOT NULL,
    action_type TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(identifier, action_type)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Ledger indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries(account_type, account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created ON ledger_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_status ON ledger_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_created ON ledger_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_balances_account ON ledger_balances(account_type, account_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Rate limit indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, action_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_locked ON rate_limits(locked_until) WHERE locked_until IS NOT NULL;

-- ============================================================================
-- LEDGER FUNCTIONS
-- ============================================================================

-- Function to update ledger balance atomically
CREATE OR REPLACE FUNCTION update_ledger_balance(
    p_account_type TEXT,
    p_account_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'TCT'
) RETURNS void AS $$
BEGIN
    INSERT INTO ledger_balances (account_type, account_id, balance, currency)
    VALUES (p_account_type, p_account_id, p_amount, p_currency)
    ON CONFLICT (account_type, account_id, currency)
    DO UPDATE SET
        balance = ledger_balances.balance + p_amount,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock escrow funds for both players atomically
CREATE OR REPLACE FUNCTION lock_escrow_both_players(
    p_game_id UUID,
    p_white_player_id UUID,
    p_black_player_id UUID,
    p_stake_amount NUMERIC
) RETURNS JSONB AS $$
DECLARE
    v_white_balance NUMERIC;
    v_black_balance NUMERIC;
    v_transaction_id TEXT;
BEGIN
    -- Lock the balance rows to prevent race conditions
    SELECT balance INTO v_white_balance
    FROM balances
    WHERE user_id = p_white_player_id
    FOR UPDATE;

    SELECT balance INTO v_black_balance
    FROM balances
    WHERE user_id = p_black_player_id
    FOR UPDATE;

    -- Check white player has sufficient funds
    IF v_white_balance IS NULL OR v_white_balance < p_stake_amount THEN
        RAISE EXCEPTION 'Insufficient funds for white player';
    END IF;

    -- Check black player has sufficient funds
    IF v_black_balance IS NULL OR v_black_balance < p_stake_amount THEN
        RAISE EXCEPTION 'Insufficient funds for black player';
    END IF;

    -- Deduct from both players
    UPDATE balances SET balance = balance - p_stake_amount WHERE user_id = p_white_player_id;
    UPDATE balances SET balance = balance - p_stake_amount WHERE user_id = p_black_player_id;

    -- Create or update escrow record
    INSERT INTO game_escrows (
        game_id,
        player_white_id,
        player_white_locked_tct,
        player_black_id,
        player_black_locked_tct,
        total_pool_tct,
        status,
        locked_at
    ) VALUES (
        p_game_id,
        p_white_player_id,
        p_stake_amount,
        p_black_player_id,
        p_stake_amount,
        p_stake_amount * 2,
        'active',
        NOW()
    )
    ON CONFLICT (game_id) DO UPDATE SET
        player_white_locked_tct = p_stake_amount,
        player_black_locked_tct = p_stake_amount,
        total_pool_tct = p_stake_amount * 2,
        status = 'active',
        locked_at = NOW();

    v_transaction_id := 'escrow_' || p_game_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'created_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release escrow funds atomically
CREATE OR REPLACE FUNCTION release_escrow_funds(
    p_game_id UUID,
    p_winner_id UUID,
    p_loser_id UUID,
    p_is_draw BOOLEAN DEFAULT FALSE,
    p_platform_fee_rate NUMERIC DEFAULT 0.10
) RETURNS JSONB AS $$
DECLARE
    v_escrow RECORD;
    v_total_pool NUMERIC;
    v_platform_fee NUMERIC;
    v_winner_payout NUMERIC;
    v_transaction_id TEXT;
BEGIN
    -- Lock the escrow record
    SELECT * INTO v_escrow
    FROM game_escrows
    WHERE game_id = p_game_id
    FOR UPDATE;

    IF v_escrow IS NULL THEN
        RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
    END IF;

    IF v_escrow.status != 'active' THEN
        RAISE EXCEPTION 'Escrow is not active, current status: %', v_escrow.status;
    END IF;

    v_total_pool := v_escrow.total_pool_tct;

    IF p_is_draw THEN
        -- Refund both players equally
        v_platform_fee := 0;

        UPDATE balances
        SET balance = balance + v_escrow.player_white_locked_tct
        WHERE user_id = v_escrow.player_white_id;

        UPDATE balances
        SET balance = balance + v_escrow.player_black_locked_tct
        WHERE user_id = v_escrow.player_black_id;

        v_winner_payout := v_escrow.player_white_locked_tct; -- Each player gets their stake back
    ELSE
        -- Calculate platform fee and winner payout
        v_platform_fee := v_total_pool * p_platform_fee_rate;
        v_winner_payout := v_total_pool - v_platform_fee;

        -- Pay winner
        UPDATE balances
        SET balance = balance + v_winner_payout
        WHERE user_id = p_winner_id;

        -- Record platform fee (would go to platform account in real implementation)
    END IF;

    -- Mark escrow as released
    UPDATE game_escrows SET
        status = CASE WHEN p_is_draw THEN 'refunded' ELSE 'released' END,
        winner_id = p_winner_id,
        platform_fee_tct = v_platform_fee,
        winner_payout_tct = v_winner_payout,
        released_at = NOW()
    WHERE game_id = p_game_id;

    v_transaction_id := 'release_' || p_game_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'total_pool', v_total_pool,
        'platform_fee', v_platform_fee,
        'winner_payout', v_winner_payout,
        'is_draw', p_is_draw
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel escrow and refund
CREATE OR REPLACE FUNCTION cancel_escrow(
    p_game_id UUID,
    p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    v_escrow RECORD;
    v_transaction_id TEXT;
BEGIN
    -- Lock the escrow record
    SELECT * INTO v_escrow
    FROM game_escrows
    WHERE game_id = p_game_id
    FOR UPDATE;

    IF v_escrow IS NULL THEN
        RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
    END IF;

    IF v_escrow.status IN ('released', 'refunded', 'cancelled') THEN
        RAISE EXCEPTION 'Escrow already finalized, status: %', v_escrow.status;
    END IF;

    -- Refund white player if they locked funds
    IF v_escrow.player_white_locked_tct > 0 THEN
        UPDATE balances
        SET balance = balance + v_escrow.player_white_locked_tct
        WHERE user_id = v_escrow.player_white_id;
    END IF;

    -- Refund black player if they locked funds
    IF v_escrow.player_black_locked_tct > 0 THEN
        UPDATE balances
        SET balance = balance + v_escrow.player_black_locked_tct
        WHERE user_id = v_escrow.player_black_id;
    END IF;

    -- Mark escrow as cancelled
    UPDATE game_escrows SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = p_reason
    WHERE game_id = p_game_id;

    v_transaction_id := 'cancel_' || p_game_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'refunded_white', v_escrow.player_white_locked_tct,
        'refunded_black', v_escrow.player_black_locked_tct,
        'reason', p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RATE LIMITING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier TEXT,
    p_action_type TEXT,
    p_max_attempts INTEGER DEFAULT 5,
    p_window_seconds INTEGER DEFAULT 60,
    p_cooldown_seconds INTEGER DEFAULT 300
) RETURNS JSONB AS $$
DECLARE
    v_record RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_window_start TIMESTAMPTZ;
    v_allowed BOOLEAN;
BEGIN
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM rate_limits
    WHERE identifier = p_identifier AND action_type = p_action_type
    FOR UPDATE;

    -- Check if locked
    IF v_record IS NOT NULL AND v_record.locked_until IS NOT NULL AND v_record.locked_until > v_now THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'remaining', 0,
            'reset_in', EXTRACT(EPOCH FROM (v_record.locked_until - v_now)) * 1000,
            'retry_after', EXTRACT(EPOCH FROM (v_record.locked_until - v_now)) * 1000
        );
    END IF;

    v_window_start := v_now - (p_window_seconds || ' seconds')::INTERVAL;

    IF v_record IS NULL THEN
        -- Create new record
        INSERT INTO rate_limits (identifier, action_type, attempt_count, window_start)
        VALUES (p_identifier, p_action_type, 1, v_now);

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', p_max_attempts - 1,
            'reset_in', p_window_seconds * 1000,
            'retry_after', 0
        );
    ELSIF v_record.window_start < v_window_start THEN
        -- Window expired, reset
        UPDATE rate_limits SET
            attempt_count = 1,
            window_start = v_now,
            locked_until = NULL,
            updated_at = v_now
        WHERE identifier = p_identifier AND action_type = p_action_type;

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', p_max_attempts - 1,
            'reset_in', p_window_seconds * 1000,
            'retry_after', 0
        );
    ELSIF v_record.attempt_count >= p_max_attempts THEN
        -- Limit exceeded, apply cooldown
        UPDATE rate_limits SET
            locked_until = v_now + (p_cooldown_seconds || ' seconds')::INTERVAL,
            updated_at = v_now
        WHERE identifier = p_identifier AND action_type = p_action_type;

        RETURN jsonb_build_object(
            'allowed', false,
            'remaining', 0,
            'reset_in', p_cooldown_seconds * 1000,
            'retry_after', p_cooldown_seconds * 1000
        );
    ELSE
        -- Increment counter
        UPDATE rate_limits SET
            attempt_count = attempt_count + 1,
            updated_at = v_now
        WHERE identifier = p_identifier AND action_type = p_action_type;

        RETURN jsonb_build_object(
            'allowed', true,
            'remaining', p_max_attempts - v_record.attempt_count - 1,
            'reset_in', EXTRACT(EPOCH FROM (v_record.window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now)) * 1000,
            'retry_after', 0
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Ledger transactions - users can only see their own
CREATE POLICY "Users can view own ledger transactions" ON ledger_transactions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ledger_entries
            WHERE ledger_entries.transaction_id = ledger_transactions.id
            AND ledger_entries.account_id = auth.uid()::TEXT
        )
    );

-- Ledger entries - users can only see their own
CREATE POLICY "Users can view own ledger entries" ON ledger_entries
    FOR SELECT
    USING (account_id = auth.uid()::TEXT);

-- Ledger balances - users can only see their own
CREATE POLICY "Users can view own balances" ON ledger_balances
    FOR SELECT
    USING (account_id = auth.uid()::TEXT);

-- Audit logs - users can only see their own
CREATE POLICY "Users can view own audit logs" ON audit_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- Rate limits - users can only see their own
CREATE POLICY "Users can view own rate limits" ON rate_limits
    FOR SELECT
    USING (identifier = auth.uid()::TEXT OR identifier LIKE auth.uid()::TEXT || ':%');

-- ============================================================================
-- ADD MISSING COLUMNS TO GAME_ESCROWS IF NEEDED
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'locked_at') THEN
        ALTER TABLE game_escrows ADD COLUMN locked_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'released_at') THEN
        ALTER TABLE game_escrows ADD COLUMN released_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'cancelled_at') THEN
        ALTER TABLE game_escrows ADD COLUMN cancelled_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'cancellation_reason') THEN
        ALTER TABLE game_escrows ADD COLUMN cancellation_reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'winner_id') THEN
        ALTER TABLE game_escrows ADD COLUMN winner_id UUID REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'platform_fee_tct') THEN
        ALTER TABLE game_escrows ADD COLUMN platform_fee_tct NUMERIC(18, 8) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'game_escrows' AND column_name = 'winner_payout_tct') THEN
        ALTER TABLE game_escrows ADD COLUMN winner_payout_tct NUMERIC(18, 8) DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ledger_transactions IS 'Double-entry accounting transactions - every transaction must balance';
COMMENT ON TABLE ledger_entries IS 'Individual debit/credit entries within transactions';
COMMENT ON TABLE ledger_balances IS 'Running balance totals for each account';
COMMENT ON TABLE audit_logs IS 'Security audit trail for all sensitive operations';
COMMENT ON TABLE rate_limits IS 'Rate limiting state for brute force protection';

COMMENT ON FUNCTION lock_escrow_both_players IS 'Atomically lock funds from both players for a game';
COMMENT ON FUNCTION release_escrow_funds IS 'Atomically release escrow funds to winner or refund on draw';
COMMENT ON FUNCTION cancel_escrow IS 'Atomically cancel escrow and refund all locked funds';
COMMENT ON FUNCTION check_rate_limit IS 'Check and update rate limit for an action';
