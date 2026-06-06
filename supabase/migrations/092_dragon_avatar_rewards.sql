-- ============================================================================
-- Migration 092: Dragon Avatar Rewards System
--
-- Maps 35 dragon profile pictures to milestone-based rewards.
-- Players unlock dragons by playing games, winning, completing challenges,
-- and tournament participation. TCT bonuses awarded directly to balances.
--
-- NOTE: The INSERT INTO rewards statements have been intentionally moved to
-- migration 093.  PostgreSQL prevents using a newly-added enum value in the
-- same transaction that added it (SQLSTATE 55P04).  By splitting DDL (here)
-- from data inserts (093), each migration runs in its own committed
-- transaction, making the new enum values safe to use in 093.
-- ============================================================================

-- ============================================================================
-- 1. Add missing criteria_type / transaction_type enum values
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'challenges_completed'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'criteria_type')
  ) THEN
    ALTER TYPE criteria_type ADD VALUE 'challenges_completed';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'tournaments_played'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'criteria_type')
  ) THEN
    ALTER TYPE criteria_type ADD VALUE 'tournaments_played';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'reward_payout'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'reward_payout';
  END IF;
END $$;

-- ============================================================================
-- 2. Add avatar_url and reward_type columns to rewards table
-- ============================================================================

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'standard';

-- ============================================================================
-- 3. claim_dragon_reward function
-- ============================================================================

CREATE OR REPLACE FUNCTION claim_dragon_reward(
  p_user_id UUID,
  p_reward_id UUID
)
RETURNS TABLE(success BOOLEAN, amount_claimed NUMERIC, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward RECORD;
  v_user_reward RECORD;
  v_username TEXT;
  v_balance_before NUMERIC;
BEGIN
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not found or inactive'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_user_reward
  FROM user_rewards
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User reward record not found'::TEXT;
    RETURN;
  END IF;

  IF v_user_reward.unlocked_at IS NULL THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not yet unlocked'::TEXT;
    RETURN;
  END IF;

  IF v_user_reward.tct_claimed THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward already claimed'::TEXT;
    RETURN;
  END IF;

  IF v_reward.tct_reward <= 0 THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'No TCT reward for this milestone'::TEXT;
    RETURN;
  END IF;

  SELECT username INTO v_username FROM profiles WHERE id = p_user_id;

  SELECT available_tct INTO v_balance_before
  FROM balances
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User balance record not found'::TEXT;
    RETURN;
  END IF;

  UPDATE user_rewards
  SET tct_claimed = true,
      claimed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  UPDATE balances
  SET available_tct = available_tct + v_reward.tct_reward,
      total_won_tct = total_won_tct + v_reward.tct_reward,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (
    user_id, type, amount_tct, balance_before_tct, balance_after_tct, description
  ) VALUES (
    p_user_id,
    'reward_payout',
    v_reward.tct_reward,
    v_balance_before,
    v_balance_before + v_reward.tct_reward,
    'Dragon reward claimed: ' || v_reward.name || ' (' || v_reward.tier || ')'
  );

  INSERT INTO admin_audit_log (
    admin_id, admin_username, is_super_admin,
    action_type, action_severity,
    target_user_id, target_user_username,
    target_table, target_record_id,
    new_values, reason, notes
  ) VALUES (
    p_user_id,
    COALESCE(v_username, 'unknown'),
    false,
    'adjust_balance',
    'medium',
    p_user_id,
    COALESCE(v_username, 'unknown'),
    'user_rewards',
    p_reward_id,
    jsonb_build_object(
      'action', 'reward_tct_claimed',
      'reward_name', v_reward.name,
      'reward_type', v_reward.reward_type,
      'tct_amount', v_reward.tct_reward,
      'reward_tier', v_reward.tier,
      'balance_before', v_balance_before,
      'balance_after', v_balance_before + v_reward.tct_reward
    ),
    'Dragon avatar reward TCT claimed',
    'TCT credited to balances.available_tct for milestone reward: ' || v_reward.name
  );

  RETURN QUERY SELECT true, v_reward.tct_reward, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 4. get_user_reward_progress function (with auto-unlock)
-- ============================================================================

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
  SELECT COALESCE(p.games_played, 0), COALESCE(p.games_won, 0),
         COALESCE(p.current_streak, 0), COALESCE(p.elo_rating, 1200)
  INTO v_games_played, v_total_wins, v_current_streak, v_elo_rating
  FROM profiles p WHERE p.id = p_user_id;

  SELECT COUNT(*)::INTEGER INTO v_challenges_completed
  FROM challenges
  WHERE (creator_id = p_user_id OR opponent_id = p_user_id)
    AND status = 'accepted'
    AND game_id IS NOT NULL;

  SELECT COUNT(*)::INTEGER INTO v_tournaments_played
  FROM tournament_registrations
  WHERE user_id = p_user_id;

  SELECT COUNT(*)::INTEGER INTO v_tournament_wins
  FROM tournament_registrations
  WHERE user_id = p_user_id
    AND final_place = 1;

  SELECT COALESCE(SUM(amount_tct), 0) INTO v_total_earnings
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'win_payout';

  INSERT INTO user_rewards (user_id, reward_id, progress)
  SELECT p_user_id, r.id, 0
  FROM rewards r
  WHERE r.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_rewards ur
      WHERE ur.user_id = p_user_id AND ur.reward_id = r.id
    );

  UPDATE user_rewards ur
  SET unlocked_at = NOW(),
      progress = r.criteria_value,
      updated_at = NOW()
  FROM rewards r
  WHERE ur.reward_id = r.id
    AND ur.user_id = p_user_id
    AND ur.unlocked_at IS NULL
    AND r.is_active = true
    AND (
      (r.criteria_type = 'games_played'            AND v_games_played >= r.criteria_value)
      OR (r.criteria_type = 'total_wins'           AND v_total_wins >= r.criteria_value)
      OR (r.criteria_type = 'challenges_completed' AND v_challenges_completed >= r.criteria_value)
      OR (r.criteria_type = 'tournaments_played'   AND v_tournaments_played >= r.criteria_value)
      OR (r.criteria_type = 'tournament_wins'      AND v_tournament_wins >= r.criteria_value)
      OR (r.criteria_type = 'win_streak'           AND v_current_streak >= r.criteria_value)
      OR (r.criteria_type = 'elo_rating'           AND v_elo_rating >= r.criteria_value)
      OR (r.criteria_type = 'total_earnings'       AND v_total_earnings >= r.criteria_value)
    );

  RETURN QUERY
  SELECT
    r.id AS reward_id,
    r.name AS reward_name,
    r.criteria_type,
    r.criteria_value,
    CASE r.criteria_type
      WHEN 'games_played'          THEN v_games_played
      WHEN 'total_wins'            THEN v_total_wins
      WHEN 'challenges_completed'  THEN v_challenges_completed
      WHEN 'tournaments_played'    THEN v_tournaments_played
      WHEN 'tournament_wins'       THEN v_tournament_wins
      WHEN 'win_streak'            THEN v_current_streak
      WHEN 'elo_rating'            THEN v_elo_rating
      WHEN 'total_earnings'        THEN v_total_earnings::INTEGER
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

-- ============================================================================
-- 5. Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION claim_dragon_reward(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_reward_progress(UUID) TO authenticated;

-- ============================================================================
-- 6. Indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rewards_reward_type ON rewards(reward_type);
CREATE INDEX IF NOT EXISTS idx_rewards_avatar_url ON rewards(avatar_url) WHERE avatar_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_criteria_type ON rewards(criteria_type);
