-- =============================================================================
-- Play Now Queue System
--
-- Real-time matchmaking queue for quick play with:
-- - ELO-based matching
-- - On-chain escrow integration
-- - Automatic expiration
-- - Push notification support
-- =============================================================================

-- Create play_now_queue table
CREATE TABLE IF NOT EXISTS play_now_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Match settings
    wager_tct INTEGER NOT NULL DEFAULT 0,
    time_control_seconds INTEGER NOT NULL DEFAULT 300,
    increment_seconds INTEGER NOT NULL DEFAULT 3,

    -- ELO matching
    elo_rating INTEGER NOT NULL DEFAULT 1200,
    elo_range_min INTEGER NOT NULL DEFAULT 1100,
    elo_range_max INTEGER NOT NULL DEFAULT 1300,

    -- On-chain escrow (for wager games)
    on_chain_game_id TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired')),

    -- Match result
    matched_with_id UUID REFERENCES profiles(id),
    matched_at TIMESTAMPTZ,
    game_id UUID REFERENCES games(id),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient matching
CREATE INDEX IF NOT EXISTS idx_play_now_queue_status ON play_now_queue(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_play_now_queue_wager ON play_now_queue(wager_tct, time_control_seconds, increment_seconds);
CREATE INDEX IF NOT EXISTS idx_play_now_queue_elo ON play_now_queue(elo_rating);
CREATE INDEX IF NOT EXISTS idx_play_now_queue_user ON play_now_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_play_now_queue_expires ON play_now_queue(expires_at) WHERE status = 'waiting';

-- RLS policies
ALTER TABLE play_now_queue ENABLE ROW LEVEL SECURITY;

-- Users can view all waiting entries (needed for matchmaking)
CREATE POLICY "Users can view waiting queue entries" ON play_now_queue
    FOR SELECT
    USING (status = 'waiting' OR user_id = auth.uid());

-- Users can insert their own entries
CREATE POLICY "Users can create own queue entries" ON play_now_queue
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own entries
CREATE POLICY "Users can update own queue entries" ON play_now_queue
    FOR UPDATE
    USING (user_id = auth.uid() OR matched_with_id = auth.uid())
    WITH CHECK (user_id = auth.uid() OR matched_with_id = auth.uid());

-- Users can delete their own entries
CREATE POLICY "Users can delete own queue entries" ON play_now_queue
    FOR DELETE
    USING (user_id = auth.uid());

-- Function to clean up expired queue entries
CREATE OR REPLACE FUNCTION cleanup_expired_queue_entries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE play_now_queue
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'waiting'
      AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;

    RETURN expired_count;
END;
$$;

-- Function to find compatible opponents
CREATE OR REPLACE FUNCTION find_compatible_opponents(
    p_user_id UUID,
    p_wager_tct INTEGER,
    p_time_control_seconds INTEGER,
    p_increment_seconds INTEGER,
    p_elo_rating INTEGER,
    p_elo_range_min INTEGER,
    p_elo_range_max INTEGER,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    queue_id UUID,
    opponent_id UUID,
    opponent_elo INTEGER,
    opponent_username TEXT,
    opponent_avatar_index INTEGER,
    on_chain_game_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First cleanup expired entries
    PERFORM cleanup_expired_queue_entries();

    RETURN QUERY
    SELECT
        q.id as queue_id,
        q.user_id as opponent_id,
        q.elo_rating as opponent_elo,
        p.username as opponent_username,
        p.avatar_index as opponent_avatar_index,
        q.on_chain_game_id
    FROM play_now_queue q
    JOIN profiles p ON p.id = q.user_id
    WHERE q.status = 'waiting'
      AND q.user_id != p_user_id
      AND q.wager_tct = p_wager_tct
      AND q.time_control_seconds = p_time_control_seconds
      AND q.increment_seconds = p_increment_seconds
      -- Mutual ELO range check
      AND q.elo_rating >= p_elo_range_min
      AND q.elo_rating <= p_elo_range_max
      AND p_elo_rating >= q.elo_range_min
      AND p_elo_rating <= q.elo_range_max
    ORDER BY q.created_at ASC
    LIMIT p_limit;
END;
$$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_play_now_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_play_now_queue_updated_at
    BEFORE UPDATE ON play_now_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_play_now_queue_updated_at();

-- Enable realtime for queue updates
ALTER PUBLICATION supabase_realtime ADD TABLE play_now_queue;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON play_now_queue TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_queue_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION find_compatible_opponents(UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Add push_token column to profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'push_token'
    ) THEN
        ALTER TABLE profiles ADD COLUMN push_token TEXT;
    END IF;
END $$;
