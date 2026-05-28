-- ============================================================================
-- Migration 092: Dragon Avatar Rewards System
--
-- Maps 35 dragon profile pictures to milestone-based rewards.
-- Players unlock dragons by playing games, winning, completing challenges,
-- and tournament participation. TCT bonuses awarded directly to balances.
-- ============================================================================

-- ============================================================================
-- 1. Add missing criteria_type enum values
-- ============================================================================

-- Add 'challenges_completed' if not present
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

-- Add 'tournaments_played' if not present
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

-- Add 'reward_payout' to transaction_type if not present
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
-- 2. Add avatar_url column to rewards table if not present
-- ============================================================================

ALTER TABLE rewards ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'standard';

-- ============================================================================
-- 3. Insert Dragon Avatar Rewards (35 total)
-- ============================================================================

-- Baby Dragons (indices 0-8) - Unlocked via games_played milestones
INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, reward_type, avatar_url, sort_order, is_active) VALUES
  ('Baby Dragon I',      'Hatchling steps — play your first 10 games',              'flame', 'bronze',   'games_played', 10,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/d987cb8d-3a1c-4153-b962-4f4a5a3bde41.png', 100, true),
  ('Baby Dragon II',     'Finding your wings — play 30 games',                       'flame', 'bronze',   'games_played', 30,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/d93b981e-f6ea-4972-8107-b576496c24cb.png', 101, true),
  ('Baby Dragon III',    'Battle-tested hatchling — play 75 games',                  'flame', 'bronze',   'games_played', 75,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/178d349f-b91d-42b8-ac42-9aa352cc4def.png', 102, true),
  ('Baby Dragon IV',     'Scales hardening — survive 150 games on the board',        'flame', 'silver',   'games_played', 150,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/fda8ce80-6fd8-4b5f-abfc-19bc79c31d5e.png', 103, true),
  ('Baby Dragon V',      'Rising from the ashes — endure 250 games',                 'flame', 'silver',   'games_played', 250,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/6ece8f2e-1e13-4bed-be15-309669d9c15c.png', 104, true),
  ('Baby Dragon VI',     'Fireproof — 400 games and still breathing',                'flame', 'silver',   'games_played', 400,  15,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/657b192c-fb2e-4f82-8204-e9ec107e293d.png', 105, true),
  ('Baby Dragon VII',    'Dragon''s endurance — forge through 600 games',            'flame', 'gold',     'games_played', 600,  25,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/bc4aa1f6-2d6d-483e-8cb6-ca2e7b25e77d.png', 106, true),
  ('Baby Dragon VIII',   'Ancient persistence — 900 games played',                   'flame', 'gold',     'games_played', 900,  35,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/f78eaa5e-ef63-408e-9505-0d171c3b4e4c.png', 107, true),
  ('Baby Dragon IX',     'Eternal flame — 1,500 games, a true dragon of the board',  'flame', 'platinum', 'games_played', 1500, 100, 'dragon_avatar', 'https://r2-pub.rork.com/generated-images/7be0c5cb-b02c-4377-82a1-df22516fe0ab.png', 108, true);

-- Teenage Dragons (indices 9-17) - Unlocked via total_wins milestones
INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, reward_type, avatar_url, sort_order, is_active) VALUES
  ('Teenage Dragon I',    'First taste of victory — win 5 games',                    'trophy', 'bronze',   'total_wins', 5,    0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/0d77351e-5ae4-4fd4-85c9-d40337247e61.png', 200, true),
  ('Teenage Dragon II',   'Sharpening your claws — win 20 games',                    'trophy', 'bronze',   'total_wins', 20,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/2c7178ac-3096-416e-be22-cf009c5c489d.png', 201, true),
  ('Teenage Dragon III',  'Predator instinct — 50 victories claimed',                'trophy', 'bronze',   'total_wins', 50,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/69b5e875-14b0-4b40-bf22-96c695d6b2be.png', 202, true),
  ('Teenage Dragon IV',   'Triple-digit terror — 100 wins on the board',             'trophy', 'silver',   'total_wins', 100,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/47fcabb7-7000-4456-83c2-e6859069b70d.png', 203, true),
  ('Teenage Dragon V',    'Fear the flame — 175 victories and counting',             'trophy', 'silver',   'total_wins', 175,  15,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png', 204, true),
  ('Teenage Dragon VI',   'Apex hunter — 275 wins, your name echoes in the arena',   'trophy', 'gold',     'total_wins', 275,  25,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png', 205, true),
  ('Teenage Dragon VII',  'Dragonlord rising — 400 victories forged in battle',      'trophy', 'gold',     'total_wins', 400,  35,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/af03441f-c644-46ce-8ab1-44a2a267ba28.png', 206, true),
  ('Teenage Dragon VIII', 'Unstoppable force — 600 wins, a living legend',           'trophy', 'platinum', 'total_wins', 600,  50,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png', 207, true),
  ('Teenage Dragon IX',   'Thousand-win dragon — a mythic champion of the board',    'trophy', 'platinum', 'total_wins', 1000, 100, 'dragon_avatar', 'https://r2-pub.rork.com/generated-images/4891fc39-750e-4ebd-b2fa-73600f8549a0.png', 208, true);

-- Non-fierce Adult Dragons (indices 18-26) - Unlocked via challenges_completed milestones
INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, reward_type, avatar_url, sort_order, is_active) VALUES
  ('Adult Dragon I',     'Accept the call — complete 3 challenges',                  'target', 'bronze',   'challenges_completed', 3,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/d5421ced-b222-469e-86e9-bf57414cd738.png', 300, true),
  ('Adult Dragon II',    'Challenger''s resolve — conquer 8 challenges',             'target', 'bronze',   'challenges_completed', 8,   0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png', 301, true),
  ('Adult Dragon III',   'Proving grounds — 15 challenges defeated',                 'target', 'bronze',   'challenges_completed', 15,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png', 302, true),
  ('Adult Dragon IV',    'Trial by fire — overcome 25 challenges',                   'target', 'silver',   'challenges_completed', 25,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png', 303, true),
  ('Adult Dragon V',     'Gauntlet runner — 40 challenges conquered',                'target', 'silver',   'challenges_completed', 40,  15,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png', 304, true),
  ('Adult Dragon VI',    'Challenge devourer — 60 foes bested in personal combat',   'target', 'gold',     'challenges_completed', 60,  25,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/6086acd7-2054-4db0-a38b-ddb62d8173a7.png', 305, true),
  ('Adult Dragon VII',   'Unbroken will — 85 challenges in the rearview',            'target', 'gold',     'challenges_completed', 85,  35,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/d4928689-63db-46a9-a7c4-806463141952.png', 306, true),
  ('Adult Dragon VIII',  'Legendary challenger — 120 rivals humbled',                'target', 'platinum', 'challenges_completed', 120, 50,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/637923f8-0483-4397-8775-a745526d7f32.png', 307, true),
  ('Adult Dragon IX',    'Challenge incarnate — 200 completed, none can stand',      'target', 'platinum', 'challenges_completed', 200, 100, 'dragon_avatar', 'https://r2-pub.rork.com/generated-images/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png', 308, true);

-- Fierce Adult Dragons (indices 27-34) - Unlocked via tournament milestones
INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, reward_type, avatar_url, sort_order, is_active) VALUES
  ('Fierce Dragon I',     'Into the arena — enter 3 tournaments',                             'sword',  'bronze',   'tournaments_played', 3,  0,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/4090decb-e03e-4e1e-836d-6a97455932cf.png', 400, true),
  ('Fierce Dragon II',    'Tournament regular — battle through 8 tournaments',                'sword',  'bronze',   'tournaments_played', 8,  8,   'dragon_avatar', 'https://r2-pub.rork.com/generated-images/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png', 401, true),
  ('Fierce Dragon III',   'Arena veteran — 15 tournaments on the record',                     'sword',  'silver',   'tournaments_played', 15, 15,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png', 402, true),
  ('Fierce Dragon IV',    'Tournament dragon — 30 events, a feared competitor',               'sword',  'gold',     'tournaments_played', 30, 35,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/3f3a6e15-3411-4972-8348-766fa05572db.png', 403, true),
  ('Fierce Dragon V',     'Crown collector — win 3 tournaments',                              'crown',  'silver',   'tournament_wins',    3,  40,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/6233121d-9638-41cd-9cc0-831af74194eb.png', 404, true),
  ('Fierce Dragon VI',    'Dynasty builder — 6 tournament victories',                         'crown',  'gold',     'tournament_wins',    6,  60,  'dragon_avatar', 'https://r2-pub.rork.com/generated-images/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png', 405, true),
  ('Fierce Dragon VII',   'Unrivaled champion — 10 tournament crowns',                        'crown',  'platinum', 'tournament_wins',    10, 125, 'dragon_avatar', 'https://r2-pub.rork.com/generated-images/c7776511-a385-4bf9-a051-7cce392c1409.png', 406, true),
  ('Fierce Dragon VIII',  'Eternal champion — 20 tournament victories, a dragon of legend',   'crown',  'platinum', 'tournament_wins',    20, 200, 'dragon_avatar', 'https://r2-pub.rork.com/generated-images/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png', 407, true);

-- ============================================================================
-- 4. Insert TCT-Only Bonus Rewards (12 total, no avatar)
-- ============================================================================

INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, reward_type, sort_order, is_active) VALUES
  ('5-Win Streak',       'Hot streak — blaze through 5 wins in a row',              'flame',        'bronze',   'win_streak',      5,     15,  'tct_bonus', 500, true),
  ('8-Win Streak',       'Inferno run — 8 consecutive victories',                   'flame',        'silver',   'win_streak',      8,     40,  'tct_bonus', 501, true),
  ('15-Win Streak',      'Unstoppable blaze — 15 wins without defeat',              'flame',        'gold',     'win_streak',      15,    125, 'tct_bonus', 502, true),
  ('ELO 1200',           'Rising star — reach ELO 1200',                            'trending-up',  'bronze',   'elo_rating',      1200,  20,  'tct_bonus', 510, true),
  ('ELO 1400',           'Serious contender — reach ELO 1400',                      'trending-up',  'silver',   'elo_rating',      1400,  45,  'tct_bonus', 511, true),
  ('ELO 1600',           'Elite player — reach ELO 1600',                           'trending-up',  'gold',     'elo_rating',      1600,  75,  'tct_bonus', 512, true),
  ('ELO 1800',           'Grandmaster dragon — reach ELO 1800',                     'trending-up',  'platinum', 'elo_rating',      1800,  150, 'tct_bonus', 513, true),
  ('Earned 250 TCT',     'First hoard — earn 250 TCT from gameplay',                'zap',          'bronze',   'total_earnings',  250,   15,  'tct_bonus', 520, true),
  ('Earned 1500 TCT',    'Growing treasury — earn 1,500 TCT from gameplay',         'zap',          'silver',   'total_earnings',  1500,  40,  'tct_bonus', 521, true),
  ('Earned 3500 TCT',    'Dragon''s vault — earn 3,500 TCT from gameplay',          'zap',          'gold',     'total_earnings',  3500,  75,  'tct_bonus', 522, true),
  ('Earned 10000 TCT',   'Treasure mountain — earn 10,000 TCT from gameplay',       'zap',          'platinum', 'total_earnings',  10000, 150, 'tct_bonus', 523, true),
  ('Earned 25000 TCT',   'Legendary hoard — earn 25,000 TCT from the battlefield',  'zap',          'platinum', 'total_earnings',  25000, 400, 'tct_bonus', 524, true);

-- ============================================================================
-- 5. claim_dragon_reward function
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
  -- Get reward details
  SELECT * INTO v_reward FROM rewards WHERE id = p_reward_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not found or inactive'::TEXT;
    RETURN;
  END IF;

  -- Get user reward progress
  SELECT * INTO v_user_reward
  FROM user_rewards
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User reward record not found'::TEXT;
    RETURN;
  END IF;

  -- Validate reward is unlocked
  IF v_user_reward.unlocked_at IS NULL THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward not yet unlocked'::TEXT;
    RETURN;
  END IF;

  -- Check not already claimed
  IF v_user_reward.tct_claimed THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'Reward already claimed'::TEXT;
    RETURN;
  END IF;

  -- Check there is a TCT reward to claim
  IF v_reward.tct_reward <= 0 THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'No TCT reward for this milestone'::TEXT;
    RETURN;
  END IF;

  -- Get user's username for audit log
  SELECT username INTO v_username FROM profiles WHERE id = p_user_id;

  -- Get current balance (and verify balances row exists)
  SELECT available_tct INTO v_balance_before
  FROM balances
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 'User balance record not found'::TEXT;
    RETURN;
  END IF;

  -- Mark as claimed
  UPDATE user_rewards
  SET tct_claimed = true,
      claimed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  -- Credit TCT to user's balance (matches legacy claim_reward_tct pattern)
  UPDATE balances
  SET available_tct = available_tct + v_reward.tct_reward,
      total_won_tct = total_won_tct + v_reward.tct_reward,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Insert transaction record for audit trail
  INSERT INTO transactions (
    user_id,
    type,
    amount_tct,
    balance_before_tct,
    balance_after_tct,
    description
  ) VALUES (
    p_user_id,
    'reward_payout',
    v_reward.tct_reward,
    v_balance_before,
    v_balance_before + v_reward.tct_reward,
    'Dragon reward claimed: ' || v_reward.name || ' (' || v_reward.tier || ')'
  );

  -- Insert admin audit log entry
  INSERT INTO admin_audit_log (
    admin_id,
    admin_username,
    is_super_admin,
    action_type,
    action_severity,
    target_user_id,
    target_user_username,
    target_table,
    target_record_id,
    new_values,
    reason,
    notes
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
-- 6. get_user_reward_progress function (with auto-unlock)
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
  -- Compute stats from profiles
  SELECT COALESCE(p.games_played, 0), COALESCE(p.games_won, 0),
         COALESCE(p.current_streak, 0), COALESCE(p.elo_rating, 1200)
  INTO v_games_played, v_total_wins, v_current_streak, v_elo_rating
  FROM profiles p WHERE p.id = p_user_id;

  -- Compute challenges_completed from challenges table
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

  -- Compute total_earnings from transactions (win_payout type)
  SELECT COALESCE(SUM(amount_tct), 0) INTO v_total_earnings
  FROM transactions
  WHERE user_id = p_user_id
    AND type = 'win_payout';

  -- Auto-unlock: ensure user_rewards rows exist for all active rewards
  INSERT INTO user_rewards (user_id, reward_id, progress)
  SELECT p_user_id, r.id, 0
  FROM rewards r
  WHERE r.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM user_rewards ur
      WHERE ur.user_id = p_user_id AND ur.reward_id = r.id
    );

  -- Auto-unlock: set unlocked_at where criteria are met
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
      (r.criteria_type = 'games_played'         AND v_games_played >= r.criteria_value)
      OR (r.criteria_type = 'total_wins'        AND v_total_wins >= r.criteria_value)
      OR (r.criteria_type = 'challenges_completed' AND v_challenges_completed >= r.criteria_value)
      OR (r.criteria_type = 'tournaments_played' AND v_tournaments_played >= r.criteria_value)
      OR (r.criteria_type = 'tournament_wins'    AND v_tournament_wins >= r.criteria_value)
      OR (r.criteria_type = 'win_streak'         AND v_current_streak >= r.criteria_value)
      OR (r.criteria_type = 'elo_rating'         AND v_elo_rating >= r.criteria_value)
      OR (r.criteria_type = 'total_earnings'     AND v_total_earnings >= r.criteria_value)
    );

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

-- ============================================================================
-- 7. Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION claim_dragon_reward(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_reward_progress(UUID) TO authenticated;

-- ============================================================================
-- 8. Indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rewards_reward_type ON rewards(reward_type);
CREATE INDEX IF NOT EXISTS idx_rewards_avatar_url ON rewards(avatar_url) WHERE avatar_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_criteria_type ON rewards(criteria_type);
