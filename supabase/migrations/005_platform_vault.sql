-- ============================================================================
-- Migration 005: Platform Vault for Custody Model
-- ============================================================================
-- This migration sets up the platform vault system for the custody model where:
-- - Users deposit USDC to the platform's vault address
-- - TCT balance is tracked in the database
-- - Withdrawals are sent from the vault to users
-- - Platform maintains full custody of funds
-- ============================================================================

-- Platform vault configuration and state
CREATE TABLE IF NOT EXISTS platform_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Vault wallet address on Base
    vault_address TEXT NOT NULL,
    -- Current on-chain USDC balance (in smallest units, 6 decimals)
    onchain_usdc_balance NUMERIC(20, 0) DEFAULT 0,
    -- Last block number where balance was verified
    last_verified_block BIGINT DEFAULT 0,
    -- Total TCT issued (should equal sum of all user balances)
    total_tct_issued NUMERIC(20, 2) DEFAULT 0,
    -- Total USDC value of TCT issued (for reconciliation)
    total_usdc_value NUMERIC(20, 6) DEFAULT 0,
    -- Platform commission earned (in TCT)
    total_commission_tct NUMERIC(20, 2) DEFAULT 0,
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'maintenance')),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault transaction log for audit trail
CREATE TABLE IF NOT EXISTS vault_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Transaction type
    type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'commission', 'refund', 'adjustment')),
    -- User who initiated (null for platform operations)
    user_id UUID REFERENCES profiles(id),
    -- USDC amount (positive for deposits, negative for withdrawals)
    usdc_amount NUMERIC(20, 6) NOT NULL,
    -- TCT amount credited/debited
    tct_amount NUMERIC(20, 2) NOT NULL,
    -- On-chain transaction hash
    tx_hash TEXT,
    -- Block number for on-chain tx
    block_number BIGINT,
    -- From/To addresses
    from_address TEXT,
    to_address TEXT,
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
    -- Reference to related records
    reference_type TEXT, -- 'deposit', 'withdrawal', 'game_settlement', etc.
    reference_id UUID,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- Withdrawal requests queue
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    -- Amount requested in TCT
    amount_tct NUMERIC(20, 2) NOT NULL,
    -- Equivalent USDC amount
    amount_usdc NUMERIC(20, 6) NOT NULL,
    -- Destination wallet address
    to_address TEXT NOT NULL,
    -- Status flow: pending -> processing -> completed/failed
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    -- Transaction hash when sent
    tx_hash TEXT,
    -- Error message if failed
    error_message TEXT,
    -- Processing timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    -- Idempotency key to prevent duplicates
    idempotency_key TEXT UNIQUE
);

-- Daily reconciliation snapshots
CREATE TABLE IF NOT EXISTS vault_reconciliation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Snapshot date
    snapshot_date DATE NOT NULL UNIQUE,
    -- On-chain USDC balance at snapshot
    onchain_usdc_balance NUMERIC(20, 6) NOT NULL,
    -- Sum of all user TCT balances
    total_user_tct NUMERIC(20, 2) NOT NULL,
    -- Expected USDC (total_user_tct / 25)
    expected_usdc NUMERIC(20, 6) NOT NULL,
    -- Platform commission TCT balance
    platform_commission_tct NUMERIC(20, 2) NOT NULL,
    -- Discrepancy (onchain - expected)
    discrepancy_usdc NUMERIC(20, 6) NOT NULL,
    -- Is reconciled (discrepancy within threshold)
    is_reconciled BOOLEAN DEFAULT FALSE,
    -- Notes
    notes TEXT,
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vault_transactions_user ON vault_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_type ON vault_transactions(type);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_status ON vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_tx_hash ON vault_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);

-- ============================================================================
-- Functions
-- ============================================================================

