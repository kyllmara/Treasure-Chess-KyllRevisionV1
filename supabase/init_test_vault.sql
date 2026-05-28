-- =====================================================
-- INITIALIZE TEST VAULT FOR POLYGON AMOY TESTNET
-- =====================================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jgjhmivnlvruzvztepqa/sql
-- =====================================================

-- First, check if platform_vault table exists and has the vault
DO $$
BEGIN
  -- Delete any existing vault entries (for clean test setup)
  DELETE FROM platform_vault WHERE vault_address IS NOT NULL;

  -- Insert the test vault
  INSERT INTO platform_vault (
    vault_address,
    status,
    onchain_usdc_balance,
    total_tct_issued,
    total_usdc_value,
    total_commission_tct
  ) VALUES (
    '0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b',
    'active',
    1000000,  -- 1 USDC in 6 decimals (current balance)
    0,        -- No TCT issued yet
    1.0,      -- 1 USDC value
    0         -- No commission yet
  );

  RAISE NOTICE 'Test vault initialized successfully!';
END $$;

-- Verify the vault was created
SELECT
  id,
  vault_address,
  status,
  onchain_usdc_balance / 1000000.0 as usdc_balance,
  total_tct_issued,
  created_at
FROM platform_vault
WHERE status = 'active';
