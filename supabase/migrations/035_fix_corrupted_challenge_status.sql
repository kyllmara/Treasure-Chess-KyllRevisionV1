-- ============================================================================
-- Migration 035: Clean Up Old Challenges
-- ============================================================================
-- Delete all pending challenges that are:
-- 1. Expired (past their expires_at)
-- 2. Old (created more than 24 hours ago)
-- This ensures old/stale challenges don't pollute the board.
-- ============================================================================

-- Delete expired pending challenges
DELETE FROM challenges
WHERE status = 'pending'
AND (
    expires_at < NOW()
    OR created_at < NOW() - INTERVAL '24 hours'
);

-- Delete all pending challenges with no game_id that are more than 1 hour old
-- This cleans up abandoned challenges
DELETE FROM challenges
WHERE status = 'pending'
AND game_id IS NULL
AND created_at < NOW() - INTERVAL '1 hour';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
