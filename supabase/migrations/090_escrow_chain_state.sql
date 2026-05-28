-- Track on-chain escrow lifecycle state for exploit protection.
-- This lets game-complete and cleanup processes know what cleanup is needed
-- when a game ends with a partially-completed on-chain escrow.

-- Possible values:
--   'none'           — no on-chain escrow attempted
--   'creator_locked' — white player locked funds on-chain, black hasn't joined
--   'both_locked'    — both players locked on-chain, full escrow active
--   'settled'        — on-chain escrow settled after game end
--   'canceled'       — partial escrow was canceled (creator refunded)

ALTER TABLE game_escrows
  ADD COLUMN IF NOT EXISTS on_chain_escrow_state TEXT NOT NULL DEFAULT 'none';

-- Index for finding escrows that need cleanup
CREATE INDEX IF NOT EXISTS idx_game_escrows_chain_state
  ON game_escrows (on_chain_escrow_state)
  WHERE on_chain_escrow_state = 'creator_locked';
