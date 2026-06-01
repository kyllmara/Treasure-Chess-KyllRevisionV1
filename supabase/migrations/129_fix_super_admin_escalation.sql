-- ============================================================================
-- Migration 129: Restrict admin_grant_super_admin to service_role only
--
-- CRIT-02: admin_grant_super_admin was callable by any authenticated user.
-- An attacker could pass their own UUID as p_target_user_id to self-escalate
-- to super admin, bypassing the internal is_user_super_admin check by also
-- passing a known super admin UUID as p_super_admin_id.
--
-- Fix: Revoke EXECUTE from authenticated and anon; restrict to service_role.
-- Admin super-privilege operations must go through authenticated edge functions
-- that verify the caller's session server-side before invoking these RPCs.
--
-- Also revoke admin_revoke_admin (the super-admin-capable demotion function
-- from migration 097) from authenticated for the same reason — any user
-- could call it with a forged p_super_admin_id.
-- ============================================================================

BEGIN;

-- Revoke admin_grant_super_admin from all client-facing roles.
-- Defined in migration 098 with signature (UUID, UUID, TEXT).
REVOKE EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT) TO service_role;

-- Revoke admin_revoke_admin (super-admin demotion path, migration 097).
-- Signature: (UUID, UUID, TEXT).
-- Note: there is no separate admin_revoke_super_admin function in this codebase;
-- migration 097 implements super-admin revocation inside admin_revoke_admin.
REVOKE EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) TO service_role;

COMMIT;
