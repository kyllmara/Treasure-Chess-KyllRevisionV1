-- ============================================================================
-- Migration: Add ready status tracking for challenge lobbies
-- ============================================================================
-- This enables a symmetric "ready up" flow for wager challenges:
-- 1. Creator creates challenge, waits in lobby
-- 2. Opponent joins lobby
-- 3. Both players mark themselves "Ready" (in any order)
-- 4. When BOTH are ready -> funds locked for both -> game starts

-- Add columns to track each player's ready status
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS creator_ready BOOLEAN DEFAULT FALSE;

ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS opponent_ready BOOLEAN DEFAULT FALSE;

-- Add escrow_status column to track fund locking progress
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS escrow_status TEXT
CHECK (escrow_status IN ('none', 'waiting', 'both_ready'))
DEFAULT 'none';

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_challenges_escrow_status ON challenges(escrow_status);
CREATE INDEX IF NOT EXISTS idx_challenges_ready_status ON challenges(creator_ready, opponent_ready);

COMMENT ON COLUMN challenges.creator_ready IS 'Whether the challenge creator has marked themselves ready in the lobby';
COMMENT ON COLUMN challenges.opponent_ready IS 'Whether the opponent has marked themselves ready in the lobby';
COMMENT ON COLUMN challenges.escrow_status IS 'Tracks escrow fund locking: none (not started), waiting (in lobby), both_ready (funds locked, game starting)';
