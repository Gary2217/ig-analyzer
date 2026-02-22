-- ============================================================
-- Migration: media_daily_aggregate
-- Daily rollup of media_raw per account.
-- Unique key: (user_id_text, ig_account_id, day)
-- ============================================================

create table if not exists public.media_daily_aggregate (
  id                  uuid primary key default gen_random_uuid(),
  user_id_text        text not null,
  ig_account_id       uuid not null,
  day                 date not null,
  media_count         integer not null default 0,
  total_likes         integer not null default 0,
  total_comments      integer not null default 0,
  total_saves         integer not null default 0,
  total_shares        integer not null default 0,
  total_interactions  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists media_daily_aggregate_tenant_day_uidx
  on public.media_daily_aggregate (user_id_text, ig_account_id, day);

create index if not exists media_daily_aggregate_ig_account_id_idx
  on public.media_daily_aggregate (ig_account_id);

create index if not exists media_daily_aggregate_day_idx
  on public.media_daily_aggregate (day);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'media_daily_aggregate_set_updated_at'
  ) then
    create trigger media_daily_aggregate_set_updated_at
    before update on public.media_daily_aggregate
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end
$$;

alter table public.media_daily_aggregate enable row level security;

drop policy if exists "media_daily_aggregate_select_own" on public.media_daily_aggregate;
drop policy if exists "media_daily_aggregate_insert_own" on public.media_daily_aggregate;
drop policy if exists "media_daily_aggregate_update_own" on public.media_daily_aggregate;
drop policy if exists "media_daily_aggregate_delete_own" on public.media_daily_aggregate;

create policy "media_daily_aggregate_select_own"
  on public.media_daily_aggregate for select to authenticated
  using (user_id_text = auth.uid()::text);

create policy "media_daily_aggregate_insert_own"
  on public.media_daily_aggregate for insert to authenticated
  with check (user_id_text = auth.uid()::text);

create policy "media_daily_aggregate_update_own"
  on public.media_daily_aggregate for update to authenticated
  using (user_id_text = auth.uid()::text)
  with check (user_id_text = auth.uid()::text);

create policy "media_daily_aggregate_delete_own"
  on public.media_daily_aggregate for delete to authenticated
  using (user_id_text = auth.uid()::text);

-- Rollback:
--   drop table if exists public.media_daily_aggregate;
