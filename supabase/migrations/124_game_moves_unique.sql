BEGIN;

DO $$ BEGIN
  ALTER TABLE game_moves
    ADD CONSTRAINT uq_game_moves_game_move_number UNIQUE (game_id, move_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
