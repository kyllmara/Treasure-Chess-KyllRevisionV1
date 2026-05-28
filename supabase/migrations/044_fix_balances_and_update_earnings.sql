-- ============================================================================
-- Migration 044: Fix balances RLS and update game earnings
-- ============================================================================
-- Add service_role policy and update earnings for on-chain settled games
-- ============================================================================

-- Add policy to allow service_role to manage balances
DROP POLICY IF EXISTS "Service role can manage all balances" ON balances;
CREATE POLICY "Service role can manage all balances" ON balances
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Now insert/update balance records for game 11350f28-10de-4d69-869d-10ef258a3052
-- Game: 25 TCT wager, white (720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331) won
-- Winner gets: 25 * 2 * 0.9 = 45 TCT
-- Loser loses: 25 TCT

-- Create balance record for winner if it doesn't exist, then update total_won_tct
INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
VALUES ('720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331', 0, 0, 0, 0, 45, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET
  total_won_tct = COALESCE(balances.total_won_tct, 0) + 45,
  updated_at = NOW();

-- Create balance record for loser if it doesn't exist, then update total_lost_tct
INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
VALUES ('f7ea0802-e965-47f1-83fb-44b0cd7c29e8', 0, 0, 0, 0, 0, 25, 0)
ON CONFLICT (user_id) DO UPDATE SET
  total_lost_tct = COALESCE(balances.total_lost_tct, 0) + 25,
  updated_at = NOW();
