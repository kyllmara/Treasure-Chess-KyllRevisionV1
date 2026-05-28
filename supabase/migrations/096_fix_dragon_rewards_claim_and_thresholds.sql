-- ============================================================================
-- Migration 096: Fix Dragon Rewards - Claim, Auto-Unlock, Thresholds
--
-- Fixes:
-- 1. claim_dragon_reward() now credits balances.available_tct (not profiles.wallet_balance)
-- 2. Removes platform_reward_pool dependency (never existed)
-- 3. Inserts a transactions record for audit trail
-- 4. get_user_reward_progress() now auto-unlocks rewards when criteria are met
-- 5. Increases thresholds (~2-3x harder)
-- 6. Increases TCT reward amounts to compensate
-- 7. Adds flavor text descriptions
-- ============================================================================

-- ============================================================================
-- 1. Add 'reward_payout' to transaction_type enum
-- ============================================================================

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
-- 2. Fix claim_dragon_reward() - credit balances table, add transaction record
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
-- 3. Fix get_user_reward_progress() - auto-unlock rewards when criteria met
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

  -- ========================================================================
  -- Auto-unlock: set unlocked_at on any user_rewards row where the user
  -- has met the criteria but unlocked_at is still NULL.
  -- First, ensure user_rewards rows exist for all active rewards.
  -- ========================================================================

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
-- 4. Update thresholds, descriptions, and TCT amounts
-- ============================================================================

-- Baby Dragons: games_played — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 10,  tct_reward = 0,   description = 'Hatchling steps — play your first 10 games'                WHERE name = 'Baby Dragon I'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 30,  tct_reward = 0,   description = 'Finding your wings — play 30 games'                          WHERE name = 'Baby Dragon II'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 75,  tct_reward = 0,   description = 'Battle-tested hatchling — play 75 games'                     WHERE name = 'Baby Dragon III'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 150, tct_reward = 8,   description = 'Scales hardening — survive 150 games on the board'            WHERE name = 'Baby Dragon IV'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 250, tct_reward = 8,   description = 'Rising from the ashes — endure 250 games'                    WHERE name = 'Baby Dragon V'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 400, tct_reward = 15,  description = 'Fireproof — 400 games and still breathing'                   WHERE name = 'Baby Dragon VI'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 600, tct_reward = 25,  description = 'Dragon''s endurance — forge through 600 games'               WHERE name = 'Baby Dragon VII'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 900, tct_reward = 35,  description = 'Ancient persistence — 900 games played'                      WHERE name = 'Baby Dragon VIII' AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 1500, tct_reward = 100, description = 'Eternal flame — 1,500 games, a true dragon of the board'    WHERE name = 'Baby Dragon IX'   AND reward_type = 'dragon_avatar';

-- Teenage Dragons: total_wins — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 5,    tct_reward = 0,   description = 'First taste of victory — win 5 games'                      WHERE name = 'Teenage Dragon I'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 20,   tct_reward = 0,   description = 'Sharpening your claws — win 20 games'                      WHERE name = 'Teenage Dragon II'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 50,   tct_reward = 0,   description = 'Predator instinct — 50 victories claimed'                  WHERE name = 'Teenage Dragon III'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 100,  tct_reward = 8,   description = 'Triple-digit terror — 100 wins on the board'               WHERE name = 'Teenage Dragon IV'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 175,  tct_reward = 15,  description = 'Fear the flame — 175 victories and counting'               WHERE name = 'Teenage Dragon V'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 275,  tct_reward = 25,  description = 'Apex hunter — 275 wins, your name echoes in the arena'     WHERE name = 'Teenage Dragon VI'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 400,  tct_reward = 35,  description = 'Dragonlord rising — 400 victories forged in battle'        WHERE name = 'Teenage Dragon VII'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 600,  tct_reward = 50,  description = 'Unstoppable force — 600 wins, a living legend'             WHERE name = 'Teenage Dragon VIII' AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 1000, tct_reward = 100, description = 'Thousand-win dragon — a mythic champion of the board'      WHERE name = 'Teenage Dragon IX'   AND reward_type = 'dragon_avatar';

-- Adult Dragons: challenges_completed — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 3,   tct_reward = 0,   description = 'Accept the call — complete 3 challenges'                    WHERE name = 'Adult Dragon I'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 8,   tct_reward = 0,   description = 'Challenger''s resolve — conquer 8 challenges'               WHERE name = 'Adult Dragon II'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 15,  tct_reward = 8,   description = 'Proving grounds — 15 challenges defeated'                   WHERE name = 'Adult Dragon III'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 25,  tct_reward = 8,   description = 'Trial by fire — overcome 25 challenges'                     WHERE name = 'Adult Dragon IV'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 40,  tct_reward = 15,  description = 'Gauntlet runner — 40 challenges conquered'                  WHERE name = 'Adult Dragon V'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 60,  tct_reward = 25,  description = 'Challenge devourer — 60 foes bested in personal combat'     WHERE name = 'Adult Dragon VI'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 85,  tct_reward = 35,  description = 'Unbroken will — 85 challenges in the rearview'              WHERE name = 'Adult Dragon VII'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 120, tct_reward = 50,  description = 'Legendary challenger — 120 rivals humbled'                  WHERE name = 'Adult Dragon VIII' AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 200, tct_reward = 100, description = 'Challenge incarnate — 200 completed, none can stand'        WHERE name = 'Adult Dragon IX'   AND reward_type = 'dragon_avatar';

