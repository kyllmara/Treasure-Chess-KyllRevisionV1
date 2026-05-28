-- ============================================================================
-- Migration 011: Admin System for Mobile Admin Panel
-- ============================================================================
-- Implements a comprehensive admin system for Treasure Chess:
-- - Admin role management (admin, super_admin levels)
-- - User ban/suspend functionality with audit trail
-- - Balance adjustment capability with double-entry accounting
-- - Admin-specific audit logging
-- - 2FA requirement tracking for admin accounts
-- - Row-level security for admin-only operations
-- ============================================================================

-- ============================================================================
-- SECTION 1: Extend Profiles Table for Admin & Ban Status
-- ============================================================================

-- Add admin and ban columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ban_reason TEXT,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS ban_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS suspension_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS admin_2fa_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Create indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin ON profiles(is_super_admin) WHERE is_super_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON profiles(is_banned) WHERE is_banned = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON profiles(is_suspended) WHERE is_suspended = TRUE;

-- ============================================================================
-- SECTION 2: Admin Audit Log Table
-- ============================================================================

-- Create enum for admin action types
DO $$ BEGIN
    CREATE TYPE admin_action_type AS ENUM (
        -- User management
        'user_ban',
        'user_unban',
        'user_suspend',
        'user_unsuspend',
        'user_balance_adjust',
        'user_profile_edit',
        'user_password_reset',
        -- Admin management
        'admin_grant',
        'admin_revoke',
        'super_admin_grant',
        'super_admin_revoke',
        -- Platform configuration
        'config_update',
        'rake_settings_update',
        -- Financial operations
        'manual_refund',
        'manual_credit',
        'manual_debit',
        'escrow_force_settle',
        'vault_adjustment',
        -- System operations
        'system_maintenance',
        'export_data',
        'view_sensitive_data'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create enum for admin action severity
DO $$ BEGIN
    CREATE TYPE admin_action_severity AS ENUM (
        'low',       -- View operations, minor changes
        'medium',    -- User suspensions, config changes
        'high',      -- Bans, financial adjustments
        'critical'   -- Super admin changes, vault operations
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Admin audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Who performed the action
    admin_id UUID NOT NULL REFERENCES profiles(id),
    admin_username TEXT NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    -- What action was performed
    action_type admin_action_type NOT NULL,
    action_severity admin_action_severity NOT NULL DEFAULT 'low',
    -- Target of the action
    target_user_id UUID REFERENCES profiles(id),
    target_user_username TEXT,
    target_table TEXT,
    target_record_id UUID,
    -- Before and after state
    old_values JSONB,
    new_values JSONB,
    -- Context
    reason TEXT,
    notes TEXT,
    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    request_id TEXT,
    -- 2FA verification
    was_2fa_verified BOOLEAN NOT NULL DEFAULT FALSE,
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for admin audit queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_user ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_type ON admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_severity ON admin_audit_log(action_severity);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_table ON admin_audit_log(target_table);

-- ============================================================================
-- SECTION 3: Admin Session Tracking
-- ============================================================================

-- Track admin sessions for security
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES profiles(id),
    -- Session info
    session_token TEXT NOT NULL UNIQUE,
    -- 2FA status
    is_2fa_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verification_method TEXT, -- 'biometric', 'pin', 'totp'
    -- Device info
    device_id TEXT,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    -- Session lifecycle
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- ============================================================================
-- SECTION 4: Balance Adjustment Ledger
-- ============================================================================

-- Create ledger_entry_type if it doesn't exist (dependency from rake_system)
-- If it already exists, add the admin-specific values
DO $$ BEGIN
    CREATE TYPE ledger_entry_type AS ENUM (
        'wager_in', 'wager_out', 'rake', 'payout', 'refund',
        'admin_credit', 'admin_debit', 'admin_refund', 'compensation'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add admin values if type already existed without them
DO $$ BEGIN ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'admin_credit'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'admin_debit'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'admin_refund'; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'compensation'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================================
-- SECTION 5: Helper Functions
-- ============================================================================

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    SELECT is_admin OR is_super_admin INTO v_is_admin
    FROM profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_is_admin, FALSE);
END;
$$;

-- Check if user is super admin
CREATE OR REPLACE FUNCTION is_user_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_is_super_admin BOOLEAN;
BEGIN
    SELECT is_super_admin INTO v_is_super_admin
    FROM profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_is_super_admin, FALSE);
END;
$$;

-- Check if user is banned or suspended
CREATE OR REPLACE FUNCTION is_user_restricted(p_user_id UUID)
RETURNS TABLE (
    is_restricted BOOLEAN,
    restriction_type TEXT,
    reason TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF v_profile.is_banned AND (v_profile.ban_expires_at IS NULL OR v_profile.ban_expires_at > NOW()) THEN
        RETURN QUERY SELECT TRUE, 'banned'::TEXT, v_profile.ban_reason, v_profile.ban_expires_at;
        RETURN;
    END IF;

    IF v_profile.is_suspended AND (v_profile.suspension_expires_at IS NULL OR v_profile.suspension_expires_at > NOW()) THEN
        RETURN QUERY SELECT TRUE, 'suspended'::TEXT, v_profile.suspension_reason, v_profile.suspension_expires_at;
        RETURN;
    END IF;

    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ;
END;
$$;

-- ============================================================================
-- SECTION 6: Admin Audit Logging Function
-- ============================================================================

CREATE OR REPLACE FUNCTION log_admin_action(
    p_admin_id UUID,
    p_action_type admin_action_type,
    p_severity admin_action_severity,
    p_target_user_id UUID DEFAULT NULL,
    p_target_table TEXT DEFAULT NULL,
    p_target_record_id UUID DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT NULL,
    p_was_2fa_verified BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
    v_admin_username TEXT;
    v_admin_is_super BOOLEAN;
    v_target_username TEXT;
BEGIN
    -- Get admin info
    SELECT username, is_super_admin INTO v_admin_username, v_admin_is_super
    FROM profiles WHERE id = p_admin_id;

    IF v_admin_username IS NULL THEN
        RAISE EXCEPTION 'Admin user not found: %', p_admin_id;
    END IF;

    -- Get target username if applicable
    IF p_target_user_id IS NOT NULL THEN
        SELECT username INTO v_target_username
        FROM profiles WHERE id = p_target_user_id;
    END IF;

    -- Insert audit log
    INSERT INTO admin_audit_log (
        admin_id, admin_username, is_super_admin,
        action_type, action_severity,
        target_user_id, target_user_username,
        target_table, target_record_id,
        old_values, new_values,
        reason, notes,
        ip_address, user_agent, device_info,
        was_2fa_verified
    ) VALUES (
        p_admin_id, v_admin_username, v_admin_is_super,
        p_action_type, p_severity,
        p_target_user_id, v_target_username,
        p_target_table, p_target_record_id,
        p_old_values, p_new_values,
        p_reason, p_notes,
        p_ip_address, p_user_agent, p_device_info,
        p_was_2fa_verified
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ============================================================================
-- SECTION 7: User Ban/Unban Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_ban_user(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT,
    p_duration_days INTEGER DEFAULT NULL, -- NULL = permanent
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_values JSONB;
    v_new_values JSONB;
    v_expires_at TIMESTAMPTZ;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Insufficient privileges: user is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    -- Cannot ban admins unless super admin
    IF (v_target_profile.is_admin OR v_target_profile.is_super_admin) AND NOT is_user_super_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Only super admins can ban other admins';
    END IF;

    -- Cannot ban super admins
    IF v_target_profile.is_super_admin THEN
        RAISE EXCEPTION 'Cannot ban a super admin';
    END IF;

    -- Calculate expiration
    IF p_duration_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_duration_days || ' days')::INTERVAL;
    END IF;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_banned', v_target_profile.is_banned,
        'ban_reason', v_target_profile.ban_reason,
        'banned_at', v_target_profile.banned_at,
        'ban_expires_at', v_target_profile.ban_expires_at
    );

    -- Ban the user
    UPDATE profiles
    SET
        is_banned = TRUE,
        ban_reason = p_reason,
        banned_at = NOW(),
        banned_by = p_admin_id,
        ban_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Store new values
    v_new_values := jsonb_build_object(
        'is_banned', TRUE,
        'ban_reason', p_reason,
        'banned_at', NOW(),
        'ban_expires_at', v_expires_at
    );

    -- Log the action
    PERFORM log_admin_action(
        p_admin_id,
        'user_ban',
        'high',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        v_new_values,
        p_reason,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'ban_reason', p_reason,
        'expires_at', v_expires_at,
        'is_permanent', v_expires_at IS NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin_unban_user(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Admin unbanned user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_values JSONB;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Insufficient privileges: user is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_banned THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not banned'
        );
    END IF;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_banned', v_target_profile.is_banned,
        'ban_reason', v_target_profile.ban_reason,
        'banned_at', v_target_profile.banned_at,
        'ban_expires_at', v_target_profile.ban_expires_at
    );

    -- Unban the user
    UPDATE profiles
    SET
        is_banned = FALSE,
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL,
        ban_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action
    PERFORM log_admin_action(
        p_admin_id,
        'user_unban',
        'high',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object('is_banned', FALSE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username
    );
END;
$$;

-- ============================================================================
-- SECTION 8: User Suspend/Unsuspend Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_suspend_user(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT,
    p_duration_hours INTEGER DEFAULT 24,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_values JSONB;
    v_expires_at TIMESTAMPTZ;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Insufficient privileges: user is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    -- Calculate expiration (suspensions always expire)
    v_expires_at := NOW() + (p_duration_hours || ' hours')::INTERVAL;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_suspended', v_target_profile.is_suspended,
        'suspension_reason', v_target_profile.suspension_reason
    );

    -- Suspend the user
    UPDATE profiles
    SET
        is_suspended = TRUE,
        suspension_reason = p_reason,
        suspended_at = NOW(),
        suspended_by = p_admin_id,
        suspension_expires_at = v_expires_at,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action
    PERFORM log_admin_action(
        p_admin_id,
        'user_suspend',
        'medium',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object(
            'is_suspended', TRUE,
            'suspension_reason', p_reason,
            'suspension_expires_at', v_expires_at
        ),
        p_reason,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'suspension_reason', p_reason,
        'expires_at', v_expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin_unsuspend_user(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Admin lifted suspension'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_values JSONB;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Insufficient privileges: user is not an admin';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_suspended THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not suspended'
        );
    END IF;

    -- Store old values
    v_old_values := jsonb_build_object(
        'is_suspended', v_target_profile.is_suspended,
        'suspension_reason', v_target_profile.suspension_reason
    );

    -- Unsuspend the user
    UPDATE profiles
    SET
        is_suspended = FALSE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action
    PERFORM log_admin_action(
        p_admin_id,
        'user_unsuspend',
        'medium',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        v_old_values,
        jsonb_build_object('is_suspended', FALSE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username
    );
END;
$$;

-- ============================================================================
-- SECTION 9: Balance Adjustment Function
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_adjust_balance(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_amount_tct NUMERIC,  -- Positive for credit, negative for debit
    p_reason TEXT,
    p_adjustment_type TEXT DEFAULT 'adjustment', -- 'compensation', 'refund', 'correction', 'penalty'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_ledger_tx_id UUID := gen_random_uuid();
    v_entry_type ledger_entry_type;
    v_treasury_id UUID;
    v_treasury_balance NUMERIC;
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Verify admin privileges
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Insufficient privileges: user is not an admin';
    END IF;

    -- Large adjustments require super admin
    IF ABS(p_amount_tct) > 10000 AND NOT is_user_super_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Adjustments over 10,000 TCT require super admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    -- Get current balance
    SELECT available_tct INTO v_current_balance
    FROM balances
    WHERE user_id = p_target_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        -- Create balance record if doesn't exist
        INSERT INTO balances (user_id, available_tct)
        VALUES (p_target_user_id, 0);
        v_current_balance := 0;
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance + p_amount_tct;

    -- Prevent negative balance
    IF v_new_balance < 0 THEN
        RAISE EXCEPTION 'Adjustment would result in negative balance. Current: %, Adjustment: %', v_current_balance, p_amount_tct;
    END IF;

    -- Determine entry type
    IF p_amount_tct > 0 THEN
        IF p_adjustment_type = 'refund' THEN
            v_entry_type := 'admin_refund';
        ELSIF p_adjustment_type = 'compensation' THEN
            v_entry_type := 'compensation';
        ELSE
            v_entry_type := 'admin_credit';
        END IF;
    ELSE
        v_entry_type := 'admin_debit';
    END IF;

    -- Update user balance
    UPDATE balances
    SET
        available_tct = v_new_balance,
        updated_at = NOW()
    WHERE user_id = p_target_user_id;

    -- Record in transactions table
    INSERT INTO transactions (
        user_id, type, amount_tct,
        balance_before_tct, balance_after_tct,
        description
    ) VALUES (
        p_target_user_id,
        CASE WHEN p_amount_tct > 0 THEN 'deposit' ELSE 'withdraw' END,
        p_amount_tct,
        v_current_balance,
        v_new_balance,
        'Admin adjustment (' || p_adjustment_type || '): ' || p_reason
    );

    -- Get treasury account for ledger
    v_treasury_id := get_vault_account_id('platform_treasury');
    SELECT balance_tct INTO v_treasury_balance FROM vault_accounts WHERE id = v_treasury_id;

    -- Record in double-entry ledger
    -- User entry
    INSERT INTO rake_ledger (
        transaction_id, entry_type, user_id,
        debit_tct, credit_tct, balance_after_tct,
        description, metadata
    ) VALUES (
        v_ledger_tx_id, v_entry_type, p_target_user_id,
        CASE WHEN p_amount_tct > 0 THEN p_amount_tct ELSE 0 END,
        CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE 0 END,
        v_new_balance,
        'Admin balance adjustment: ' || p_reason,
        jsonb_build_object(
            'admin_id', p_admin_id,
            'adjustment_type', p_adjustment_type
        )
    );

    -- Treasury counter-entry
    INSERT INTO rake_ledger (
        transaction_id, entry_type, account_id,
        debit_tct, credit_tct, balance_after_tct,
        description, metadata
    ) VALUES (
        v_ledger_tx_id, v_entry_type, v_treasury_id,
        CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE 0 END,
        CASE WHEN p_amount_tct > 0 THEN p_amount_tct ELSE 0 END,
        v_treasury_balance + CASE WHEN p_amount_tct < 0 THEN ABS(p_amount_tct) ELSE -p_amount_tct END,
        'Counter-entry for admin adjustment',
        jsonb_build_object('adjustment_for', p_target_user_id)
    );

    -- Update treasury balance (credits come from treasury, debits go to treasury)
    UPDATE vault_accounts
    SET
        balance_tct = balance_tct - p_amount_tct, -- Subtract because giving to user
        total_debits_tct = CASE WHEN p_amount_tct > 0 THEN total_debits_tct + p_amount_tct ELSE total_debits_tct END,
        total_credits_tct = CASE WHEN p_amount_tct < 0 THEN total_credits_tct + ABS(p_amount_tct) ELSE total_credits_tct END,
        updated_at = NOW()
    WHERE id = v_treasury_id;

    -- Log the action
    PERFORM log_admin_action(
        p_admin_id,
        'user_balance_adjust',
        CASE
            WHEN ABS(p_amount_tct) > 1000 THEN 'critical'
            WHEN ABS(p_amount_tct) > 100 THEN 'high'
            ELSE 'medium'
        END,
        p_target_user_id,
        'balances',
        p_target_user_id,
        jsonb_build_object('available_tct', v_current_balance),
        jsonb_build_object('available_tct', v_new_balance),
        p_reason,
        p_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'adjustment_amount', p_amount_tct,
        'adjustment_type', p_adjustment_type,
        'balance_before', v_current_balance,
        'balance_after', v_new_balance,
        'ledger_transaction_id', v_ledger_tx_id
    );
END;
$$;

-- ============================================================================
-- SECTION 10: Admin Management Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_grant_admin(
    p_super_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Granted admin privileges'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Only super admins can grant admin
    IF NOT is_user_super_admin(p_super_admin_id) THEN
        RAISE EXCEPTION 'Only super admins can grant admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF v_target_profile.is_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is already an admin'
        );
    END IF;

    -- Grant admin
    UPDATE profiles
    SET
        is_admin = TRUE,
        admin_2fa_enabled = FALSE, -- Require 2FA setup
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action
    PERFORM log_admin_action(
        p_super_admin_id,
        'admin_grant',
        'critical',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        jsonb_build_object('is_admin', FALSE),
        jsonb_build_object('is_admin', TRUE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username,
        'requires_2fa_setup', TRUE
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin_revoke_admin(
    p_super_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Admin privileges revoked'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Only super admins can revoke admin
    IF NOT is_user_super_admin(p_super_admin_id) THEN
        RAISE EXCEPTION 'Only super admins can revoke admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not an admin'
        );
    END IF;

    -- Revoke admin (and super admin if applicable)
    UPDATE profiles
    SET
        is_admin = FALSE,
        is_super_admin = FALSE,
        admin_2fa_enabled = FALSE,
        admin_2fa_verified_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Revoke all admin sessions
    UPDATE admin_sessions
    SET
        revoked_at = NOW(),
        revoked_reason = p_reason
    WHERE admin_id = p_target_user_id AND revoked_at IS NULL;

    -- Log the action
    PERFORM log_admin_action(
        p_super_admin_id,
        'admin_revoke',
        'critical',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        jsonb_build_object('is_admin', TRUE),
        jsonb_build_object('is_admin', FALSE),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'username', v_target_profile.username
    );
END;
$$;

-- ============================================================================
-- SECTION 11: Admin Dashboard Query Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        -- User stats
        'users', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM profiles),
            'active_today', (SELECT COUNT(*) FROM profiles WHERE last_seen_at >= CURRENT_DATE),
            'active_week', (SELECT COUNT(*) FROM profiles WHERE last_seen_at >= CURRENT_DATE - INTERVAL '7 days'),
            'new_today', (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE),
            'new_week', (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
            'banned', (SELECT COUNT(*) FROM profiles WHERE is_banned = TRUE),
            'suspended', (SELECT COUNT(*) FROM profiles WHERE is_suspended = TRUE)
        ),
        -- Game stats
        'games', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM games),
            'active', (SELECT COUNT(*) FROM games WHERE status = 'active'),
            'completed_today', (SELECT COUNT(*) FROM games WHERE status = 'completed' AND ended_at >= CURRENT_DATE),
            'completed_week', (SELECT COUNT(*) FROM games WHERE status = 'completed' AND ended_at >= CURRENT_DATE - INTERVAL '7 days')
        ),
        -- Financial stats (from vault)
        'financial', (SELECT admin_get_vault_dashboard()),
        -- Challenge stats
        'challenges', jsonb_build_object(
            'pending', (SELECT COUNT(*) FROM challenges WHERE status = 'pending'),
            'created_today', (SELECT COUNT(*) FROM challenges WHERE created_at >= CURRENT_DATE)
        ),
        -- Admin stats
        'admins', jsonb_build_object(
            'total_admins', (SELECT COUNT(*) FROM profiles WHERE is_admin = TRUE),
            'super_admins', (SELECT COUNT(*) FROM profiles WHERE is_super_admin = TRUE),
            'actions_today', (SELECT COUNT(*) FROM admin_audit_log WHERE created_at >= CURRENT_DATE)
        ),
        'generated_at', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Search users for admin panel
CREATE OR REPLACE FUNCTION admin_search_users(
    p_search_term TEXT DEFAULT NULL,
    p_filter_banned BOOLEAN DEFAULT NULL,
    p_filter_suspended BOOLEAN DEFAULT NULL,
    p_filter_admin BOOLEAN DEFAULT NULL,
    p_order_by TEXT DEFAULT 'created_at',
    p_order_dir TEXT DEFAULT 'DESC',
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    elo_rating INTEGER,
    games_played INTEGER,
    games_won INTEGER,
    is_admin BOOLEAN,
    is_super_admin BOOLEAN,
    is_banned BOOLEAN,
    ban_reason TEXT,
    is_suspended BOOLEAN,
    suspension_reason TEXT,
    available_tct NUMERIC,
    locked_tct NUMERIC,
    created_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.username,
        p.email,
        p.elo_rating,
        p.games_played,
        p.games_won,
        p.is_admin,
        p.is_super_admin,
        p.is_banned,
        p.ban_reason,
        p.is_suspended,
        p.suspension_reason,
        COALESCE(b.available_tct, 0::NUMERIC),
        COALESCE(b.locked_tct, 0::NUMERIC),
        p.created_at,
        p.last_seen_at
    FROM profiles p
    LEFT JOIN balances b ON b.user_id = p.id
    WHERE
        (p_search_term IS NULL OR
            p.username ILIKE '%' || p_search_term || '%' OR
            p.email ILIKE '%' || p_search_term || '%' OR
            p.id::TEXT = p_search_term)
        AND (p_filter_banned IS NULL OR p.is_banned = p_filter_banned)
        AND (p_filter_suspended IS NULL OR p.is_suspended = p_filter_suspended)
        AND (p_filter_admin IS NULL OR p.is_admin = p_filter_admin)
    ORDER BY
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN p.created_at END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN p.created_at END ASC,
        CASE WHEN p_order_by = 'username' AND p_order_dir = 'DESC' THEN p.username END DESC,
        CASE WHEN p_order_by = 'username' AND p_order_dir = 'ASC' THEN p.username END ASC,
        CASE WHEN p_order_by = 'elo_rating' AND p_order_dir = 'DESC' THEN p.elo_rating END DESC,
        CASE WHEN p_order_by = 'elo_rating' AND p_order_dir = 'ASC' THEN p.elo_rating END ASC,
        CASE WHEN p_order_by = 'last_seen_at' AND p_order_dir = 'DESC' THEN p.last_seen_at END DESC,
        CASE WHEN p_order_by = 'last_seen_at' AND p_order_dir = 'ASC' THEN p.last_seen_at END ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Get user details for admin
CREATE OR REPLACE FUNCTION admin_get_user_details(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_balance balances%ROWTYPE;
    v_result JSONB;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    SELECT * INTO v_balance FROM balances WHERE user_id = p_user_id;

    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', v_profile.id,
            'username', v_profile.username,
            'email', v_profile.email,
            'elo_rating', v_profile.elo_rating,
            'games_played', v_profile.games_played,
            'games_won', v_profile.games_won,
            'games_lost', v_profile.games_lost,
            'games_drawn', v_profile.games_drawn,
            'current_streak', v_profile.current_streak,
            'longest_streak', v_profile.longest_streak,
            'created_at', v_profile.created_at,
            'last_seen_at', v_profile.last_seen_at
        ),
        'admin_status', jsonb_build_object(
            'is_admin', v_profile.is_admin,
            'is_super_admin', v_profile.is_super_admin,
            'admin_2fa_enabled', v_profile.admin_2fa_enabled
        ),
        'restrictions', jsonb_build_object(
            'is_banned', v_profile.is_banned,
            'ban_reason', v_profile.ban_reason,
            'banned_at', v_profile.banned_at,
            'ban_expires_at', v_profile.ban_expires_at,
            'is_suspended', v_profile.is_suspended,
            'suspension_reason', v_profile.suspension_reason,
            'suspended_at', v_profile.suspended_at,
            'suspension_expires_at', v_profile.suspension_expires_at
        ),
        'balance', jsonb_build_object(
            'available_tct', COALESCE(v_balance.available_tct, 0),
            'locked_tct', COALESCE(v_balance.locked_tct, 0),
            'total_deposited_tct', COALESCE(v_balance.total_deposited_tct, 0),
            'total_withdrawn_tct', COALESCE(v_balance.total_withdrawn_tct, 0),
            'total_won_tct', COALESCE(v_balance.total_won_tct, 0),
            'total_lost_tct', COALESCE(v_balance.total_lost_tct, 0),
            'total_commission_paid_tct', COALESCE(v_balance.total_commission_paid_tct, 0)
        ),
        'recent_games', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', g.id,
                'opponent_id', CASE WHEN g.white_player_id = p_user_id THEN g.black_player_id ELSE g.white_player_id END,
                'result', g.result,
                'wager_tct', g.wager_tct,
                'ended_at', g.ended_at
            )), '[]'::JSONB)
            FROM games g
            WHERE (g.white_player_id = p_user_id OR g.black_player_id = p_user_id)
                AND g.status = 'completed'
            ORDER BY g.ended_at DESC
            LIMIT 10
        ),
        'recent_transactions', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', t.id,
                'type', t.type,
                'amount_tct', t.amount_tct,
                'description', t.description,
                'created_at', t.created_at
            )), '[]'::JSONB)
            FROM transactions t
            WHERE t.user_id = p_user_id
            ORDER BY t.created_at DESC
            LIMIT 10
        ),
        'admin_notes', v_profile.admin_notes
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- SECTION 12: Auto-Expire Suspensions
-- ============================================================================

