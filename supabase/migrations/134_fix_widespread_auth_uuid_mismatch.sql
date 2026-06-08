-- Fix the systemic auth.uid() vs profiles.id UUID mismatch across RLS policies.
--
-- profiles.id (the "user id" used everywhere as user_id/creator_id/player_id/etc.)
-- is NOT the same value as profiles.auth_user_id (= auth.uid()::text, the Supabase
-- Auth user id). Every policy that compared a profiles.id-referencing column
-- directly to auth.uid() was therefore always false, silently denying access for
-- 100% of users (verified: 0 of N profiles have id::text = auth_user_id).
--
-- This migration adds a helper that resolves the caller's profile id, and
-- rewrites every affected policy to use it.

CREATE OR REPLACE FUNCTION auth_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid()::text
$$;

-- ============================================================
-- admin_audit_log
-- ============================================================
DROP POLICY IF EXISTS "Only admins can view audit log" ON admin_audit_log;
CREATE POLICY "Only admins can view audit log" ON admin_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

-- ============================================================
-- admin_sessions
-- ============================================================
DROP POLICY IF EXISTS "Admins can view own sessions" ON admin_sessions;
CREATE POLICY "Admins can view own sessions" ON admin_sessions
  FOR SELECT TO authenticated
  USING (
    admin_id = auth_profile_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_profile_id()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

-- ============================================================
-- audit_logs
-- ============================================================
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- balances
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own balance" ON balances;
CREATE POLICY "Users can insert own balance" ON balances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can update own balance" ON balances;
CREATE POLICY "Users can update own balance" ON balances
  FOR UPDATE TO authenticated
  USING (user_id = auth_profile_id())
  WITH CHECK (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can view own balance" ON balances;
CREATE POLICY "Users can view own balance" ON balances
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- challenge_notifications
-- ============================================================
DROP POLICY IF EXISTS "Users can update own notifications" ON challenge_notifications;
CREATE POLICY "Users can update own notifications" ON challenge_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can view own notifications" ON challenge_notifications;
CREATE POLICY "Users can view own notifications" ON challenge_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- challenge_objectives
-- ============================================================
DROP POLICY IF EXISTS "Challenge creator can add objectives" ON challenge_objectives;
CREATE POLICY "Challenge creator can add objectives" ON challenge_objectives
  FOR INSERT TO authenticated
  WITH CHECK (challenge_id IN (
    SELECT id FROM challenges WHERE creator_id = auth_profile_id()
  ));

-- ============================================================
-- challenges
-- ============================================================
DROP POLICY IF EXISTS "Users can create challenges" ON challenges;
CREATE POLICY "Users can create challenges" ON challenges
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can delete challenges" ON challenges;
CREATE POLICY "Users can delete challenges" ON challenges
  FOR DELETE TO authenticated
  USING (creator_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can delete own challenges" ON challenges;
CREATE POLICY "Users can delete own challenges" ON challenges
  FOR DELETE TO authenticated
  USING (creator_id = auth_profile_id() AND status = 'pending'::challenge_status);

DROP POLICY IF EXISTS "Users can update challenges" ON challenges;
CREATE POLICY "Users can update challenges" ON challenges
  FOR UPDATE TO authenticated
  USING (
    creator_id = auth_profile_id()
    OR opponent_id = auth_profile_id()
    OR (status = 'pending'::challenge_status AND opponent_id IS NULL)
  )
  WITH CHECK (
    creator_id = auth_profile_id()
    OR opponent_id = auth_profile_id()
    OR (status = 'pending'::challenge_status AND opponent_id = auth_profile_id())
  );

DROP POLICY IF EXISTS "Users can view relevant challenges" ON challenges;
CREATE POLICY "Users can view relevant challenges" ON challenges
  FOR SELECT TO authenticated
  USING (
    creator_id = auth_profile_id()
    OR opponent_id = auth_profile_id()
    OR (is_public = true AND status = 'pending'::challenge_status)
    OR (status = 'pending'::challenge_status AND opponent_id IS NULL)
  );

-- ============================================================
-- game_history
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own game history" ON game_history;
CREATE POLICY "Users can view their own game history" ON game_history
  FOR SELECT TO authenticated
  USING (
    player_id = auth_profile_id()
    OR opponent_id = auth_profile_id()
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- ============================================================
-- house_challenge_attempts
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all house challenge attempts" ON house_challenge_attempts;
CREATE POLICY "Admins can view all house challenge attempts" ON house_challenge_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can view own house challenge attempts" ON house_challenge_attempts;
CREATE POLICY "Users can view own house challenge attempts" ON house_challenge_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- house_challenges
-- ============================================================
DROP POLICY IF EXISTS "Admins can create house challenges" ON house_challenges;
CREATE POLICY "Admins can create house challenges" ON house_challenges
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Admins can update house challenges" ON house_challenges;
CREATE POLICY "Admins can update house challenges" ON house_challenges
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Admins can view all house challenges" ON house_challenges;
CREATE POLICY "Admins can view all house challenges" ON house_challenges
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

-- ============================================================
-- payment_orders
-- ============================================================
DROP POLICY IF EXISTS "Users can view own payment orders" ON payment_orders;
CREATE POLICY "Users can view own payment orders" ON payment_orders
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- pending_deposits
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own pending deposits" ON pending_deposits;
CREATE POLICY "Users can view their own pending deposits" ON pending_deposits
  FOR SELECT TO authenticated
  USING (
    user_id = auth_profile_id()
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );

-- ============================================================
-- pending_fiat_deposits
-- ============================================================
DROP POLICY IF EXISTS "Admins can update fiat deposits" ON pending_fiat_deposits;
CREATE POLICY "Admins can update fiat deposits" ON pending_fiat_deposits
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Admins can view all fiat deposits" ON pending_fiat_deposits;
CREATE POLICY "Admins can view all fiat deposits" ON pending_fiat_deposits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can create fiat deposit requests" ON pending_fiat_deposits;
CREATE POLICY "Users can create fiat deposit requests" ON pending_fiat_deposits
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can view own fiat deposits" ON pending_fiat_deposits;
CREATE POLICY "Users can view own fiat deposits" ON pending_fiat_deposits
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

-- ============================================================
-- pending_on_chain_games
-- ============================================================
DROP POLICY IF EXISTS "pending_games_delete" ON pending_on_chain_games;
CREATE POLICY "pending_games_delete" ON pending_on_chain_games
  FOR DELETE TO authenticated
  USING (creator_user_id = auth_profile_id());

-- ============================================================
-- platform_connections
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own platform connections" ON platform_connections;
CREATE POLICY "Users can insert own platform connections" ON platform_connections
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can update own platform connections" ON platform_connections;
CREATE POLICY "Users can update own platform connections" ON platform_connections
  FOR UPDATE TO authenticated
  USING (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can view own platform connections" ON platform_connections;
CREATE POLICY "Users can view own platform connections" ON platform_connections
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

-- ============================================================
-- play_now_queue (drop the broken duplicate; correct ones already exist)
-- ============================================================
DROP POLICY IF EXISTS "Users can view queue entries" ON play_now_queue;
CREATE POLICY "Users can view queue entries" ON play_now_queue
  FOR SELECT TO authenticated
  USING (
    status = 'waiting'::text
    OR user_id = auth_profile_id()
    OR matched_with_id = auth_profile_id()
  );

-- ============================================================
-- rake_ledger
-- ============================================================
DROP POLICY IF EXISTS "Users can view own ledger entries" ON rake_ledger;
CREATE POLICY "Users can view own ledger entries" ON rake_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- reward_payouts (the "OR true" made this effectively public; tighten it)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own payouts" ON reward_payouts;
CREATE POLICY "Users can view own payouts" ON reward_payouts
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- settlement_logs
-- ============================================================
DROP POLICY IF EXISTS "settlement_logs_read" ON settlement_logs;
CREATE POLICY "settlement_logs_read" ON settlement_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM games g
    WHERE g.id = settlement_logs.game_id
      AND (g.white_player_id = auth_profile_id() OR g.black_player_id = auth_profile_id())
  ));

-- ============================================================
-- support_messages
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert messages on any ticket" ON support_messages;
CREATE POLICY "Admins can insert messages on any ticket" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_profile_id() = sender_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth_profile_id()
        AND (profiles.is_admin = true OR profiles.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS "Admins can view all messages" ON support_messages;
CREATE POLICY "Admins can view all messages" ON support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can insert messages on own tickets" ON support_messages;
CREATE POLICY "Users can insert messages on own tickets" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_profile_id() = sender_id
    AND EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_messages.ticket_id
        AND support_tickets.user_id = auth_profile_id()
    )
  );

DROP POLICY IF EXISTS "Users can view messages on own tickets" ON support_messages;
CREATE POLICY "Users can view messages on own tickets" ON support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM support_tickets
    WHERE support_tickets.id = support_messages.ticket_id
      AND support_tickets.user_id = auth_profile_id()
  ));

