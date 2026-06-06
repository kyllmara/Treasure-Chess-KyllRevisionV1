-- ============================================================================
-- Migration 043: Update earnings for game 11350f28-10de-4d69-869d-10ef258a3052
-- ============================================================================
-- Data backfill for old deployment. Wrapped in IF EXISTS guards so it is a
-- no-op on a fresh database where these profile rows do not exist.
-- ============================================================================

DO $$
BEGIN
    DROP POLICY IF EXISTS "Service role can manage all balances" ON balances;
    CREATE POLICY "Service role can manage all balances" ON balances
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE id = '720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331') THEN
    INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
    VALUES ('720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331', 0, 0, 0, 0, 45, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      total_won_tct = balances.total_won_tct + 45,
      updated_at = NOW();
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8') THEN
    INSERT INTO balances (user_id, available_tct, locked_tct, total_deposited_tct, total_withdrawn_tct, total_won_tct, total_lost_tct, total_commission_paid_tct)
    VALUES ('f7ea0802-e965-47f1-83fb-44b0cd7c29e8', 0, 0, 0, 0, 0, 25, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      total_lost_tct = balances.total_lost_tct + 25,
      updated_at = NOW();
  END IF;
END $$;
