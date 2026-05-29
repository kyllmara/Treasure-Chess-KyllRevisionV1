-- Migration 117: Move TCT/USDC conversion rates into platform_config
--
-- Previously hardcoded as 25 in 8 separate edge functions. A single rate change
-- required editing and redeploying all 8 functions with risk of inconsistency.
--
-- This migration:
-- 1. Seeds tct_rates into platform_config
-- 2. Creates get_tct_rates() for edge functions to call
-- 3. Creates admin_update_tct_rates() for admin panel control
--
-- buy_rate:  TCT credited per USDC deposited (user buying TCT)
-- sell_rate: TCT required per USDC withdrawn (user selling TCT back)
-- Starting both at 25 (no spread). Admin can introduce a spread later
-- by setting sell_rate > buy_rate — standard exchange model.

BEGIN;

-- 1. Seed tct_rates
INSERT INTO platform_config (config_key, config_value, description)
VALUES (
    'tct_rates',
    '{"tct_buy_rate": 25, "tct_sell_rate": 25}'::JSONB,
    'TCT/USDC conversion rates. tct_buy_rate: TCT credited per USDC deposited. tct_sell_rate: TCT required per USDC on withdrawal. Setting sell_rate > buy_rate captures a spread as additional revenue.'
)
ON CONFLICT (config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value,
        updated_at   = NOW();

-- 2. get_tct_rates() — called by all edge functions at request time
CREATE OR REPLACE FUNCTION get_tct_rates()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE v_settings JSONB;
BEGIN
    SELECT config_value INTO v_settings
    FROM platform_config
    WHERE config_key = 'tct_rates';

    RETURN COALESCE(v_settings, '{"tct_buy_rate": 25, "tct_sell_rate": 25}'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION get_tct_rates() TO authenticated;
GRANT EXECUTE ON FUNCTION get_tct_rates() TO anon;
GRANT EXECUTE ON FUNCTION get_tct_rates() TO service_role;

-- 3. admin_update_tct_rates() — admin panel calls this to change rates
CREATE OR REPLACE FUNCTION admin_update_tct_rates(
    p_tct_buy_rate  NUMERIC DEFAULT NULL,
    p_tct_sell_rate NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_settings JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    v_settings := get_tct_rates();

    IF p_tct_buy_rate IS NOT NULL THEN
        IF p_tct_buy_rate < 1 OR p_tct_buy_rate > 10000 THEN
            RAISE EXCEPTION 'tct_buy_rate must be between 1 and 10000';
        END IF;
        v_settings := jsonb_set(v_settings, '{tct_buy_rate}', to_jsonb(p_tct_buy_rate));
    END IF;

    IF p_tct_sell_rate IS NOT NULL THEN
        IF p_tct_sell_rate < 1 OR p_tct_sell_rate > 10000 THEN
            RAISE EXCEPTION 'tct_sell_rate must be between 1 and 10000';
        END IF;
        v_settings := jsonb_set(v_settings, '{tct_sell_rate}', to_jsonb(p_tct_sell_rate));
    END IF;

    UPDATE platform_config
    SET config_value = v_settings, updated_at = NOW()
    WHERE config_key = 'tct_rates';

    RETURN v_settings;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_tct_rates(NUMERIC, NUMERIC) TO service_role;

COMMIT;
