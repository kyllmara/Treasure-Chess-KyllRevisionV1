-- Fix: Cast p_status TEXT[] to challenge_status[] so the ANY() comparison works.
-- Error was: operator does not exist: challenge_status = text

CREATE OR REPLACE FUNCTION get_challenge_history(
    p_user_id UUID,
    p_status TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    room_code TEXT,
    wager_tct NUMERIC,
    time_control_seconds INTEGER,
    increment_seconds INTEGER,
    status challenge_status,
    game_id UUID,
    created_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    was_creator BOOLEAN,
    opponent_username TEXT,
    opponent_elo INTEGER,
    game_result TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.room_code,
        c.wager_tct,
        c.time_control_seconds,
        c.increment_seconds,
        c.status,
        c.game_id,
        c.created_at,
        c.accepted_at,
        c.expires_at,
        (c.creator_id = p_user_id) AS was_creator,
        CASE
            WHEN c.creator_id = p_user_id THEN p_opp.username
            ELSE p_creator.username
        END AS opponent_username,
        CASE
            WHEN c.creator_id = p_user_id THEN p_opp.elo_rating
            ELSE p_creator.elo_rating
        END AS opponent_elo,
        g.result AS game_result
    FROM challenges c
    JOIN profiles p_creator ON p_creator.id = c.creator_id
    LEFT JOIN profiles p_opp ON p_opp.id = c.opponent_id
    LEFT JOIN games g ON g.id = c.game_id
    WHERE (c.creator_id = p_user_id OR c.opponent_id = p_user_id)
    AND (p_status IS NULL OR c.status = ANY(p_status::challenge_status[]))
    ORDER BY c.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
