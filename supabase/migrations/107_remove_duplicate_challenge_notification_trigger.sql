-- Migration 107: Remove duplicate challenge notification trigger
--
-- Problem: When a direct challenge is created, TWO notifications are sent:
-- 1. trg_notify_direct_challenge trigger inserts "New Challenge!" notification
-- 2. create_direct_challenge function inserts "You've Been Challenged!" notification
--
-- Solution: Drop the trigger since the function already handles notifications
-- with more detailed information (time control, wager amount).

DROP TRIGGER IF EXISTS trg_notify_direct_challenge ON challenges;

-- Optionally drop the function if it's not used elsewhere
DROP FUNCTION IF EXISTS notify_direct_challenge();
