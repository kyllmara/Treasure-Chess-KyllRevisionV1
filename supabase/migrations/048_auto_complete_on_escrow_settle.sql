-- Migration 048: Auto-complete game when escrow is settled
-- This trigger ensures that whenever on_chain_settled is set to true,
-- the game status is automatically updated to 'completed' if it isn't already.
-- This prevents games from getting stuck as 'active' when escrow settles.

-- Create a function to auto-complete games when escrow settles
CREATE OR REPLACE FUNCTION auto_complete_on_escrow_settle()
RETURNS TRIGGER AS $$
BEGIN
  -- If on_chain_settled is being set to true and game is not already completed
  IF NEW.on_chain_settled = true AND OLD.on_chain_settled IS DISTINCT FROM true THEN
    -- Only update if status is not already completed
    IF NEW.status != 'completed' THEN
      NEW.status := 'completed';
      NEW.ended_at := COALESCE(NEW.ended_at, NOW());
      RAISE NOTICE '[auto_complete_on_escrow_settle] Game % auto-completed because escrow settled', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_auto_complete_on_escrow_settle ON games;
CREATE TRIGGER trigger_auto_complete_on_escrow_settle
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_on_escrow_settle();

-- Also create a function to periodically check and fix any games that slipped through
-- This can be called manually or by a cron job
CREATE OR REPLACE FUNCTION fix_stuck_settled_games()
RETURNS TABLE(game_id UUID, old_status TEXT, new_status TEXT) AS $$
BEGIN
  RETURN QUERY
  UPDATE games
  SET
    status = 'completed',
    ended_at = COALESCE(ended_at, NOW())
  WHERE
    status = 'active'
    AND on_chain_settled = true
  RETURNING
    id as game_id,
    'active' as old_status,
    'completed' as new_status;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fix_stuck_settled_games TO authenticated;
GRANT EXECUTE ON FUNCTION fix_stuck_settled_games TO service_role;

-- Run the fix immediately for any existing stuck games
SELECT * FROM fix_stuck_settled_games();
