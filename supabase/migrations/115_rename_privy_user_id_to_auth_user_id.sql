-- Rename privy_user_id → auth_user_id across the profiles table.
-- The column previously stored Privy user IDs, then Magic Link issuer IDs,
-- and now stores Supabase Auth UUIDs. The new name reflects actual usage.
--
-- Also updates the profiles INSERT RLS policy and get_current_user_profile_id()
-- which are the two remaining live objects that still reference privy_user_id.
-- (balances + challenges policies were already migrated to auth.uid() in
--  029_fix_balances_rls.sql and 031_fix_challenges_join_rls.sql respectively.)

BEGIN;

-- 1. Add the new column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id TEXT;

-- 2. Backfill from privy_user_id
UPDATE profiles SET auth_user_id = privy_user_id WHERE auth_user_id IS NULL;

-- 3. Index for fast lookups by auth_user_id
DROP INDEX IF EXISTS idx_profiles_privy_user_id;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON profiles (auth_user_id);

-- 4. Replace the INSERT policy that references privy_user_id.
--    "Authenticated users can create profile" was created in 014_magic_auth_migration.sql
--    and never updated. Drop and recreate using auth.uid().
DROP POLICY IF EXISTS "Authenticated users can create profile" ON profiles;

CREATE POLICY "Authenticated users can create profile" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_user_id = auth.uid()::text
    OR auth.role() = 'service_role'
  );

-- 5. Also harden the UPDATE policy.
--    016_fix_profile_update_rls.sql left it as WITH CHECK (true) — restore proper auth check.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    auth_user_id = auth.uid()::text
    OR id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- 6. Add a SELECT policy if one doesn't exist (some migrations may not have created one).
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);  -- Profiles are intentionally public (leaderboard, opponent lookup)

-- 7. Replace get_current_user_profile_id() — only defined in 014, never updated.
CREATE OR REPLACE FUNCTION get_current_user_profile_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id
  FROM profiles
  WHERE auth_user_id = auth.uid()::text
  LIMIT 1;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_current_user_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_profile_id() TO anon;

-- 8. Drop privy_user_id — use CASCADE to automatically remove dependent RLS
--    policies on other tables (transactions, matchmaking_queue, payment_orders,
--    user_kyc_status, withdrawal_limits, admin_audit_log, admin_sessions,
--    user_rewards, user_achievements).  Migration 118 recreates most of them;
--    transactions and matchmaking_queue are recreated below.
ALTER TABLE profiles DROP COLUMN IF EXISTS privy_user_id CASCADE;

-- Recreate the two policies that migration 118 does not cover.
-- auth.uid() == profiles.id in this codebase (Supabase Auth UUID pattern).
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own queue entries" ON matchmaking_queue;
CREATE POLICY "Users can view own queue entries" ON matchmaking_queue
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 9. Drop magic_user_id — created by 014_magic_auth_migration.sql for Magic SDK,
--    never populated since switching to Supabase Auth. No current code reads or writes it.
DROP INDEX IF EXISTS idx_profiles_magic_user_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS magic_user_id;

COMMIT;
