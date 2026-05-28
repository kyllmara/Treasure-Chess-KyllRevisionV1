-- ============================================================================
-- Migration 034: Clean Up Old Challenges
-- ============================================================================
-- Clean up challenges that are expired or stuck.
-- The challenge_status enum has: 'pending', 'accepted', 'cancelled', 'expired'
-- ============================================================================

-- Clean up any challenges that are stuck in weird states
-- Delete challenges that are:
-- 1. Expired (past their expires_at)
-- 2. Older than 24 hours and still pending with no opponent
DELETE FROM challenges
WHERE status = 'pending'
AND (
    (expires_at < NOW())
    OR (created_at < NOW() - INTERVAL '24 hours' AND opponent_id IS NULL)
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
