-- Migration 104: Fix Direct Challenge Notification
-- The create_direct_challenge function wasn't inserting notifications
-- This updates the function to properly notify the challenged player

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
    v_creator_username TEXT;
    v_time_label TEXT;
    v_notification_body TEXT;
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

    -- Get creator username for notification
    SELECT username INTO v_creator_username
    FROM profiles WHERE id = p_creator_id;

    -- Verify balance if wager
    IF p_wager_tct > 0 THEN
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

    -- Lock wager if applicable
    IF p_wager_tct > 0 THEN
        PERFORM lock_balance_for_challenge(p_creator_id, p_wager_tct, v_challenge_id);
    END IF;

    -- Format time label
    v_time_label := CASE
        WHEN p_time_control_seconds < 60 THEN p_time_control_seconds || 's'
        ELSE (p_time_control_seconds / 60) || ' min'
    END;

    -- Build notification body
    IF p_wager_tct > 0 THEN
        v_notification_body := v_creator_username || ' challenged you to a ' || v_time_label || ' game for ' || p_wager_tct || ' TCT!';
    ELSE
        v_notification_body := v_creator_username || ' challenged you to a ' || v_time_label || ' game!';
    END IF;

    -- Insert notification for opponent
    INSERT INTO challenge_notifications (
        user_id,
        challenge_id,
        notification_type,
        title,
        body
    ) VALUES (
        v_opponent_id,
        v_challenge_id,
        'challenge_received',
        'You''ve Been Challenged!',
        v_notification_body
    );

    RETURN QUERY SELECT TRUE, v_challenge_id, v_room_code, NULL::TEXT;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_direct_challenge(UUID, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) TO authenticated;
