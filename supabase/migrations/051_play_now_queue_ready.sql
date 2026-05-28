-- Add ready column to play_now_queue for lobby/ready-up flow
-- Players must both mark ready before escrow is locked (wager games)
ALTER TABLE play_now_queue ADD COLUMN ready BOOLEAN NOT NULL DEFAULT false;
