-- ============================================================================
-- Migration 112: Attempts Per Entry Fee
-- ============================================================================
-- One entry fee payment covers multiple attempts (e.g., pay once, get 3 tries)
-- ============================================================================

-- Add attempts_per_entry column (how many attempts per payment)
ALTER TABLE house_challenges
ADD COLUMN IF NOT EXISTS attempts_per_entry INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN house_challenges.attempts_per_entry IS 'Number of attempts included per entry fee payment (e.g., 3 = pay once, get 3 tries)';

-- Add entry_session tracking to attempts table
ALTER TABLE house_challenge_attempts
ADD COLUMN IF NOT EXISTS entry_session_id UUID;

ALTER TABLE house_challenge_attempts
ADD COLUMN IF NOT EXISTS attempt_number_in_session INTEGER DEFAULT 1;

COMMENT ON COLUMN house_challenge_attempts.entry_session_id IS 'Groups attempts that share the same entry fee payment';
COMMENT ON COLUMN house_challenge_attempts.attempt_number_in_session IS 'Which attempt this is within the paid session (1, 2, 3, etc.)';

-- Function to check if user needs to pay for a new attempt
CREATE OR REPLACE FUNCTION check_needs_entry_payment(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS TABLE (
    needs_payment BOOLEAN,
    remaining_attempts INTEGER,
    current_session_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
    v_challenge RECORD;
    v_latest_session RECORD;
    v_attempts_used INTEGER;
BEGIN
    -- Get challenge details
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID;
        RETURN;
    END IF;

    -- Find the latest entry session for this user/challenge
    SELECT
        entry_session_id,
        COUNT(*) as attempts_used
    INTO v_latest_session
    FROM house_challenge_attempts
    WHERE user_id = p_user_id
      AND challenge_id = p_challenge_id
      AND entry_session_id IS NOT NULL
      AND status IN ('lost', 'forfeited', 'in_progress')  -- Only count non-winning attempts
    GROUP BY entry_session_id
    ORDER BY MAX(created_at) DESC
    LIMIT 1;

    -- If no session found or no attempts, needs payment
    IF v_latest_session.entry_session_id IS NULL THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID;
        RETURN;
    END IF;

    -- Check if there are remaining attempts in the session
    v_attempts_used := v_latest_session.attempts_used;

    IF v_attempts_used < v_challenge.attempts_per_entry THEN
        -- Has remaining attempts in current session
        RETURN QUERY SELECT FALSE, (v_challenge.attempts_per_entry - v_attempts_used)::INTEGER, v_latest_session.entry_session_id;
    ELSE
        -- Used all attempts, needs new payment
        RETURN QUERY SELECT TRUE, 0, NULL::UUID;
    END IF;
END;
$$;

-- Updated start_house_challenge to handle entry sessions
CREATE OR REPLACE FUNCTION start_house_challenge(
    p_user_id UUID,
    p_challenge_id UUID,
    p_entry_session_id UUID DEFAULT NULL  -- Pass existing session if continuing
)
RETURNS TABLE (
    success BOOLEAN,
    attempt_id UUID,
    player_color TEXT,
    error_message TEXT,
    new_entry_session_id UUID,
    attempt_number INTEGER,
    attempts_remaining INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_challenge RECORD;
    v_user_attempt_count INTEGER;
    v_user_monthly_count INTEGER;
    v_attempt_id UUID;
    v_player_color TEXT;
    v_month_start TIMESTAMPTZ;
    v_session_id UUID;
    v_attempt_num INTEGER;
    v_session_attempts INTEGER;
BEGIN
    -- Lock and fetch challenge
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge not found', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check if challenge is active
    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge is not active', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check start date
    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has not started yet', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check end date
    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has ended', NULL::UUID, 0, 0;
        RETURN;
    END IF;

    -- Check total lifetime entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum lifetime attempts reached', NULL::UUID, 0, 0;
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
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum monthly attempts reached', NULL::UUID, 0, 0;
            RETURN;
        END IF;
    END IF;

    -- Check max total entries
    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Challenge has reached maximum entries', NULL::UUID, 0, 0;
            RETURN;
        END IF;
    END IF;

    -- Handle entry session
    IF p_entry_session_id IS NOT NULL THEN
        -- Continuing existing session
        v_session_id := p_entry_session_id;

        -- Count attempts in this session
        SELECT COUNT(*) INTO v_session_attempts
        FROM house_challenge_attempts
        WHERE entry_session_id = v_session_id;

        IF v_session_attempts >= v_challenge.attempts_per_entry THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'No attempts remaining in this session', NULL::UUID, 0, 0;
            RETURN;
        END IF;

        v_attempt_num := v_session_attempts + 1;
    ELSE
        -- New session (new payment)
        v_session_id := gen_random_uuid();
        v_attempt_num := 1;
    END IF;

    -- Determine player color
    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    -- Create attempt record
    INSERT INTO house_challenge_attempts (
        challenge_id, user_id, entry_fee_paid_tct, status, player_color,
        game_started_at, entry_session_id, attempt_number_in_session
    ) VALUES (
        p_challenge_id, p_user_id,
        CASE WHEN v_attempt_num = 1 THEN v_challenge.entry_fee_tct ELSE 0 END,  -- Only first attempt in session has fee
        'in_progress', v_player_color, NOW(),
        v_session_id, v_attempt_num
    ) RETURNING id INTO v_attempt_id;

    -- Update challenge stats (only count unique entry sessions for fee collection)
    IF v_attempt_num = 1 THEN
        UPDATE house_challenges
        SET total_attempts = total_attempts + 1,
            total_entry_fees_collected = total_entry_fees_collected + v_challenge.entry_fee_tct
        WHERE id = p_challenge_id;
    ELSE
        UPDATE house_challenges
        SET total_attempts = total_attempts + 1
        WHERE id = p_challenge_id;
    END IF;

    RETURN QUERY SELECT
        TRUE,
        v_attempt_id,
        v_player_color,
        NULL::TEXT,
        v_session_id,
        v_attempt_num,
        (v_challenge.attempts_per_entry - v_attempt_num)::INTEGER;
END;
$$;

GRANT EXECUTE ON FUNCTION check_needs_entry_payment(UUID, UUID) TO authenticated;
