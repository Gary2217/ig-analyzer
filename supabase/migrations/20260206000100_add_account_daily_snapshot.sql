-- Additive: pre-aggregated per-account daily snapshots for fast trend reads.
-- Multi-tenant safe: includes both user_id and account_id (ig_user_id).
-- Backfill window: last 120 days (buffer > 90) to support all allowed ranges.
create table if not exists public.account_daily_snapshot (
  id bigserial primary key,
  user_id text not null,
  ig_user_id bigint not null,
  page_id bigint not null,
  day date not null,
  reach bigint null,
  impressions bigint null default 0,
  total_interactions bigint null default 0,
  accounts_engaged bigint null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_daily_snapshot_user_ig_page_day_key unique (user_id, ig_user_id, page_id, day)
);

-- Index for fast range reads by tenant + day (ascending)
create index if not exists idx_account_daily_snapshot_user_ig_page_day
  on public.account_daily_snapshot (user_id, ig_user_id, page_id, day);

-- Optional descending index for recent-day queries (Postgres can use either)
create index if not exists idx_account_daily_snapshot_user_ig_page_day_desc
  on public.account_daily_snapshot (user_id, ig_user_id, page_id, day desc);

-- RLS safety: ensure only rows belonging to the authenticated user are accessible.
-- This table is primarily accessed via service role in the API route,
-- but we enable RLS for defense-in-depth if needed later.
alter table public.account_daily_snapshot enable row level security;

-- No policies by default; service role bypasses RLS.
-- If you add per-user policies later, ensure they filter by auth.uid() = user_id.
