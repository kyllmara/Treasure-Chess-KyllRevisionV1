-- ============================================================================
-- Migration 111: Add monthly limits to house challenges
-- ============================================================================
-- Adds max_entries_per_user_per_month column for monthly attempt resets
-- ============================================================================

-- Add new column for monthly limits
ALTER TABLE house_challenges
ADD COLUMN IF NOT EXISTS max_entries_per_user_per_month INTEGER;

-- Comment explaining the columns
COMMENT ON COLUMN house_challenges.max_entries_per_user IS 'Total lifetime attempts per user (NULL = unlimited)';
COMMENT ON COLUMN house_challenges.max_entries_per_user_per_month IS 'Monthly attempts per user that resets each month (NULL = unlimited)';
COMMENT ON COLUMN house_challenges.max_total_entries IS 'Total attempts across all users (NULL = unlimited)';

-- Update start_house_challenge to check monthly limits
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
    v_user_attempt_count INTEGER;
    v_user_monthly_count INTEGER;
    v_attempt_id UUID;
    v_player_color TEXT;
    v_month_start TIMESTAMPTZ;
BEGIN
    -- Lock and fetch challenge
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge not found';
        RETURN;
    END IF;

    -- Check if challenge is active
    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge is not active';
        RETURN;
    END IF;

    -- Check start date
    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has not started yet';
        RETURN;
    END IF;

    -- Check end date
    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has ended';
        RETURN;
    END IF;

    -- Check total lifetime entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum lifetime attempts reached for this challenge';
            RETURN;
        END IF;
    END IF;

    -- Check monthly entries per user
    IF v_challenge.max_entries_per_user_per_month IS NOT NULL THEN
        v_month_start := date_trunc('month', NOW());

        SELECT COUNT(*) INTO v_user_monthly_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id
          AND challenge_id = p_challenge_id
          AND created_at >= v_month_start;

        IF v_user_monthly_count >= v_challenge.max_entries_per_user_per_month THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum monthly attempts reached. Resets next month.';
            RETURN;
        END IF;
    END IF;

    -- Check max total entries
    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has reached maximum total entries';
            RETURN;
        END IF;
    END IF;

    -- Determine player color
    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    -- Create attempt record
    INSERT INTO house_challenge_attempts (
        challenge_id, user_id, entry_fee_paid_tct, status, player_color, game_started_at
    ) VALUES (
        p_challenge_id, p_user_id, v_challenge.entry_fee_tct, 'in_progress', v_player_color, NOW()
    ) RETURNING id INTO v_attempt_id;

    -- Update challenge stats
    UPDATE house_challenges
    SET total_attempts = total_attempts + 1,
        total_entry_fees_collected = total_entry_fees_collected + v_challenge.entry_fee_tct
    WHERE id = p_challenge_id;

    RETURN QUERY SELECT TRUE, v_attempt_id, v_player_color, NULL::TEXT;
END;
$$;

-- Helper function to get user's monthly attempt count
CREATE OR REPLACE FUNCTION get_user_house_challenge_monthly_attempts(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
    v_count INTEGER;
    v_month_start TIMESTAMPTZ;
BEGIN
    v_month_start := date_trunc('month', NOW());

    SELECT COUNT(*) INTO v_count
    FROM house_challenge_attempts
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND created_at >= v_month_start;

    RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_house_challenge_monthly_attempts(UUID, UUID) TO authenticated;
