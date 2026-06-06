-- Migration 133: Grant missing UPDATE permission on games to authenticated role.
--
-- executeMove in online-game.tsx calls supabase.from("games").update(...) directly.
-- Without this GRANT, the update fails with "permission denied for table games"
-- even though the RLS UPDATE policy is correctly defined.
-- The existing RLS policy already restricts updates to game participants only.

GRANT UPDATE ON games TO authenticated;