-- Get vault address (returns the active vault address)
CREATE OR REPLACE FUNCTION get_vault_address()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_address TEXT;
BEGIN
    SELECT vault_address INTO v_address
    FROM platform_vault
    WHERE status = 'active'
    LIMIT 1;

    RETURN v_address;
END;
$$;

-- Record a deposit to the vault
CREATE OR REPLACE FUNCTION record_vault_deposit(
    p_user_id UUID,
    p_usdc_amount NUMERIC,
    p_tct_amount NUMERIC,
    p_tx_hash TEXT,
    p_block_number BIGINT,
    p_from_address TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vault_address TEXT;
    v_transaction_id UUID;
    v_current_balance NUMERIC;
BEGIN
    -- Get vault address
    SELECT vault_address INTO v_vault_address
    FROM platform_vault
    WHERE status = 'active'
    LIMIT 1;

    IF v_vault_address IS NULL THEN
        RAISE EXCEPTION 'No active vault configured';
    END IF;

    -- Check for duplicate transaction
    SELECT id INTO v_transaction_id
    FROM vault_transactions
    WHERE tx_hash = p_tx_hash;

    IF v_transaction_id IS NOT NULL THEN
        RETURN v_transaction_id; -- Already processed
    END IF;

    -- Create vault transaction record
    INSERT INTO vault_transactions (
        type,
        user_id,
        usdc_amount,
        tct_amount,
        tx_hash,
        block_number,
        from_address,
        to_address,
        status,
        reference_type,
        confirmed_at
    ) VALUES (
        'deposit',
        p_user_id,
        p_usdc_amount,
        p_tct_amount,
        p_tx_hash,
        p_block_number,
        p_from_address,
        v_vault_address,
        'confirmed',
        'deposit',
        NOW()
    )
    RETURNING id INTO v_transaction_id;

    -- Update user balance
    SELECT available_tct INTO v_current_balance
    FROM balances
    WHERE user_id = p_user_id;

    IF v_current_balance IS NULL THEN
        INSERT INTO balances (user_id, available_tct, total_deposited_tct)
        VALUES (p_user_id, p_tct_amount, p_tct_amount);
    ELSE
        UPDATE balances
        SET
            available_tct = available_tct + p_tct_amount,
            total_deposited_tct = COALESCE(total_deposited_tct, 0) + p_tct_amount,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;

    -- Update vault totals
    UPDATE platform_vault
    SET
        total_tct_issued = total_tct_issued + p_tct_amount,
        total_usdc_value = total_usdc_value + p_usdc_amount,
        updated_at = NOW()
    WHERE status = 'active';

    -- Create transaction history record
    INSERT INTO transactions (
        user_id,
        type,
        amount_tct,
        tx_hash,
        balance_before_tct,
        balance_after_tct,
        description
    ) VALUES (
        p_user_id,
        'deposit',
        p_tct_amount,
        p_tx_hash,
        COALESCE(v_current_balance, 0),
        COALESCE(v_current_balance, 0) + p_tct_amount,
        'USDC deposit: ' || p_usdc_amount || ' USDC = ' || p_tct_amount || ' TCT'
    );

    RETURN v_transaction_id;
END;
$$;

-- Request a withdrawal
CREATE OR REPLACE FUNCTION request_withdrawal(
    p_user_id UUID,
    p_amount_tct NUMERIC,
    p_to_address TEXT,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
    request_id UUID,
    success BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_available_balance NUMERIC;
    v_locked_balance NUMERIC;
    v_amount_usdc NUMERIC;
    v_request_id UUID;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_request_id
        FROM withdrawal_requests
        WHERE idempotency_key = p_idempotency_key;

        IF v_request_id IS NOT NULL THEN
            RETURN QUERY SELECT v_request_id, TRUE, NULL::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Get user balance
    SELECT available_tct, COALESCE(locked_tct, 0)
    INTO v_available_balance, v_locked_balance
    FROM balances
    WHERE user_id = p_user_id;

    IF v_available_balance IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'No balance found'::TEXT;
        RETURN;
    END IF;

    -- Check sufficient balance
    IF v_available_balance < p_amount_tct THEN
        RETURN QUERY SELECT NULL::UUID, FALSE,
            ('Insufficient balance. Available: ' || v_available_balance || ' TCT')::TEXT;
        RETURN;
    END IF;

    -- Calculate USDC amount (1 USDC = 25 TCT)
    v_amount_usdc := p_amount_tct / 25.0;

    -- Validate minimum withdrawal
    IF v_amount_usdc < 1 THEN
        RETURN QUERY SELECT NULL::UUID, FALSE, 'Minimum withdrawal is 25 TCT ($1 USDC)'::TEXT;
        RETURN;
    END IF;

    -- Lock the funds
    UPDATE balances
    SET
        available_tct = available_tct - p_amount_tct,
        locked_tct = COALESCE(locked_tct, 0) + p_amount_tct,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Create withdrawal request
    INSERT INTO withdrawal_requests (
        user_id,
        amount_tct,
        amount_usdc,
        to_address,
        status,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_amount_tct,
        v_amount_usdc,
        p_to_address,
        'pending',
        p_idempotency_key
    )
    RETURNING id INTO v_request_id;

    RETURN QUERY SELECT v_request_id, TRUE, NULL::TEXT;
END;
$$;

-- Complete a withdrawal (called by the withdrawal processor)
CREATE OR REPLACE FUNCTION complete_withdrawal(
    p_request_id UUID,
    p_tx_hash TEXT,
    p_success BOOLEAN,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request withdrawal_requests%ROWTYPE;
    v_current_balance NUMERIC;
BEGIN
    -- Get withdrawal request
    SELECT * INTO v_request
    FROM withdrawal_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Withdrawal request not found';
    END IF;

    IF v_request.status NOT IN ('pending', 'processing') THEN
        RAISE EXCEPTION 'Withdrawal already processed';
    END IF;

    -- Get current balance
    SELECT available_tct INTO v_current_balance
    FROM balances
    WHERE user_id = v_request.user_id;

    IF p_success THEN
        -- Success: remove from locked, record transaction
        UPDATE balances
        SET
            locked_tct = COALESCE(locked_tct, 0) - v_request.amount_tct,
            total_withdrawn_tct = COALESCE(total_withdrawn_tct, 0) + v_request.amount_tct,
            updated_at = NOW()
        WHERE user_id = v_request.user_id;

        -- Update withdrawal request
        UPDATE withdrawal_requests
        SET
            status = 'completed',
            tx_hash = p_tx_hash,
            completed_at = NOW()
        WHERE id = p_request_id;

        -- Create vault transaction
        INSERT INTO vault_transactions (
            type,
            user_id,
            usdc_amount,
            tct_amount,
            tx_hash,
            from_address,
            to_address,
            status,
            reference_type,
            reference_id,
            confirmed_at
        ) VALUES (
            'withdrawal',
            v_request.user_id,
            -v_request.amount_usdc,
            -v_request.amount_tct,
            p_tx_hash,
            (SELECT vault_address FROM platform_vault WHERE status = 'active' LIMIT 1),
            v_request.to_address,
            'confirmed',
            'withdrawal',
            p_request_id,
            NOW()
        );

        -- Update vault totals
        UPDATE platform_vault
        SET
            total_tct_issued = total_tct_issued - v_request.amount_tct,
            total_usdc_value = total_usdc_value - v_request.amount_usdc,
            updated_at = NOW()
        WHERE status = 'active';

        -- Create transaction history
        INSERT INTO transactions (
            user_id,
            type,
            amount_tct,
            tx_hash,
            balance_before_tct,
            balance_after_tct,
            description
        ) VALUES (
            v_request.user_id,
            'withdrawal',
            -v_request.amount_tct,
            p_tx_hash,
            v_current_balance + v_request.amount_tct,
            v_current_balance,
            'Withdrawal: ' || v_request.amount_tct || ' TCT = ' || v_request.amount_usdc || ' USDC'
        );
    ELSE
        -- Failed: return funds to available
        UPDATE balances
        SET
            available_tct = available_tct + v_request.amount_tct,
            locked_tct = COALESCE(locked_tct, 0) - v_request.amount_tct,
            updated_at = NOW()
        WHERE user_id = v_request.user_id;

        -- Update withdrawal request
        UPDATE withdrawal_requests
        SET
            status = 'failed',
            error_message = p_error_message,
            completed_at = NOW()
        WHERE id = p_request_id;
    END IF;

    RETURN TRUE;
END;
$$;

-- Get vault status for reserve proof
CREATE OR REPLACE FUNCTION get_vault_status()
RETURNS TABLE (
    vault_address TEXT,
    total_tct_issued NUMERIC,
    total_usdc_value NUMERIC,
    total_commission_tct NUMERIC,
    active_users BIGINT,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pv.vault_address,
        pv.total_tct_issued,
        pv.total_usdc_value,
        pv.total_commission_tct,
        (SELECT COUNT(DISTINCT user_id) FROM balances WHERE available_tct > 0),
        pv.status
    FROM platform_vault pv
    WHERE pv.status = 'active'
    LIMIT 1;
END;
$$;

-- Run daily reconciliation
CREATE OR REPLACE FUNCTION run_vault_reconciliation()
RETURNS TABLE (
    snapshot_date DATE,
    total_user_tct NUMERIC,
    expected_usdc NUMERIC,
    platform_commission NUMERIC,
    is_reconciled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_user_tct NUMERIC;
    v_expected_usdc NUMERIC;
    v_commission_tct NUMERIC;
    v_today DATE := CURRENT_DATE;
BEGIN
    -- Calculate total user TCT (available + locked)
    SELECT COALESCE(SUM(available_tct + COALESCE(locked_tct, 0)), 0)
    INTO v_total_user_tct
    FROM balances;

    -- Calculate expected USDC
    v_expected_usdc := v_total_user_tct / 25.0;

    -- Get commission TCT
    SELECT COALESCE(total_commission_tct, 0)
    INTO v_commission_tct
    FROM platform_vault
    WHERE status = 'active';

    -- Insert or update reconciliation record
    INSERT INTO vault_reconciliation (
        snapshot_date,
        onchain_usdc_balance,
        total_user_tct,
        expected_usdc,
        platform_commission_tct,
        discrepancy_usdc,
        is_reconciled
    ) VALUES (
        v_today,
        0, -- Will be updated by external process that checks on-chain
        v_total_user_tct,
        v_expected_usdc,
        v_commission_tct,
        0,
        FALSE
    )
    ON CONFLICT (snapshot_date) DO UPDATE
    SET
        total_user_tct = EXCLUDED.total_user_tct,
        expected_usdc = EXCLUDED.expected_usdc,
        platform_commission_tct = EXCLUDED.platform_commission_tct;

    RETURN QUERY
    SELECT
        v_today,
        v_total_user_tct,
        v_expected_usdc,
        v_commission_tct,
        FALSE;
END;
$$;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE platform_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_reconciliation ENABLE ROW LEVEL SECURITY;

-- Platform vault: read-only for public (vault address only)
CREATE POLICY "Public can read vault address"
    ON platform_vault FOR SELECT
    USING (status = 'active');

-- Vault transactions: users can see their own
CREATE POLICY "Users can view own vault transactions"
    ON vault_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Withdrawal requests: users can view and create their own
CREATE POLICY "Users can view own withdrawal requests"
    ON withdrawal_requests FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create withdrawal requests"
    ON withdrawal_requests FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Reconciliation: public read for transparency
CREATE POLICY "Public can view reconciliation"
    ON vault_reconciliation FOR SELECT
    USING (true);
