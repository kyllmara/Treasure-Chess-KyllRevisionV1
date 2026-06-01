-- Migration 125: Game timeout cron — index + setup instructions
--
-- The game-timeout-cron edge function resolves orphaned active games where
-- both players disconnected mid-game, leaving TCT locked in escrow indefinitely.
--
-- HOW TO ENABLE THE CRON JOB (Supabase Dashboard)
-- ─────────────────────────────────────────────────
-- 1. Go to: Database → Extensions → enable "pg_cron" (usually already on).
-- 2. Go to: Database → Cron Jobs → New cron job.
--    Name:     game-timeout-cleanup
--    Schedule: */30 * * * *   (every 30 minutes)
--    Command (HTTP request via pg_net):
--
--      SELECT net.http_post(
--        url     := '<YOUR_SUPABASE_URL>/functions/v1/game-timeout-cron',
--        headers := jsonb_build_object(
--          'Content-Type',  'application/json',
--          'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
--        ),
--        body    := '{}'::jsonb
--      );
--
--    Replace <YOUR_SUPABASE_URL> with your project's URL
--    (e.g., https://jgjhmivnlvruzvztepqa.supabase.co) and
--    <YOUR_SERVICE_ROLE_KEY> with the service_role key from
--    Project Settings → API.
--
--    Alternatively, if you have CRON_SECRET set as an edge function secret,
--    you can pass that instead of the Authorization header:
--
--      SELECT net.http_post(
--        url     := '<YOUR_SUPABASE_URL>/functions/v1/game-timeout-cron',
--        headers := jsonb_build_object(
--          'Content-Type',  'application/json',
--          'X-Cron-Secret', '<YOUR_CRON_SECRET>'
--        ),
--        body    := '{}'::jsonb
--      );
--
-- 3. Save. The job will run every 30 minutes automatically.
--
-- NOTE: pg_net must also be enabled (Database → Extensions → pg_net).
--       It is enabled by default on all Supabase projects.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- Index to make the timeout queries fast.
--
-- The cron function runs two queries against games(status, last_move_at)
-- and games(status, created_at). A partial index covering status='active'
-- keeps the scan narrow — in steady state there are far fewer active games
-- than completed/abandoned ones.
CREATE INDEX IF NOT EXISTS idx_games_active_last_move
  ON games (status, last_move_at)
  WHERE status = 'active';

COMMIT;
