-- Add read tracking columns to support_tickets
-- user_last_read_at: when the user last viewed the conversation
-- admin_last_read_at: when an admin last viewed the conversation

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS admin_last_read_at TIMESTAMPTZ DEFAULT now();

-- RPC: Get count of tickets with unread admin replies for a user
CREATE OR REPLACE FUNCTION get_user_unread_support_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT t.id)::INTEGER INTO unread_count
  FROM support_tickets t
  WHERE t.user_id = p_user_id
    AND t.status != 'resolved'
    AND EXISTS (
      SELECT 1 FROM support_messages m
      WHERE m.ticket_id = t.id
        AND m.is_admin = true
        AND m.created_at > COALESCE(t.user_last_read_at, '1970-01-01'::timestamptz)
    );
  RETURN unread_count;
END;
$$;

-- RPC: Get count of tickets with unread user messages for admins
CREATE OR REPLACE FUNCTION get_admin_unread_support_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT t.id)::INTEGER INTO unread_count
  FROM support_tickets t
  WHERE EXISTS (
    SELECT 1 FROM support_messages m
    WHERE m.ticket_id = t.id
      AND m.is_admin = false
      AND m.created_at > COALESCE(t.admin_last_read_at, '1970-01-01'::timestamptz)
  );
  RETURN unread_count;
END;
$$;

-- RPC: Mark ticket as read by user
CREATE OR REPLACE FUNCTION mark_support_ticket_read_user(p_ticket_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE support_tickets
  SET user_last_read_at = now()
  WHERE id = p_ticket_id AND user_id = p_user_id;
END;
$$;

-- RPC: Mark ticket as read by admin
CREATE OR REPLACE FUNCTION mark_support_ticket_read_admin(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE support_tickets
  SET admin_last_read_at = now()
  WHERE id = p_ticket_id;
END;
$$;
