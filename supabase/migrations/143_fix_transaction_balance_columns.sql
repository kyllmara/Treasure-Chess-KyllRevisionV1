-- Balance snapshot columns are optional for Stripe-sourced transactions
-- (deposit/withdraw) where we don't have pre/post snapshots readily available.
ALTER TABLE transactions
  ALTER COLUMN balance_before_tct DROP NOT NULL,
  ALTER COLUMN balance_after_tct DROP NOT NULL;
