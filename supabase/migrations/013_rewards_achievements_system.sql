-- =====================================================
-- TREASURE CHESS - REWARDS & ACHIEVEMENTS SYSTEM
-- =====================================================
-- Migration 013: Complete rewards and achievements backend
--
-- Features:
-- - Rewards with tiers (bronze/silver/gold/platinum)
-- - Achievements with rarity (common/rare/epic/legendary)
-- - Progress tracking for incomplete rewards
-- - Automatic unlocking via database triggers
-- - Real-time notifications via postgres_changes

-- =====================================================
-- ENUMS
-- =====================================================

-- Reward tier levels
CREATE TYPE reward_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- Achievement rarity levels
CREATE TYPE achievement_rarity AS ENUM ('common', 'rare', 'epic', 'legendary');

-- Criteria types for rewards and achievements
CREATE TYPE criteria_type AS ENUM (
  'win_streak',           -- Current win streak reaches threshold
  'games_played',         -- Total games played reaches milestone
  'total_earnings',       -- Total TCT earned from wins
  'total_wins',           -- Total games won
  'elo_rating',           -- ELO rating reaches threshold
  'longest_streak',       -- Longest win streak ever achieved
  'referral_count',       -- Number of successful referrals
  'tournament_wins',      -- Tournament victories
  'consecutive_days',     -- Days played in a row
  'checkmate_count',      -- Games won by checkmate
  'quick_win',            -- Win in under N moves
  'comeback_win',         -- Win after being down material
  'perfect_game',         -- Win without losing any pieces
  'first_blood'           -- First win ever
);

-- =====================================================
-- REWARDS TABLE
-- =====================================================
-- Defines available rewards players can unlock

CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  tier reward_tier NOT NULL DEFAULT 'bronze',
  criteria_type criteria_type NOT NULL,
  criteria_value INTEGER NOT NULL,
  tct_reward NUMERIC(20, 8) NOT NULL DEFAULT 0,
  gradient_start TEXT NOT NULL DEFAULT '#4ECDC4',
  gradient_end TEXT NOT NULL DEFAULT '#44A08D',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- USER_REWARDS TABLE
-- =====================================================
-- Tracks which rewards each user has earned and their progress

CREATE TABLE user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  tct_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, reward_id)
);

-- =====================================================
-- ACHIEVEMENTS TABLE
-- =====================================================
-- Defines special achievements (more prestigious than rewards)

CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'medal',
  rarity achievement_rarity NOT NULL DEFAULT 'common',
  criteria_type criteria_type NOT NULL,
  criteria_value INTEGER NOT NULL,
  badge_color TEXT NOT NULL DEFAULT '#FFD700',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- USER_ACHIEVEMENTS TABLE
-- =====================================================
-- Tracks which achievements each user has earned

CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  earned_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Rewards indexes
CREATE INDEX idx_rewards_criteria_type ON rewards(criteria_type);
CREATE INDEX idx_rewards_tier ON rewards(tier);
CREATE INDEX idx_rewards_is_active ON rewards(is_active);
CREATE INDEX idx_rewards_sort_order ON rewards(sort_order);

-- User rewards indexes
CREATE INDEX idx_user_rewards_user_id ON user_rewards(user_id);
CREATE INDEX idx_user_rewards_reward_id ON user_rewards(reward_id);
CREATE INDEX idx_user_rewards_unlocked ON user_rewards(user_id) WHERE unlocked_at IS NOT NULL;
CREATE INDEX idx_user_rewards_unclaimed ON user_rewards(user_id) WHERE unlocked_at IS NOT NULL AND tct_claimed = false;

-- Achievements indexes
CREATE INDEX idx_achievements_criteria_type ON achievements(criteria_type);
CREATE INDEX idx_achievements_rarity ON achievements(rarity);
CREATE INDEX idx_achievements_is_active ON achievements(is_active);

-- User achievements indexes
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX idx_user_achievements_earned ON user_achievements(user_id) WHERE earned_at IS NOT NULL;
CREATE INDEX idx_user_achievements_featured ON user_achievements(user_id) WHERE featured = true;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp for rewards
CREATE TRIGGER update_rewards_updated_at
  BEFORE UPDATE ON rewards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at timestamp for user_rewards
CREATE TRIGGER update_user_rewards_updated_at
  BEFORE UPDATE ON user_rewards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at timestamp for achievements
CREATE TRIGGER update_achievements_updated_at
  BEFORE UPDATE ON achievements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at timestamp for user_achievements
CREATE TRIGGER update_user_achievements_updated_at
  BEFORE UPDATE ON user_achievements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to check and unlock rewards for a user based on their current stats
