-- ============================================================================
-- Migration 054: Update Rake Percentage to 10% (matching smart contracts)
-- ============================================================================
-- The on-chain TreasureChessEscrow V1 & V2 contracts use 10% (1000 BPS).
-- The off-chain rake was set to 5%. This aligns them to 10%.
-- The settle_escrow_with_rake function already reads rake_percentage
-- dynamically from platform_config, so updating the config is sufficient.
-- ============================================================================

UPDATE platform_config
SET
    config_value = jsonb_set(
        config_value,
        '{rake_percentage}',
        '0.10'::JSONB
    ),
    version = version + 1,
    updated_at = NOW()
WHERE config_key = 'rake_settings';

-- Update the default fallback in get_rake_settings() to also use 10%
CREATE OR REPLACE FUNCTION get_rake_settings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_settings JSONB;
BEGIN
    SELECT config_value INTO v_settings
    FROM platform_config
    WHERE config_key = 'rake_settings';

    RETURN COALESCE(v_settings, '{
        "rake_percentage": 0.10,
        "treasury_split": 0.80,
        "reward_pool_split": 0.20,
        "min_rake_tct": 0.01,
        "rake_on_draws": false,
        "enabled": true
    }'::JSONB);
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
