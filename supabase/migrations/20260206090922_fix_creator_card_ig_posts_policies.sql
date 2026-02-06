-- Fix duplicate policy errors by using IF NOT EXISTS for policies where supported,
-- or by dropping and recreating in a safe way. This migration unblocks subsequent migrations.

-- Policy already exists; this is a no-op placeholder to allow migration sequencing.
-- The actual policies were created in a previous migration; Supabase CLI does not support CREATE POLICY IF NOT EXISTS.
-- We'll leave this empty since the policies already exist on remote.