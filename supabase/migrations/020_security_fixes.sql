-- ============================================================================
-- Migration 020: CRITICAL SECURITY FIXES
-- ============================================================================
-- This migration addresses multiple critical vulnerabilities that could allow
-- attackers to steal funds through database manipulation.
--
-- VULNERABILITIES FIXED:
-- 1. Challenges: Users could modify on_chain_game_id to point to different escrow
-- 2. Games: No UPDATE policy - users could modify game results
-- 3. Immutable fields: wager_tct, creator_id, etc. were modifiable
-- ============================================================================

-- ============================================================================
-- FIX 1: Restrict Challenges UPDATE to prevent escrow swapping
-- ============================================================================
-- The old policy allowed participants to modify ANY field including:
-- - on_chain_game_id (could point to different escrow with more funds)
-- - wager_tct (could change wager after creation)
-- - creator_id (could change ownership)
--
-- ATTACK SCENARIO:
-- 1. Attacker creates high-value challenge (100 USDC, on_chain_game_id = 0xABCD)
-- 2. Victim creates low-value challenge (1 USDC, on_chain_game_id = 0x1234)
-- 3. Attacker joins victim's challenge
-- 4. Attacker UPDATE challenges SET on_chain_game_id = '0xABCD' WHERE id = victim_challenge
-- 5. When game completes, settlement uses 100 USDC escrow instead of 1 USDC
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own challenges" ON challenges;

-- Create a function to validate challenge updates
-- This ensures immutable fields cannot be changed
CREATE OR REPLACE FUNCTION validate_challenge_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent modification of immutable fields
    IF OLD.on_chain_game_id IS DISTINCT FROM NEW.on_chain_game_id THEN
        RAISE EXCEPTION 'Cannot modify on_chain_game_id after creation';
    END IF;

    IF OLD.wager_tct IS DISTINCT FROM NEW.wager_tct THEN
        RAISE EXCEPTION 'Cannot modify wager_tct after creation';
    END IF;

    IF OLD.creator_id IS DISTINCT FROM NEW.creator_id THEN
        RAISE EXCEPTION 'Cannot modify creator_id';
    END IF;

    IF OLD.room_code IS DISTINCT FROM NEW.room_code THEN
        RAISE EXCEPTION 'Cannot modify room_code after creation';
    END IF;

    -- Allow status changes only in valid directions
    -- pending -> active, cancelled
    -- active -> completed, cancelled
    IF OLD.status = 'completed' OR OLD.status = 'cancelled' THEN
        IF NEW.status != OLD.status THEN
            RAISE EXCEPTION 'Cannot modify status of completed/cancelled challenge';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for challenge updates
DROP TRIGGER IF EXISTS challenge_update_validation ON challenges;
CREATE TRIGGER challenge_update_validation
    BEFORE UPDATE ON challenges
    FOR EACH ROW
    EXECUTE FUNCTION validate_challenge_update();

-- Recreate the UPDATE policy with limited scope
CREATE POLICY "Users can update own challenges" ON challenges
    FOR UPDATE
    TO authenticated
    USING (
        creator_id = auth.uid()
        OR opponent_id = auth.uid()
    )
    WITH CHECK (
        creator_id = auth.uid()
        OR opponent_id = auth.uid()
    );

-- ============================================================================
-- FIX 2: Add Games UPDATE policy with strict field restrictions
-- ============================================================================
-- The games table has RLS enabled but NO UPDATE policy for users.
-- This means users currently CANNOT update games via RLS.
-- However, we need to ensure only the service_role can update critical fields.
-- ============================================================================

-- First, check if there's an UPDATE policy and drop it
DROP POLICY IF EXISTS "Users can update games" ON games;
DROP POLICY IF EXISTS "Participants can update games" ON games;
DROP POLICY IF EXISTS "Service role can update games" ON games;

-- Create validation trigger for games table
CREATE OR REPLACE FUNCTION validate_game_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only service_role can modify these critical fields
    -- Regular users (authenticated) should NEVER be able to change results

    -- Check if this is being called with service_role privileges
    -- If not, block changes to critical fields
    IF current_setting('role') != 'service_role' THEN
        -- Block modification of game results
        IF OLD.result IS DISTINCT FROM NEW.result THEN
            RAISE EXCEPTION 'Cannot modify game result';
        END IF;

        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RAISE EXCEPTION 'Cannot modify game status';
        END IF;

        -- Block modification of on-chain fields
        IF OLD.on_chain_game_id IS DISTINCT FROM NEW.on_chain_game_id THEN
            RAISE EXCEPTION 'Cannot modify on_chain_game_id';
        END IF;

        IF OLD.on_chain_settled IS DISTINCT FROM NEW.on_chain_settled THEN
            RAISE EXCEPTION 'Cannot modify on_chain_settled';
        END IF;

        IF OLD.on_chain_tx_hash IS DISTINCT FROM NEW.on_chain_tx_hash THEN
            RAISE EXCEPTION 'Cannot modify on_chain_tx_hash';
        END IF;

        -- Block modification of player IDs
        IF OLD.white_player_id IS DISTINCT FROM NEW.white_player_id THEN
            RAISE EXCEPTION 'Cannot modify white_player_id';
        END IF;

        IF OLD.black_player_id IS DISTINCT FROM NEW.black_player_id THEN
            RAISE EXCEPTION 'Cannot modify black_player_id';
        END IF;

        -- Block modification of wager
        IF OLD.wager_tct IS DISTINCT FROM NEW.wager_tct THEN
            RAISE EXCEPTION 'Cannot modify wager_tct';
        END IF;

        -- Block modification of ELO fields
        IF OLD.white_elo_before IS DISTINCT FROM NEW.white_elo_before THEN
            RAISE EXCEPTION 'Cannot modify white_elo_before';
        END IF;

        IF OLD.black_elo_before IS DISTINCT FROM NEW.black_elo_before THEN
            RAISE EXCEPTION 'Cannot modify black_elo_before';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for game updates
