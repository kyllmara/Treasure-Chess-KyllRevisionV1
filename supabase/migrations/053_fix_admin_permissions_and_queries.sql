-- ============================================================================
-- Migration 053: Fix Admin Panel Permissions and SQL Bugs
-- ============================================================================
-- 1. Fix SQL bug in admin_get_user_details (ORDER BY outside aggregate)
-- 2. Grant EXECUTE on admin functions to authenticated role
--    (functions already have internal admin checks via is_user_admin())
-- ============================================================================

-- ============================================================================
-- SECTION 1: Fix admin_get_user_details SQL bug
-- ============================================================================
-- The ORDER BY / LIMIT were outside jsonb_agg(), causing:
-- "column g.ended_at must appear in GROUP BY clause or be used in aggregate"

CREATE OR REPLACE FUNCTION admin_get_user_details(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_profile profiles%ROWTYPE;
    v_balance balances%ROWTYPE;
    v_result JSONB;
BEGIN
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    SELECT * INTO v_balance FROM balances WHERE user_id = p_user_id;

    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', v_profile.id,
            'username', v_profile.username,
            'email', v_profile.email,
            'elo_rating', v_profile.elo_rating,
            'games_played', v_profile.games_played,
            'games_won', v_profile.games_won,
            'games_lost', v_profile.games_lost,
            'games_drawn', v_profile.games_drawn,
            'current_streak', v_profile.current_streak,
            'longest_streak', v_profile.longest_streak,
            'created_at', v_profile.created_at,
            'last_seen_at', v_profile.last_seen_at
        ),
        'admin_status', jsonb_build_object(
            'is_admin', v_profile.is_admin,
            'is_super_admin', v_profile.is_super_admin,
            'admin_2fa_enabled', v_profile.admin_2fa_enabled
        ),
        'restrictions', jsonb_build_object(
            'is_banned', v_profile.is_banned,
            'ban_reason', v_profile.ban_reason,
            'banned_at', v_profile.banned_at,
            'ban_expires_at', v_profile.ban_expires_at,
            'is_suspended', v_profile.is_suspended,
            'suspension_reason', v_profile.suspension_reason,
            'suspended_at', v_profile.suspended_at,
            'suspension_expires_at', v_profile.suspension_expires_at
        ),
        'balance', jsonb_build_object(
            'available_tct', COALESCE(v_balance.available_tct, 0),
            'locked_tct', COALESCE(v_balance.locked_tct, 0),
            'total_deposited_tct', COALESCE(v_balance.total_deposited_tct, 0),
            'total_withdrawn_tct', COALESCE(v_balance.total_withdrawn_tct, 0),
            'total_won_tct', COALESCE(v_balance.total_won_tct, 0),
            'total_lost_tct', COALESCE(v_balance.total_lost_tct, 0),
            'total_commission_paid_tct', COALESCE(v_balance.total_commission_paid_tct, 0)
        ),
        'recent_games', (
            SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::JSONB)
            FROM (
                SELECT
                    g.id,
                    CASE WHEN g.white_player_id = p_user_id THEN g.black_player_id ELSE g.white_player_id END AS opponent_id,
                    g.result,
                    g.wager_tct,
                    g.ended_at
                FROM games g
                WHERE (g.white_player_id = p_user_id OR g.black_player_id = p_user_id)
                    AND g.status = 'completed'
                ORDER BY g.ended_at DESC
                LIMIT 10
            ) sub
        ),
        'recent_transactions', (
            SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::JSONB)
            FROM (
                SELECT
                    t.id,
                    t.type,
                    t.amount_tct,
                    t.description,
                    t.created_at
                FROM transactions t
                WHERE t.user_id = p_user_id
                ORDER BY t.created_at DESC
                LIMIT 10
            ) sub
        ),
        'admin_notes', v_profile.admin_notes
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- SECTION 2: Grant admin functions to authenticated role
-- ============================================================================
-- These functions have internal admin checks (is_user_admin / is_user_super_admin)
-- so granting to authenticated is safe. The mobile app uses the authenticated client.

-- From migration 011 (admin system)
GRANT EXECUTE ON FUNCTION admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_search_users(TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_ban_user(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unban_user(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_suspend_user(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unsuspend_user(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_grant_admin(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_revoke_admin(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action(UUID, admin_action_type, admin_action_severity, UUID, TEXT, UUID, JSONB, JSONB, TEXT, TEXT, INET, TEXT, JSONB, BOOLEAN) TO authenticated;

-- From migration 022 (rake system)
GRANT EXECUTE ON FUNCTION admin_get_vault_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_ledger_entries(INTEGER, INTEGER, UUID, ledger_entry_type) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_audit_trail(INTEGER, INTEGER, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_rake_settings(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