-- ============================================================
-- support_tickets
-- ============================================================
DROP POLICY IF EXISTS "Admins can update any ticket" ON support_tickets;
CREATE POLICY "Admins can update any ticket" ON support_tickets
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Admins can view all tickets" ON support_tickets;
CREATE POLICY "Admins can view all tickets" ON support_tickets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can create own tickets" ON support_tickets;
CREATE POLICY "Users can create own tickets" ON support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can view own tickets" ON support_tickets;
CREATE POLICY "Users can view own tickets" ON support_tickets
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

-- ============================================================
-- stream_events / stream_sessions / stream_settings
-- ============================================================
DROP POLICY IF EXISTS "Users can view own stream events" ON stream_events;
CREATE POLICY "Users can view own stream events" ON stream_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM stream_sessions s
    WHERE s.id = stream_events.session_id AND s.user_id = auth_profile_id()
  ));

DROP POLICY IF EXISTS "Users can insert own stream sessions" ON stream_sessions;
CREATE POLICY "Users can insert own stream sessions" ON stream_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can update own stream sessions" ON stream_sessions;
CREATE POLICY "Users can update own stream sessions" ON stream_sessions
  FOR UPDATE TO authenticated
  USING (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can insert own stream settings" ON stream_settings;
CREATE POLICY "Users can insert own stream settings" ON stream_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can update own stream settings" ON stream_settings;
CREATE POLICY "Users can update own stream settings" ON stream_settings
  FOR UPDATE TO authenticated
  USING (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can view own stream settings" ON stream_settings;
CREATE POLICY "Users can view own stream settings" ON stream_settings
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

-- ============================================================
-- tournament_registrations
-- ============================================================
DROP POLICY IF EXISTS "Users can register themselves" ON tournament_registrations;
CREATE POLICY "Users can register themselves" ON tournament_registrations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can unregister themselves" ON tournament_registrations;
CREATE POLICY "Users can unregister themselves" ON tournament_registrations
  FOR DELETE TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- tournament_templates / tournaments
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage templates" ON tournament_templates;
CREATE POLICY "Admins can manage templates" ON tournament_templates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth_profile_id() AND profiles.is_admin = true
  ));

