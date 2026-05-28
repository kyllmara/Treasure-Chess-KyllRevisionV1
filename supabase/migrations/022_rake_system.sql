-- ============================================================================
-- Migration 008: Platform Rake System with Double-Entry Accounting
-- ============================================================================
-- Implements a comprehensive rake system for Treasure Chess:
-- - Configurable rake percentage (default 5%)
-- - 80/20 split: 80% treasury, 20% reward pool
-- - Double-entry accounting ledger (every transaction balances)
-- - Complete audit trail for all vault operations
-- - Draw scenarios return 100% stakes (no rake)
-- - Admin API functions for vault statistics
-- ============================================================================

-- ============================================================================
-- SECTION 1: Platform Configuration
-- ============================================================================

-- Platform configuration table for system-wide settings
CREATE TABLE IF NOT EXISTS platform_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key TEXT NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    description TEXT,
    -- Version for optimistic concurrency control
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id)
);

-- Insert default rake configuration
INSERT INTO platform_config (config_key, config_value, description)
VALUES (
    'rake_settings',
    '{
        "rake_percentage": 0.05,
        "treasury_split": 0.80,
        "reward_pool_split": 0.20,
        "min_rake_tct": 0.01,
        "rake_on_draws": false,
        "enabled": true
    }'::JSONB,
    'Platform rake configuration: percentage taken from winning pot, split between treasury and reward pool'
)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- SECTION 2: Vault Accounts (Treasury & Reward Pool)
-- ============================================================================

-- Create enum for vault account types
DO $$ BEGIN
    CREATE TYPE vault_account_type AS ENUM ('treasury', 'reward_pool', 'escrow', 'user');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Vault accounts table - tracks different platform fund pools
CREATE TABLE IF NOT EXISTS vault_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type vault_account_type NOT NULL,
    account_name TEXT NOT NULL UNIQUE,
    description TEXT,
    -- Current balance (denormalized for quick reads, derived from ledger)
    balance_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Running totals for reporting
    total_credits_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    total_debits_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create the two main vault accounts
INSERT INTO vault_accounts (account_type, account_name, description)
VALUES
    ('treasury', 'platform_treasury', 'Main platform treasury - receives 80% of rake'),
    ('reward_pool', 'player_reward_pool', 'Player reward pool - receives 20% of rake for future distributions')
ON CONFLICT (account_name) DO NOTHING;

-- ============================================================================
-- SECTION 3: Double-Entry Accounting Ledger
-- ============================================================================

-- Create enum for ledger entry types
DO $$ BEGIN
    CREATE TYPE ledger_entry_type AS ENUM (
        'rake_treasury',      -- Rake portion to treasury
        'rake_reward_pool',   -- Rake portion to reward pool
        'winner_payout',      -- Payout to winner
        'draw_refund',        -- Refund on draw
        'escrow_lock',        -- Funds locked in escrow
        'escrow_release',     -- Funds released from escrow
        'adjustment',         -- Manual adjustment
        'reward_distribution' -- Rewards distributed to players
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Double-entry accounting ledger
-- Every transaction has matching debit and credit entries that sum to zero
CREATE TABLE IF NOT EXISTS rake_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Transaction grouping (all entries with same tx_id must sum to zero)
    transaction_id UUID NOT NULL,
    -- Entry type for categorization
    entry_type ledger_entry_type NOT NULL,
    -- Account affected
    account_id UUID REFERENCES vault_accounts(id),
    user_id UUID REFERENCES profiles(id),
    -- Debit increases assets/expenses, Credit increases liabilities/equity/revenue
    -- For our purposes: Debit = funds received, Credit = funds sent
    debit_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    credit_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Running balance after this entry (for the specific account/user)
    balance_after_tct NUMERIC(20, 8) NOT NULL,
    -- Reference to related records
    game_id UUID REFERENCES games(id),
    escrow_id UUID REFERENCES game_escrows(id),
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constraint: exactly one of account_id or user_id must be set
    CONSTRAINT ledger_account_or_user CHECK (
        (account_id IS NOT NULL AND user_id IS NULL) OR
        (account_id IS NULL AND user_id IS NOT NULL)
    ),
    -- Constraint: entry must have either debit or credit, not both
    CONSTRAINT ledger_debit_or_credit CHECK (
        (debit_tct > 0 AND credit_tct = 0) OR
        (debit_tct = 0 AND credit_tct > 0) OR
        (debit_tct = 0 AND credit_tct = 0)  -- Zero entries allowed for special cases
    )
);

-- Index for fast transaction verification (sum must equal zero)
CREATE INDEX IF NOT EXISTS idx_rake_ledger_transaction_id ON rake_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_rake_ledger_account_id ON rake_ledger(account_id);
CREATE INDEX IF NOT EXISTS idx_rake_ledger_user_id ON rake_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_rake_ledger_game_id ON rake_ledger(game_id);
CREATE INDEX IF NOT EXISTS idx_rake_ledger_entry_type ON rake_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_rake_ledger_created_at ON rake_ledger(created_at);

-- ============================================================================
-- SECTION 4: Audit Trail
-- ============================================================================

