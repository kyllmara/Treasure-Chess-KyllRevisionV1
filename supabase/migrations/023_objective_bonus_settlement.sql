-- ============================================================================
-- Migration 010: Wire Objective Bonus into Settlement
-- ============================================================================
-- This migration updates the settle_escrow_with_rake function to include
-- objective bonus calculation for House challenges
-- ============================================================================

-- Drop the old function to recreate with objective bonus support
DROP FUNCTION IF EXISTS settle_escrow_with_rake(UUID, UUID, TEXT);

-- Recreate settle_escrow_with_rake with objective bonus support
CREATE OR REPLACE FUNCTION settle_escrow_with_rake(
    p_game_id UUID,
    p_winner_id UUID,  -- NULL for draw
    p_reason TEXT DEFAULT 'checkmate'
)
RETURNS TABLE (
    escrow_id UUID,
    winner_payout NUMERIC,
    loser_refund NUMERIC,
    rake_amount NUMERIC,
    treasury_amount NUMERIC,
    reward_pool_amount NUMERIC,
    is_draw BOOLEAN,
    ledger_transaction_id UUID,
    objective_bonus_multiplier NUMERIC,
    bonus_payout NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_escrow RECORD;
    v_winner_payout NUMERIC;
    v_rake_amount NUMERIC := 0;
    v_treasury_amount NUMERIC := 0;
    v_reward_pool_amount NUMERIC := 0;
    v_loser_id UUID;
    v_is_draw BOOLEAN := FALSE;
    v_winner_current_available NUMERIC;
    v_loser_current_available NUMERIC;
    v_settings JSONB;
    v_rake_percentage NUMERIC;
    v_ledger_tx_id UUID;
    v_winner_stake NUMERIC;
    v_loser_stake NUMERIC;
    v_challenge_id UUID;
    v_objective_multiplier NUMERIC := 1.0;
    v_bonus_payout NUMERIC := 0;
    v_base_payout NUMERIC;
BEGIN
    -- Get rake settings
    v_settings := get_rake_settings();
    v_rake_percentage := (v_settings->>'rake_percentage')::NUMERIC;

    -- Get escrow with row lock
    SELECT * INTO v_escrow
    FROM game_escrows
    WHERE game_escrows.game_id = p_game_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
    END IF;

    IF v_escrow.status != 'active' THEN
        RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
    END IF;

    -- Check if this game is associated with a challenge with objectives
    SELECT c.id INTO v_challenge_id
    FROM challenges c
    WHERE c.game_id = p_game_id
    LIMIT 1;

    -- Handle draw case
    IF p_winner_id IS NULL THEN
        v_is_draw := TRUE;
        v_winner_payout := 0;

        -- Refund both players in full (no rake on draws)
        -- Refund white player
        UPDATE balances
        SET
            available_tct = available_tct + v_escrow.player_white_locked_tct,
            locked_tct = locked_tct - v_escrow.player_white_locked_tct,
            updated_at = NOW()
        WHERE user_id = v_escrow.player_white_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = v_escrow.player_white_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_escrow.player_white_id, 'refund', v_escrow.player_white_locked_tct,
            p_game_id, v_escrow.id,
            v_winner_current_available - v_escrow.player_white_locked_tct,
            v_winner_current_available,
            'Draw refund - ' || p_reason || ' (no rake)'
        );

        -- Refund black player
        UPDATE balances
        SET
            available_tct = available_tct + v_escrow.player_black_locked_tct,
            locked_tct = locked_tct - v_escrow.player_black_locked_tct,
            updated_at = NOW()
        WHERE user_id = v_escrow.player_black_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_escrow.player_black_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_escrow.player_black_id, 'refund', v_escrow.player_black_locked_tct,
            p_game_id, v_escrow.id,
            v_loser_current_available - v_escrow.player_black_locked_tct,
            v_loser_current_available,
            'Draw refund - ' || p_reason || ' (no rake)'
        );

        -- Record draw refund in ledger
        v_ledger_tx_id := record_draw_refund(
            p_game_id,
            v_escrow.id,
            v_escrow.player_white_id,
            v_escrow.player_white_locked_tct,
            v_escrow.player_black_id,
            v_escrow.player_black_locked_tct
        );

        -- Update escrow status
        UPDATE game_escrows
        SET
            status = 'settled',
            settled_at = NOW(),
            settlement_type = 'draw_refund',
            winner_id = NULL,
            winner_payout_tct = 0,
            loser_refund_tct = 0,
            rake_amount_tct = 0
        WHERE game_id = p_game_id;

        RETURN QUERY SELECT
            v_escrow.id,
            0::NUMERIC,
            (v_escrow.player_white_locked_tct + v_escrow.player_black_locked_tct)::NUMERIC,
            0::NUMERIC,
            0::NUMERIC,
            0::NUMERIC,
            TRUE,
            v_ledger_tx_id,
            1.0::NUMERIC,
            0::NUMERIC;
        RETURN;
    END IF;

    -- Winner case - determine loser and stake amounts
    IF p_winner_id = v_escrow.player_white_id THEN
        v_loser_id := v_escrow.player_black_id;
        v_winner_stake := v_escrow.player_white_locked_tct;
        v_loser_stake := v_escrow.player_black_locked_tct;
    ELSE
        v_loser_id := v_escrow.player_white_id;
        v_winner_stake := v_escrow.player_black_locked_tct;
        v_loser_stake := v_escrow.player_white_locked_tct;
    END IF;

    -- Calculate rake
    v_rake_amount := (v_winner_stake + v_loser_stake) * v_rake_percentage;

    -- Calculate base winner payout (pot minus rake)
    v_base_payout := (v_winner_stake + v_loser_stake) - v_rake_amount;

    -- Calculate objective bonus if challenge exists
    IF v_challenge_id IS NOT NULL THEN
        BEGIN
            v_objective_multiplier := calculate_objective_bonus(v_challenge_id, p_game_id);
        EXCEPTION WHEN OTHERS THEN
            -- If function doesn't exist or fails, default to 1.0
            v_objective_multiplier := 1.0;
        END;
    END IF;

    -- Apply objective bonus multiplier
    IF v_objective_multiplier > 1.0 THEN
        -- Bonus comes from reward pool, not taken from loser
        v_bonus_payout := v_base_payout * (v_objective_multiplier - 1.0);
        v_winner_payout := v_base_payout + v_bonus_payout;

        -- Deduct bonus from reward pool
        UPDATE vault_accounts
        SET
            balance_tct = balance_tct - v_bonus_payout,
            total_debits_tct = total_debits_tct + v_bonus_payout,
            updated_at = NOW()
        WHERE account_name = 'reward_pool' AND balance_tct >= v_bonus_payout;

        -- If reward pool insufficient, cap bonus at what's available
        IF NOT FOUND THEN
            SELECT balance_tct INTO v_bonus_payout
            FROM vault_accounts WHERE account_name = 'reward_pool';

            IF v_bonus_payout IS NULL OR v_bonus_payout < 0 THEN
                v_bonus_payout := 0;
            END IF;

            v_winner_payout := v_base_payout + v_bonus_payout;

            IF v_bonus_payout > 0 THEN
                UPDATE vault_accounts
                SET
                    balance_tct = 0,
                    total_debits_tct = total_debits_tct + v_bonus_payout,
                    updated_at = NOW()
                WHERE account_name = 'reward_pool';
            END IF;
        END IF;
    ELSE
        v_winner_payout := v_base_payout;
    END IF;

    -- Split rake: 80% treasury, 20% reward pool
    v_treasury_amount := v_rake_amount * 0.80;
    v_reward_pool_amount := v_rake_amount * 0.20;

    -- Update winner balance (unlock stake + add winnings)
    UPDATE balances
    SET
        available_tct = available_tct + v_winner_stake + v_winner_payout - v_winner_stake,
        locked_tct = locked_tct - v_winner_stake,
        updated_at = NOW()
    WHERE user_id = p_winner_id;

    SELECT available_tct INTO v_winner_current_available
    FROM balances WHERE user_id = p_winner_id;

    -- Record winner transaction
    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
        balance_before_tct, balance_after_tct, description)
    VALUES (
        p_winner_id, 'win', v_winner_payout,
        p_game_id, v_escrow.id,
        v_winner_current_available - v_winner_payout + v_winner_stake - v_winner_stake,
        v_winner_current_available,
        CASE
            WHEN v_bonus_payout > 0 THEN
                'Win - ' || p_reason || ' (' || v_rake_percentage*100 || '% rake) + ' ||
                ROUND((v_objective_multiplier - 1.0) * 100) || '% objective bonus'
            ELSE
                'Win - ' || p_reason || ' (' || v_rake_percentage*100 || '% rake)'
        END
    );

    -- Update loser balance (unlock and remove stake)
    UPDATE balances
    SET
        locked_tct = locked_tct - v_loser_stake,
        updated_at = NOW()
    WHERE user_id = v_loser_id;

    SELECT available_tct INTO v_loser_current_available
    FROM balances WHERE user_id = v_loser_id;

    -- Record loser transaction
    INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
        balance_before_tct, balance_after_tct, description)
    VALUES (
        v_loser_id, 'loss', v_loser_stake,
        p_game_id, v_escrow.id,
        v_loser_current_available + v_loser_stake,
        v_loser_current_available,
        'Loss - ' || p_reason
    );

    -- Record rake settlement in ledger
    v_ledger_tx_id := record_rake_settlement(
        p_game_id,
        v_escrow.id,
        p_winner_id,
        v_loser_id,
        v_winner_stake + v_loser_stake,
        v_rake_amount,
        v_winner_payout
    );

    -- Update vault accounts
    UPDATE vault_accounts
    SET
        balance_tct = balance_tct + v_treasury_amount,
        total_credits_tct = total_credits_tct + v_treasury_amount,
        updated_at = NOW()
    WHERE account_name = 'platform_treasury';

    UPDATE vault_accounts
    SET
        balance_tct = balance_tct + v_reward_pool_amount,
        total_credits_tct = total_credits_tct + v_reward_pool_amount,
        updated_at = NOW()
    WHERE account_name = 'reward_pool';

    -- Update escrow status
    UPDATE game_escrows
    SET
        status = 'settled',
        settled_at = NOW(),
        settlement_type = 'winner_takes_pot',
        winner_id = p_winner_id,
        winner_payout_tct = v_winner_payout,
        loser_refund_tct = 0,
        rake_amount_tct = v_rake_amount
    WHERE game_id = p_game_id;

    RETURN QUERY SELECT
        v_escrow.id,
        v_winner_payout,
        0::NUMERIC,
        v_rake_amount,
        v_treasury_amount,
        v_reward_pool_amount,
        FALSE,
        v_ledger_tx_id,
        v_objective_multiplier,
        v_bonus_payout;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- Add comment
-- ============================================================================
COMMENT ON FUNCTION settle_escrow_with_rake IS
'Settles game escrow with rake deduction and objective bonus support.
For wins: Takes 5% rake (80% treasury, 20% reward pool), applies objective bonus multiplier.
For draws: Full refund to both players, no rake taken.
Returns objective_bonus_multiplier (1.0 = no bonus) and bonus_payout amount.';
