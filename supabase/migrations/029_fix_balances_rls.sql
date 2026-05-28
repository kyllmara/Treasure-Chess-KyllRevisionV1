-- =====================================================
-- Fix Balances RLS for Supabase Auth Integration
-- =====================================================
-- The magic-auth edge function creates Supabase Auth users with the
-- same ID as the profile ID. So auth.uid() == profile.id
--
-- Previous RLS checked magic_user_id or privy_user_id in JWT sub,
-- but now we use standard Supabase auth where sub == profile.id
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own balance" ON balances;
DROP POLICY IF EXISTS "System can insert balance" ON balances;

-- Create new policy that checks auth.uid() directly against user_id
-- (Since we create Supabase Auth users with id = profile.id)
CREATE POLICY "Users can view own balance" ON balances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to create their own balance record
CREATE POLICY "Users can insert own balance" ON balances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to update their own balance (for future features)
DROP POLICY IF EXISTS "Users can update own balance" ON balances;
CREATE POLICY "Users can update own balance" ON balances
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
