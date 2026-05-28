-- ============================================================================
-- Migration 041: Fix finish_game enum casting
-- ============================================================================
-- The finish_game function was passing TEXT but the columns expect enum types.
-- This migration fixes the function to cast text to the appropriate enums.
-- ============================================================================

DROP FUNCTION IF EXISTS finish_game(UUID, TEXT, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION finish_game(
    p_game_id UUID,
    p_status TEXT,
    p_result TEXT,
    p_winner_id UUID,
    p_end_reason TEXT,
    p_final_fen TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE games
    SET
        status = p_status::game_status,
        result = p_result::game_result,
        winner_id = p_winner_id,
        end_reason = p_end_reason,
        final_fen = p_final_fen,
        ended_at = NOW()
    WHERE id = p_game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION finish_game TO authenticated;
GRANT EXECUTE ON FUNCTION finish_game TO service_role;
