-- ============================================================================
-- Migration 039: Fix game update trigger for service_role
-- ============================================================================
-- The previous trigger used current_setting('role') which doesn't properly
-- detect service_role access. This fixes it to use session_user check.
-- ============================================================================

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS game_update_validation ON games;
DROP FUNCTION IF EXISTS validate_game_update();

-- Create improved validation trigger that properly allows service_role
CREATE OR REPLACE FUNCTION validate_game_update()
RETURNS TRIGGER AS $$
DECLARE
    is_service_role BOOLEAN;
BEGIN
    -- Check if this is being called with service_role privileges
    -- Service role connections have a different session user pattern
    is_service_role := (
        current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
        OR current_user = 'postgres'
        OR current_user = 'supabase_admin'
        OR session_user = 'postgres'
        OR session_user = 'authenticator'
    );

    -- If service_role, allow all changes
    IF is_service_role THEN
        RETURN NEW;
    END IF;

    -- For regular users, block modification of critical fields

    -- Block modification of game results
    IF OLD.result IS DISTINCT FROM NEW.result THEN
        RAISE EXCEPTION 'Cannot modify game result (code: P0001)';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        RAISE EXCEPTION 'Cannot modify game status (code: P0001)';
    END IF;

    -- Block modification of winner
    IF OLD.winner_id IS DISTINCT FROM NEW.winner_id THEN
        RAISE EXCEPTION 'Cannot modify winner_id (code: P0001)';
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for game updates
CREATE TRIGGER game_update_validation
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION validate_game_update();

-- ============================================================================
-- Also clean up the stale active games
-- ============================================================================

-- Mark old active games as abandoned if they have no recent activity
UPDATE games
SET
    status = 'abandoned',
    end_reason = 'timeout',
    ended_at = NOW()
WHERE
    status = 'active'
    AND created_at < NOW() - INTERVAL '6 hours';
