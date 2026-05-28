-- =====================================================
-- SYNC ADMIN FLAGS FROM EMAIL ALLOWLIST
-- =====================================================
-- Migration: 061_sync_admin_emails.sql
-- Purpose: Ensure profiles with admin emails have is_admin/is_super_admin
--          set to true in the database. The AdminGate uses an email allowlist
--          to grant UI access, but RPC functions (admin_create_tournament, etc.)
--          only check the database is_admin flag.

-- Set admin + super_admin for the known admin emails
UPDATE profiles
SET is_admin = TRUE, is_super_admin = TRUE
WHERE LOWER(email) IN ('byronoc123@gmail.com', 'byronoc123@protonmail.com');

-- Create a function that can be called to sync admin status by email
-- This allows the client to trigger a sync if new admin emails are added
CREATE OR REPLACE FUNCTION sync_admin_status_by_email(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_is_admin BOOLEAN;
BEGIN
  SELECT LOWER(email) INTO v_email FROM profiles WHERE id = p_user_id;

  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if email is in the admin list
  v_is_admin := v_email IN ('byronoc123@gmail.com', 'byronoc123@protonmail.com');

  IF v_is_admin THEN
    UPDATE profiles
    SET is_admin = TRUE, is_super_admin = TRUE
    WHERE id = p_user_id AND (is_admin = FALSE OR is_super_admin = FALSE);
  END IF;

  RETURN v_is_admin;
END;
$$;
