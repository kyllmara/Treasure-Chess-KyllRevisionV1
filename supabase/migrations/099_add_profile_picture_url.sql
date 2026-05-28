-- ============================================================================
-- Migration 099: Add profile_picture_url to profiles
--
-- Allows users to save dragon avatar URLs (or any avatar URL) as their
-- profile picture, persisted across sessions.
-- Also updates the update_user_profile RPC function to accept the new field.
-- ============================================================================

-- 1. Add profile_picture_url column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- 2. Drop old function signature to avoid overload conflicts
DROP FUNCTION IF EXISTS update_user_profile(UUID, TEXT, INTEGER);

-- 3. Create the updated function with profile_picture_url support
CREATE OR REPLACE FUNCTION update_user_profile(
  p_profile_id UUID,
  p_username TEXT DEFAULT NULL,
  p_avatar_index INTEGER DEFAULT NULL,
  p_profile_picture_url TEXT DEFAULT NULL
)
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles;
BEGIN
  -- Check if username is being changed and if so, check uniqueness
  IF p_username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE username = p_username
      AND id != p_profile_id
    ) THEN
      RAISE EXCEPTION 'Username already taken';
    END IF;
  END IF;

  -- Update the profile
  UPDATE profiles
  SET
    username = COALESCE(p_username, username),
    avatar_index = COALESCE(p_avatar_index, avatar_index),
    profile_picture_url = COALESCE(p_profile_picture_url, profile_picture_url),
    updated_at = NOW()
  WHERE id = p_profile_id
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN v_profile;
END;
$$;

-- 4. Re-grant permissions (using full signature to avoid ambiguity)
GRANT EXECUTE ON FUNCTION update_user_profile(UUID, TEXT, INTEGER, TEXT) TO public;
GRANT EXECUTE ON FUNCTION update_user_profile(UUID, TEXT, INTEGER, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_user_profile(UUID, TEXT, INTEGER, TEXT) TO authenticated;
