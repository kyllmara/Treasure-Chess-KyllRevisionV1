-- Migration 050: Fix on-chain settlement balances
-- The submit-game-result function was not updating the balances table
-- This adds a helper function and fixes the current game

-- Create helper function to increment balance fields (if not exists)
CREATE OR REPLACE FUNCTION increment_balance_field(
  p_user_id UUID,
  p_field TEXT,
  p_amount NUMERIC
)
RETURNS VOID AS $$
BEGIN
  -- Ensure user has a balance record
  INSERT INTO balances (user_id, available_tct, locked_tct, total_won_tct, total_lost_tct)
  VALUES (p_user_id, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update the specified field
  IF p_field = 'total_won_tct' THEN
    UPDATE balances SET total_won_tct = COALESCE(total_won_tct, 0) + p_amount WHERE user_id = p_user_id;
  ELSIF p_field = 'total_lost_tct' THEN
    UPDATE balances SET total_lost_tct = COALESCE(total_lost_tct, 0) + p_amount WHERE user_id = p_user_id;
  ELSIF p_field = 'available_tct' THEN
    UPDATE balances SET available_tct = COALESCE(available_tct, 0) + p_amount WHERE user_id = p_user_id;
  ELSIF p_field = 'locked_tct' THEN
    UPDATE balances SET locked_tct = COALESCE(locked_tct, 0) + p_amount WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_balance_field TO service_role;

-- Fix the current game (1f64cea3-de1c-433b-b212-8211f9c9156e)
-- White player (720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331) won
-- Wager was 25 TCT per player = 50 TCT pot
-- Winner gets 45 TCT (90% after 10% rake)
-- Loser lost 25 TCT

DO $$
DECLARE
  v_game_id UUID := '1f64cea3-de1c-433b-b212-8211f9c9156e';
  v_winner_id UUID;
  v_loser_id UUID;
  v_wager_tct NUMERIC;
  v_winner_payout_tct NUMERIC;
BEGIN
  -- Get game details
  SELECT
    winner_id,
    CASE WHEN result = 'white_wins' THEN black_player_id ELSE white_player_id END,
    wager_tct
  INTO v_winner_id, v_loser_id, v_wager_tct
  FROM games
  WHERE id = v_game_id;

  IF v_winner_id IS NULL THEN
    RAISE NOTICE 'Game not found or no winner';
    RETURN;
  END IF;

  -- Calculate payout (pot minus 10% rake)
  v_winner_payout_tct := (v_wager_tct * 2) * 0.9;

  RAISE NOTICE 'Fixing balances for game %: winner=%, loser=%, wager=%, payout=%',
    v_game_id, v_winner_id, v_loser_id, v_wager_tct, v_winner_payout_tct;

  -- Ensure both players have balance records
  INSERT INTO balances (user_id, available_tct, locked_tct, total_won_tct, total_lost_tct)
  VALUES (v_winner_id, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO balances (user_id, available_tct, locked_tct, total_won_tct, total_lost_tct)
  VALUES (v_loser_id, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update winner's total_won_tct
  UPDATE balances
  SET total_won_tct = COALESCE(total_won_tct, 0) + v_winner_payout_tct
  WHERE user_id = v_winner_id;

  -- Update loser's total_lost_tct
  UPDATE balances
  SET total_lost_tct = COALESCE(total_lost_tct, 0) + v_wager_tct
  WHERE user_id = v_loser_id;

  RAISE NOTICE 'Balances updated successfully';
END $$;

-- Show the updated balances
SELECT
  b.user_id,
  p.username,
  b.total_won_tct,
  b.total_lost_tct,
  b.available_tct,
  b.locked_tct
FROM balances b
JOIN profiles p ON b.user_id = p.id
WHERE b.user_id IN (
  SELECT white_player_id FROM games WHERE id = '1f64cea3-de1c-433b-b212-8211f9c9156e'
  UNION
  SELECT black_player_id FROM games WHERE id = '1f64cea3-de1c-433b-b212-8211f9c9156e'
);
