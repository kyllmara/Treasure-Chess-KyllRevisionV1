-- ============================================================================
-- Migration: Fix Games INSERT RLS Policy
-- ============================================================================
-- Problem: Users cannot create games when accepting challenges because there's
-- no INSERT policy on the games table.
--
-- Solution: Add an INSERT policy that allows authenticated users to create
-- games where they are a participant (white or black player).
-- ============================================================================

-- Add INSERT policy for games
-- Users can create games where they are one of the participants
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'games'
        AND policyname = 'Users can create games as participant'
    ) THEN
        CREATE POLICY "Users can create games as participant" ON games
            FOR INSERT
            TO authenticated
            WITH CHECK (
                -- User must be either the white or black player
                white_player_id = auth.uid()
                OR black_player_id = auth.uid()
            );
    END IF;
END $$;

-- Also ensure game_moves can be inserted by participants
-- Check if policy exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'game_moves'
        AND policyname = 'Participants can insert moves'
    ) THEN
        CREATE POLICY "Participants can insert moves" ON game_moves
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM games g
                    WHERE g.id = game_id
                    AND (g.white_player_id = auth.uid() OR g.black_player_id = auth.uid())
                )
            );
    END IF;
END $$;

-- Grant necessary permissions
GRANT INSERT ON games TO authenticated;
GRANT INSERT ON game_moves TO authenticated;