CREATE OR REPLACE FUNCTION check_user_rewards(p_user_id UUID)
RETURNS TABLE(
  reward_id UUID,
  reward_name TEXT,
  reward_description TEXT,
  tct_reward NUMERIC,
  newly_unlocked BOOLEAN
) AS $$
DECLARE
  v_profile RECORD;
  v_reward RECORD;
  v_current_value INTEGER;
  v_user_reward_id UUID;
BEGIN
  -- Fetch user's current stats
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check each active reward
  FOR v_reward IN
    SELECT * FROM rewards WHERE is_active = true ORDER BY sort_order
  LOOP
    -- Determine current progress based on criteria type
    v_current_value := CASE v_reward.criteria_type
      WHEN 'win_streak' THEN v_profile.current_streak
      WHEN 'games_played' THEN v_profile.games_played
      WHEN 'total_wins' THEN v_profile.games_won
      WHEN 'elo_rating' THEN v_profile.elo_rating
      WHEN 'longest_streak' THEN v_profile.longest_streak
      -- Earnings and other types need separate calculation
      ELSE 0
    END;

    -- Insert or update user_reward record
    INSERT INTO user_rewards (user_id, reward_id, progress)
    VALUES (p_user_id, v_reward.id, GREATEST(v_current_value, 0))
    ON CONFLICT (user_id, reward_id)
    DO UPDATE SET
      progress = GREATEST(user_rewards.progress, EXCLUDED.progress),
      updated_at = NOW()
    RETURNING id INTO v_user_reward_id;

    -- Check if newly unlocked (progress meets criteria and not already unlocked)
    IF v_current_value >= v_reward.criteria_value THEN
      UPDATE user_rewards
      SET unlocked_at = COALESCE(unlocked_at, NOW())
      WHERE id = v_user_reward_id
        AND unlocked_at IS NULL;

      IF FOUND THEN
        -- Return newly unlocked reward
        reward_id := v_reward.id;
        reward_name := v_reward.name;
        reward_description := v_reward.description;
        tct_reward := v_reward.tct_reward;
        newly_unlocked := true;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to check and unlock achievements for a user
CREATE OR REPLACE FUNCTION check_user_achievements(p_user_id UUID)
RETURNS TABLE(
  achievement_id UUID,
  achievement_name TEXT,
  achievement_description TEXT,
  rarity achievement_rarity,
  newly_earned BOOLEAN
) AS $$
DECLARE
  v_profile RECORD;
  v_achievement RECORD;
  v_current_value INTEGER;
  v_user_achievement_id UUID;
BEGIN
  -- Fetch user's current stats
  SELECT * INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check each active achievement
  FOR v_achievement IN
    SELECT * FROM achievements WHERE is_active = true ORDER BY sort_order
  LOOP
    -- Determine current progress based on criteria type
    v_current_value := CASE v_achievement.criteria_type
      WHEN 'win_streak' THEN v_profile.current_streak
      WHEN 'games_played' THEN v_profile.games_played
      WHEN 'total_wins' THEN v_profile.games_won
      WHEN 'elo_rating' THEN v_profile.elo_rating
      WHEN 'longest_streak' THEN v_profile.longest_streak
      WHEN 'first_blood' THEN CASE WHEN v_profile.games_won >= 1 THEN 1 ELSE 0 END
      ELSE 0
    END;

    -- Insert or update user_achievement record
    INSERT INTO user_achievements (user_id, achievement_id, progress)
    VALUES (p_user_id, v_achievement.id, GREATEST(v_current_value, 0))
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      progress = GREATEST(user_achievements.progress, EXCLUDED.progress),
      updated_at = NOW()
    RETURNING id INTO v_user_achievement_id;

    -- Check if newly earned (progress meets criteria and not already earned)
    IF v_current_value >= v_achievement.criteria_value THEN
      UPDATE user_achievements
      SET earned_at = COALESCE(earned_at, NOW())
      WHERE id = v_user_achievement_id
        AND earned_at IS NULL;

      IF FOUND THEN
        -- Return newly earned achievement
        achievement_id := v_achievement.id;
        achievement_name := v_achievement.name;
        achievement_description := v_achievement.description;
        rarity := v_achievement.rarity;
        newly_earned := true;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to claim TCT reward
