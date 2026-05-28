-- ============================================================================
-- Migration 046: Correct user balances
-- ============================================================================
-- byronoc123@gmail.com (f7ea0802-e965-47f1-83fb-44b0cd7c29e8) won 20 TCT
-- byronoc123@protonmail.com (720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331) lost 25 TCT
-- ============================================================================

-- Reset and set correct values for gmail user (winner)
UPDATE balances
SET
  total_won_tct = 20,
  total_lost_tct = 0,
  updated_at = NOW()
WHERE user_id = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8';

-- Reset and set correct values for protonmail user (loser)
UPDATE balances
SET
  total_won_tct = 0,
  total_lost_tct = 25,
  updated_at = NOW()
WHERE user_id = '720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331';
