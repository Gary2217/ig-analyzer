-- SWR (stale-while-revalidate) columns for ig_thumbnail_cache
alter table public.ig_thumbnail_cache
  add column if not exists soft_expires_at  timestamptz,
  add column if not exists hard_expires_at  timestamptz,
  add column if not exists refreshed_at     timestamptz,
  add column if not exists refreshing       boolean not null default false,
  add column if not exists refresh_failures int     not null default 0,
  add column if not exists next_refresh_at  timestamptz,
  add column if not exists etag             text,
  add column if not exists last_modified    text;

-- Backfill existing rows
update public.ig_thumbnail_cache
set
  soft_expires_at = coalesce(expires_at, now() + interval '30 days'),
  hard_expires_at = greatest(coalesce(expires_at, now()), now() + interval '180 days'),
  refreshed_at    = coalesce(created_at, now())
where soft_expires_at is null;

-- Indexes
create index if not exists ig_thumbnail_cache_next_refresh_at_idx
  on public.ig_thumbnail_cache (next_refresh_at);

create index if not exists ig_thumbnail_cache_soft_expires_at_idx
  on public.ig_thumbnail_cache (soft_expires_at);
