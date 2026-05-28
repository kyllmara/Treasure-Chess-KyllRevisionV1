-- ============================================================================
-- Migration: 072_direct_challenge_on_chain.sql
-- Description: Add on-chain escrow support to direct challenges.
--   When a direct challenge is created with a wager, the caller can supply
--   an on_chain_game_id (bytes32 hash). When provided:
--     - The value is stored in challenges.on_chain_game_id
--     - The DB balance lock (lock_balance_for_challenge) is SKIPPED because
--       funds will be escrowed on-chain during the ready-up flow
--   This ensures the game-complete Edge Function sees on_chain_game_id and
--   settles via on-chain escrow instead of the DB-only path.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_direct_challenge(
    p_creator_id UUID,
    p_opponent_username TEXT,
    p_wager_tct NUMERIC,
    p_time_control_seconds INTEGER,
    p_increment_seconds INTEGER,
    p_color_preference TEXT DEFAULT 'random',
    p_is_rated BOOLEAN DEFAULT TRUE,
    p_on_chain_game_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    challenge_id UUID,
    room_code TEXT,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_opponent_id UUID;
    v_room_code TEXT;
    v_challenge_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Find opponent by username
    SELECT id INTO v_opponent_id
    FROM profiles
    WHERE username ILIKE p_opponent_username;

    IF v_opponent_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Player not found';
        RETURN;
    END IF;

    IF v_opponent_id = p_creator_id THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Cannot challenge yourself';
        RETURN;
    END IF;

    -- Verify balance if wager (only for DB-escrowed games)
    IF p_wager_tct > 0 AND p_on_chain_game_id IS NULL THEN
        DECLARE
            v_balance NUMERIC;
        BEGIN
            SELECT available_tct INTO v_balance
            FROM balances WHERE user_id = p_creator_id;

            IF v_balance < p_wager_tct THEN
                RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, 'Insufficient balance';
                RETURN;
            END IF;
        END;
    END IF;

    -- Generate room code
    v_room_code := upper(substring(md5(random()::text) from 1 for 6));

    -- Calculate expiry (24 hours)
    v_expires_at := NOW() + INTERVAL '24 hours';

    -- Create challenge
    INSERT INTO challenges (
        room_code, creator_id, opponent_id, wager_tct,
        time_control_seconds, increment_seconds,
        creator_color_preference, is_public, is_rated,
        status, expires_at, on_chain_game_id
    ) VALUES (
        v_room_code, p_creator_id, v_opponent_id, p_wager_tct,
        p_time_control_seconds, p_increment_seconds,
        p_color_preference, FALSE, p_is_rated,
        'pending', v_expires_at, p_on_chain_game_id
    )
    RETURNING id INTO v_challenge_id;

    -- Lock wager via DB only when NOT using on-chain escrow
    IF p_wager_tct > 0 AND p_on_chain_game_id IS NULL THEN
        PERFORM lock_balance_for_challenge(p_creator_id, p_wager_tct, v_challenge_id);
    END IF;

    RETURN QUERY SELECT TRUE, v_challenge_id, v_room_code, NULL::TEXT;
END;
$$;
