-- Fix settle_escrow_with_rake to accept both 'active' and 'pending_escrow' statuses.
-- Play Now games may have escrows created with either status.
-- Only change: the status check on line 609 of the original function.

-- Drop and recreate since return type may have changed across migrations
DROP FUNCTION IF EXISTS settle_escrow_with_rake(UUID, UUID, TEXT);

CREATE FUNCTION settle_escrow_with_rake(
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
    ledger_transaction_id UUID
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

    -- Allow settlement for 'active' or 'pending_escrow' (Play Now games without on-chain escrow)
    -- Reject already-settled escrows (settled, refunded, escrow_failed, etc.)
    IF v_escrow.status NOT IN ('active', 'pending_escrow') THEN
        RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
    END IF;

    -- Handle draw case
    IF p_winner_id IS NULL THEN
        v_is_draw := TRUE;
        v_winner_payout := 0;

        -- Refund both players in full (no rake on draws)
        -- Refund white player
        UPDATE balances
        SET
            available_tct = available_tct + v_escrow.player_white_locked_tct,
            locked_tct = GREATEST(locked_tct - v_escrow.player_white_locked_tct, 0),
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
            locked_tct = GREATEST(locked_tct - v_escrow.player_black_locked_tct, 0),
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

        -- Record in ledger
        BEGIN
            SELECT record_draw_refund(
                p_game_id,
                v_escrow.id,
                v_escrow.player_white_id,
                v_escrow.player_black_id,
                v_escrow.player_white_locked_tct,
                v_escrow.player_black_locked_tct
            ) INTO v_ledger_tx_id;
        EXCEPTION WHEN OTHERS THEN
            v_ledger_tx_id := NULL;
        END;

        -- Update escrow status
        UPDATE game_escrows
        SET status = 'refunded', settled_at = NOW()
        WHERE id = v_escrow.id;

    ELSE
        -- Win/loss case
        v_is_draw := FALSE;

        -- Determine stakes
        IF p_winner_id = v_escrow.player_white_id THEN
            v_winner_stake := v_escrow.player_white_locked_tct;
            v_loser_stake := v_escrow.player_black_locked_tct;
            v_loser_id := v_escrow.player_black_id;
        ELSE
            v_winner_stake := v_escrow.player_black_locked_tct;
            v_loser_stake := v_escrow.player_white_locked_tct;
            v_loser_id := v_escrow.player_white_id;
        END IF;

        -- Calculate rake
        v_rake_amount := FLOOR(v_loser_stake * v_rake_percentage / 100);
        v_treasury_amount := FLOOR(v_rake_amount * 80 / 100);
        v_reward_pool_amount := v_rake_amount - v_treasury_amount;

        -- Winner payout = their stake back + loser's stake - rake
        v_winner_payout := v_winner_stake + v_loser_stake - v_rake_amount;

        -- Update winner balance
        UPDATE balances
        SET
            available_tct = available_tct + v_winner_payout,
            locked_tct = GREATEST(locked_tct - v_winner_stake, 0),
            total_won_tct = COALESCE(total_won_tct, 0) + (v_loser_stake - v_rake_amount),
            updated_at = NOW()
        WHERE user_id = p_winner_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = p_winner_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            p_winner_id, 'win', v_winner_payout,
            p_game_id, v_escrow.id,
            v_winner_current_available - v_winner_payout,
            v_winner_current_available,
            'Won ' || v_winner_payout || ' TCT (' || v_rake_amount || ' rake) - ' || p_reason
        );

        -- Update loser balance (remove locked amount)
        UPDATE balances
        SET
            locked_tct = GREATEST(locked_tct - v_loser_stake, 0),
            total_lost_tct = COALESCE(total_lost_tct, 0) + v_loser_stake,
            updated_at = NOW()
        WHERE user_id = v_loser_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_loser_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (
            v_loser_id, 'loss', v_loser_stake,
            p_game_id, v_escrow.id,
            v_loser_current_available,
            v_loser_current_available,
            'Lost ' || v_loser_stake || ' TCT - ' || p_reason
        );

        -- Distribute rake
        IF v_treasury_amount > 0 THEN
            UPDATE balances
            SET available_tct = available_tct + v_treasury_amount, updated_at = NOW()
            WHERE user_id = (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1);
        END IF;

        -- Record in ledger
        BEGIN
            SELECT record_rake_settlement(
                p_game_id,
                v_escrow.id,
                p_winner_id,
                v_loser_id,
                v_winner_payout,
                v_rake_amount,
                v_treasury_amount,
                v_reward_pool_amount
            ) INTO v_ledger_tx_id;
        EXCEPTION WHEN OTHERS THEN
            v_ledger_tx_id := NULL;
        END;

        -- Update escrow status
        UPDATE game_escrows
        SET status = 'settled', settled_at = NOW()
        WHERE id = v_escrow.id;
    END IF;

    RETURN QUERY SELECT
        v_escrow.id,
        v_winner_payout,
        0::NUMERIC,
        v_rake_amount,
        v_treasury_amount,
        v_reward_pool_amount,
        v_is_draw,
        v_ledger_tx_id;
END;
$$;
