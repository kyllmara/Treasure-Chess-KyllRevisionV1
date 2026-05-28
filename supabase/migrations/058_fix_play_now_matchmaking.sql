-- ============================================================================
-- Migration 058: Fix Play Now Matchmaking RLS + Atomic Match Claiming
-- ============================================================================
-- Problem: Player 1 cannot update Player 2's queue entry due to RLS.
-- The UPDATE policy requires user_id = auth.uid() OR matched_with_id = auth.uid(),
-- but matched_with_id is NULL before the match is claimed — chicken-and-egg.
--
-- Also, the SELECT policy only allows seeing 'waiting' entries or your own,
-- so after matching, players can't see each other's entries.
--
-- Fix:
-- 1. SECURITY DEFINER RPC to atomically claim both entries
-- 2. Update SELECT policy to include matched entries
-- ============================================================================

-- 1. Update SELECT policy to allow seeing matched opponent's entry
DROP POLICY IF EXISTS "Users can view waiting queue entries" ON play_now_queue;
CREATE POLICY "Users can view queue entries" ON play_now_queue
    FOR SELECT
    USING (
        status = 'waiting'
        OR user_id = auth.uid()
        OR matched_with_id = auth.uid()
    );

-- 2. Atomic match claiming function (bypasses RLS)
CREATE OR REPLACE FUNCTION claim_play_now_match(
    p_my_queue_id UUID,
    p_opponent_queue_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_my_entry RECORD;
    v_opp_entry RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Lock both rows to prevent race conditions
    SELECT * INTO v_my_entry
    FROM play_now_queue
    WHERE id = p_my_queue_id
    FOR UPDATE;

    SELECT * INTO v_opp_entry
    FROM play_now_queue
    WHERE id = p_opponent_queue_id
    FOR UPDATE;

    -- Validate both exist
    IF v_my_entry IS NULL OR v_opp_entry IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Queue entry not found');
    END IF;

    -- Validate caller owns their entry
    IF v_my_entry.user_id != auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not your queue entry');
    END IF;

    -- Validate both are still waiting
    IF v_my_entry.status != 'waiting' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Your entry is no longer waiting');
    END IF;

    IF v_opp_entry.status != 'waiting' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Opponent is no longer waiting');
    END IF;

    -- Claim the match: update both entries atomically
    UPDATE play_now_queue
    SET status = 'matched',
        matched_with_id = v_opp_entry.user_id,
        matched_at = v_now
    WHERE id = p_my_queue_id;

    UPDATE play_now_queue
    SET status = 'matched',
        matched_with_id = v_my_entry.user_id,
        matched_at = v_now
    WHERE id = p_opponent_queue_id;

    RETURN jsonb_build_object(
        'success', true,
        'my_entry_id', p_my_queue_id,
        'opponent_entry_id', p_opponent_queue_id,
        'opponent_user_id', v_opp_entry.user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_play_now_match(UUID, UUID) TO authenticated;

-- 3. Function to set game_id on both entries (for after game creation)
CREATE OR REPLACE FUNCTION set_play_now_game_id(
    p_my_queue_id UUID,
    p_opponent_queue_id UUID,
    p_game_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE play_now_queue
    SET game_id = p_game_id
    WHERE id IN (p_my_queue_id, p_opponent_queue_id)
      AND status = 'matched';

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION set_play_now_game_id(UUID, UUID, UUID) TO authenticated;

-- 4. Function to set on_chain_game_id on both entries
CREATE OR REPLACE FUNCTION set_play_now_chain_id(
    p_my_queue_id UUID,
    p_opponent_queue_id UUID,
    p_on_chain_game_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE play_now_queue
    SET on_chain_game_id = p_on_chain_game_id
    WHERE id IN (p_my_queue_id, p_opponent_queue_id)
      AND status = 'matched';

    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION set_play_now_chain_id(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
