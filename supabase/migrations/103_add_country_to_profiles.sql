-- Migration: Add country field to profiles
-- This allows users to set their country which will be displayed on the leaderboard

-- Add country column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- Create an index for potential country-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);

-- Add comment for documentation
COMMENT ON COLUMN profiles.country IS 'ISO 3166-1 alpha-2 country code (e.g., US, GB, DE)';
