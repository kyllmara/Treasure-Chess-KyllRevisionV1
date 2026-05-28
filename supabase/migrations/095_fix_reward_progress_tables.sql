-- Migration 095: Fix get_user_reward_progress to use correct table/column names
--
-- Fixes:
-- 1. challenge_history -> challenges (creator_id/opponent_id, status='accepted' means completed)
-- 2. tournament_participants -> tournament_registrations
-- 3. tournaments.winner_id -> tournament_registrations.final_place = 1
-- 4. transactions.type = 'stake_won' -> 'win_payout', column amount_tct not amount

CREATE OR REPLACE FUNCTION get_user_reward_progress(p_user_id UUID)
RETURNS TABLE(
  reward_id UUID,
  reward_name TEXT,
  criteria_type criteria_type,
  criteria_value INTEGER,
  current_progress INTEGER,
  is_unlocked BOOLEAN,
  tct_reward NUMERIC,
  tct_claimed BOOLEAN,
  avatar_url TEXT,
  reward_type TEXT,
  tier reward_tier
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_games_played INTEGER;
  v_total_wins INTEGER;
  v_challenges_completed INTEGER;
  v_tournaments_played INTEGER;
  v_tournament_wins INTEGER;
  v_current_streak INTEGER;
  v_elo_rating INTEGER;
  v_total_earnings NUMERIC;
BEGIN
  -- Compute stats from profiles
  SELECT COALESCE(p.games_played, 0), COALESCE(p.games_won, 0),
         COALESCE(p.current_streak, 0), COALESCE(p.elo_rating, 1200)
  INTO v_games_played, v_total_wins, v_current_streak, v_elo_rating
  FROM profiles p WHERE p.id = p_user_id;

  -- Compute challenges_completed from challenges table
  -- A challenge is "completed" when it has been accepted and has a game_id
  SELECT COUNT(*)::INTEGER INTO v_challenges_completed
  FROM challenges
  WHERE (creator_id = p_user_id OR opponent_id = p_user_id)
    AND status = 'accepted'
    AND game_id IS NOT NULL;

  -- Compute tournaments_played from tournament_registrations
  SELECT COUNT(*)::INTEGER INTO v_tournaments_played
  FROM tournament_registrations
  WHERE user_id = p_user_id;

  -- Compute tournament_wins from tournament_registrations (final_place = 1)
  SELECT COUNT(*)::INTEGER INTO v_tournament_wins
  FROM tournament_registrations
  WHERE user_id = p_user_id
    AND final_place = 1;

  -- Compute total_earnings from transactions (win_payout type, amount_tct column)
  SELECT COALESCE(SUM(amount_tct), 0) INTO v_total_earnings
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'win_payout';

  -- Return all rewards with computed progress
  RETURN QUERY
  SELECT
    r.id AS reward_id,
    r.name AS reward_name,
    r.criteria_type,
    r.criteria_value,
    CASE r.criteria_type
      WHEN 'games_played' THEN v_games_played
      WHEN 'total_wins' THEN v_total_wins
      WHEN 'challenges_completed' THEN v_challenges_completed
      WHEN 'tournaments_played' THEN v_tournaments_played
      WHEN 'tournament_wins' THEN v_tournament_wins
      WHEN 'win_streak' THEN v_current_streak
      WHEN 'elo_rating' THEN v_elo_rating
      WHEN 'total_earnings' THEN v_total_earnings::INTEGER
      ELSE 0
    END AS current_progress,
    (ur.unlocked_at IS NOT NULL) AS is_unlocked,
    r.tct_reward,
    COALESCE(ur.tct_claimed, false) AS tct_claimed,
    r.avatar_url,
    r.reward_type,
    r.tier
  FROM rewards r
  LEFT JOIN user_rewards ur ON ur.reward_id = r.id AND ur.user_id = p_user_id
  WHERE r.is_active = true
  ORDER BY r.sort_order;
END;
$$;
