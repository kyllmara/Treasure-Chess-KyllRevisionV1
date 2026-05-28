-- ============================================================================
-- Migration 080: Update RLS to support declined challenges
-- ============================================================================
-- The SELECT policy only allows reading pending+public or own challenges.
-- After a challenge is declined, the creator needs to read it (status='declined')
-- to decide Make Public vs Cancel. The existing policy already covers this
-- via `creator_id = auth.uid()`, but we also need the DELETE policy to allow
-- creators to delete their declined challenges.
-- ============================================================================

-- Ensure creators can delete their own challenges (any status)
DROP POLICY IF EXISTS "Users can delete challenges" ON challenges;

CREATE POLICY "Users can delete challenges" ON challenges
  FOR DELETE
  TO authenticated
  USING (
    creator_id = auth.uid()
  );
