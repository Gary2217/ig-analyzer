-- ============================================================
-- Migration: media_raw
-- Stores per-media item data fetched from IG Graph API.
-- Unique key: (user_id_text, ig_account_id, media_id)
-- ============================================================

create table if not exists public.media_raw (
  id              uuid primary key default gen_random_uuid(),
  user_id_text    text not null,
  ig_account_id   uuid not null,
  media_id        text not null,
  media_type      text,
  permalink       text,
  caption         text,
  media_timestamp timestamptz,
  like_count      integer not null default 0,
  comments_count  integer not null default 0,
  save_count      integer not null default 0,
  share_count     integer not null default 0,
  reach           integer,
  impressions     integer,
  plays           integer,
  raw_json        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists media_raw_tenant_media_uidx
  on public.media_raw (user_id_text, ig_account_id, media_id);

create index if not exists media_raw_ig_account_id_idx
  on public.media_raw (ig_account_id);

create index if not exists media_raw_media_timestamp_idx
  on public.media_raw (media_timestamp);

create index if not exists media_raw_user_id_text_idx
  on public.media_raw (user_id_text);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'media_raw_set_updated_at'
  ) then
    create trigger media_raw_set_updated_at
    before update on public.media_raw
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end
$$;

alter table public.media_raw enable row level security;

drop policy if exists "media_raw_select_own" on public.media_raw;
drop policy if exists "media_raw_insert_own" on public.media_raw;
drop policy if exists "media_raw_update_own" on public.media_raw;
drop policy if exists "media_raw_delete_own" on public.media_raw;

create policy "media_raw_select_own"
  on public.media_raw for select to authenticated
  using (user_id_text = auth.uid()::text);

create policy "media_raw_insert_own"
  on public.media_raw for insert to authenticated
  with check (user_id_text = auth.uid()::text);

create policy "media_raw_update_own"
  on public.media_raw for update to authenticated
  using (user_id_text = auth.uid()::text)
  with check (user_id_text = auth.uid()::text);

create policy "media_raw_delete_own"
  on public.media_raw for delete to authenticated
  using (user_id_text = auth.uid()::text);

-- Rollback:
--   drop table if exists public.media_raw;
