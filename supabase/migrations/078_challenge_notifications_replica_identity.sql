-- ============================================================================
-- Migration 078: Set REPLICA IDENTITY FULL on challenge_notifications
-- ============================================================================
-- Supabase Realtime requires REPLICA IDENTITY FULL to support filtered
-- subscriptions on non-primary-key columns (e.g. user_id=eq.xxx).
-- Without this, the WAL doesn't include the user_id column, so the
-- filter can't match and the subscription closes immediately.
-- ============================================================================

ALTER TABLE challenge_notifications REPLICA IDENTITY FULL;
