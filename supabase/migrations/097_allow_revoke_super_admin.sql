-- ============================================================================
-- Migration 097: Allow super admins to demote other super admins
--
-- Removes the guard that prevented revoking super admin privileges.
-- Now sets both is_admin and is_super_admin to FALSE.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_revoke_admin(
    p_super_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Admin privileges revoked'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Only super admins can revoke admin
    IF NOT is_user_super_admin(p_super_admin_id) THEN
        RAISE EXCEPTION 'Only super admins can revoke admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF NOT v_target_profile.is_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is not an admin'
        );
    END IF;

    -- Revoke admin (and super admin if applicable)
    UPDATE profiles
    SET
        is_admin = FALSE,
        is_super_admin = FALSE,
        admin_2fa_enabled = FALSE,
        admin_2fa_verified_at = NULL,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Revoke all admin sessions
    UPDATE admin_sessions
    SET
        revoked_at = NOW(),
        revoked_reason = p_reason
    WHERE admin_id = p_target_user_id AND revoked_at IS NULL;

    -- Log the action
    PERFORM log_admin_action(
        p_super_admin_id,
        'admin_revoke',
        'critical',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        jsonb_build_object(
            'is_admin', v_target_profile.is_admin,
            'is_super_admin', v_target_profile.is_super_admin
        ),
        jsonb_build_object(
            'is_admin', FALSE,
            'is_super_admin', FALSE
        ),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Admin privileges revoked for user %s', v_target_profile.username)
    );
END;
$$;
