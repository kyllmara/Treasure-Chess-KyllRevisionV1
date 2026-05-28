-- ============================================================================
-- Migration 077: Enable Realtime + Fix INSERT for challenge_notifications
-- ============================================================================
-- 1. Add challenge_notifications to the supabase_realtime publication so
--    the ChallengeNotificationListener component receives INSERT events.
-- 2. Add INSERT policy + GRANT so authenticated users can insert
--    notifications for other users (e.g. when creating a direct challenge).
--    Previously only SELECT/UPDATE were granted, so the client-side insert
--    in notifyChallengeCreated was silently failing.
-- ============================================================================

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'challenge_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE challenge_notifications;
  END IF;
END $$;

-- Allow authenticated users to insert challenge notifications
DROP POLICY IF EXISTS "Users can insert challenge notifications" ON challenge_notifications;
CREATE POLICY "Users can insert challenge notifications"
  ON challenge_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grant INSERT permission (was missing: only SELECT, UPDATE were granted)
GRANT INSERT ON challenge_notifications TO authenticated;
