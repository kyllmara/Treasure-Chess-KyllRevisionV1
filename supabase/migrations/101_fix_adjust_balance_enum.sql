-- ============================================================================
-- Migration 101: Add missing 'adjust_balance' value to admin_action_type enum
--
-- The claim_dragon_reward function (from migration 096) uses 'adjust_balance'
-- as the action_type when logging to admin_audit_log, but the enum only has
-- 'user_balance_adjust'. Add the missing value so reward claims succeed.
-- ============================================================================

ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'adjust_balance';
