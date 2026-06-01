BEGIN;

-- Revoke direct client access to complete_house_challenge.
-- Win evaluation is now done server-side in the complete-house-challenge edge function.
REVOKE EXECUTE ON FUNCTION complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN) FROM anon;

-- Ensure service_role can still call it (edge function uses service_role key)
GRANT EXECUTE ON FUNCTION complete_house_challenge(UUID, BOOLEAN, INTEGER, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

COMMIT;
