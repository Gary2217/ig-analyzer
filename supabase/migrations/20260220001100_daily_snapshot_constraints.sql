-- ============================================================
-- Migration: Daily snapshot reliability — debug fields + indexes
-- Risk: LOW — additive only, no constraint changes (unique indexes already exist)
-- ============================================================

-- account_daily_snapshot: add debug/observability fields
alter table if exists public.account_daily_snapshot
  add column if not exists source_used text,
  add column if not exists wrote_at timestamptz;

-- ig_daily_followers: add debug/observability fields
alter table if exists public.ig_daily_followers
  add column if not exists source_used text,
  add column if not exists wrote_at timestamptz;

-- Ensure day index exists for fast range reads (may already exist from earlier migrations)
create index if not exists ig_daily_snapshots_day_idx
  on public.account_daily_snapshot (ig_account_id, day);

create index if not exists ig_daily_followers_day_idx
  on public.ig_daily_followers (ig_account_id, day);
