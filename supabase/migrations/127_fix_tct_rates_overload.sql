BEGIN;

-- Drop the old 2-parameter overload (no audit trail, no caller tracking)
-- The 3-parameter version in migration 118 (admin_update_tct_rates(UUID, NUMERIC, NUMERIC))
-- is the correct audited version.
DROP FUNCTION IF EXISTS admin_update_tct_rates(NUMERIC, NUMERIC);

-- Grant service_role access to the audited 3-parameter version
-- (migration 122 only granted the 2-param version)
GRANT EXECUTE ON FUNCTION admin_update_tct_rates(UUID, NUMERIC, NUMERIC) TO service_role;

-- Revoke from authenticated in case blanket grant from 001 gave access
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(UUID, NUMERIC, NUMERIC) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_update_tct_rates(UUID, NUMERIC, NUMERIC) FROM anon;

COMMIT;