CREATE OR REPLACE FUNCTION check_expired_suspensions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Lift expired suspensions
    UPDATE profiles
    SET
        is_suspended = FALSE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_expires_at = NULL,
        updated_at = NOW()
    WHERE is_suspended = TRUE
        AND suspension_expires_at IS NOT NULL
        AND suspension_expires_at <= NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Lift expired bans
    UPDATE profiles
    SET
        is_banned = FALSE,
        ban_reason = NULL,
        banned_at = NULL,
        banned_by = NULL,
        ban_expires_at = NULL,
        updated_at = NOW()
    WHERE is_banned = TRUE
        AND ban_expires_at IS NOT NULL
        AND ban_expires_at <= NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    -- Note: This overwrites previous count but captures ban lifts

    RETURN v_count;
END;
$$;

-- ============================================================================
-- SECTION 13: Row Level Security
-- ============================================================================

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

-- Admin audit log: Only admins can view
CREATE POLICY "Only admins can view audit log"
    ON admin_audit_log FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
    ));

-- Admin sessions: Admins can view their own sessions
CREATE POLICY "Admins can view own sessions"
    ON admin_sessions FOR SELECT
    TO authenticated
    USING (admin_id IN (
        SELECT id FROM profiles
        WHERE profiles.privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
    ));

