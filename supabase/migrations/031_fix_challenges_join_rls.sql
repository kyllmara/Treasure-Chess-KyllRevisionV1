-- ============================================================================
-- Migration 031: Fix Challenges RLS to Allow Joining
-- ============================================================================
-- The UPDATE policy currently requires user to be creator OR opponent.
-- But when joining a challenge, opponent_id is NULL, so users can't set
-- themselves as the opponent.
--
-- Fix: Allow authenticated users to update public pending challenges
-- to set themselves as opponent, OR update challenges they're part of.
-- ============================================================================

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update own challenges" ON challenges;

-- ============================================================================
-- NEW UPDATE Policy:
-- - Challenge participants can update their challenges
-- - Any authenticated user can join a public pending challenge (set opponent_id)
-- ============================================================================
CREATE POLICY "Users can update challenges" ON challenges
  FOR UPDATE
  TO authenticated
  USING (
    -- User is creator or opponent (already participating)
    creator_id = auth.uid()
    OR opponent_id = auth.uid()
    -- OR it's a public pending challenge they could join
    OR (is_public = TRUE AND status = 'pending' AND opponent_id IS NULL)
  )
  WITH CHECK (
    -- Creator can update anything
    creator_id = auth.uid()
    -- Opponent can update
    OR opponent_id = auth.uid()
    -- Anyone can set themselves as opponent on public pending challenges
    OR (
      is_public = TRUE
      AND status = 'pending'
      AND opponent_id = auth.uid()  -- They're setting themselves as opponent
    )
  );

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
