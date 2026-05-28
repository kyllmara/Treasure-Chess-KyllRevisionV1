-- ============================================================================
-- Migration 037: Fix Challenge Validation Trigger
-- ============================================================================
-- The validate_challenge_update() function uses 'completed' which is not
-- a valid value in the challenge_status enum.
-- Valid values are: 'pending', 'accepted', 'cancelled', 'expired'
-- ============================================================================

-- Drop the old trigger first
DROP TRIGGER IF EXISTS challenge_update_validation ON challenges;

-- Recreate the function with correct enum values
CREATE OR REPLACE FUNCTION validate_challenge_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent modification of immutable fields
    IF OLD.on_chain_game_id IS NOT NULL AND OLD.on_chain_game_id IS DISTINCT FROM NEW.on_chain_game_id THEN
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
    -- pending -> accepted, cancelled, expired
    -- accepted, cancelled, expired are terminal states
    IF OLD.status = 'accepted' OR OLD.status = 'cancelled' OR OLD.status = 'expired' THEN
        IF NEW.status != OLD.status THEN
            RAISE EXCEPTION 'Cannot modify status of accepted/cancelled/expired challenge';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER challenge_update_validation
    BEFORE UPDATE ON challenges
    FOR EACH ROW
    EXECUTE FUNCTION validate_challenge_update();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
