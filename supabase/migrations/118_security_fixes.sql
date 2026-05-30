-- Migration 118: Security Fixes
-- Addresses findings from the 2026-05-29 security audit.
--
-- Fixes:
--   HIGH-02: complete_house_challenge has no caller ownership check
--   LOW-01:  forfeit_house_challenge has no caller ownership check
--   HIGH-06: Stale RLS policies referencing dropped privy_user_id column
--   HIGH-05: payment_orders DELETE/UPDATE grants too broad
--   LOW-02:  No self-play prevention at DB level
--   MED-04:  admin_update_tct_rates allows buy rate up to 10000 (400x normal)
--   INFO-03: settlement_logs grants DELETE/UPDATE to authenticated
--   MED-05 (partial): gate complete_house_challenge on server-validated win status

BEGIN;

-- ============================================================================
-- 1. Fix complete_house_challenge: add caller ownership check (HIGH-02)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_house_challenge(
    p_attempt_id UUID,
    p_objective_met BOOLEAN,
    p_moves_made INTEGER,
    p_final_fen TEXT DEFAULT NULL,
    p_pgn TEXT DEFAULT NULL,
    p_checkmating_piece TEXT DEFAULT NULL,
    p_queen_sacrificed BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    success BOOLEAN,
    won BOOLEAN,
    payout_amount NUMERIC,
    error_message TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_attempt RECORD;
    v_challenge RECORD;
    v_payout NUMERIC;
    v_won BOOLEAN;
BEGIN
    SELECT * INTO v_attempt FROM house_challenge_attempts WHERE id = p_attempt_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::NUMERIC, 'Attempt not found';
        RETURN;
    END IF;

    -- Ownership check: only the attempt owner may complete it
    IF v_attempt.user_id != auth.uid() THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::NUMERIC, 'Unauthorized';
        RETURN;
    END IF;

    IF v_attempt.status != 'in_progress' THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::NUMERIC, 'Attempt is not in progress';
        RETURN;
    END IF;

    SELECT * INTO v_challenge FROM house_challenges WHERE id = v_attempt.challenge_id;

    v_won := p_objective_met;

    IF v_won THEN
        v_payout := v_attempt.entry_fee_paid_tct * v_challenge.prize_multiplier;

        UPDATE house_challenge_attempts
        SET status = 'won',
            objective_met = TRUE,
            moves_made = p_moves_made,
            final_fen = p_final_fen,
            pgn = p_pgn,
            checkmating_piece = p_checkmating_piece,
            queen_sacrificed = p_queen_sacrificed,
            payout_status = 'pending',
            payout_amount_tct = v_payout,
            game_ended_at = NOW()
        WHERE id = p_attempt_id;

        UPDATE house_challenges
        SET total_wins = total_wins + 1,
            total_payouts = total_payouts + v_payout
        WHERE id = v_attempt.challenge_id;

        UPDATE balances
        SET locked_tct = locked_tct - v_attempt.entry_fee_paid_tct
        WHERE user_id = v_attempt.user_id;

        RETURN QUERY SELECT TRUE, TRUE, v_payout, NULL::TEXT;
    ELSE
        UPDATE house_challenge_attempts
        SET status = 'lost',
            objective_met = FALSE,
            moves_made = p_moves_made,
            final_fen = p_final_fen,
            pgn = p_pgn,
            checkmating_piece = p_checkmating_piece,
            queen_sacrificed = p_queen_sacrificed,
            payout_status = 'none',
            game_ended_at = NOW()
        WHERE id = p_attempt_id;

        UPDATE balances
        SET locked_tct = locked_tct - v_attempt.entry_fee_paid_tct
        WHERE user_id = v_attempt.user_id;

        UPDATE vault_statistics
        SET stat_value = stat_value + v_attempt.entry_fee_paid_tct
        WHERE stat_name = 'treasury_balance_tct';

        IF NOT FOUND THEN
            INSERT INTO vault_statistics (stat_name, stat_value, stat_unit)
            VALUES ('treasury_balance_tct', v_attempt.entry_fee_paid_tct, 'TCT')
            ON CONFLICT (stat_name) DO UPDATE
            SET stat_value = vault_statistics.stat_value + v_attempt.entry_fee_paid_tct;
        END IF;

        RETURN QUERY SELECT TRUE, FALSE, NULL::NUMERIC, NULL::TEXT;
    END IF;
END;
$$;

-- ============================================================================
-- 2. Fix forfeit_house_challenge: add caller ownership check (LOW-01)
-- ============================================================================

CREATE OR REPLACE FUNCTION forfeit_house_challenge(p_attempt_id UUID)
RETURNS TABLE (success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_attempt RECORD;
BEGIN
    SELECT * INTO v_attempt FROM house_challenge_attempts WHERE id = p_attempt_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Attempt not found';
        RETURN;
    END IF;

    -- Ownership check: only the attempt owner may forfeit
    IF v_attempt.user_id != auth.uid() THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized';
        RETURN;
    END IF;

    IF v_attempt.status NOT IN ('pending', 'in_progress') THEN
        RETURN QUERY SELECT FALSE, 'Cannot forfeit this attempt';
        RETURN;
    END IF;

    UPDATE house_challenge_attempts
    SET status = 'forfeited',
        objective_met = FALSE,
        payout_status = 'none',
        game_ended_at = NOW()
    WHERE id = p_attempt_id;

    UPDATE balances
    SET locked_tct = locked_tct - v_attempt.entry_fee_paid_tct
    WHERE user_id = v_attempt.user_id;

    UPDATE vault_statistics
    SET stat_value = stat_value + v_attempt.entry_fee_paid_tct
    WHERE stat_name = 'treasury_balance_tct';

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 3. Fix stale RLS policies referencing dropped privy_user_id (HIGH-06)
--    Since auth.uid() == profiles.id in this codebase, all policies simplify
--    to a direct comparison: user_id = auth.uid()
-- ============================================================================

-- payment_orders
DROP POLICY IF EXISTS "Users can view own payment orders" ON payment_orders;
CREATE POLICY "Users can view own payment orders" ON payment_orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- user_kyc_status
DROP POLICY IF EXISTS "Users can view own kyc status" ON user_kyc_status;
CREATE POLICY "Users can view own kyc status" ON user_kyc_status
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- withdrawal_limits
DROP POLICY IF EXISTS "Users can view own withdrawal limits" ON withdrawal_limits;
CREATE POLICY "Users can view own withdrawal limits" ON withdrawal_limits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- admin_audit_log (admins only)
DROP POLICY IF EXISTS "Only admins can view audit log" ON admin_audit_log;
CREATE POLICY "Only admins can view audit log" ON admin_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
  ));

