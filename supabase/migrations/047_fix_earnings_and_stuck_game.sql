-- Migration: Fix earnings and stuck game
-- This corrects the total_won_tct for user byron555555 and marks stuck games as completed

-- Step 1: Update earnings for byron555555 (byronoc123@gmail.com) to 40 TCT
UPDATE balances
SET
  total_won_tct = 40,
  updated_at = NOW()
WHERE user_id = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8';

-- Step 2: Mark any games that have on_chain_settled = true but status = 'active' as completed
-- This catches games where escrow was released but status wasn't updated
UPDATE games
SET
  status = 'completed',
  ended_at = COALESCE(ended_at, NOW())
WHERE
  status = 'active'
  AND on_chain_settled = true;

-- Step 3: For games where escrow was NOT used but have been active too long,
-- mark as abandoned (stale games)
UPDATE games
SET
  status = 'abandoned',
  result = COALESCE(result::text, 'abandoned')::game_result,
  ended_at = COALESCE(ended_at, NOW())
WHERE
  status = 'active'
  AND on_chain_settled IS NOT TRUE
  AND (
    -- Game has been active for more than 2 hours
    (started_at IS NOT NULL AND started_at < NOW() - INTERVAL '2 hours')
    OR
    -- Last move was more than 2 hours ago
    (last_move_at IS NOT NULL AND last_move_at < NOW() - INTERVAL '2 hours')
    OR
    -- Game created more than 2 hours ago with no activity
    (created_at < NOW() - INTERVAL '2 hours' AND last_move_at IS NULL AND started_at IS NULL)
  );
