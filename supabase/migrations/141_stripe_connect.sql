-- Stripe Connect Express account ID per player.
-- Set when the player completes onboarding; used for automated payouts.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect
  ON profiles (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
