-- Migration 120: Realtime publication gaps + missing indexes
--
-- Fixes:
--   matchmaking_queue and game_escrows were never added to the supabase_realtime
--   publication, so postgres_changes subscriptions on these tables silently
--   never fired. Matchmaking relied on this for match detection.
--
--   Missing composite index on matchmaking_queue caused full index scans when
--   searching for opponents by (status, wager_tct, time_control_seconds).

BEGIN;

-- ============================================================================
-- 1. Add matchmaking_queue to Realtime publication
-- ============================================================================

ALTER TABLE matchmaking_queue REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE matchmaking_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. Add game_escrows to Realtime publication
-- ============================================================================

ALTER TABLE game_escrows REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_escrows;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. Composite index for matchmaking queue opponent search
--    Covers: WHERE status='waiting' AND wager_tct=? AND time_control_seconds=?
--    AND increment_seconds=? ORDER BY created_at ASC
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_lookup
  ON matchmaking_queue (status, wager_tct, time_control_seconds, increment_seconds, created_at);

-- ============================================================================
-- 4. Index for active game lookups by player
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_games_active_player
  ON games (status, white_player_id, black_player_id);

-- ============================================================================
-- 5. Index for balance lookups (used on every matchmaking balance check)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_balances_user_id
  ON balances (user_id);

COMMIT;
