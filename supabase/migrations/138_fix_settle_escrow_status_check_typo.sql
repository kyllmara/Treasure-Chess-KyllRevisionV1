-- =====================================================================
-- Migration 138: Fix settle_escrow_with_rake 'pending_escrow' typo
-- =====================================================================
-- BUG: settle_escrow_with_rake's first guard checks
--   IF v_escrow.status NOT IN ('active', 'pending_escrow') THEN
-- but 'pending_escrow' is NOT a value of the escrow_status enum
-- (CREATE TYPE escrow_status AS ENUM ('active','settled','refunded',
-- 'disputed') from migration 001 — never altered). This typo was
-- introduced in migration 089 and carried forward through 116 and 128.
--
-- Effect: every call to settle_escrow_with_rake fails immediately with
--   ERROR 22P02: invalid input value for enum escrow_status:
--   "pending_escrow"
-- regardless of the escrow's actual status. Postgres rolls back the
-- whole function, so no balances/transactions/escrow rows are ever
-- updated. game-complete's RPC error is swallowed and the client is
-- told settlement succeeded, leaving wagers stuck in escrow forever.
--
-- FIX: drop the dead/invalid 'pending_escrow' branch — only 'active'
-- escrows should ever be settled.
-- =====================================================================

CREATE OR REPLACE FUNCTION settle_escrow_with_rake(
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
    v_rake_percentage           NUMERIC;
    v_treasury_share            NUMERIC;
    v_max_rake_tct              NUMERIC;
    v_min_rake_tct              NUMERIC;
    v_ledger_tx_id              UUID;
    v_winner_stake              NUMERIC;
    v_loser_stake               NUMERIC;
    v_total_pool                NUMERIC;
BEGIN
    -- Load rake settings from platform_config (single read)
    v_settings        := get_rake_settings();
    v_rake_percentage := (v_settings->>'rake_percentage')::NUMERIC;
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

    IF v_escrow.status != 'active' THEN
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

        -- Rake on total pot, capped at max_rake_tct
        v_rake_amount := FLOOR(v_total_pool * v_rake_percentage);
        v_rake_amount := LEAST(v_rake_amount, v_max_rake_tct);
        IF v_rake_amount < v_min_rake_tct AND v_rake_amount > 0 THEN
            v_rake_amount := v_min_rake_tct;
        END IF;

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

        -- BL-05 FIX: Credit rake to vault_statistics treasury counter instead of an admin
        -- profile balance. This prevents any admin from directing rake to their own account.
        IF v_treasury_amount > 0 THEN
            UPDATE vault_statistics
            SET stat_value = stat_value + v_treasury_amount
            WHERE stat_name = 'treasury_balance_tct';

            IF NOT FOUND THEN
                INSERT INTO vault_statistics (stat_name, stat_value, stat_unit)
                VALUES ('treasury_balance_tct', v_treasury_amount, 'TCT')
                ON CONFLICT (stat_name) DO UPDATE
                    SET stat_value = vault_statistics.stat_value + v_treasury_amount;
            END IF;
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
