-- Migration 126: Revoke client-callable balance mutation RPCs
-- Addresses client-side audit findings CS-AF-01 and CS-AF-02.
--
-- HIGH CS-AF-01: credit_user_balance has no DB function definition at all —
--   the client call (lib/wallet.ts) uses `(supabase.rpc as any)` to suppress
--   TS errors and will error at runtime if invoked. Defensively revoke any
--   future accidental GRANT and create a no-op stub that rejects immediately,
--   so a future migration cannot accidentally grant it.
--
-- HIGH CS-AF-02: update_ledger_balance (migration 024) is SECURITY DEFINER
--   but has no auth.uid() ownership check — any authenticated user can
--   manipulate any ledger account balance. Revoke EXECUTE from authenticated.

BEGIN;

-- ============================================================================
-- 1. update_ledger_balance: revoke from authenticated (CS-AF-02 / HIGH-2)
--    The function must only be callable by service_role (Edge Functions).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION update_ledger_balance(TEXT, TEXT, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION update_ledger_balance(TEXT, TEXT, NUMERIC, TEXT) FROM anon;

-- ============================================================================
-- 2. credit_user_balance: create a hard-failing stub and revoke (CS-AF-01 / HIGH-1)
--    No migration previously defined this function — the client call in
--    lib/wallet.ts is dead code that errors at runtime. We create a stub that
--    explicitly raises an exception (SECURITY DEFINER, no grants) so that even
--    if service_role tries to call it, the intent is clear: deposit crediting
--    must go through the process-deposits Edge Function, not this RPC.
-- ============================================================================

CREATE OR REPLACE FUNCTION credit_user_balance(
    p_user_id   UUID,
    p_amount    NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
    -- This function is intentionally disabled.
    -- All deposit crediting must be performed by the process-deposits Edge Function
    -- using the service_role key, after on-chain verification.
    RAISE EXCEPTION 'credit_user_balance is not callable directly. Use the process-deposits Edge Function.';
END;
$$;

-- Revoke from all non-superuser roles
REVOKE EXECUTE ON FUNCTION credit_user_balance(UUID, NUMERIC, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION credit_user_balance(UUID, NUMERIC, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION credit_user_balance(UUID, NUMERIC, TEXT) FROM public;

COMMIT;
