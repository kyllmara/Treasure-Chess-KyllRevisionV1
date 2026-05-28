-- ============================================================================
-- Migration 106: House Challenges System
-- ============================================================================
-- Creates the House Challenges system where:
-- - Users pay entry fee to attempt platform challenges
-- - Win conditions are tracked during gameplay against AI
-- - Winners receive 2x their entry fee via on-chain USDC transfer
-- - Admins can create/manage challenges via admin panel
-- ============================================================================

-- Cleanup any partially applied objects (defensive)
DO $$ BEGIN
    -- Drop tables first (cascades to policies)
    DROP TABLE IF EXISTS house_challenge_attempts CASCADE;
    DROP TABLE IF EXISTS house_challenges CASCADE;

    -- Drop functions
    DROP FUNCTION IF EXISTS start_house_challenge(UUID, UUID) CASCADE;
    DROP FUNCTION IF EXISTS complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS forfeit_house_challenge(UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_user_house_challenge_attempts(UUID, UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_active_house_challenges(UUID) CASCADE;
    DROP FUNCTION IF EXISTS update_house_challenge_updated_at() CASCADE;
    DROP FUNCTION IF EXISTS update_house_attempt_updated_at() CASCADE;

    -- Drop types
    DROP TYPE IF EXISTS house_challenge_status CASCADE;
    DROP TYPE IF EXISTS house_challenge_attempt_status CASCADE;
    DROP TYPE IF EXISTS house_payout_status CASCADE;
    DROP TYPE IF EXISTS ai_difficulty_level CASCADE;
END $$;

-- ============================================================================
-- Now recreate everything correctly
-- ============================================================================

-- SECTION 1: Enums
DO $$ BEGIN
    CREATE TYPE house_challenge_status AS ENUM (
        'active', 'paused', 'ended', 'archived'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE house_challenge_attempt_status AS ENUM (
        'pending', 'in_progress', 'won', 'lost', 'forfeited', 'expired'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE house_payout_status AS ENUM (
        'none', 'pending', 'processing', 'completed', 'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ai_difficulty_level AS ENUM (
        'beginner', 'easy', 'medium', 'hard', 'expert'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SECTION 2: House Challenges Table
CREATE TABLE IF NOT EXISTS house_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    entry_fee_tct NUMERIC(15, 2) NOT NULL DEFAULT 0,
    prize_multiplier NUMERIC(4, 2) NOT NULL DEFAULT 2.0,
    difficulty TEXT NOT NULL DEFAULT 'Medium',
    ai_difficulty ai_difficulty_level NOT NULL DEFAULT 'medium',
    time_limit_seconds INTEGER NOT NULL DEFAULT 300,
    player_color TEXT NOT NULL DEFAULT 'white' CHECK (player_color IN ('white', 'black', 'random')),
    objective_type challenge_objective_type NOT NULL,
    objective_value TEXT NOT NULL,
    max_entries_per_user INTEGER,
    max_total_entries INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status house_challenge_status NOT NULL DEFAULT 'active',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0,
    total_entry_fees_collected NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_payouts NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_house_challenges_active ON house_challenges(is_active, status) WHERE is_active = TRUE AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_house_challenges_difficulty ON house_challenges(difficulty);
CREATE INDEX IF NOT EXISTS idx_house_challenges_dates ON house_challenges(start_date, end_date);

-- SECTION 3: House Challenge Attempts Table
CREATE TABLE IF NOT EXISTS house_challenge_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES house_challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_fee_paid_tct NUMERIC(15, 2) NOT NULL,
    status house_challenge_attempt_status NOT NULL DEFAULT 'pending',
    player_color TEXT NOT NULL DEFAULT 'white' CHECK (player_color IN ('white', 'black')),
    moves_made INTEGER NOT NULL DEFAULT 0,
    final_fen TEXT,
    pgn TEXT,
    objective_met BOOLEAN,
    checkmating_piece TEXT,
    queen_sacrificed BOOLEAN DEFAULT FALSE,
    payout_status house_payout_status NOT NULL DEFAULT 'none',
    payout_amount_tct NUMERIC(15, 2),
    payout_tx_hash TEXT,
    payout_error TEXT,
    game_started_at TIMESTAMPTZ,
    game_ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_house_attempts_user ON house_challenge_attempts(user_id, challenge_id);
CREATE INDEX IF NOT EXISTS idx_house_attempts_challenge ON house_challenge_attempts(challenge_id, status);
CREATE INDEX IF NOT EXISTS idx_house_attempts_payout_pending ON house_challenge_attempts(payout_status) WHERE payout_status = 'pending';

-- SECTION 4: Updated At Triggers
CREATE OR REPLACE FUNCTION update_house_challenge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_house_challenge_updated_at ON house_challenges;
CREATE TRIGGER trg_house_challenge_updated_at
    BEFORE UPDATE ON house_challenges
    FOR EACH ROW EXECUTE FUNCTION update_house_challenge_updated_at();

CREATE OR REPLACE FUNCTION update_house_attempt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_house_attempt_updated_at ON house_challenge_attempts;
CREATE TRIGGER trg_house_attempt_updated_at
    BEFORE UPDATE ON house_challenge_attempts
    FOR EACH ROW EXECUTE FUNCTION update_house_attempt_updated_at();

-- SECTION 5: Start House Challenge Function
CREATE OR REPLACE FUNCTION start_house_challenge(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS TABLE (
    success BOOLEAN,
    attempt_id UUID,
    player_color TEXT,
    error_message TEXT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_challenge RECORD;
    v_user_balance NUMERIC;
    v_user_attempt_count INTEGER;
    v_attempt_id UUID;
    v_player_color TEXT;
BEGIN
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge not found';
        RETURN;
    END IF;

    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge is not active';
        RETURN;
    END IF;

    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has not started yet';
        RETURN;
    END IF;

    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has ended';
        RETURN;
    END IF;

    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum attempts reached for this challenge';
            RETURN;
        END IF;
    END IF;

    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has reached maximum total entries';
            RETURN;
        END IF;
    END IF;

    SELECT available_tct INTO v_user_balance FROM balances WHERE user_id = p_user_id;

    IF v_user_balance IS NULL OR v_user_balance < v_challenge.entry_fee_tct THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Insufficient balance';
        RETURN;
    END IF;

    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    UPDATE balances
    SET available_tct = available_tct - v_challenge.entry_fee_tct,
        locked_tct = locked_tct + v_challenge.entry_fee_tct
    WHERE user_id = p_user_id;

    INSERT INTO house_challenge_attempts (
        challenge_id, user_id, entry_fee_paid_tct, status, player_color, game_started_at
    ) VALUES (
        p_challenge_id, p_user_id, v_challenge.entry_fee_tct, 'in_progress', v_player_color, NOW()
    ) RETURNING id INTO v_attempt_id;

    UPDATE house_challenges
    SET total_attempts = total_attempts + 1,
        total_entry_fees_collected = total_entry_fees_collected + v_challenge.entry_fee_tct
    WHERE id = p_challenge_id;

    RETURN QUERY SELECT TRUE, v_attempt_id, v_player_color, NULL::TEXT;
END;
$$;

-- SECTION 6: Complete House Challenge Function
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

-- SECTION 7: Forfeit House Challenge Function
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

-- SECTION 8: Get User Attempt Count Function
CREATE OR REPLACE FUNCTION get_user_house_challenge_attempts(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM house_challenge_attempts
    WHERE user_id = p_user_id AND challenge_id = p_challenge_id;
    RETURN v_count;
END;
$$;

-- SECTION 9: Get Active House Challenges Function
CREATE OR REPLACE FUNCTION get_active_house_challenges(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    entry_fee_tct NUMERIC,
    prize_multiplier NUMERIC,
    difficulty TEXT,
    ai_difficulty ai_difficulty_level,
    time_limit_seconds INTEGER,
    player_color TEXT,
    objective_type challenge_objective_type,
    objective_value TEXT,
    max_entries_per_user INTEGER,
    total_attempts INTEGER,
    total_wins INTEGER,
    user_attempts INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
    RETURN QUERY
    SELECT
        hc.id,
        hc.name,
        hc.description,
        hc.entry_fee_tct,
        hc.prize_multiplier,
        hc.difficulty,
        hc.ai_difficulty,
        hc.time_limit_seconds,
        hc.player_color,
        hc.objective_type,
        hc.objective_value,
        hc.max_entries_per_user,
        hc.total_attempts,
        hc.total_wins,
        COALESCE(
            (SELECT COUNT(*)::INTEGER
             FROM house_challenge_attempts a
             WHERE a.challenge_id = hc.id AND a.user_id = p_user_id),
            0
        ) AS user_attempts
    FROM house_challenges hc
    WHERE hc.is_active = TRUE
    AND hc.status = 'active'
    AND (hc.start_date IS NULL OR NOW() >= hc.start_date)
    AND (hc.end_date IS NULL OR NOW() <= hc.end_date)
    ORDER BY hc.entry_fee_tct ASC, hc.created_at DESC;
END;
$$;

-- SECTION 10: Row Level Security
ALTER TABLE house_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_challenge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active house challenges"
    ON house_challenges FOR SELECT
    USING (is_active = TRUE AND status = 'active');

CREATE POLICY "Admins can view all house challenges"
    ON house_challenges FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (is_admin = TRUE OR is_super_admin = TRUE)
        )
    );

CREATE POLICY "Admins can create house challenges"
    ON house_challenges FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (is_admin = TRUE OR is_super_admin = TRUE)
        )
    );

CREATE POLICY "Admins can update house challenges"
    ON house_challenges FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (is_admin = TRUE OR is_super_admin = TRUE)
        )
    );

CREATE POLICY "Users can view own house challenge attempts"
    ON house_challenge_attempts FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all house challenge attempts"
    ON house_challenge_attempts FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND (is_admin = TRUE OR is_super_admin = TRUE)
        )
    );

-- SECTION 11: Grant Permissions
GRANT EXECUTE ON FUNCTION start_house_challenge(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION forfeit_house_challenge(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_house_challenge_attempts(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_house_challenges(UUID) TO authenticated;
GRANT ALL ON house_challenges TO service_role;
GRANT ALL ON house_challenge_attempts TO service_role;
GRANT SELECT ON house_challenges TO authenticated;
GRANT SELECT, INSERT ON house_challenge_attempts TO authenticated;

-- SECTION 12: Seed Initial House Challenges
INSERT INTO house_challenges (
    name, description, entry_fee_tct, prize_multiplier, difficulty, ai_difficulty,
    time_limit_seconds, player_color, objective_type, objective_value,
    max_entries_per_user, is_active
) VALUES
    ('Scholar''s Mate', 'Checkmate opponent in 4 or less moves', 625, 2.0, 'Medium', 'medium',
     120, 'white', 'checkmate_in_moves', '4', 3, true),
    ('King Pawn', 'Checkmate opponent using your pawn', 1250, 2.0, 'Hard', 'hard',
     600, 'white', 'checkmate_with_piece', 'p', 3, true),
    ('Fool''s Mate', 'Checkmate opponent in 2 moves as Black', 2500, 2.0, 'Expert', 'expert',
     60, 'black', 'checkmate_in_moves', '2', 3, true),
    ('Smothered Mate', 'Checkmate opponent using your knight', 1250, 2.0, 'Hard', 'hard',
     600, 'white', 'checkmate_with_piece', 'n', 3, true),
    ('Legal''s Mate', 'Checkmate opponent by sacrificing your queen', 3750, 2.0, 'Expert', 'expert',
     600, 'white', 'sacrifice_queen', 'q', 3, true)
ON CONFLICT DO NOTHING;
