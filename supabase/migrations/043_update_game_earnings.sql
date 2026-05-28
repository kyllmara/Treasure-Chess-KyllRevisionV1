-- ============================================================================
-- Migration 043: Update earnings for game 11350f28-10de-4d69-869d-10ef258a3052
-- ============================================================================
-- Game: 25 TCT wager, white (720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331) won
-- Winner gets: 25 * 2 * 0.9 = 45 TCT
-- Loser loses: 25 TCT
-- ============================================================================

-- First, add a policy to allow service_role to manage balances if it doesn't exist
DO $$
BEGIN
    -- Drop existing service role policy if it exists
    DROP POLICY IF EXISTS "Service role can manage all balances" ON balances;

    -- Create new policy for service role
    CREATE POLICY "Service role can manage all balances" ON balances
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if policy already exists
        NULL;
END $$;

-- Create balance record for winner if it doesn't exist, then update total_won_tct
INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
VALUES ('720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331', 0, 0, 0, 0, 45, 0, 0)
ON CONFLICT (user_id) DO UPDATE SET
  total_won_tct = balances.total_won_tct + 45,
  updated_at = NOW();

-- Create balance record for loser if it doesn't exist, then update total_lost_tct
INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
VALUES ('f7ea0802-e965-47f1-83fb-44b0cd7c29e8', 0, 0, 0, 0, 0, 25, 0)
ON CONFLICT (user_id) DO UPDATE SET
  total_lost_tct = balances.total_lost_tct + 25,
  updated_at = NOW();
