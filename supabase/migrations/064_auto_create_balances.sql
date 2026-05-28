-- ============================================================================
-- Migration: Auto-create balance rows for profiles + backfill existing
-- ============================================================================

-- 1. Create trigger function to auto-create balance row on profile insert
CREATE OR REPLACE FUNCTION create_balance_for_new_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.balances (user_id, available_tct, locked_tct)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Add unique constraint on user_id if not exists (needed for ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'balances_user_id_unique'
  ) THEN
    ALTER TABLE public.balances ADD CONSTRAINT balances_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 3. Create trigger
DROP TRIGGER IF EXISTS trigger_create_balance_for_profile ON public.profiles;
CREATE TRIGGER trigger_create_balance_for_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_balance_for_new_profile();

-- 4. Backfill: create balance rows for all existing profiles that don't have one
INSERT INTO public.balances (user_id, available_tct, locked_tct)
SELECT p.id, 0, 0
FROM public.profiles p
LEFT JOIN public.balances b ON b.user_id = p.id
WHERE b.id IS NULL;

-- 5. Add RLS policy for service_role to insert balances (for the trigger)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'balances' AND policyname = 'Service role can manage balances'
  ) THEN
    CREATE POLICY "Service role can manage balances" ON public.balances
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