-- Fierce Dragons: tournaments — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 3,  tct_reward = 0,   description = 'Into the arena — enter 3 tournaments'                        WHERE name = 'Fierce Dragon I'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 8,  tct_reward = 8,   description = 'Tournament regular — battle through 8 tournaments'            WHERE name = 'Fierce Dragon II'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 15, tct_reward = 15,  description = 'Arena veteran — 15 tournaments on the record'                 WHERE name = 'Fierce Dragon III'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 30, tct_reward = 35,  description = 'Tournament dragon — 30 events, a feared competitor'           WHERE name = 'Fierce Dragon IV'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 3,  tct_reward = 40,  description = 'Crown collector — win 3 tournaments'                          WHERE name = 'Fierce Dragon V'    AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 6,  tct_reward = 60,  description = 'Dynasty builder — 6 tournament victories'                     WHERE name = 'Fierce Dragon VI'   AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 10, tct_reward = 125, description = 'Unrivaled champion — 10 tournament crowns'                    WHERE name = 'Fierce Dragon VII'  AND reward_type = 'dragon_avatar';
UPDATE rewards SET criteria_value = 20, tct_reward = 200, description = 'Eternal champion — 20 tournament victories, a dragon of legend' WHERE name = 'Fierce Dragon VIII' AND reward_type = 'dragon_avatar';

-- TCT Bonus: win_streak — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 5,  tct_reward = 15,  description = 'Hot streak — blaze through 5 wins in a row'                  WHERE name = '3-Win Streak'  AND reward_type = 'tct_bonus';
UPDATE rewards SET name = '5-Win Streak',  criteria_value = 8,  tct_reward = 40,  description = 'Inferno run — 8 consecutive victories'                         WHERE name = '5-Win Streak'  AND reward_type = 'tct_bonus';
UPDATE rewards SET name = '10-Win Streak', criteria_value = 15, tct_reward = 125, description = 'Unstoppable blaze — 15 wins without defeat'                    WHERE name = '10-Win Streak' AND reward_type = 'tct_bonus';

-- Fix the 3-Win Streak name to reflect new threshold
UPDATE rewards SET name = '5-Win Streak' WHERE name = '3-Win Streak' AND reward_type = 'tct_bonus';
UPDATE rewards SET name = '8-Win Streak' WHERE name = '5-Win Streak' AND criteria_value = 8 AND reward_type = 'tct_bonus';
UPDATE rewards SET name = '15-Win Streak' WHERE name = '10-Win Streak' AND criteria_value = 15 AND reward_type = 'tct_bonus';

-- TCT Bonus: elo_rating — same thresholds, slightly more TCT, flavor text
UPDATE rewards SET tct_reward = 20,  description = 'Rising star — reach ELO 1200'                                     WHERE name = 'ELO 1200' AND reward_type = 'tct_bonus';
UPDATE rewards SET tct_reward = 45,  description = 'Serious contender — reach ELO 1400'                               WHERE name = 'ELO 1400' AND reward_type = 'tct_bonus';
UPDATE rewards SET tct_reward = 75,  description = 'Elite player — reach ELO 1600'                                    WHERE name = 'ELO 1600' AND reward_type = 'tct_bonus';
UPDATE rewards SET tct_reward = 150, description = 'Grandmaster dragon — reach ELO 1800'                              WHERE name = 'ELO 1800' AND reward_type = 'tct_bonus';

-- TCT Bonus: total_earnings — harder thresholds, more TCT, flavor text
UPDATE rewards SET criteria_value = 250,   tct_reward = 15,  description = 'First hoard — earn 250 TCT from gameplay'                WHERE name = 'Earned 100 TCT'   AND reward_type = 'tct_bonus';
UPDATE rewards SET criteria_value = 1500,  tct_reward = 40,  description = 'Growing treasury — earn 1,500 TCT from gameplay'         WHERE name = 'Earned 500 TCT'   AND reward_type = 'tct_bonus';
UPDATE rewards SET criteria_value = 3500,  tct_reward = 75,  description = 'Dragon''s vault — earn 3,500 TCT from gameplay'          WHERE name = 'Earned 1000 TCT'  AND reward_type = 'tct_bonus';
UPDATE rewards SET criteria_value = 10000, tct_reward = 150, description = 'Treasure mountain — earn 10,000 TCT from gameplay'       WHERE name = 'Earned 5000 TCT'  AND reward_type = 'tct_bonus';
UPDATE rewards SET criteria_value = 25000, tct_reward = 400, description = 'Legendary hoard — earn 25,000 TCT from the battlefield'  WHERE name = 'Earned 10000 TCT' AND reward_type = 'tct_bonus';

-- Fix earnings reward names to reflect new thresholds
UPDATE rewards SET name = 'Earned 250 TCT'   WHERE name = 'Earned 100 TCT'   AND reward_type = 'tct_bonus';
UPDATE rewards SET name = 'Earned 1500 TCT'  WHERE name = 'Earned 500 TCT'   AND reward_type = 'tct_bonus';
UPDATE rewards SET name = 'Earned 3500 TCT'  WHERE name = 'Earned 1000 TCT'  AND reward_type = 'tct_bonus';
UPDATE rewards SET name = 'Earned 10000 TCT' WHERE name = 'Earned 5000 TCT'  AND reward_type = 'tct_bonus';
UPDATE rewards SET name = 'Earned 25000 TCT' WHERE name = 'Earned 10000 TCT' AND reward_type = 'tct_bonus';

-- ============================================================================
-- 5. Re-grant permissions (in case CREATE OR REPLACE changed them)
-- ============================================================================

GRANT EXECUTE ON FUNCTION claim_dragon_reward(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_reward_progress(UUID) TO authenticated;
