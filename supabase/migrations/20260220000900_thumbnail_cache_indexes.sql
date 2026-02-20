-- Ensure url_hash has a unique index (may already be primary key; if not exists is safe)
create unique index if not exists ig_thumbnail_cache_url_hash_uidx
  on public.ig_thumbnail_cache (url_hash);

-- Index for lock acquisition and eligibility checks
create index if not exists ig_thumbnail_cache_next_refresh_at_idx
  on public.ig_thumbnail_cache (next_refresh_at);

-- Index for analytics / purge ordering
create index if not exists ig_thumbnail_cache_updated_at_idx
  on public.ig_thumbnail_cache (updated_at);