-- Comprehensive audit table for all vault operations
CREATE TABLE IF NOT EXISTS vault_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- What happened
    operation TEXT NOT NULL,
    -- Who/what triggered it
    actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'user', 'admin', 'scheduled_job')),
    actor_id UUID REFERENCES profiles(id),
    -- What was affected
    affected_table TEXT NOT NULL,
    affected_id UUID,
    -- Before and after state
    old_values JSONB,
    new_values JSONB,
    -- Computed change summary
    change_summary JSONB,
    -- Context
    game_id UUID REFERENCES games(id),
    escrow_id UUID REFERENCES game_escrows(id),
    transaction_id UUID,
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_audit_operation ON vault_audit(operation);
CREATE INDEX IF NOT EXISTS idx_vault_audit_actor_id ON vault_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_game_id ON vault_audit(game_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_created_at ON vault_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_vault_audit_transaction_id ON vault_audit(transaction_id);

-- Daily aggregated statistics for vault reporting
CREATE TABLE IF NOT EXISTS vault_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stats_date DATE NOT NULL UNIQUE,
    -- Game statistics
    total_games INTEGER NOT NULL DEFAULT 0,
    total_wagered_games INTEGER NOT NULL DEFAULT 0,
    total_draws INTEGER NOT NULL DEFAULT 0,
    -- Volume
    total_wager_volume_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    total_pot_volume_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Rake collected
    total_rake_collected_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    rake_to_treasury_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    rake_to_reward_pool_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Payouts
    total_winner_payouts_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    total_draw_refunds_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Vault balances at end of day
    treasury_balance_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    reward_pool_balance_tct NUMERIC(20, 8) NOT NULL DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_daily_stats_date ON vault_daily_stats(stats_date);

-- ============================================================================
-- SECTION 5: Helper Functions
-- ============================================================================

-- Get current rake settings
CREATE OR REPLACE FUNCTION get_rake_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_settings JSONB;
BEGIN
    SELECT config_value INTO v_settings
    FROM platform_config
    WHERE config_key = 'rake_settings';

    RETURN COALESCE(v_settings, '{
        "rake_percentage": 0.05,
        "treasury_split": 0.80,
        "reward_pool_split": 0.20,
        "min_rake_tct": 0.01,
        "rake_on_draws": false,
        "enabled": true
    }'::JSONB);
END;
$$;

-- Get vault account by name
CREATE OR REPLACE FUNCTION get_vault_account_id(p_account_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id
    FROM vault_accounts
    WHERE account_name = p_account_name AND is_active = TRUE;

    RETURN v_id;
END;
$$;

-- Record audit entry
CREATE OR REPLACE FUNCTION record_vault_audit(
    p_operation TEXT,
    p_actor_type TEXT,
    p_actor_id UUID,
    p_affected_table TEXT,
    p_affected_id UUID,
    p_old_values JSONB,
    p_new_values JSONB,
    p_game_id UUID DEFAULT NULL,
    p_escrow_id UUID DEFAULT NULL,
    p_transaction_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_audit_id UUID;
    v_change_summary JSONB;
BEGIN
    -- Compute change summary
    IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
        v_change_summary := jsonb_build_object(
            'changed_fields', (
                SELECT jsonb_object_agg(key, jsonb_build_object('old', p_old_values->key, 'new', value))
                FROM jsonb_each(p_new_values)
                WHERE p_old_values->key IS DISTINCT FROM value
            )
        );
    ELSE
        v_change_summary := '{}'::JSONB;
    END IF;

    INSERT INTO vault_audit (
        operation, actor_type, actor_id, affected_table, affected_id,
        old_values, new_values, change_summary,
        game_id, escrow_id, transaction_id
    ) VALUES (
        p_operation, p_actor_type, p_actor_id, p_affected_table, p_affected_id,
        p_old_values, p_new_values, v_change_summary,
        p_game_id, p_escrow_id, p_transaction_id
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

-- ============================================================================
-- SECTION 6: Double-Entry Ledger Functions
-- ============================================================================

-- Verify a transaction balances (debits = credits)
CREATE OR REPLACE FUNCTION verify_ledger_transaction(p_transaction_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_total_debits NUMERIC;
    v_total_credits NUMERIC;
BEGIN
    SELECT
        COALESCE(SUM(debit_tct), 0),
        COALESCE(SUM(credit_tct), 0)
    INTO v_total_debits, v_total_credits
    FROM rake_ledger
    WHERE transaction_id = p_transaction_id;

    RETURN v_total_debits = v_total_credits;
END;
$$;

-- Create a balanced ledger entry set for rake settlement
CREATE OR REPLACE FUNCTION record_rake_settlement(
    p_game_id UUID,
    p_escrow_id UUID,
    p_winner_id UUID,
    p_loser_id UUID,
    p_total_pot_tct NUMERIC,
    p_rake_amount_tct NUMERIC,
    p_winner_payout_tct NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction_id UUID := gen_random_uuid();
    v_treasury_id UUID;
    v_reward_pool_id UUID;
    v_settings JSONB;
    v_treasury_amount NUMERIC;
    v_reward_pool_amount NUMERIC;
    v_treasury_balance NUMERIC;
    v_reward_pool_balance NUMERIC;
    v_winner_balance NUMERIC;
BEGIN
    -- Get vault account IDs
    v_treasury_id := get_vault_account_id('platform_treasury');
    v_reward_pool_id := get_vault_account_id('player_reward_pool');

    IF v_treasury_id IS NULL OR v_reward_pool_id IS NULL THEN
        RAISE EXCEPTION 'Vault accounts not configured';
    END IF;

    -- Get rake settings for split
    v_settings := get_rake_settings();
    v_treasury_amount := ROUND(p_rake_amount_tct * (v_settings->>'treasury_split')::NUMERIC, 8);
    v_reward_pool_amount := p_rake_amount_tct - v_treasury_amount; -- Remainder to avoid rounding issues

    -- Get current balances for vault accounts
    SELECT balance_tct INTO v_treasury_balance FROM vault_accounts WHERE id = v_treasury_id FOR UPDATE;
    SELECT balance_tct INTO v_reward_pool_balance FROM vault_accounts WHERE id = v_reward_pool_id FOR UPDATE;
    SELECT available_tct INTO v_winner_balance FROM balances WHERE user_id = p_winner_id;

    -- Entry 1: Winner receives payout (debit - receiving funds)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, user_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description, metadata
    ) VALUES (
        v_transaction_id, 'winner_payout', p_winner_id,
        p_winner_payout_tct, 0, v_winner_balance + p_winner_payout_tct,
        p_game_id, p_escrow_id,
        'Winner payout from game settlement',
        jsonb_build_object('pot_total', p_total_pot_tct, 'rake_deducted', p_rake_amount_tct)
    );

    -- Entry 2: Treasury receives rake portion (debit - receiving funds)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description, metadata
    ) VALUES (
        v_transaction_id, 'rake_treasury', v_treasury_id,
        v_treasury_amount, 0, v_treasury_balance + v_treasury_amount,
        p_game_id, p_escrow_id,
        '80% rake to treasury',
        jsonb_build_object('total_rake', p_rake_amount_tct, 'split_percentage', 0.80)
    );

    -- Entry 3: Reward pool receives rake portion (debit - receiving funds)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description, metadata
    ) VALUES (
        v_transaction_id, 'rake_reward_pool', v_reward_pool_id,
        v_reward_pool_amount, 0, v_reward_pool_balance + v_reward_pool_amount,
        p_game_id, p_escrow_id,
        '20% rake to reward pool',
        jsonb_build_object('total_rake', p_rake_amount_tct, 'split_percentage', 0.20)
    );

    -- Entry 4: Escrow releases full pot (credit - sending funds)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description, metadata
    ) VALUES (
        v_transaction_id, 'escrow_release', v_treasury_id,  -- Using treasury as escrow tracking account
        0, p_total_pot_tct, v_treasury_balance + v_treasury_amount, -- Already updated above
        p_game_id, p_escrow_id,
        'Escrow release for game settlement',
        jsonb_build_object('winner_id', p_winner_id, 'loser_id', p_loser_id)
    );

    -- Update vault account balances
    UPDATE vault_accounts
    SET
        balance_tct = balance_tct + v_treasury_amount,
        total_credits_tct = total_credits_tct + v_treasury_amount,
        updated_at = NOW()
    WHERE id = v_treasury_id;

    UPDATE vault_accounts
    SET
        balance_tct = balance_tct + v_reward_pool_amount,
        total_credits_tct = total_credits_tct + v_reward_pool_amount,
        updated_at = NOW()
    WHERE id = v_reward_pool_id;

    -- Record audit entry
    PERFORM record_vault_audit(
        'rake_settlement',
        'system',
        NULL,
        'rake_ledger',
        v_transaction_id,
        NULL,
        jsonb_build_object(
            'pot_total', p_total_pot_tct,
            'rake_amount', p_rake_amount_tct,
            'treasury_amount', v_treasury_amount,
            'reward_pool_amount', v_reward_pool_amount,
            'winner_payout', p_winner_payout_tct,
            'winner_id', p_winner_id,
            'loser_id', p_loser_id
        ),
        p_game_id,
        p_escrow_id,
        v_transaction_id
    );

    RETURN v_transaction_id;
END;
$$;

-- Record draw refund in ledger (no rake taken)
CREATE OR REPLACE FUNCTION record_draw_refund(
    p_game_id UUID,
    p_escrow_id UUID,
    p_white_player_id UUID,
    p_white_refund_tct NUMERIC,
    p_black_player_id UUID,
    p_black_refund_tct NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction_id UUID := gen_random_uuid();
    v_treasury_id UUID;
    v_white_balance NUMERIC;
    v_black_balance NUMERIC;
    v_treasury_balance NUMERIC;
BEGIN
    v_treasury_id := get_vault_account_id('platform_treasury');

    -- Get current balances
    SELECT available_tct INTO v_white_balance FROM balances WHERE user_id = p_white_player_id;
    SELECT available_tct INTO v_black_balance FROM balances WHERE user_id = p_black_player_id;
    SELECT balance_tct INTO v_treasury_balance FROM vault_accounts WHERE id = v_treasury_id;

    -- Entry 1: White player refund (debit)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, user_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description
    ) VALUES (
        v_transaction_id, 'draw_refund', p_white_player_id,
        p_white_refund_tct, 0, v_white_balance + p_white_refund_tct,
        p_game_id, p_escrow_id,
        'Draw refund - full stake returned'
    );

    -- Entry 2: Black player refund (debit)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, user_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description
    ) VALUES (
        v_transaction_id, 'draw_refund', p_black_player_id,
        p_black_refund_tct, 0, v_black_balance + p_black_refund_tct,
        p_game_id, p_escrow_id,
        'Draw refund - full stake returned'
    );

    -- Entry 3: Escrow releases (credit)
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        game_id, escrow_id, description
    ) VALUES (
        v_transaction_id, 'escrow_release', v_treasury_id,
        0, p_white_refund_tct + p_black_refund_tct, v_treasury_balance,
        p_game_id, p_escrow_id,
        'Escrow release for draw - no rake taken'
    );

    -- Record audit entry
    PERFORM record_vault_audit(
        'draw_refund',
        'system',
        NULL,
        'rake_ledger',
        v_transaction_id,
        NULL,
        jsonb_build_object(
            'white_refund', p_white_refund_tct,
            'black_refund', p_black_refund_tct,
            'total_refunded', p_white_refund_tct + p_black_refund_tct,
            'rake_taken', 0
        ),
        p_game_id,
        p_escrow_id,
        v_transaction_id
    );

    RETURN v_transaction_id;
