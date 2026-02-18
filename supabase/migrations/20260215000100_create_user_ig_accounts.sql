-- ============================================================
-- Migration: user_ig_accounts (SaaS groundwork, feature-flag ready)
-- Date: 2026-02-15
-- Risk: LOW (additive) — does NOT change existing tables/queries
-- Notes:
-- - Stores per-user Instagram connection metadata.
-- - RLS ensures user isolation.
-- - This migration intentionally does NOT wire application logic.
-- ============================================================

create table if not exists public.user_ig_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'instagram',

  -- Instagram identifiers
  ig_user_id text,
  page_id text,

  -- Access token (MVP). Consider encryption in a later iteration.
  access_token text,

  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Foreign key is optional if auth schema exists (Supabase)
do $$
begin
  alter table public.user_ig_accounts
    add constraint user_ig_accounts_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete cascade;
exception
  when undefined_table then
    -- auth.users may not exist in some environments
    null;
end
$$;

create unique index if not exists user_ig_accounts_user_provider_uidx
  on public.user_ig_accounts (user_id, provider);

create index if not exists user_ig_accounts_user_id_idx
  on public.user_ig_accounts (user_id);

create index if not exists user_ig_accounts_ig_user_id_idx
  on public.user_ig_accounts (ig_user_id);

-- updated_at trigger (reuse existing function if present)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at_timestamp'
  ) then
    create or replace function public.set_updated_at_timestamp()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'user_ig_accounts_set_updated_at'
  ) then
    create trigger user_ig_accounts_set_updated_at
    before update on public.user_ig_accounts
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end
$$;

alter table public.user_ig_accounts enable row level security;

drop policy if exists "user_ig_accounts_select_own" on public.user_ig_accounts;
drop policy if exists "user_ig_accounts_insert_own" on public.user_ig_accounts;
drop policy if exists "user_ig_accounts_update_own" on public.user_ig_accounts;
drop policy if exists "user_ig_accounts_delete_own" on public.user_ig_accounts;

create policy "user_ig_accounts_select_own"
  on public.user_ig_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_ig_accounts_insert_own"
  on public.user_ig_accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_ig_accounts_update_own"
  on public.user_ig_accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_ig_accounts_delete_own"
  on public.user_ig_accounts
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- Rollback (manual):
--   drop table if exists public.user_ig_accounts;
-- ============================================================
