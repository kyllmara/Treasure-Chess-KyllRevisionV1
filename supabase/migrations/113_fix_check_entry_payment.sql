-- ============================================================================
-- Migration 113: Fix check_needs_entry_payment to include eligibility check
-- ============================================================================
-- Adds can_attempt and error_message to prevent taking payment when user
-- has already hit their max entries limit
-- ============================================================================

-- Drop the old function first (return type is changing)
DROP FUNCTION IF EXISTS check_needs_entry_payment(UUID, UUID);

-- Updated function to check eligibility BEFORE payment
CREATE OR REPLACE FUNCTION check_needs_entry_payment(
    p_user_id UUID,
    p_challenge_id UUID
)
RETURNS TABLE (
    needs_payment BOOLEAN,
    remaining_attempts INTEGER,
    current_session_id UUID,
    can_attempt BOOLEAN,
    error_message TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
    v_challenge RECORD;
    v_latest_session RECORD;
    v_attempts_used INTEGER;
    v_user_attempt_count INTEGER;
    v_user_monthly_count INTEGER;
    v_month_start TIMESTAMPTZ;
BEGIN
    -- Get challenge details
    SELECT * INTO v_challenge FROM house_challenges WHERE id = p_challenge_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Challenge not found'::TEXT;
        RETURN;
    END IF;

    -- Check if challenge is active
    IF NOT v_challenge.is_active OR v_challenge.status != 'active' THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Challenge is not active'::TEXT;
        RETURN;
    END IF;

    -- Check start date
    IF v_challenge.start_date IS NOT NULL AND NOW() < v_challenge.start_date THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Challenge has not started yet'::TEXT;
        RETURN;
    END IF;

    -- Check end date
    IF v_challenge.end_date IS NOT NULL AND NOW() > v_challenge.end_date THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Challenge has ended'::TEXT;
        RETURN;
    END IF;

    -- Check total lifetime entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Maximum lifetime attempts reached'::TEXT;
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
            RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Maximum monthly attempts reached'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Check max total entries (global)
    IF v_challenge.max_total_entries IS NOT NULL THEN
        IF v_challenge.total_attempts >= v_challenge.max_total_entries THEN
            RETURN QUERY SELECT TRUE, 0, NULL::UUID, FALSE, 'Challenge has reached maximum entries'::TEXT;
            RETURN;
        END IF;
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

    -- If no session found or no attempts, needs payment but CAN attempt
    IF v_latest_session.entry_session_id IS NULL THEN
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, TRUE, NULL::TEXT;
        RETURN;
    END IF;

    -- Check if there are remaining attempts in the session
    v_attempts_used := v_latest_session.attempts_used;

    IF v_attempts_used < v_challenge.attempts_per_entry THEN
        -- Has remaining attempts in current session
        RETURN QUERY SELECT FALSE, (v_challenge.attempts_per_entry - v_attempts_used)::INTEGER, v_latest_session.entry_session_id, TRUE, NULL::TEXT;
    ELSE
        -- Used all attempts, needs new payment but CAN attempt
        RETURN QUERY SELECT TRUE, 0, NULL::UUID, TRUE, NULL::TEXT;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_needs_entry_payment(UUID, UUID) TO authenticated;