END;
$$;

-- ============================================================================
-- SECTION 7: Modified Settlement Function with Rake
-- ============================================================================

-- Drop and recreate settle_escrow with proper rake handling
CREATE OR REPLACE FUNCTION settle_escrow_with_rake(
    p_game_id UUID,
    p_winner_id UUID,  -- NULL for draw
    p_reason TEXT DEFAULT 'checkmate'
)
RETURNS TABLE (
    escrow_id UUID,
    winner_payout NUMERIC,
    loser_refund NUMERIC,
    rake_amount NUMERIC,
    treasury_amount NUMERIC,
    reward_pool_amount NUMERIC,
    is_draw BOOLEAN,
    ledger_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_escrow RECORD;
    v_winner_payout NUMERIC;
    v_rake_amount NUMERIC := 0;
    v_treasury_amount NUMERIC := 0;
    v_reward_pool_amount NUMERIC := 0;
    v_loser_id UUID;
    v_is_draw BOOLEAN := FALSE;
    v_winner_current_available NUMERIC;
    v_loser_current_available NUMERIC;
    v_settings JSONB;
    v_rake_percentage NUMERIC;
    v_ledger_tx_id UUID;
    v_winner_stake NUMERIC;
    v_loser_stake NUMERIC;
BEGIN
    -- Get rake settings
    v_settings := get_rake_settings();
    v_rake_percentage := (v_settings->>'rake_percentage')::NUMERIC;

    -- Get escrow with row lock
    SELECT * INTO v_escrow
    FROM game_escrows
    WHERE game_escrows.game_id = p_game_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
    END IF;

    IF v_escrow.status != 'active' THEN
        RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
    END IF;

    -- Handle draw case
    IF p_winner_id IS NULL THEN
        v_is_draw := TRUE;
        v_winner_payout := 0;

        -- Refund both players in full (no rake on draws)
        -- Refund white player
        UPDATE balances
        SET
            available_tct = available_tct + v_escrow.player_white_locked_tct,
            locked_tct = locked_tct - v_escrow.player_white_locked_tct,
            updated_at = NOW()
        WHERE user_id = v_escrow.player_white_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = v_escrow.player_white_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_escrow.player_white_id, 'refund', v_escrow.player_white_locked_tct,
            p_game_id, v_escrow.id,
            v_winner_current_available - v_escrow.player_white_locked_tct,
            v_winner_current_available,
            'Draw refund - ' || p_reason || ' (no rake)'
        );

        -- Refund black player
        UPDATE balances
        SET
            available_tct = available_tct + v_escrow.player_black_locked_tct,
            locked_tct = locked_tct - v_escrow.player_black_locked_tct,
            updated_at = NOW()
        WHERE user_id = v_escrow.player_black_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_escrow.player_black_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_escrow.player_black_id, 'refund', v_escrow.player_black_locked_tct,
            p_game_id, v_escrow.id,
            v_loser_current_available - v_escrow.player_black_locked_tct,
            v_loser_current_available,
            'Draw refund - ' || p_reason || ' (no rake)'
        );

        -- Record in ledger
        v_ledger_tx_id := record_draw_refund(
            p_game_id,
            v_escrow.id,
            v_escrow.player_white_id,
            v_escrow.player_white_locked_tct,
            v_escrow.player_black_id,
            v_escrow.player_black_locked_tct
        );

        -- Update escrow
        UPDATE game_escrows
        SET
            status = 'settled',
            winner_id = NULL,
            winner_payout_tct = 0,
            loser_refund_tct = 0,
            commission_tct = 0,
            settled_at = NOW(),
            settled_reason = p_reason
        WHERE id = v_escrow.id;

    ELSE
        -- Handle win/loss case with 5% rake
        -- Determine loser and stakes
        IF p_winner_id = v_escrow.player_white_id THEN
            v_loser_id := v_escrow.player_black_id;
            v_winner_stake := v_escrow.player_white_locked_tct;
            v_loser_stake := v_escrow.player_black_locked_tct;
        ELSE
            v_loser_id := v_escrow.player_white_id;
            v_winner_stake := v_escrow.player_black_locked_tct;
            v_loser_stake := v_escrow.player_white_locked_tct;
        END IF;

        -- Calculate rake: 5% of total pot
        v_rake_amount := ROUND(v_escrow.total_pool_tct * v_rake_percentage, 8);

        -- Ensure minimum rake if configured
        IF v_rake_amount < (v_settings->>'min_rake_tct')::NUMERIC AND v_rake_amount > 0 THEN
            v_rake_amount := (v_settings->>'min_rake_tct')::NUMERIC;
        END IF;

        -- Calculate split: 80% treasury, 20% reward pool
        v_treasury_amount := ROUND(v_rake_amount * (v_settings->>'treasury_split')::NUMERIC, 8);
        v_reward_pool_amount := v_rake_amount - v_treasury_amount;

        -- Winner gets: total pool minus rake
        v_winner_payout := v_escrow.total_pool_tct - v_rake_amount;

        -- Winner: unlock their stake + add winnings (minus rake)
        UPDATE balances
        SET
            available_tct = available_tct + v_winner_payout,
            locked_tct = locked_tct - v_winner_stake,
            total_won_tct = total_won_tct + (v_winner_payout - v_winner_stake),
            updated_at = NOW()
        WHERE user_id = p_winner_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = p_winner_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            p_winner_id, 'win_payout', v_winner_payout,
            p_game_id, v_escrow.id,
            v_winner_current_available - v_winner_payout,
            v_winner_current_available,
            'Game won - ' || p_reason || '. Received ' || v_winner_payout || ' TCT (5% rake: ' || v_rake_amount || ' TCT)'
        );

        -- Loser: deduct locked funds
        UPDATE balances
        SET
            locked_tct = locked_tct - v_loser_stake,
            total_lost_tct = total_lost_tct + v_loser_stake,
            updated_at = NOW()
        WHERE user_id = v_loser_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_loser_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_loser_id, 'loss_deduct',
            -v_loser_stake,
            p_game_id, v_escrow.id,
            v_loser_current_available,
            v_loser_current_available,
            'Game lost - ' || p_reason
        );

        -- Record rake commission transaction
        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            p_winner_id, 'commission', -v_rake_amount,
            p_game_id, v_escrow.id,
            v_winner_current_available,
            v_winner_current_available,
            'Platform rake (5%): ' || v_rake_amount || ' TCT (Treasury: ' || v_treasury_amount || ', Rewards: ' || v_reward_pool_amount || ')'
        );

        -- Update winner's commission paid stats
        UPDATE balances
        SET total_commission_paid_tct = total_commission_paid_tct + v_rake_amount
        WHERE user_id = p_winner_id;

        -- Record in double-entry ledger
        v_ledger_tx_id := record_rake_settlement(
            p_game_id,
            v_escrow.id,
            p_winner_id,
            v_loser_id,
            v_escrow.total_pool_tct,
            v_rake_amount,
            v_winner_payout
        );

        -- Update platform vault totals
        UPDATE platform_vault
        SET
            total_commission_tct = total_commission_tct + v_rake_amount,
            updated_at = NOW()
        WHERE status = 'active';

        -- Update escrow
        UPDATE game_escrows
        SET
            status = 'settled',
            winner_id = p_winner_id,
            winner_payout_tct = v_winner_payout,
            loser_refund_tct = 0,
            commission_tct = v_rake_amount,
            settled_at = NOW(),
            settled_reason = p_reason
        WHERE id = v_escrow.id;

    END IF;

    -- Return settlement details
    RETURN QUERY SELECT
        v_escrow.id,
        v_winner_payout,
        0::NUMERIC, -- loser_refund (always 0 now)
        v_rake_amount,
        v_treasury_amount,
        v_reward_pool_amount,
        v_is_draw,
        v_ledger_tx_id;
