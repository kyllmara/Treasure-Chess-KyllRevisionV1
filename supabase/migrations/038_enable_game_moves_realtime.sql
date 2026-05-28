-- Enable realtime for game_moves table
-- This allows clients to subscribe to move changes for board sync

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_moves;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
