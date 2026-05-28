-- ============================================================================
-- Migration 079: Add 'declined' to challenge_status enum
-- ============================================================================
-- The challenge_status enum currently has: pending, accepted, cancelled, expired
-- We need 'declined' so that when an opponent declines a direct challenge,
-- the creator can choose to make it public or cancel it.
-- ============================================================================

ALTER TYPE challenge_status ADD VALUE IF NOT EXISTS 'declined';