CREATE OR REPLACE FUNCTION claim_reward_tct(
  p_user_id UUID,
  p_reward_id UUID
) RETURNS TABLE(
  success BOOLEAN,
  amount_claimed NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_user_reward RECORD;
  v_reward RECORD;
BEGIN
  -- Get user reward record
  SELECT ur.*, r.tct_reward
  INTO v_user_reward
  FROM user_rewards ur
  JOIN rewards r ON r.id = ur.reward_id
  WHERE ur.user_id = p_user_id
    AND ur.reward_id = p_reward_id;

  IF NOT FOUND THEN
    success := false;
    amount_claimed := 0;
    error_message := 'Reward not found';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_user_reward.unlocked_at IS NULL THEN
    success := false;
    amount_claimed := 0;
    error_message := 'Reward not yet unlocked';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_user_reward.tct_claimed THEN
    success := false;
    amount_claimed := 0;
    error_message := 'Reward already claimed';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Mark as claimed
  UPDATE user_rewards
  SET tct_claimed = true,
      claimed_at = NOW()
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  -- Add TCT to user balance
  IF v_user_reward.tct_reward > 0 THEN
    UPDATE balances
    SET available_tct = available_tct + v_user_reward.tct_reward,
        total_won_tct = total_won_tct + v_user_reward.tct_reward
    WHERE user_id = p_user_id;
  END IF;

  success := true;
  amount_claimed := v_user_reward.tct_reward;
  error_message := NULL;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to set featured achievement for a user
CREATE OR REPLACE FUNCTION set_featured_achievement(
  p_user_id UUID,
  p_achievement_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Verify user has earned this achievement
  IF NOT EXISTS (
    SELECT 1 FROM user_achievements
    WHERE user_id = p_user_id
      AND achievement_id = p_achievement_id
      AND earned_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  -- Remove featured status from all user's achievements
  UPDATE user_achievements
  SET featured = false
  WHERE user_id = p_user_id;

  -- Set new featured achievement
  UPDATE user_achievements
  SET featured = true
  WHERE user_id = p_user_id AND achievement_id = p_achievement_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Rewards: Everyone can view active rewards
CREATE POLICY "Active rewards are viewable by everyone" ON rewards
  FOR SELECT USING (is_active = true);

-- User rewards: Users can view their own rewards
CREATE POLICY "Users can view own rewards" ON user_rewards
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- Achievements: Everyone can view active achievements
CREATE POLICY "Active achievements are viewable by everyone" ON achievements
  FOR SELECT USING (is_active = true);

-- User achievements: Users can view all earned achievements (for leaderboard badges)
CREATE POLICY "Earned achievements are viewable by everyone" ON user_achievements
  FOR SELECT USING (earned_at IS NOT NULL);

-- Users can view their own achievements (including progress)
CREATE POLICY "Users can view own achievement progress" ON user_achievements
  FOR SELECT USING (user_id IN (
    SELECT id FROM profiles WHERE privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  ));

-- =====================================================
-- SEED DATA: REWARDS
-- =====================================================

INSERT INTO rewards (name, description, icon, tier, criteria_type, criteria_value, tct_reward, gradient_start, gradient_end, sort_order) VALUES
-- Win Streak Rewards
('Hot Streak', '3 game win streak', 'flame', 'bronze', 'win_streak', 3, 10, '#FF6B6B', '#EE5A6F', 10),
('On Fire', '5 game win streak', 'flame', 'silver', 'win_streak', 5, 25, '#FF8C42', '#FF6B35', 11),
('Unstoppable', '10 game win streak', 'flame', 'gold', 'win_streak', 10, 100, '#FFD700', '#FFA500', 12),
('Rising Star', '25 game win streak', 'flame', 'gold', 'win_streak', 25, 250, '#4ECDC4', '#44A08D', 13),
('Master Streak', '50 game win streak', 'trophy', 'platinum', 'win_streak', 50, 500, '#A770EF', '#CF8BF3', 14),
('Legendary Streak', '100 game win streak', 'crown', 'platinum', 'win_streak', 100, 1000, '#FFD700', '#FFA500', 15),

-- Games Played Milestones
('Rookie', 'Play 10 games', 'target', 'bronze', 'games_played', 10, 5, '#4ECDC4', '#556270', 20),
('Regular', 'Play 50 games', 'target', 'bronze', 'games_played', 50, 15, '#6C5CE7', '#A29BFE', 21),
('Veteran', 'Play 100 games', 'target', 'silver', 'games_played', 100, 50, '#00B894', '#55EFC4', 22),
('Dedicated', 'Play 250 games', 'target', 'silver', 'games_played', 250, 100, '#FDCB6E', '#F39C12', 23),
('Committed', 'Play 500 games', 'target', 'gold', 'games_played', 500, 200, '#E17055', '#D63031', 24),
('Chess Master', 'Play 1000 games', 'medal', 'platinum', 'games_played', 1000, 500, '#FFD700', '#FFA500', 25),

-- Total Wins Milestones
('First Victory', 'Win your first game', 'trophy', 'bronze', 'total_wins', 1, 5, '#4ECDC4', '#44A08D', 30),
('Winning Habit', 'Win 25 games', 'trophy', 'bronze', 'total_wins', 25, 25, '#6C5CE7', '#A29BFE', 31),
('Dominator', 'Win 100 games', 'trophy', 'silver', 'total_wins', 100, 100, '#00B894', '#55EFC4', 32),
('Champion', 'Win 250 games', 'trophy', 'gold', 'total_wins', 250, 250, '#FDCB6E', '#F39C12', 33),
('Legend', 'Win 500 games', 'crown', 'platinum', 'total_wins', 500, 500, '#FFD700', '#FFA500', 34),

-- ELO Rating Milestones
('Improving', 'Reach 1300 ELO', 'trending-up', 'bronze', 'elo_rating', 1300, 25, '#4ECDC4', '#556270', 40),
('Skilled', 'Reach 1500 ELO', 'trending-up', 'silver', 'elo_rating', 1500, 75, '#6C5CE7', '#A29BFE', 41),
('Expert', 'Reach 1800 ELO', 'trending-up', 'gold', 'elo_rating', 1800, 200, '#00B894', '#55EFC4', 42),
('Master', 'Reach 2000 ELO', 'trending-up', 'platinum', 'elo_rating', 2000, 500, '#FFD700', '#FFA500', 43),
('Grandmaster', 'Reach 2200 ELO', 'crown', 'platinum', 'elo_rating', 2200, 1000, '#A770EF', '#CF8BF3', 44);

-- =====================================================
-- SEED DATA: ACHIEVEMENTS
-- =====================================================

INSERT INTO achievements (name, description, icon, rarity, criteria_type, criteria_value, badge_color, sort_order) VALUES
-- Entry Level
('First Blood', 'Win your first game', 'sword', 'common', 'first_blood', 1, '#4ECDC4', 10),

-- Win Streak Achievements
('Hot Hand', 'Achieve a 5 game win streak', 'flame', 'common', 'win_streak', 5, '#FF6B6B', 20),
('Fire Starter', 'Achieve a 10 game win streak', 'flame', 'rare', 'win_streak', 10, '#FF8C42', 21),
('Inferno', 'Achieve a 25 game win streak', 'flame', 'epic', 'win_streak', 25, '#E17055', 22),
('Phoenix', 'Achieve a 50 game win streak', 'flame', 'legendary', 'win_streak', 50, '#FFD700', 23),

-- Games Played Achievements
('Regular', 'Play 100 games', 'gamepad', 'common', 'games_played', 100, '#6C5CE7', 30),
('Devoted', 'Play 500 games', 'gamepad', 'rare', 'games_played', 500, '#A29BFE', 31),
('Obsessed', 'Play 1000 games', 'gamepad', 'epic', 'games_played', 1000, '#00B894', 32),

-- Total Wins Achievements
('Victor', 'Win 50 games', 'trophy', 'common', 'total_wins', 50, '#4ECDC4', 40),
('Conqueror', 'Win 250 games', 'trophy', 'rare', 'total_wins', 250, '#FFD700', 41),
('Overlord', 'Win 500 games', 'crown', 'epic', 'total_wins', 500, '#FF6B6B', 42),
('Supreme', 'Win 1000 games', 'crown', 'legendary', 'total_wins', 1000, '#A770EF', 43),

-- ELO Achievements
('Rising Star', 'Reach 1500 ELO', 'star', 'common', 'elo_rating', 1500, '#FDCB6E', 50),
('Expert Player', 'Reach 1800 ELO', 'star', 'rare', 'elo_rating', 1800, '#F39C12', 51),
('Master Class', 'Reach 2000 ELO', 'medal', 'epic', 'elo_rating', 2000, '#E17055', 52),
('Grandmaster', 'Reach 2200 ELO', 'award', 'legendary', 'elo_rating', 2200, '#FFD700', 53),

-- Longest Streak Achievements (historical best)
('Streak Hunter', 'Best win streak of 10', 'zap', 'common', 'longest_streak', 10, '#4ECDC4', 60),
('Streak Master', 'Best win streak of 25', 'zap', 'rare', 'longest_streak', 25, '#6C5CE7', 61),
('Streak Legend', 'Best win streak of 50', 'zap', 'epic', 'longest_streak', 50, '#A770EF', 62),
('Unbreakable', 'Best win streak of 100', 'zap', 'legendary', 'longest_streak', 100, '#FFD700', 63);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON rewards TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON user_rewards TO authenticated;
GRANT SELECT ON achievements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON user_achievements TO authenticated;

GRANT EXECUTE ON FUNCTION check_user_rewards(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_achievements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_reward_tct(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_featured_achievement(UUID, UUID) TO authenticated;
