-- ============================================================================
-- Migration 132: Fix RLS policies that compare auth.uid() (auth UUID) against
-- profile UUIDs stored in various tables.
--
-- Root cause: profiles.id (profile UUID) != profiles.auth_user_id (auth UUID).
-- Policies that use "col = auth.uid()" where col holds a profile UUID will
-- always fail because auth.uid() returns the Supabase auth UUID, not the
-- profile UUID.
--
-- Tables fixed here: game_moves (critical — blocks move submission)
-- ============================================================================

-- game_moves INSERT: allow participants to insert moves
DROP POLICY IF EXISTS "Participants can insert moves" ON game_moves;
CREATE POLICY "Participants can insert moves" ON game_moves
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM games g
      WHERE g.id = game_moves.game_id
        AND (
          g.white_player_id IN (
            SELECT id FROM profiles WHERE auth_user_id = auth.uid()::text
          ) OR
          g.black_player_id IN (
            SELECT id FROM profiles WHERE auth_user_id = auth.uid()::text
          )
        )
    )
  );
