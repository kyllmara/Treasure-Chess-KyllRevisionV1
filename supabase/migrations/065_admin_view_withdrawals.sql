-- ============================================================================
-- Migration: Allow admin users to view all withdrawals and transactions
-- ============================================================================

-- Admin users can view all withdrawals (not just their own)
CREATE POLICY "Admins can view all withdrawals"
  ON public.withdrawals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
    )
  );

-- Also ensure admins can view all transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transactions' AND policyname = 'Admins can view all transactions'
  ) THEN
    CREATE POLICY "Admins can view all transactions"
      ON public.transactions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
        )
      );
  END IF;
END $$;
