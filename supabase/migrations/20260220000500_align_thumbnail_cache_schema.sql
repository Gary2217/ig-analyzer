-- Add missing columns safely
alter table public.ig_thumbnail_cache
  add column if not exists original_url text;

alter table public.ig_thumbnail_cache
  add column if not exists bytes_size integer;

alter table public.ig_thumbnail_cache
  add column if not exists upstream_status integer;

alter table public.ig_thumbnail_cache
  add column if not exists updated_at timestamptz not null default now();

alter table public.ig_thumbnail_cache
  add column if not exists last_accessed_at timestamptz;

-- Backfill original_url from existing url column (only if url exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ig_thumbnail_cache'
      and column_name = 'url'
  ) then
    execute $q$
      update public.ig_thumbnail_cache
      set original_url = url
      where original_url is null
    $q$;
  end if;
end $$;

-- Backfill bytes_size from existing byte_length column (only if byte_length exists)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ig_thumbnail_cache'
      and column_name = 'byte_length'
  ) then
    execute $q$
      update public.ig_thumbnail_cache
      set bytes_size = byte_length
      where bytes_size is null and byte_length is not null
    $q$;
  end if;
end $$;

-- Ensure expires index exists
create index if not exists ig_thumbnail_cache_expires_at_idx
on public.ig_thumbnail_cache (expires_at);

-- Ensure updated_at index exists
create index if not exists ig_thumbnail_cache_updated_at_idx
on public.ig_thumbnail_cache (updated_at);

-- Ensure url_hash is primary key ONLY if the table currently has no primary key
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ig_thumbnail_cache'
      and i.indisprimary
  ) then
    alter table public.ig_thumbnail_cache
      add constraint ig_thumbnail_cache_pkey primary key (url_hash);
  end if;
end $$;

-- Trigger to auto-update updated_at
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
for each row
execute function public.ig_thumbnail_cache_set_updated_at();

-- Disable RLS (server-only table)
alter table public.ig_thumbnail_cache disable row level security;
