-- ============================================================================
-- Migration 128: Business Logic Security Fixes
-- ============================================================================
-- Addresses findings from the 2026-06-01 Business Logic Red Team audit.
--
-- Fixes applied:
--   BL-01: settle_escrow and settle_escrow_with_rake callable by any
--          authenticated user to fraudulently claim wager payouts.
--   BL-02: finish_game callable by any game participant to fraudulently
--          record a win and then call settle_escrow to collect funds.
--   BL-03: unlock_balance_for_challenge / lock_balance_for_challenge lack
--          caller-ownership check — any user can unlock another user's locked
--          balance or drain their own available balance.
--   BL-04: finalize_tournament / complete_tournament / start_tournament /
--          record_tournament_match_result callable by any authenticated user
--          enabling early finalization and fraudulent match results.
--   BL-05: Rake crediting in settle_escrow_with_rake targets any profile
--          with is_admin=TRUE, allowing an attacker who becomes admin to
--          capture rake directly to their own balance.
-- ============================================================================

BEGIN;

-- ============================================================================
-- BL-01 FIX: Revoke settle_escrow and settle_escrow_with_rake from
--            authenticated. These must only be called by service_role
--            (via the game-complete edge function).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION settle_escrow(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) FROM authenticated;

-- Ensure service_role retains access
GRANT EXECUTE ON FUNCTION settle_escrow(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO service_role;

-- ============================================================================
-- BL-02 FIX: Revoke finish_game from authenticated.
--            The game-complete edge function calls it via service_role key.
--            Direct authenticated access allows any game participant to write
--            an arbitrary result to any game they are in.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION finish_game(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM authenticated;

-- Ensure service_role retains access
GRANT EXECUTE ON FUNCTION finish_game(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- BL-03 FIX: Add caller-ownership enforcement to unlock_balance_for_challenge
--            and lock_balance_for_challenge. A user must only be able to
--            operate on their own balance.
-- ============================================================================

CREATE OR REPLACE FUNCTION lock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_available NUMERIC;
  v_balance_id UUID;
BEGIN
  -- Caller must be operating on their own balance
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot lock balance for another user';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Lock amount must be positive';
  END IF;

  SELECT id, available_tct INTO v_balance_id, v_current_available
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance record not found for user %', p_user_id;
  END IF;

  IF v_current_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %', v_current_available, p_amount;
  END IF;

  UPDATE balances
  SET available_tct = available_tct - p_amount,
      locked_tct = locked_tct + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount_tct, description, balance_before_tct, balance_after_tct)
  VALUES (
    p_user_id,
    'lock',
    p_amount,
    'Funds locked for challenge ' || p_challenge_id,
    v_current_available,
    v_current_available - p_amount
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION unlock_balance_for_challenge(
  p_user_id UUID,
  p_amount NUMERIC,
  p_challenge_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_locked NUMERIC;
  v_current_available NUMERIC;
BEGIN
  -- Caller must be operating on their own balance
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot unlock balance for another user';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Unlock amount must be positive';
  END IF;

  SELECT available_tct, locked_tct INTO v_current_available, v_current_locked
  FROM balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance record not found for user %', p_user_id;
  END IF;

  UPDATE balances
  SET available_tct = available_tct + p_amount,
      locked_tct = GREATEST(locked_tct - p_amount, 0),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount_tct, description, balance_before_tct, balance_after_tct)
  VALUES (
    p_user_id,
    'unlock',
    p_amount,
    'Funds unlocked for challenge ' || p_challenge_id,
    v_current_available,
    v_current_available + p_amount
  );

  RETURN TRUE;
END;
$$;

-- Retain authenticated grants (callers need these for house challenge flow),
-- but ownership is now enforced inside the functions above.
GRANT EXECUTE ON FUNCTION lock_balance_for_challenge(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_balance_for_challenge(UUID, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- BL-04 FIX: Revoke tournament-mutating functions from authenticated.
--            finalize_tournament, complete_tournament, start_tournament, and
--            record_tournament_match_result must only be called by service_role
--            or admin-gated wrappers (admin_start_tournament, etc.).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION finalize_tournament(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION complete_tournament(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION start_tournament(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION record_tournament_match_result(UUID, UUID, UUID) FROM authenticated;

-- Ensure service_role retains access
GRANT EXECUTE ON FUNCTION finalize_tournament(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_tournament(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION start_tournament(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION record_tournament_match_result(UUID, UUID, UUID) TO service_role;

-- ============================================================================
-- BL-05 FIX: Replace ad-hoc admin rake crediting in settle_escrow_with_rake
--            with a proper vault account credit, removing the dependency on
--            profiles.is_admin=TRUE which allows an admin user to pocket rake.
--
-- The fix: Update the rake distribution block to credit the vault_statistics
-- treasury counter instead of a profile balance. Vault balances are withdrawn
-- by the platform via the vault withdrawal flow, not by individual admins.
-- ============================================================================

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

-- settle_escrow_with_rake is now service_role only (no authenticated grant)
GRANT EXECUTE ON FUNCTION settle_escrow_with_rake(UUID, UUID, TEXT) TO service_role;

COMMIT;
