-- Migration 116: Fix settle_escrow_with_rake and enforce rake cap
--
-- Issues found in migration 089:
-- 1. v_rake_percentage / 100 bug: rake_percentage is stored as a fraction (0.10 = 10%).
--    Migration 089 applied /100 again, making the effective rate 0.001% instead of 10%.
-- 2. Treasury/reward split hardcoded at 80/20 instead of reading from settings.
-- 3. max_rake_tct field exists in platform_config but was never enforced in the function.
-- 4. Rake was applied only to the loser's stake, not the total pot.
--
-- This migration also sets the game rake to 10% and cap to 2500 TCT (~$100 at 25 TCT/USDC).

BEGIN;

-- 1. Update platform_config: game rake → 10%, cap → 2500 TCT
UPDATE platform_config
SET config_value = config_value
    || '{"rake_percentage": 0.10}'::JSONB
    || '{"max_rake_tct": 2500}'::JSONB
WHERE config_key = 'rake_settings';

-- 2. Recreate settle_escrow_with_rake with all fixes applied
DROP FUNCTION IF EXISTS settle_escrow_with_rake(UUID, UUID, TEXT);

CREATE FUNCTION settle_escrow_with_rake(
    p_game_id   UUID,
    p_winner_id UUID,  -- NULL for draw
    p_reason    TEXT DEFAULT 'checkmate'
)
RETURNS TABLE (
    escrow_id              UUID,
    winner_payout          NUMERIC,
    loser_refund           NUMERIC,
    rake_amount            NUMERIC,
    treasury_amount        NUMERIC,
    reward_pool_amount     NUMERIC,
    is_draw                BOOLEAN,
    ledger_transaction_id  UUID
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_escrow                    RECORD;
    v_winner_payout             NUMERIC;
    v_rake_amount               NUMERIC := 0;
    v_treasury_amount           NUMERIC := 0;
    v_reward_pool_amount        NUMERIC := 0;
    v_loser_id                  UUID;
    v_is_draw                   BOOLEAN := FALSE;
    v_winner_current_available  NUMERIC;
    v_loser_current_available   NUMERIC;
    v_settings                  JSONB;
    v_rake_percentage           NUMERIC;  -- stored as fraction: 0.10 = 10%
    v_treasury_share            NUMERIC;  -- fraction of rake to treasury: 0.80 = 80%
    v_max_rake_tct              NUMERIC;
    v_min_rake_tct              NUMERIC;
    v_ledger_tx_id              UUID;
    v_winner_stake              NUMERIC;
    v_loser_stake               NUMERIC;
    v_total_pool                NUMERIC;
BEGIN
    -- Load all rake settings from platform_config (single read)
    v_settings        := get_rake_settings();
    v_rake_percentage := (v_settings->>'rake_percentage')::NUMERIC;            -- e.g. 0.10
    v_treasury_share  := COALESCE((v_settings->>'treasury_share')::NUMERIC,  0.80);
    v_max_rake_tct    := COALESCE((v_settings->>'max_rake_tct')::NUMERIC,   2500);
    v_min_rake_tct    := COALESCE((v_settings->>'min_rake_tct')::NUMERIC,      0);

    -- Lock escrow row
    SELECT * INTO v_escrow
    FROM game_escrows
    WHERE game_escrows.game_id = p_game_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Escrow not found for game %', p_game_id;
    END IF;

    IF v_escrow.status NOT IN ('active', 'pending_escrow') THEN
        RAISE EXCEPTION 'Escrow already settled. Status: %', v_escrow.status;
    END IF;

    -- -------------------------------------------------------------------------
    -- DRAW: full refund to both players, no rake
    -- -------------------------------------------------------------------------
    IF p_winner_id IS NULL THEN
        v_is_draw       := TRUE;
        v_winner_payout := 0;

        UPDATE balances
        SET available_tct = available_tct + v_escrow.player_white_locked_tct,
            locked_tct    = GREATEST(locked_tct - v_escrow.player_white_locked_tct, 0),
            updated_at    = NOW()
        WHERE user_id = v_escrow.player_white_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = v_escrow.player_white_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (v_escrow.player_white_id, 'refund', v_escrow.player_white_locked_tct,
            p_game_id, v_escrow.id,
            v_winner_current_available - v_escrow.player_white_locked_tct,
            v_winner_current_available,
            'Draw refund - ' || p_reason || ' (no rake)');

        UPDATE balances
        SET available_tct = available_tct + v_escrow.player_black_locked_tct,
            locked_tct    = GREATEST(locked_tct - v_escrow.player_black_locked_tct, 0),
            updated_at    = NOW()
        WHERE user_id = v_escrow.player_black_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_escrow.player_black_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (v_escrow.player_black_id, 'refund', v_escrow.player_black_locked_tct,
            p_game_id, v_escrow.id,
            v_loser_current_available - v_escrow.player_black_locked_tct,
            v_loser_current_available,
            'Draw refund - ' || p_reason || ' (no rake)');

        BEGIN
            SELECT record_draw_refund(p_game_id, v_escrow.id,
                v_escrow.player_white_id, v_escrow.player_black_id,
                v_escrow.player_white_locked_tct, v_escrow.player_black_locked_tct)
            INTO v_ledger_tx_id;
        EXCEPTION WHEN OTHERS THEN v_ledger_tx_id := NULL; END;

        UPDATE game_escrows SET status = 'refunded', settled_at = NOW()
        WHERE id = v_escrow.id;

    -- -------------------------------------------------------------------------
    -- WIN / LOSS
    -- -------------------------------------------------------------------------
    ELSE
        IF p_winner_id = v_escrow.player_white_id THEN
            v_winner_stake := v_escrow.player_white_locked_tct;
            v_loser_stake  := v_escrow.player_black_locked_tct;
            v_loser_id     := v_escrow.player_black_id;
        ELSE
            v_winner_stake := v_escrow.player_black_locked_tct;
            v_loser_stake  := v_escrow.player_white_locked_tct;
            v_loser_id     := v_escrow.player_white_id;
        END IF;

        v_total_pool := v_winner_stake + v_loser_stake;

        -- Rake on total pot, capped at max_rake_tct, floored at min_rake_tct
        v_rake_amount := FLOOR(v_total_pool * v_rake_percentage);
        v_rake_amount := LEAST(v_rake_amount, v_max_rake_tct);
        IF v_rake_amount < v_min_rake_tct AND v_rake_amount > 0 THEN
            v_rake_amount := v_min_rake_tct;
        END IF;

        -- Treasury/reward split (read from settings, not hardcoded)
        v_treasury_amount    := FLOOR(v_rake_amount * v_treasury_share);
        v_reward_pool_amount := v_rake_amount - v_treasury_amount;

        v_winner_payout := v_total_pool - v_rake_amount;

        -- Credit winner
        UPDATE balances
        SET available_tct = available_tct + v_winner_payout,
            locked_tct    = GREATEST(locked_tct - v_winner_stake, 0),
            total_won_tct = COALESCE(total_won_tct, 0) + (v_loser_stake - v_rake_amount),
            updated_at    = NOW()
        WHERE user_id = p_winner_id;

        SELECT available_tct INTO v_winner_current_available
        FROM balances WHERE user_id = p_winner_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (p_winner_id, 'win', v_winner_payout, p_game_id, v_escrow.id,
            v_winner_current_available - v_winner_payout,
            v_winner_current_available,
            'Won ' || v_winner_payout || ' TCT (' || v_rake_amount || ' rake) - ' || p_reason);

        -- Update loser
        UPDATE balances
        SET locked_tct     = GREATEST(locked_tct - v_loser_stake, 0),
            total_lost_tct = COALESCE(total_lost_tct, 0) + v_loser_stake,
            updated_at     = NOW()
        WHERE user_id = v_loser_id;

        SELECT available_tct INTO v_loser_current_available
        FROM balances WHERE user_id = v_loser_id;

        INSERT INTO transactions (user_id, type, amount_tct, game_id, escrow_id,
            balance_before_tct, balance_after_tct, description)
        VALUES (v_loser_id, 'loss', v_loser_stake, p_game_id, v_escrow.id,
            v_loser_current_available, v_loser_current_available,
            'Lost ' || v_loser_stake || ' TCT - ' || p_reason);

        -- Distribute rake to treasury (reward pool handled separately)
        IF v_treasury_amount > 0 THEN
            UPDATE balances
            SET available_tct = available_tct + v_treasury_amount, updated_at = NOW()
            WHERE user_id = (SELECT id FROM profiles WHERE is_admin = TRUE LIMIT 1);
        END IF;

        BEGIN
            SELECT record_rake_settlement(p_game_id, v_escrow.id, p_winner_id, v_loser_id,
                v_winner_payout, v_rake_amount, v_treasury_amount, v_reward_pool_amount)
            INTO v_ledger_tx_id;
        EXCEPTION WHEN OTHERS THEN v_ledger_tx_id := NULL; END;

        UPDATE game_escrows SET status = 'settled', settled_at = NOW()
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

GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO service_role;

COMMIT;
