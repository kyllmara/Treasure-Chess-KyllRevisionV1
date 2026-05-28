-- ============================================================================
-- Migration 114: Fix payout calculation for multi-attempt sessions
-- ============================================================================
-- BUG: Payout was calculated as entry_fee_paid_tct * multiplier
-- But entry_fee_paid_tct is 0 for 2nd/3rd attempts in a session!
-- FIX: Use challenge.entry_fee_tct for payout calculation
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

    IF v_attempt.status != 'in_progress' THEN
        RETURN QUERY SELECT FALSE, FALSE, NULL::NUMERIC, 'Attempt is not in progress';
        RETURN;
    END IF;

    SELECT * INTO v_challenge FROM house_challenges WHERE id = v_attempt.challenge_id;

    v_won := p_objective_met;

    IF v_won THEN
        -- Calculate payout using CHALLENGE entry fee (not attempt's recorded fee)
        -- This fixes the bug where 2nd/3rd attempts in a session had 0 payout
        v_payout := v_challenge.entry_fee_tct * v_challenge.prize_multiplier;

        -- Update attempt as won with pending payout
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

        -- Update challenge stats
        UPDATE house_challenges
        SET total_wins = total_wins + 1,
            total_payouts = total_payouts + v_payout
        WHERE id = v_attempt.challenge_id;

        RETURN QUERY SELECT TRUE, TRUE, v_payout, NULL::TEXT;
    ELSE
        -- Player lost
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

        RETURN QUERY SELECT TRUE, FALSE, NULL::NUMERIC, NULL::TEXT;
    END IF;
END;
$$;

COMMENT ON FUNCTION complete_house_challenge IS 'Completes a house challenge. Payout = challenge.entry_fee * multiplier (fixed for multi-attempt sessions)';