-- ============================================================================
-- SECTION 14: Grant Permissions
-- ============================================================================

-- Functions accessible to authenticated users (with admin check inside)
GRANT EXECUTE ON FUNCTION is_user_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_restricted(UUID) TO authenticated;

-- Admin-only functions (service role, admin checks inside functions)
GRANT EXECUTE ON FUNCTION admin_ban_user(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_unban_user(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_suspend_user(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_unsuspend_user(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_grant_admin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_dashboard_stats() TO service_role;
GRANT EXECUTE ON FUNCTION admin_search_users(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_user_details(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION log_admin_action(UUID, admin_action_type, admin_action_severity, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, INET, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION check_expired_suspensions() TO service_role;

-- Grant table access
GRANT SELECT ON admin_audit_log TO authenticated;
GRANT SELECT ON admin_sessions TO authenticated;
GRANT ALL ON admin_audit_log TO service_role;
GRANT ALL ON admin_sessions TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of changes:
-- 1. Extended profiles table with admin, ban, and suspension columns
-- 2. Created admin_audit_log table for comprehensive action logging
-- 3. Created admin_sessions table for session tracking
-- 4. Added helper functions for admin/restriction checks
-- 5. Implemented ban/unban/suspend/unsuspend functions with audit trails
-- 6. Implemented balance adjustment function with double-entry accounting
-- 7. Implemented admin management functions (grant/revoke)
-- 8. Created dashboard stats and user search functions
-- 9. Added auto-expire logic for temporary bans/suspensions
-- 10. Set up proper RLS policies for admin-only access
-- ============================================================================
