-- ============================================================================
-- Migration 045: Fix duplicate earnings from migrations 043 and 044
-- ============================================================================
-- Migrations 043 and 044 both added the same earnings for game 11350f28-...
-- This corrects the double-counted amounts
-- ============================================================================

-- Winner: Subtract the extra 45 TCT that was added twice
UPDATE balances
SET total_won_tct = COALESCE(total_won_tct, 0) - 45,
    updated_at = NOW()
WHERE user_id = '720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331';

-- Loser: Subtract the extra 25 TCT that was added twice
UPDATE balances
SET total_lost_tct = COALESCE(total_lost_tct, 0) - 25,
    updated_at = NOW()
WHERE user_id = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8';
