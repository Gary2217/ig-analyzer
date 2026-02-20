-- Create private storage bucket for thumbnail cache
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('thumb-cache', 'thumb-cache', false)
  on conflict (id) do nothing;
exception
  when undefined_table then
    null;
end
$$;

-- Create thumbnail cache metadata table
create table if not exists public.ig_thumbnail_cache (
  url_hash          text        primary key,
  original_url      text        not null,
  storage_path      text        not null,
  content_type      text        not null,
  bytes_size        integer     not null default 0,
  upstream_status   integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '7 days'),
  last_accessed_at  timestamptz
);

-- Indexes for TTL expiry sweeps and recency queries
create index if not exists ig_thumbnail_cache_expires_at_idx
  on public.ig_thumbnail_cache (expires_at);

create index if not exists ig_thumbnail_cache_updated_at_idx
  on public.ig_thumbnail_cache (updated_at);

-- Auto-update updated_at on row change
create or replace function public.ig_thumbnail_cache_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ig_thumbnail_cache_updated_at_trigger
  on public.ig_thumbnail_cache;

create trigger ig_thumbnail_cache_updated_at_trigger
  before update on public.ig_thumbnail_cache
  for each row execute function public.ig_thumbnail_cache_set_updated_at();

-- Enforce TTL default on INSERT/UPDATE (guard against null or missing expires_at)
create or replace function public.ig_thumbnail_cache_enforce_ttl()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null then
    new.expires_at = now() + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists ig_thumbnail_cache_enforce_ttl_trigger
  on public.ig_thumbnail_cache;

create trigger ig_thumbnail_cache_enforce_ttl_trigger
  before insert or update on public.ig_thumbnail_cache
  for each row execute function public.ig_thumbnail_cache_enforce_ttl();

-- Service role only; disable RLS so API route (service key) can read/write freely
alter table public.ig_thumbnail_cache disable row level security;
