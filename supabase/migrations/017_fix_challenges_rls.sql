-- ============================================================================
-- Migration 017: Fix Challenges Table RLS Policies
-- ============================================================================
-- Updates RLS policies to use auth.uid() now that Magic Auth is integrated
-- with Supabase Auth via the magic-auth Edge Function.
--
-- The Edge Function creates Supabase Auth users with ID = profile.id
-- so auth.uid() in RLS matches profile.id / creator_id.
-- ============================================================================

-- Drop ALL existing policies on challenges table (including the anon one)
DROP POLICY IF EXISTS "Users can view relevant challenges" ON challenges;
DROP POLICY IF EXISTS "Users can create challenges" ON challenges;
DROP POLICY IF EXISTS "Users can update own challenges" ON challenges;
DROP POLICY IF EXISTS "Users can delete own challenges" ON challenges;
DROP POLICY IF EXISTS "Service role has full access" ON challenges;
DROP POLICY IF EXISTS "Allow read challenges" ON challenges;
DROP POLICY IF EXISTS "Allow insert challenges" ON challenges;
DROP POLICY IF EXISTS "Allow update challenges" ON challenges;
DROP POLICY IF EXISTS "Allow delete challenges" ON challenges;
DROP POLICY IF EXISTS "Anon can view public challenges" ON challenges;

-- Enable RLS on challenges table
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT Policy: Users can view challenges they're involved in or public ones
-- ============================================================================
CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
    OR (is_public = TRUE AND status = 'pending')
  );

-- Also allow anon access for public challenges (for browsing before login)
CREATE POLICY "Anon can view public challenges" ON challenges
  FOR SELECT
  TO anon
  USING (is_public = TRUE AND status = 'pending');

-- ============================================================================
-- INSERT Policy: Authenticated users can create challenges
-- ============================================================================
CREATE POLICY "Users can create challenges" ON challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

-- ============================================================================
-- UPDATE Policy: Users can update challenges they created or are invited to
-- ============================================================================
CREATE POLICY "Users can update own challenges" ON challenges
  FOR UPDATE
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
  )
  WITH CHECK (
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
  );

-- ============================================================================
-- DELETE Policy: Users can only delete their own pending challenges
-- ============================================================================
CREATE POLICY "Users can delete own challenges" ON challenges
  FOR DELETE
  TO authenticated
  USING (
    creator_id = auth.uid()
    AND status = 'pending'
  );

-- ============================================================================
-- Service role has full access for background jobs
-- ============================================================================
CREATE POLICY "Service role has full access" ON challenges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- 1. Enabled RLS on challenges table
-- 2. SELECT: Users see their own + public pending challenges
-- 3. INSERT: Users can create with their ID as creator
-- 4. UPDATE: Challenge participants can update
-- 5. DELETE: Creators can delete pending challenges
-- 6. Service role has full access for backend jobs
-- ============================================================================
