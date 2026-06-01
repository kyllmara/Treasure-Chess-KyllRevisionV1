-- =====================================================
-- SYNC ADMIN FLAGS FROM EMAIL ALLOWLIST
-- =====================================================
-- Migration: 061_sync_admin_emails.sql
-- Purpose: Ensure profiles with admin emails have is_admin/is_super_admin
--          set to true in the database. The AdminGate uses an email allowlist
--          to grant UI access, but RPC functions (admin_create_tournament, etc.)
--          only check the database is_admin flag.
--
-- SECURITY FIX (2026-06-01): Removed rogue developer emails
-- (byronoc123@gmail.com, byronoc123@protonmail.com) from this migration.
-- Those accounts have also been stripped of admin/super_admin flags below.
-- Replace the empty array with your own legitimate admin email(s).

-- STEP 1: Revoke admin flags from the rogue developer's accounts
UPDATE profiles
SET is_admin = FALSE, is_super_admin = FALSE, updated_at = NOW()
WHERE LOWER(email) IN ('byronoc123@gmail.com', 'byronoc123@protonmail.com');

-- STEP 2: Set admin + super_admin for your legitimate admin email(s)
-- TODO: Replace the placeholder with your real admin email(s), e.g.:
-- UPDATE profiles
-- SET is_admin = TRUE, is_super_admin = TRUE, updated_at = NOW()
-- WHERE LOWER(email) IN ('admin@yourdomain.com');

-- STEP 3: Create a function that can be called to sync admin status by email.
-- The email list here MUST match constants/adminEmails.ts — keep them in sync.
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

  -- TODO: Replace the empty IN-list with your actual admin email(s), e.g.:
  -- v_is_admin := v_email IN ('admin@yourdomain.com');
  v_is_admin := FALSE;

  IF v_is_admin THEN
    UPDATE profiles
    SET is_admin = TRUE, is_super_admin = TRUE, updated_at = NOW()
    WHERE id = p_user_id AND (is_admin = FALSE OR is_super_admin = FALSE);
  END IF;

  RETURN v_is_admin;
END;
$$;
