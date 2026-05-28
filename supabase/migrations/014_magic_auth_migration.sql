-- =====================================================
-- MIGRATION: Magic Link Authentication Support
-- =====================================================
-- This migration adds support for Magic Link authentication
-- while maintaining backward compatibility with existing Privy users.
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jgjhmivnlvruzvztepqa/sql
-- =====================================================

-- =====================================================
-- 1. ADD MAGIC USER ID COLUMN
-- =====================================================
-- Add magic_user_id column (nullable for existing Privy users)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS magic_user_id TEXT UNIQUE;

-- Make privy_user_id nullable for new Magic users
ALTER TABLE profiles
ALTER COLUMN privy_user_id DROP NOT NULL;

-- Make embedded_wallet_address nullable (Magic handles wallets differently)
ALTER TABLE profiles
ALTER COLUMN embedded_wallet_address DROP NOT NULL;

-- Add index for Magic user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_magic_user_id ON profiles(magic_user_id) WHERE magic_user_id IS NOT NULL;

-- =====================================================
-- 2. ADD ADMIN COLUMNS
-- =====================================================
-- Add admin-related columns if they don't exist
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS admin_2fa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin) WHERE is_admin = TRUE;

-- =====================================================
-- 3. FIX RLS POLICIES FOR PROFILES
-- =====================================================

-- Drop existing policies that reference privy_user_id
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can create profile" ON profiles;

-- Create new INSERT policy that allows authenticated users to create their profile
CREATE POLICY "Authenticated users can create profile" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if the magic_user_id matches the JWT subject OR
    -- if the privy_user_id matches the JWT subject
    magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    OR (
      -- Also allow service role to create profiles
      current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    )
  );

-- Create new UPDATE policy that supports both Privy and Magic auth
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- =====================================================
-- 4. FIX RLS POLICIES FOR BALANCES
-- =====================================================
DROP POLICY IF EXISTS "Users can view own balance" ON balances;

CREATE POLICY "Users can view own balance" ON balances
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM profiles
      WHERE magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
         OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Allow users to have their balance created (for new users)
DROP POLICY IF EXISTS "System can insert balance" ON balances;
CREATE POLICY "System can insert balance" ON balances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM profiles
      WHERE magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
         OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- =====================================================
-- 5. FIX RLS POLICIES FOR CHALLENGES
-- =====================================================
DROP POLICY IF EXISTS "Users can view relevant challenges" ON challenges;

CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT
  TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM profiles
      WHERE magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
         OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
    OR opponent_id IN (
      SELECT id FROM profiles
      WHERE magic_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
         OR privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    )
    OR opponent_id IS NULL  -- Public challenges
    OR is_public = TRUE
  );

-- =====================================================
-- 6. CREATE HELPER FUNCTION FOR CURRENT USER
-- =====================================================
-- This function returns the profile ID for the currently authenticated user
CREATE OR REPLACE FUNCTION get_current_user_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_profile_id UUID;
  v_jwt_sub TEXT;
BEGIN
  -- Get the JWT subject (user identifier)
  v_jwt_sub := current_setting('request.jwt.claims', true)::json->>'sub';

  IF v_jwt_sub IS NULL THEN
    RETURN NULL;
  END IF;

  -- Look up profile by magic_user_id or privy_user_id
  SELECT id INTO v_profile_id
  FROM profiles
  WHERE magic_user_id = v_jwt_sub OR privy_user_id = v_jwt_sub
  LIMIT 1;

  RETURN v_profile_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_current_user_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_profile_id() TO anon;

-- =====================================================
-- 7. VERIFICATION
-- =====================================================
-- Check that columns were added successfully
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'magic_user_id'
  ) THEN
    RAISE EXCEPTION 'magic_user_id column was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    RAISE EXCEPTION 'is_admin column was not created';
  END IF;

  RAISE NOTICE 'Migration completed successfully!';
END;
$$;

SELECT 'Magic Link migration completed!' AS status;
