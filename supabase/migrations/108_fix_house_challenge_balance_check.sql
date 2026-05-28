-- ============================================================================
-- Migration 108: Fix House Challenge Balance Check
-- ============================================================================
-- The start_house_challenge function was checking balances.available_tct
-- which tracks internal/reward TCT, NOT on-chain USDC balance.
--
-- This migration removes the database balance check since:
-- 1. The UI already verifies on-chain balance before allowing start
-- 2. House challenges should use on-chain USDC (like other wager games)
-- 3. The balances table tracks internal rewards, not on-chain funds
-- ============================================================================

-- Recreate the start_house_challenge function without balance check
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
    v_attempt_id UUID;
    v_player_color TEXT;
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

    -- Check max entries per user
    IF v_challenge.max_entries_per_user IS NOT NULL THEN
        SELECT COUNT(*) INTO v_user_attempt_count
        FROM house_challenge_attempts
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id;

        IF v_user_attempt_count >= v_challenge.max_entries_per_user THEN
            RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Maximum attempts reached for this challenge';
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

    -- NOTE: Balance check removed - UI verifies on-chain balance before starting
    -- House challenges use on-chain USDC, not database-tracked TCT balance
    -- The entry fee will be handled by the payout system (platform pays winners from vault)

    -- Determine player color
    IF v_challenge.player_color = 'random' THEN
        v_player_color := CASE WHEN random() < 0.5 THEN 'white' ELSE 'black' END;
    ELSE
        v_player_color := v_challenge.player_color;
    END IF;

    -- Create attempt record (no balance deduction - entry fee is conceptual for now)
    -- In the future, this could trigger on-chain escrow lock
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

-- Add comment explaining the change
COMMENT ON FUNCTION start_house_challenge IS 'Starts a house challenge attempt. Balance verification is done in the UI using on-chain USDC balance, not database balance.';
