-- ============================================================================
-- Migration 076: Fix Challenge Join-by-Code RLS
-- ============================================================================
-- Bug: The UPDATE policy on challenges requires is_public = TRUE for a
-- non-creator to join. Private challenges (join-by-code) have is_public = FALSE,
-- so the RLS silently blocks the UPDATE and the join fails.
--
-- Fix: Allow any authenticated user to set themselves as opponent on any
-- pending challenge with no opponent, regardless of is_public. The challenge
-- code / ID itself acts as the authorization for private challenges.
-- ============================================================================

-- Drop and recreate the UPDATE policy
DROP POLICY IF EXISTS "Users can update challenges" ON challenges;

CREATE POLICY "Users can update challenges" ON challenges
  FOR UPDATE
  TO authenticated
  USING (
    -- Creator can always update their challenge
    creator_id = auth.uid()
    -- Opponent can update if they're set as opponent
    OR opponent_id = auth.uid()
    -- Anyone can join a PENDING challenge that has NO OPPONENT yet
    -- (for public challenges: found via board; for private: found via code/link)
    OR (status = 'pending' AND opponent_id IS NULL)
  )
  WITH CHECK (
    -- Creator can update anything on their challenge
    creator_id = auth.uid()
    -- Existing opponent can update
    OR opponent_id = auth.uid()
    -- New user can set themselves as opponent on open challenges
    OR (
      status = 'pending'
      AND opponent_id = auth.uid()  -- They must be setting themselves as opponent
    )
  );

-- Also fix SELECT so private challenge opponents can read the challenge
-- after getting the ID from a code/link
DROP POLICY IF EXISTS "Users can view relevant challenges" ON challenges;

CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
    OR (is_public = TRUE AND status = 'pending')
    -- Allow reading any pending challenge with no opponent (for join-by-code lookup)
    OR (status = 'pending' AND opponent_id IS NULL)
  );