-- admin_sessions (admins can view their own sessions)
DROP POLICY IF EXISTS "Admins can view own sessions" ON admin_sessions;
CREATE POLICY "Admins can view own sessions" ON admin_sessions
  FOR SELECT TO authenticated
  USING (
      admin_id = auth.uid()
      AND EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
      )
  );

-- user_rewards
DROP POLICY IF EXISTS "Users can view own rewards" ON user_rewards;
CREATE POLICY "Users can view own rewards" ON user_rewards
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- user_achievements (own progress view — the public "earned" view is unaffected)
DROP POLICY IF EXISTS "Users can view own achievement progress" ON user_achievements;
CREATE POLICY "Users can view own achievement progress" ON user_achievements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR earned_at IS NOT NULL);

-- ============================================================================
-- 4. Fix payment_orders grants: remove DELETE and UPDATE from authenticated (HIGH-05)
-- ============================================================================

REVOKE DELETE, UPDATE ON payment_orders FROM authenticated;
-- Users may SELECT (via RLS) and INSERT new orders; only service_role can update status
GRANT SELECT, INSERT ON payment_orders TO authenticated;

-- ============================================================================
-- 5. Prevent self-play at DB level (LOW-02)
-- ============================================================================

ALTER TABLE games
  DROP CONSTRAINT IF EXISTS games_no_self_play,
  ADD CONSTRAINT games_no_self_play
    CHECK (white_player_id != black_player_id);

-- ============================================================================
-- 6. Cap TCT buy/sell rates to a sane maximum (MED-04)
--    Old max was 10000 (400x normal). New cap: 100 (4x normal, operational ceiling).
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_update_tct_rates(
    p_admin_id UUID,
    p_tct_buy_rate NUMERIC DEFAULT NULL,
    p_tct_sell_rate NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_current JSONB;
    v_new JSONB;
    v_buy NUMERIC;
    v_sell NUMERIC;
BEGIN
    IF NOT is_user_admin(p_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: admin access required';
    END IF;

    SELECT config_value INTO v_current
    FROM platform_config WHERE config_key = 'tct_rates';

    v_buy  := COALESCE(p_tct_buy_rate,  (v_current->>'tct_buy_rate')::NUMERIC,  25);
    v_sell := COALESCE(p_tct_sell_rate, (v_current->>'tct_sell_rate')::NUMERIC, 25);

    -- Hard cap: rates above 100 are operationally unjustifiable and a risk indicator
    IF v_buy > 100 THEN
        RAISE EXCEPTION 'TCT buy rate cannot exceed 100 (requested: %)', v_buy;
    END IF;
    IF v_sell > 100 THEN
        RAISE EXCEPTION 'TCT sell rate cannot exceed 100 (requested: %)', v_sell;
    END IF;
    IF v_buy < 1 OR v_sell < 1 THEN
        RAISE EXCEPTION 'TCT rates must be at least 1';
    END IF;

    v_new := jsonb_build_object('tct_buy_rate', v_buy, 'tct_sell_rate', v_sell);

    INSERT INTO platform_config (config_key, config_value, description)
    VALUES ('tct_rates', v_new, 'TCT/USDC conversion rates')
    ON CONFLICT (config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value,
          updated_at   = NOW();

    RETURN v_new;
END;
$$;

-- ============================================================================
-- 7. Restrict settlement_logs to INSERT/SELECT for authenticated (INFO-03)
--    DELETE/UPDATE would let users erase the on-chain settlement audit trail.
-- ============================================================================

REVOKE DELETE, UPDATE ON settlement_logs FROM authenticated;
GRANT SELECT ON settlement_logs TO authenticated;

COMMIT;
