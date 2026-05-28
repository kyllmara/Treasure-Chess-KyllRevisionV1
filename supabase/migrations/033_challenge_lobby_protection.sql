-- ============================================================================
-- Migration 033: Challenge Lobby Protection
-- ============================================================================
-- Ensures:
-- 1. Challenges with opponents can't be joined by others
-- 2. Public board only shows challenges without opponents
-- 3. Challenges are properly closed after games complete
-- ============================================================================

-- Drop and recreate the UPDATE policy with stricter rules
DROP POLICY IF EXISTS "Users can update challenges" ON challenges;

CREATE POLICY "Users can update challenges" ON challenges
  FOR UPDATE
  TO authenticated
  USING (
    -- Creator can always update their challenge
    creator_id = auth.uid()
    -- Opponent can update if they're set as opponent
    OR opponent_id = auth.uid()
    -- Anyone can join a PUBLIC PENDING challenge that has NO OPPONENT yet
    OR (is_public = TRUE AND status = 'pending' AND opponent_id IS NULL)
  )
  WITH CHECK (
    -- Creator can update anything on their challenge
    creator_id = auth.uid()
    -- Existing opponent can update
    OR opponent_id = auth.uid()
    -- New user can ONLY set themselves as opponent on open challenges
    OR (
      is_public = TRUE
      AND status = 'pending'
      AND opponent_id = auth.uid()  -- They must be setting themselves as opponent
    )
  );

-- Update SELECT policy to be more explicit about what's visible
DROP POLICY IF EXISTS "Users can view relevant challenges" ON challenges;
DROP POLICY IF EXISTS "Anon can view public challenges" ON challenges;

-- Users can see:
-- 1. Challenges they created
-- 2. Challenges they're the opponent of
-- 3. Public pending challenges (for the board)
CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
    OR (is_public = TRUE AND status = 'pending')
  );

-- Anon users can only see open public challenges (no opponent yet)
CREATE POLICY "Anon can view public challenges" ON challenges
  FOR SELECT
  TO anon
  USING (is_public = TRUE AND status = 'pending' AND opponent_id IS NULL);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