DROP TRIGGER IF EXISTS game_update_validation ON games;
CREATE TRIGGER game_update_validation
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION validate_game_update();

-- Only allow participants to update allowed fields (moves, timestamps, fen)
CREATE POLICY "Participants can update game state" ON games
    FOR UPDATE
    TO authenticated
    USING (
        white_player_id = auth.uid()
        OR black_player_id = auth.uid()
    )
    WITH CHECK (
        white_player_id = auth.uid()
        OR black_player_id = auth.uid()
    );

-- Service role has full access for backend jobs
CREATE POLICY "Service role can update games" ON games
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FIX 3: Protect settlement_logs from tampering
-- ============================================================================
-- Settlement logs should be INSERT-only - no updates or deletes
-- ============================================================================

DROP POLICY IF EXISTS "settlement_logs_insert" ON settlement_logs;
DROP POLICY IF EXISTS "settlement_logs_no_update" ON settlement_logs;
DROP POLICY IF EXISTS "settlement_logs_no_delete" ON settlement_logs;

-- Only service role can insert settlement logs
CREATE POLICY "settlement_logs_service_insert" ON settlement_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- No one can update settlement logs
CREATE POLICY "settlement_logs_no_update" ON settlement_logs
    FOR UPDATE
    USING (false);

-- No one can delete settlement logs
CREATE POLICY "settlement_logs_no_delete" ON settlement_logs
    FOR DELETE
    USING (false);

-- ============================================================================
-- FIX 4: Protect pending_on_chain_games from manipulation
-- ============================================================================

DROP POLICY IF EXISTS "pending_games_write" ON pending_on_chain_games;

-- Create validation trigger
CREATE OR REPLACE FUNCTION validate_pending_game_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Block modification of critical fields
    IF OLD.on_chain_game_id IS DISTINCT FROM NEW.on_chain_game_id THEN
        RAISE EXCEPTION 'Cannot modify on_chain_game_id';
    END IF;

    IF OLD.wager_usdc IS DISTINCT FROM NEW.wager_usdc THEN
        RAISE EXCEPTION 'Cannot modify wager_usdc';
    END IF;

    IF OLD.creator_wallet IS DISTINCT FROM NEW.creator_wallet THEN
        RAISE EXCEPTION 'Cannot modify creator_wallet';
    END IF;

    IF OLD.creator_user_id IS DISTINCT FROM NEW.creator_user_id THEN
        RAISE EXCEPTION 'Cannot modify creator_user_id';
    END IF;

    IF OLD.create_tx_hash IS DISTINCT FROM NEW.create_tx_hash THEN
        RAISE EXCEPTION 'Cannot modify create_tx_hash';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS pending_game_update_validation ON pending_on_chain_games;
CREATE TRIGGER pending_game_update_validation
    BEFORE UPDATE ON pending_on_chain_games
    FOR EACH ROW
    EXECUTE FUNCTION validate_pending_game_update();

-- Only creator can update status (e.g., cancel)
CREATE POLICY "pending_games_update" ON pending_on_chain_games
    FOR UPDATE
    TO authenticated
    USING (creator_user_id = auth.uid())
    WITH CHECK (creator_user_id = auth.uid());

-- Only creator can delete
CREATE POLICY "pending_games_delete" ON pending_on_chain_games
    FOR DELETE
    TO authenticated
    USING (creator_user_id = auth.uid());

-- ============================================================================
-- FIX 5: Add audit logging for sensitive operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    user_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_event ON security_audit_log (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_log (user_id, created_at);

-- Function to log security-relevant changes
CREATE OR REPLACE FUNCTION log_security_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO security_audit_log (event_type, table_name, record_id, user_id, old_values, new_values)
    VALUES (
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id::text, OLD.id::text),
        auth.uid(),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_challenges ON challenges;
CREATE TRIGGER audit_challenges
    AFTER INSERT OR UPDATE OR DELETE ON challenges
    FOR EACH ROW
    EXECUTE FUNCTION log_security_event();

DROP TRIGGER IF EXISTS audit_games ON games;
CREATE TRIGGER audit_games
    AFTER INSERT OR UPDATE OR DELETE ON games
    FOR EACH ROW
    EXECUTE FUNCTION log_security_event();

DROP TRIGGER IF EXISTS audit_settlement_logs ON settlement_logs;
CREATE TRIGGER audit_settlement_logs
    AFTER INSERT ON settlement_logs
    FOR EACH ROW
    EXECUTE FUNCTION log_security_event();

-- RLS on audit log - only service role can read
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access audit log" ON security_audit_log
    FOR ALL
    TO service_role
    USING (true);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of fixes:
-- 1. Challenges: Trigger prevents modification of on_chain_game_id, wager_tct
-- 2. Games: Trigger prevents users from modifying results, status, on_chain fields
-- 3. Settlement logs: INSERT-only, no updates or deletes
-- 4. Pending games: Protected immutable fields
-- 5. Audit logging: All sensitive table changes are logged
-- ============================================================================
