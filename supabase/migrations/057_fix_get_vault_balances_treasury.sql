-- ============================================================================
-- Migration 057: Fix get_vault_balances to use total_tct_issued
-- ============================================================================
-- Treasury = platform vault's on-chain USDC converted to TCT (total_tct_issued)
-- not total_commission_tct (which only tracks rake earnings).
-- ============================================================================

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
        (SELECT COALESCE(total_tct_issued, 0) FROM platform_vault WHERE status = 'active'),
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
