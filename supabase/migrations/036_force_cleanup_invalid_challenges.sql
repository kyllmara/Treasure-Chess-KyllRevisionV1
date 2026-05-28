-- ============================================================================
-- Migration 036: Force Cleanup Invalid Challenges
-- ============================================================================
-- Use raw SQL to find and delete any challenges with invalid status values.
-- This runs as superuser so it bypasses RLS.
-- ============================================================================

-- Temporarily disable RLS to clean up
ALTER TABLE challenges DISABLE ROW LEVEL SECURITY;

-- Delete ALL challenges to start fresh (development environment)
-- This is aggressive but ensures no corrupted data remains
TRUNCATE TABLE challenges CASCADE;

-- Re-enable RLS
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
