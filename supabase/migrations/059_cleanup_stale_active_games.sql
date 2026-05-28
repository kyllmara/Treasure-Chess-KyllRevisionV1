-- ============================================================================
-- Migration 059: Clean up stale "active" games
-- ============================================================================
-- Problem: Some games remain in status='active' with result/end_reason/ended_at
-- all NULL, even though the game is clearly finished (old test games, failed
-- game-complete calls, etc.). This causes a phantom "Game in Progress" rejoin
-- banner on the home screen.
--
-- Fix: Mark all "active" games older than 2 hours with no recent moves as abandoned.
-- ============================================================================

-- 1. Mark old active games as abandoned
UPDATE games
SET
    status = 'abandoned',
    result = 'abandoned',
    end_reason = 'abandon',
    ended_at = COALESCE(last_move_at, created_at, NOW())
WHERE status = 'active'
  AND ended_at IS NULL
  AND created_at < NOW() - INTERVAL '2 hours';

-- 2. Also fix any games where status='completed' but result/end_reason are NULL
-- (from the auto_complete_on_escrow_settle trigger or legacy code)
UPDATE games
SET
    result = COALESCE(result, 'abandoned'),
    end_reason = COALESCE(end_reason, 'abandon'),
    ended_at = COALESCE(ended_at, NOW())
WHERE status = 'completed'
  AND (result IS NULL OR end_reason IS NULL OR ended_at IS NULL);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