END;
$$;

-- ============================================================================
-- SECTION 8: Vault Balance Query Functions
-- ============================================================================

-- Get real-time vault balances
CREATE OR REPLACE FUNCTION get_vault_balances()
RETURNS TABLE (
    treasury_balance_tct NUMERIC,
    reward_pool_balance_tct NUMERIC,
    total_rake_collected_tct NUMERIC,
    total_games_settled INTEGER,
    total_draw_refunds_tct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT balance_tct FROM vault_accounts WHERE account_name = 'platform_treasury'),
        (SELECT balance_tct FROM vault_accounts WHERE account_name = 'player_reward_pool'),
        (SELECT COALESCE(total_commission_tct, 0) FROM platform_vault WHERE status = 'active'),
        (SELECT COUNT(*)::INTEGER FROM game_escrows WHERE status = 'settled'),
        (SELECT COALESCE(SUM(
            CASE WHEN winner_id IS NULL THEN player_white_locked_tct + player_black_locked_tct ELSE 0 END
        ), 0) FROM game_escrows WHERE status = 'settled');
END;
$$;

-- Get detailed vault statistics
CREATE OR REPLACE FUNCTION get_vault_statistics(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    stat_name TEXT,
    stat_value NUMERIC,
    stat_unit TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    v_start := COALESCE(p_start_date, '1970-01-01')::TIMESTAMPTZ;
    v_end := COALESCE(p_end_date, CURRENT_DATE + 1)::TIMESTAMPTZ;

    RETURN QUERY
    -- Treasury balance
    SELECT 'treasury_balance'::TEXT, balance_tct, 'TCT'::TEXT
    FROM vault_accounts WHERE account_name = 'platform_treasury'
    UNION ALL
    -- Reward pool balance
    SELECT 'reward_pool_balance'::TEXT, balance_tct, 'TCT'::TEXT
    FROM vault_accounts WHERE account_name = 'player_reward_pool'
    UNION ALL
    -- Total rake collected (all time)
    SELECT 'total_rake_collected'::TEXT, COALESCE(total_commission_tct, 0), 'TCT'::TEXT
    FROM platform_vault WHERE status = 'active'
    UNION ALL
    -- Rake in period
    SELECT 'rake_in_period'::TEXT,
        COALESCE(SUM(commission_tct), 0), 'TCT'::TEXT
    FROM game_escrows
    WHERE status = 'settled'
        AND settled_at >= v_start
        AND settled_at < v_end
    UNION ALL
    -- Games settled in period
    SELECT 'games_settled_in_period'::TEXT,
        COUNT(*)::NUMERIC, 'games'::TEXT
    FROM game_escrows
    WHERE status = 'settled'
        AND settled_at >= v_start
        AND settled_at < v_end
    UNION ALL
    -- Draws in period
    SELECT 'draws_in_period'::TEXT,
        COUNT(*)::NUMERIC, 'games'::TEXT
    FROM game_escrows
    WHERE status = 'settled'
        AND winner_id IS NULL
        AND settled_at >= v_start
        AND settled_at < v_end
    UNION ALL
    -- Total pot volume in period
    SELECT 'pot_volume_in_period'::TEXT,
        COALESCE(SUM(total_pool_tct), 0), 'TCT'::TEXT
    FROM game_escrows
    WHERE status = 'settled'
        AND settled_at >= v_start
        AND settled_at < v_end
    UNION ALL
    -- Winner payouts in period
    SELECT 'winner_payouts_in_period'::TEXT,
        COALESCE(SUM(winner_payout_tct), 0), 'TCT'::TEXT
    FROM game_escrows
    WHERE status = 'settled'
        AND winner_id IS NOT NULL
        AND settled_at >= v_start
        AND settled_at < v_end;
END;
$$;

-- ============================================================================
-- SECTION 9: Admin API Functions
-- ============================================================================

-- Get admin vault dashboard data
CREATE OR REPLACE FUNCTION admin_get_vault_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_treasury_balance NUMERIC;
    v_reward_pool_balance NUMERIC;
    v_total_rake NUMERIC;
    v_today_rake NUMERIC;
    v_week_rake NUMERIC;
    v_month_rake NUMERIC;
    v_settings JSONB;
BEGIN
    -- Get current balances
    SELECT balance_tct INTO v_treasury_balance
    FROM vault_accounts WHERE account_name = 'platform_treasury';

    SELECT balance_tct INTO v_reward_pool_balance
    FROM vault_accounts WHERE account_name = 'player_reward_pool';

    -- Get total rake
    SELECT COALESCE(total_commission_tct, 0) INTO v_total_rake
    FROM platform_vault WHERE status = 'active';

    -- Get period rakes
    SELECT COALESCE(SUM(commission_tct), 0) INTO v_today_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE;

    SELECT COALESCE(SUM(commission_tct), 0) INTO v_week_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE - INTERVAL '7 days';

    SELECT COALESCE(SUM(commission_tct), 0) INTO v_month_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE - INTERVAL '30 days';

    -- Get settings
    v_settings := get_rake_settings();

    v_result := jsonb_build_object(
        'balances', jsonb_build_object(
            'treasury', v_treasury_balance,
            'reward_pool', v_reward_pool_balance,
            'total', v_treasury_balance + v_reward_pool_balance
        ),
        'rake', jsonb_build_object(
            'total_collected', v_total_rake,
            'today', v_today_rake,
            'this_week', v_week_rake,
            'this_month', v_month_rake
        ),
        'settings', v_settings,
        'generated_at', NOW()
    );

    RETURN v_result;
END;
$$;

-- Get ledger entries for audit (admin only)
CREATE OR REPLACE FUNCTION admin_get_ledger_entries(
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0,
    p_game_id UUID DEFAULT NULL,
    p_entry_type ledger_entry_type DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    transaction_id UUID,
    entry_type ledger_entry_type,
    account_name TEXT,
    user_id UUID,
    debit_tct NUMERIC,
    credit_tct NUMERIC,
    balance_after_tct NUMERIC,
    game_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rl.id,
        rl.transaction_id,
        rl.entry_type,
        va.account_name,
        rl.user_id,
        rl.debit_tct,
        rl.credit_tct,
        rl.balance_after_tct,
        rl.game_id,
        rl.description,
        rl.created_at
    FROM rake_ledger rl
    LEFT JOIN vault_accounts va ON va.id = rl.account_id
    WHERE (p_game_id IS NULL OR rl.game_id = p_game_id)
        AND (p_entry_type IS NULL OR rl.entry_type = p_entry_type)
    ORDER BY rl.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Get audit trail (admin only)
CREATE OR REPLACE FUNCTION admin_get_audit_trail(
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0,
    p_operation TEXT DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    operation TEXT,
    actor_type TEXT,
    actor_id UUID,
    affected_table TEXT,
    change_summary JSONB,
    game_id UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        va.id,
        va.operation,
        va.actor_type,
        va.actor_id,
        va.affected_table,
        va.change_summary,
        va.game_id,
        va.created_at
    FROM vault_audit va
    WHERE (p_operation IS NULL OR va.operation = p_operation)
        AND (p_start_date IS NULL OR va.created_at >= p_start_date::TIMESTAMPTZ)
        AND (p_end_date IS NULL OR va.created_at < (p_end_date + 1)::TIMESTAMPTZ)
    ORDER BY va.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Update rake settings (admin only)
CREATE OR REPLACE FUNCTION admin_update_rake_settings(
    p_admin_id UUID,
    p_rake_percentage NUMERIC DEFAULT NULL,
    p_treasury_split NUMERIC DEFAULT NULL,
    p_reward_pool_split NUMERIC DEFAULT NULL,
    p_min_rake_tct NUMERIC DEFAULT NULL,
    p_enabled BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_settings JSONB;
    v_new_settings JSONB;
BEGIN
    -- Get current settings
    SELECT config_value INTO v_old_settings
    FROM platform_config
    WHERE config_key = 'rake_settings';

    -- Build new settings
    v_new_settings := v_old_settings;

    IF p_rake_percentage IS NOT NULL THEN
        IF p_rake_percentage < 0 OR p_rake_percentage > 0.50 THEN
            RAISE EXCEPTION 'Rake percentage must be between 0 and 0.50 (50%%)';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{rake_percentage}', to_jsonb(p_rake_percentage));
    END IF;

    IF p_treasury_split IS NOT NULL THEN
        IF p_treasury_split < 0 OR p_treasury_split > 1 THEN
            RAISE EXCEPTION 'Treasury split must be between 0 and 1';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{treasury_split}', to_jsonb(p_treasury_split));
        -- Auto-adjust reward pool split
        v_new_settings := jsonb_set(v_new_settings, '{reward_pool_split}', to_jsonb(1 - p_treasury_split));
    END IF;

    IF p_reward_pool_split IS NOT NULL THEN
        IF p_reward_pool_split < 0 OR p_reward_pool_split > 1 THEN
            RAISE EXCEPTION 'Reward pool split must be between 0 and 1';
        END IF;
        v_new_settings := jsonb_set(v_new_settings, '{reward_pool_split}', to_jsonb(p_reward_pool_split));
        -- Auto-adjust treasury split
        v_new_settings := jsonb_set(v_new_settings, '{treasury_split}', to_jsonb(1 - p_reward_pool_split));
    END IF;

    IF p_min_rake_tct IS NOT NULL THEN
        v_new_settings := jsonb_set(v_new_settings, '{min_rake_tct}', to_jsonb(p_min_rake_tct));
    END IF;

    IF p_enabled IS NOT NULL THEN
        v_new_settings := jsonb_set(v_new_settings, '{enabled}', to_jsonb(p_enabled));
    END IF;

    -- Update settings
    UPDATE platform_config
    SET
        config_value = v_new_settings,
        version = version + 1,
        updated_at = NOW(),
        updated_by = p_admin_id
    WHERE config_key = 'rake_settings';

    -- Record audit
    PERFORM record_vault_audit(
        'update_rake_settings',
        'admin',
        p_admin_id,
        'platform_config',
        NULL,
        v_old_settings,
        v_new_settings,
        NULL, NULL, NULL
    );

    RETURN v_new_settings;
END;
$$;

-- ============================================================================
-- SECTION 10: Daily Statistics Aggregation
-- ============================================================================

-- Aggregate daily statistics (called by scheduled job)
CREATE OR REPLACE FUNCTION aggregate_daily_vault_stats(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start TIMESTAMPTZ := p_date::TIMESTAMPTZ;
    v_end TIMESTAMPTZ := (p_date + 1)::TIMESTAMPTZ;
BEGIN
    INSERT INTO vault_daily_stats (
        stats_date,
        total_games,
        total_wagered_games,
        total_draws,
        total_wager_volume_tct,
        total_pot_volume_tct,
        total_rake_collected_tct,
        rake_to_treasury_tct,
        rake_to_reward_pool_tct,
        total_winner_payouts_tct,
        total_draw_refunds_tct,
        treasury_balance_tct,
        reward_pool_balance_tct
    )
    SELECT
        p_date,
        (SELECT COUNT(*) FROM games WHERE ended_at >= v_start AND ended_at < v_end),
        (SELECT COUNT(*) FROM games WHERE wager_tct > 0 AND ended_at >= v_start AND ended_at < v_end),
        (SELECT COUNT(*) FROM game_escrows WHERE winner_id IS NULL AND settled_at >= v_start AND settled_at < v_end),
        COALESCE((SELECT SUM(wager_tct) FROM games WHERE wager_tct > 0 AND ended_at >= v_start AND ended_at < v_end), 0),
        COALESCE((SELECT SUM(total_pool_tct) FROM game_escrows WHERE settled_at >= v_start AND settled_at < v_end), 0),
        COALESCE((SELECT SUM(commission_tct) FROM game_escrows WHERE settled_at >= v_start AND settled_at < v_end), 0),
        COALESCE((SELECT SUM(debit_tct) FROM rake_ledger rl
            JOIN vault_accounts va ON va.id = rl.account_id
            WHERE va.account_name = 'platform_treasury'
            AND rl.entry_type = 'rake_treasury'
            AND rl.created_at >= v_start AND rl.created_at < v_end), 0),
        COALESCE((SELECT SUM(debit_tct) FROM rake_ledger rl
            JOIN vault_accounts va ON va.id = rl.account_id
            WHERE va.account_name = 'player_reward_pool'
            AND rl.entry_type = 'rake_reward_pool'
            AND rl.created_at >= v_start AND rl.created_at < v_end), 0),
        COALESCE((SELECT SUM(winner_payout_tct) FROM game_escrows WHERE winner_id IS NOT NULL AND settled_at >= v_start AND settled_at < v_end), 0),
        COALESCE((SELECT SUM(player_white_locked_tct + player_black_locked_tct) FROM game_escrows WHERE winner_id IS NULL AND settled_at >= v_start AND settled_at < v_end), 0),
        (SELECT balance_tct FROM vault_accounts WHERE account_name = 'platform_treasury'),
        (SELECT balance_tct FROM vault_accounts WHERE account_name = 'player_reward_pool')
    ON CONFLICT (stats_date) DO UPDATE SET
        total_games = EXCLUDED.total_games,
        total_wagered_games = EXCLUDED.total_wagered_games,
        total_draws = EXCLUDED.total_draws,
        total_wager_volume_tct = EXCLUDED.total_wager_volume_tct,
        total_pot_volume_tct = EXCLUDED.total_pot_volume_tct,
        total_rake_collected_tct = EXCLUDED.total_rake_collected_tct,
        rake_to_treasury_tct = EXCLUDED.rake_to_treasury_tct,
        rake_to_reward_pool_tct = EXCLUDED.rake_to_reward_pool_tct,
        total_winner_payouts_tct = EXCLUDED.total_winner_payouts_tct,
        total_draw_refunds_tct = EXCLUDED.total_draw_refunds_tct,
        treasury_balance_tct = EXCLUDED.treasury_balance_tct,
        reward_pool_balance_tct = EXCLUDED.reward_pool_balance_tct,
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

-- ============================================================================
-- SECTION 11: Backward Compatibility - Update Original settle_escrow
-- ============================================================================

-- Update the original settle_escrow to use the new rake system
CREATE OR REPLACE FUNCTION settle_escrow(
    p_game_id UUID,
    p_winner_id UUID,
    p_reason TEXT DEFAULT 'checkmate'
)
RETURNS TABLE (
    escrow_id UUID,
    winner_payout NUMERIC,
    loser_refund NUMERIC,
    commission NUMERIC,
    is_draw BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result RECORD;
BEGIN
    -- Call the new rake settlement function
    SELECT * INTO v_result
    FROM settle_escrow_with_rake(p_game_id, p_winner_id, p_reason);

    -- Return in the old format for backward compatibility
    RETURN QUERY SELECT
        v_result.escrow_id,
        v_result.winner_payout,
        v_result.loser_refund,
        v_result.rake_amount,  -- Map rake_amount to commission
        v_result.is_draw;
END;
$$;

-- ============================================================================
-- SECTION 12: Triggers for Audit Trail
-- ============================================================================

-- Trigger function to audit platform_config changes
CREATE OR REPLACE FUNCTION audit_platform_config_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        PERFORM record_vault_audit(
            'config_update',
            'system',
            NEW.updated_by,
            'platform_config',
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW),
            NULL, NULL, NULL
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_platform_config
    AFTER UPDATE ON platform_config
    FOR EACH ROW
    EXECUTE FUNCTION audit_platform_config_changes();

-- Trigger function to audit vault_accounts changes
CREATE OR REPLACE FUNCTION audit_vault_accounts_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Only audit significant balance changes
        IF OLD.balance_tct IS DISTINCT FROM NEW.balance_tct THEN
            PERFORM record_vault_audit(
                'balance_update',
                'system',
                NULL,
                'vault_accounts',
                NEW.id,
                jsonb_build_object('balance_tct', OLD.balance_tct),
                jsonb_build_object('balance_tct', NEW.balance_tct),
                NULL, NULL, NULL
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_vault_accounts
    AFTER UPDATE ON vault_accounts
    FOR EACH ROW
    EXECUTE FUNCTION audit_vault_accounts_changes();

-- ============================================================================
-- SECTION 13: Row Level Security
-- ============================================================================

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rake_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_daily_stats ENABLE ROW LEVEL SECURITY;

-- Platform config: Read-only for authenticated, write for admins only
CREATE POLICY "Authenticated users can read platform config"
    ON platform_config FOR SELECT
    TO authenticated
    USING (true);

-- Vault accounts: Read-only for public (for transparency)
CREATE POLICY "Public can read vault account balances"
    ON vault_accounts FOR SELECT
    USING (true);

-- Rake ledger: Users can see their own entries
CREATE POLICY "Users can view own ledger entries"
    ON rake_ledger FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Vault audit: Admin only (handled at application level)
-- No default policy - must be accessed via service role

-- Daily stats: Public read for transparency
CREATE POLICY "Public can view daily stats"
    ON vault_daily_stats FOR SELECT
    USING (true);

-- ============================================================================
-- SECTION 14: Grant Permissions
-- ============================================================================

-- Functions accessible to authenticated users
GRANT EXECUTE ON FUNCTION get_rake_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_vault_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION get_vault_statistics(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_escrow(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO authenticated;

-- Service role only (for edge functions and admin operations)
GRANT EXECUTE ON FUNCTION admin_get_vault_dashboard() TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_ledger_entries(INTEGER, INTEGER, UUID, ledger_entry_type) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_audit_trail(INTEGER, INTEGER, TEXT, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION admin_update_rake_settings(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION aggregate_daily_vault_stats(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION record_rake_settlement(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION record_draw_refund(UUID, UUID, UUID, NUMERIC, UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION record_vault_audit(TEXT, TEXT, UUID, TEXT, UUID, JSONB, JSONB, UUID, UUID, UUID) TO service_role;

-- Grant table access
GRANT SELECT ON platform_config TO authenticated;
GRANT SELECT ON vault_accounts TO authenticated;
GRANT SELECT ON rake_ledger TO authenticated;
GRANT SELECT ON vault_daily_stats TO authenticated;

-- Service role full access for admin operations
GRANT ALL ON platform_config TO service_role;
GRANT ALL ON vault_accounts TO service_role;
GRANT ALL ON rake_ledger TO service_role;
GRANT ALL ON vault_audit TO service_role;
GRANT ALL ON vault_daily_stats TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of changes:
-- 1. Created platform_config table with default 5% rake, 80/20 split
-- 2. Created vault_accounts table with treasury and reward_pool accounts
-- 3. Created rake_ledger table for double-entry accounting
-- 4. Created vault_audit table for comprehensive audit trail
-- 5. Created vault_daily_stats for aggregated reporting
-- 6. Modified settle_escrow to use 5% rake instead of 10%
-- 7. Added rake distribution: 80% treasury, 20% reward pool
-- 8. Draw scenarios return 100% stakes (no rake)
-- 9. Added admin functions for vault dashboard and configuration
-- 10. Added triggers for automatic audit logging
-- 11. Maintained backward compatibility with existing settle_escrow interface
-- ============================================================================
