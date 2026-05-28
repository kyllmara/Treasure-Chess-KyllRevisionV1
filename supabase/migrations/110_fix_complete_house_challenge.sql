-- ============================================================================
-- Migration 110: Fix complete_house_challenge for on-chain payments
-- ============================================================================
-- Since house challenges now use on-chain USDC payments (gasless via permit),
-- we should NOT manipulate balances.locked_tct or vault_statistics.
-- The entry fee goes directly to the platform vault on-chain.
-- Winners get paid from the vault via process-house-payout edge function.
-- ============================================================================

-- Recreate complete_house_challenge without locked_tct manipulation
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
        -- Calculate payout (2x entry fee)
        v_payout := v_attempt.entry_fee_paid_tct * v_challenge.prize_multiplier;

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

        -- NOTE: locked_tct NOT updated - entry fee was paid on-chain, not from DB balance
        -- Payout will be processed by process-house-payout edge function

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

        -- NOTE: locked_tct NOT updated - entry fee was paid on-chain
        -- NOTE: vault_statistics NOT updated - entry fee already in vault on-chain

        RETURN QUERY SELECT TRUE, FALSE, NULL::NUMERIC, NULL::TEXT;
    END IF;
END;
$$;

-- Also fix forfeit_house_challenge
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

    -- NOTE: locked_tct NOT updated - entry fee was paid on-chain
    -- Entry fee is non-refundable on forfeit (already in vault)

    RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

-- Add comments
COMMENT ON FUNCTION complete_house_challenge IS 'Completes a house challenge. Entry fees are paid on-chain, so no database balance manipulation needed.';
COMMENT ON FUNCTION forfeit_house_challenge IS 'Forfeits a house challenge. Entry fee is non-refundable as it was paid on-chain to vault.';
