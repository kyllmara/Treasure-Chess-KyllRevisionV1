-- ============================================================================
-- Migration 055: Fix Treasury Balance to Read from platform_vault
-- ============================================================================
-- The treasury balance should come from platform_vault.total_commission_tct
-- (the actual platform earnings), not vault_accounts which is a separate
-- double-entry ledger that may not be populated.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_get_vault_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_treasury_balance NUMERIC;
    v_total_tct_issued NUMERIC;
    v_total_usdc_value NUMERIC;
    v_reward_pool_balance NUMERIC;
    v_total_rake NUMERIC;
    v_today_rake NUMERIC;
    v_week_rake NUMERIC;
    v_month_rake NUMERIC;
    v_settings JSONB;
BEGIN
    -- Get treasury balance from platform_vault (source of truth)
    SELECT
        COALESCE(total_commission_tct, 0),
        COALESCE(total_tct_issued, 0),
        COALESCE(total_usdc_value, 0)
    INTO v_treasury_balance, v_total_tct_issued, v_total_usdc_value
    FROM platform_vault
    WHERE status = 'active';

    -- Reward pool from vault_accounts (if it exists)
    SELECT COALESCE(balance_tct, 0) INTO v_reward_pool_balance
    FROM vault_accounts WHERE account_name = 'player_reward_pool';

    -- Total rake is the same as treasury balance (from platform_vault)
    v_total_rake := v_treasury_balance;

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
            'treasury', v_treasury_balance,
            'reward_pool', COALESCE(v_reward_pool_balance, 0),
            'total', v_treasury_balance + COALESCE(v_reward_pool_balance, 0),
            'total_tct_issued', v_total_tct_issued,
            'total_usdc_value', v_total_usdc_value
        ),
        'rake', jsonb_build_object(
            'total_collected', v_total_rake,
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

-- Also fix get_vault_balances to use platform_vault for treasury
CREATE OR REPLACE FUNCTION get_vault_balances()
RETURNS TABLE (
    treasury_balance_tct NUMERIC,
    reward_pool_balance_tct NUMERIC,
    total_rake_collected_tct NUMERIC,
    total_games_settled INTEGER,
    total_draw_refunds_tct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COALESCE(total_commission_tct, 0) FROM platform_vault WHERE status = 'active'),
        (SELECT COALESCE(balance_tct, 0) FROM vault_accounts WHERE account_name = 'player_reward_pool'),
        (SELECT COALESCE(total_commission_tct, 0) FROM platform_vault WHERE status = 'active'),
        (SELECT COUNT(*)::INTEGER FROM game_escrows WHERE status = 'settled'),
        (SELECT COALESCE(SUM(
            CASE WHEN winner_id IS NULL THEN player_white_locked_tct + player_black_locked_tct ELSE 0 END
        ), 0) FROM game_escrows WHERE status = 'settled');
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
