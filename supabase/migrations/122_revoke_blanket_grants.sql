BEGIN;

-- ============================================================================
-- HIGH-03: Revoke blanket grants from migration 001
-- ============================================================================

-- Revoke all from anon (they should not have direct table write access)
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revoke write access from authenticated on RPC-managed tables
-- (RLS controls SELECT; writes must go through SECURITY DEFINER RPCs)
REVOKE INSERT, UPDATE, DELETE ON balances FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON games FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON game_escrows FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON platform_vault FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON vault_statistics FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON vault_reconciliation FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON payment_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON tournament_prizes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON admin_audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON settlement_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON relay_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON house_challenge_attempts FROM authenticated;

-- ============================================================================
-- HIGH-04: Revoke admin function access from authenticated/anon
-- ============================================================================

-- Revoke any functions that anon may have inherited from the blanket GRANT in 001
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Re-grant the functions that anon legitimately needs (e.g. public read helpers)
-- get_tct_rates is intentionally public (seeded in 117 with GRANT ... TO anon)
GRANT EXECUTE ON FUNCTION get_tct_rates() TO anon;

-- Revoke admin RPCs from authenticated (service_role only, called via edge functions)
-- Signatures verified against migration 011_admin_system.sql and 117_tct_rates_in_platform_config.sql
REVOKE EXECUTE ON FUNCTION admin_ban_user(UUID, UUID, TEXT, INTEGER, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_unban_user(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_suspend_user(UUID, UUID, TEXT, INTEGER, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_unsuspend_user(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_grant_admin(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_get_dashboard_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_search_users(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_get_user_details(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION log_admin_action(UUID, admin_action_type, admin_action_severity, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, INET, TEXT, JSONB, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION check_expired_suspensions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) FROM authenticated;

-- Ensure service_role retains access for edge functions
GRANT EXECUTE ON FUNCTION admin_ban_user(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_unban_user(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_suspend_user(UUID, UUID, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_unsuspend_user(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_grant_admin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_dashboard_stats() TO service_role;
GRANT EXECUTE ON FUNCTION admin_search_users(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_user_details(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION log_admin_action(UUID, admin_action_type, admin_action_severity, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, INET, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION check_expired_suspensions() TO service_role;
GRANT EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) TO service_role;

COMMIT;
