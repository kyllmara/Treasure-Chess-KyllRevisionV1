-- ============================================================================
-- Migration 109: Create vault_statistics table
-- ============================================================================
-- Used by house challenges to track treasury balance from lost entry fees
-- ============================================================================

CREATE TABLE IF NOT EXISTS vault_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_name TEXT UNIQUE NOT NULL,
    stat_value NUMERIC DEFAULT 0,
    stat_unit TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial stats
INSERT INTO vault_statistics (stat_name, stat_value, stat_unit)
VALUES ('treasury_balance_tct', 0, 'TCT')
ON CONFLICT (stat_name) DO NOTHING;

-- RLS
ALTER TABLE vault_statistics ENABLE ROW LEVEL SECURITY;

-- Admin can read
CREATE POLICY "Admin can read vault_statistics"
ON vault_statistics FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND (profiles.is_admin = TRUE OR profiles.is_super_admin = TRUE)
    )
);

-- Service role can do everything (for functions)
CREATE POLICY "Service role full access"
ON vault_statistics FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
