-- ============================================================================
-- Migration 056: Sync Platform Vault with On-Chain Balance
-- ============================================================================
-- The platform vault wallet 0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b
-- holds 21.8 USDC on-chain (Polygon Amoy). At 1 USDC = 25 TCT, that is 545 TCT.
-- Update the stale row and fix admin_get_vault_dashboard to show vault TCT.
-- ============================================================================

-- Update platform_vault with actual on-chain balance
UPDATE platform_vault
SET
    onchain_usdc_balance = 21800000,
    total_usdc_value = 21.8,
    total_tct_issued = 545,
    updated_at = NOW()
WHERE status = 'active';

-- Fix admin_get_vault_dashboard to use on-chain derived TCT as treasury
CREATE OR REPLACE FUNCTION admin_get_vault_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_vault_tct NUMERIC;
    v_vault_usdc NUMERIC;
    v_commission_tct NUMERIC;
    v_reward_pool_balance NUMERIC;
    v_today_rake NUMERIC;
    v_week_rake NUMERIC;
    v_month_rake NUMERIC;
    v_settings JSONB;
BEGIN
    -- Treasury = platform vault's on-chain USDC converted to TCT (1 USDC = 25 TCT)
    SELECT
        COALESCE(total_tct_issued, 0),
        COALESCE(total_usdc_value, 0),
        COALESCE(total_commission_tct, 0)
    INTO v_vault_tct, v_vault_usdc, v_commission_tct
    FROM platform_vault
    WHERE status = 'active';

    -- Reward pool from vault_accounts (if populated)
    SELECT COALESCE(balance_tct, 0) INTO v_reward_pool_balance
    FROM vault_accounts WHERE account_name = 'player_reward_pool';

    -- Get period rakes from settled escrows
    SELECT COALESCE(SUM(commission_tct), 0) INTO v_today_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE;

    SELECT COALESCE(SUM(commission_tct), 0) INTO v_week_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE - INTERVAL '7 days';

    SELECT COALESCE(SUM(commission_tct), 0) INTO v_month_rake
    FROM game_escrows
    WHERE status = 'settled' AND settled_at >= CURRENT_DATE - INTERVAL '30 days';

    -- Get settings
    v_settings := get_rake_settings();

    v_result := jsonb_build_object(
        'balances', jsonb_build_object(
            'treasury', v_vault_tct,
            'reward_pool', COALESCE(v_reward_pool_balance, 0),
            'total', v_vault_tct + COALESCE(v_reward_pool_balance, 0),
            'usdc_value', v_vault_usdc,
            'commission_earned', v_commission_tct
        ),
        'rake', jsonb_build_object(
            'total_collected', v_commission_tct,
            'today', v_today_rake,
            'this_week', v_week_rake,
            'this_month', v_month_rake
        ),
        'settings', v_settings,
        'generated_at', NOW()
    );

    RETURN v_result;
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
