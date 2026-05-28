-- Migration 049: Fix orphan wager game that completed without on-chain escrow
--
-- Game ID: 1f64cea3-de1c-433b-b212-8211f9c9156e
-- Issue: Game was created with wager_tct=25 but on-chain escrow was never created
--        (on_chain_game_id exists but contract shows status=None, meaning no funds were locked)
--        Since no real money was involved, we mark it as settled to clear the UI
--
-- Root cause: Play Now matchmaking created a game before verifying on-chain escrow existed
-- Fix applied: Added on-chain verification in playNowStore._createGame and challengeStore.markReady

-- Mark the orphan game as settled (since no funds were actually locked)
UPDATE games
SET
  on_chain_settled = true,
  on_chain_settled_at = NOW()
WHERE
  id = '1f64cea3-de1c-433b-b212-8211f9c9156e'
  AND on_chain_settled = false;

-- Log what we did
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows > 0 THEN
    RAISE NOTICE '[049_fix_orphan_wager_game] Marked game 1f64cea3-de1c-433b-b212-8211f9c9156e as settled (no on-chain funds were involved)';
  ELSE
    RAISE NOTICE '[049_fix_orphan_wager_game] Game was already settled or not found';
  END IF;
END $$;

-- Also check for any other orphan games (wager > 0 but on_chain_settled = false and status = completed)
-- and create a function to detect them in the future
CREATE OR REPLACE FUNCTION find_orphan_wager_games()
RETURNS TABLE(
  game_id UUID,
  wager_tct NUMERIC,
  on_chain_game_id TEXT,
  status TEXT,
  result TEXT,
  ended_at TIMESTAMPTZ,
  white_player TEXT,
  black_player TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id as game_id,
    g.wager_tct,
    g.on_chain_game_id,
    g.status::TEXT,
    g.result::TEXT,
    g.ended_at,
    wp.username as white_player,
    bp.username as black_player
  FROM games g
  LEFT JOIN profiles wp ON g.white_player_id = wp.id
  LEFT JOIN profiles bp ON g.black_player_id = bp.id
  WHERE
    g.wager_tct > 0
    AND g.status = 'completed'
    AND g.on_chain_settled = false
    AND g.result IS NOT NULL
  ORDER BY g.ended_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_orphan_wager_games TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphan_wager_games TO service_role;

-- Run it to see if there are other orphan games
SELECT * FROM find_orphan_wager_games();
