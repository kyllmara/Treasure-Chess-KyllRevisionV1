-- Fix: Exclude resolved tickets from admin unread count

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
  WHERE t.status != 'resolved'
    AND EXISTS (
      SELECT 1 FROM support_messages m
      WHERE m.ticket_id = t.id
        AND m.is_admin = false
        AND m.created_at > COALESCE(t.admin_last_read_at, '1970-01-01'::timestamptz)
    );
  RETURN unread_count;
END;
$$;
