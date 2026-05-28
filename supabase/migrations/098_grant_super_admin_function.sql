-- ============================================================================
-- Migration 098: Add function to grant super admin privileges
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_grant_super_admin(
    p_super_admin_id UUID,
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'Granted super admin privileges'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_profile profiles%ROWTYPE;
BEGIN
    -- Only super admins can grant super admin
    IF NOT is_user_super_admin(p_super_admin_id) THEN
        RAISE EXCEPTION 'Only super admins can grant super admin privileges';
    END IF;

    -- Get target profile
    SELECT * INTO v_target_profile FROM profiles WHERE id = p_target_user_id;

    IF v_target_profile IS NULL THEN
        RAISE EXCEPTION 'Target user not found: %', p_target_user_id;
    END IF;

    IF v_target_profile.is_super_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'User is already a super admin'
        );
    END IF;

    -- Grant admin + super admin
    UPDATE profiles
    SET
        is_admin = TRUE,
        is_super_admin = TRUE,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log the action
    PERFORM log_admin_action(
        p_super_admin_id,
        'super_admin_grant',
        'critical',
        p_target_user_id,
        'profiles',
        p_target_user_id,
        jsonb_build_object(
            'is_admin', v_target_profile.is_admin,
            'is_super_admin', FALSE
        ),
        jsonb_build_object(
            'is_admin', TRUE,
            'is_super_admin', TRUE
        ),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', format('Super admin granted to %s', v_target_profile.username)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_grant_super_admin(UUID, UUID, TEXT) TO service_role;
