-- =====================================================
-- FIX: Missing get_unread_notification_count function
-- =====================================================
-- Run this in Supabase SQL Editor to fix PGRST202 error
-- Dashboard: https://supabase.com/dashboard/project/jgjhmivnlvruzvztepqa/sql

-- First, check if challenge_notifications table exists
-- If not, create it
CREATE TABLE IF NOT EXISTS challenge_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_push_sent BOOLEAN NOT NULL DEFAULT FALSE,
    push_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_challenge_notifications_user_id ON challenge_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_notifications_unread ON challenge_notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_challenge_notifications_created_at ON challenge_notifications(created_at);

-- Enable RLS
ALTER TABLE challenge_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view own notifications" ON challenge_notifications;
CREATE POLICY "Users can view own notifications"
    ON challenge_notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON challenge_notifications;
CREATE POLICY "Users can update own notifications"
    ON challenge_notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

-- Create the missing function
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM challenge_notifications
    WHERE user_id = p_user_id AND NOT is_read;

    RETURN COALESCE(v_count, 0);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count(UUID) TO anon;

-- Grant table access
GRANT SELECT, UPDATE ON challenge_notifications TO authenticated;
GRANT ALL ON challenge_notifications TO service_role;

-- Verify function was created
SELECT 'Function created successfully!' AS status
WHERE EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_unread_notification_count'
);
