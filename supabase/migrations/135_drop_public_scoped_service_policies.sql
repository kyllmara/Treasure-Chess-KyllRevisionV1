-- Critical fix: several "service role" / "system" policies were accidentally
-- created with `roles: {public}` instead of `service_role`, with qual/with_check
-- of `true`. Since `roles: public` is inherited by `authenticated` (and `anon`),
-- these policies granted ANY authenticated user full read/write access to:
--   - balances (any user could directly edit anyone's TCT balance)
--   - reward_payouts (any user could insert/update arbitrary payout rows)
--   - tournament_matches / tournament_prizes (full ALL access for anyone)
--   - tournament_registrations (anyone could update any registration)
--
-- service_role has BYPASSRLS (verified), so it never needed these policies to
-- operate — they are pure accidental exposure and can simply be dropped.
-- Where a correctly-scoped service_role duplicate exists (balances), it remains.

DROP POLICY IF EXISTS "Service role can manage balances" ON balances;
DROP POLICY IF EXISTS "System can insert payouts" ON reward_payouts;
DROP POLICY IF EXISTS "System can update payouts" ON reward_payouts;
DROP POLICY IF EXISTS "System can manage matches" ON tournament_matches;
DROP POLICY IF EXISTS "System can manage prizes" ON tournament_prizes;
DROP POLICY IF EXISTS "System can update registrations" ON tournament_registrations;

-- Re-add proper service_role-scoped equivalents so backend/edge-function code
-- paths keep an explicit, intention-revealing policy (belt-and-suspenders;
-- service_role bypasses RLS regardless, but this documents intent for the next reader).
CREATE POLICY "Service role can manage payouts" ON reward_payouts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tournament matches" ON tournament_matches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tournament prizes" ON tournament_prizes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage tournament registrations" ON tournament_registrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
