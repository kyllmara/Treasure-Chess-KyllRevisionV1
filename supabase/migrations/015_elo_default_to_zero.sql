-- Migration: Change default ELO rating from 1200 to 0
-- New users should start with 0 ELO until they play their first game

-- Update the default value for new profiles
ALTER TABLE profiles ALTER COLUMN elo_rating SET DEFAULT 0;

-- Reset ELO to 0 for existing users who haven't played any games
-- This ensures new users who registered but haven't played start at 0
UPDATE profiles
SET elo_rating = 0
WHERE games_played = 0 AND elo_rating = 1200;