DROP POLICY IF EXISTS "Admins can manage tournaments" ON tournaments;
CREATE POLICY "Admins can manage tournaments" ON tournaments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth_profile_id() AND profiles.is_admin = true
  ));

-- ============================================================
-- transactions
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
CREATE POLICY "Admins can view all transactions" ON transactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

-- ============================================================
-- user_achievements / user_kyc_status / user_rewards / user_wallets
-- ============================================================
DROP POLICY IF EXISTS "Users can view own achievement progress" ON user_achievements;
CREATE POLICY "Users can view own achievement progress" ON user_achievements
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id() OR earned_at IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own kyc status" ON user_kyc_status;
CREATE POLICY "Users can view own kyc status" ON user_kyc_status
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can view own rewards" ON user_rewards;
CREATE POLICY "Users can view own rewards" ON user_rewards
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

DROP POLICY IF EXISTS "user_wallets_own" ON user_wallets;
CREATE POLICY "user_wallets_own" ON user_wallets
  FOR ALL TO authenticated
  USING (user_id = auth_profile_id())
  WITH CHECK (user_id = auth_profile_id());

-- ============================================================
-- vault_statistics / vault_transactions
-- ============================================================
DROP POLICY IF EXISTS "Admin can read vault_statistics" ON vault_statistics;
CREATE POLICY "Admin can read vault_statistics" ON vault_statistics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can view own vault transactions" ON vault_transactions;
CREATE POLICY "Users can view own vault transactions" ON vault_transactions
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

-- ============================================================
-- withdrawal_limits / withdrawal_requests / withdrawals
-- ============================================================
DROP POLICY IF EXISTS "Users can view own withdrawal limits" ON withdrawal_limits;
CREATE POLICY "Users can view own withdrawal limits" ON withdrawal_limits
  FOR SELECT TO authenticated
  USING (user_id = auth_profile_id());

DROP POLICY IF EXISTS "Users can create withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can create withdrawal requests" ON withdrawal_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Users can view own withdrawal requests" ON withdrawal_requests;
CREATE POLICY "Users can view own withdrawal requests" ON withdrawal_requests
  FOR SELECT TO authenticated
  USING (auth_profile_id() = user_id);

DROP POLICY IF EXISTS "Admins can view all withdrawals" ON withdrawals;
CREATE POLICY "Admins can view all withdrawals" ON withdrawals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth_profile_id()
      AND (profiles.is_admin = true OR profiles.is_super_admin = true)
  ));

DROP POLICY IF EXISTS "Users can view their own withdrawals" ON withdrawals;
CREATE POLICY "Users can view their own withdrawals" ON withdrawals
  FOR SELECT TO authenticated
  USING (
    user_id = auth_profile_id()
    OR (auth.jwt() ->> 'role'::text) = 'service_role'::text
  );
