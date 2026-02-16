create table if not exists public.user_ig_account_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'instagram',
  ig_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.user_ig_account_identities
    add constraint user_ig_account_identities_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete cascade;
exception
  when undefined_table then
    null;
end
$$;

create unique index if not exists user_ig_account_identities_user_provider_ig_uidx
  on public.user_ig_account_identities (user_id, provider, ig_user_id);

create index if not exists user_ig_account_identities_user_id_idx
  on public.user_ig_account_identities (user_id);

create index if not exists user_ig_account_identities_ig_user_id_idx
  on public.user_ig_account_identities (ig_user_id);

create index if not exists user_ig_account_identities_user_provider_idx
  on public.user_ig_account_identities (user_id, provider);

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at_timestamp'
  ) then
    create or replace function public.set_updated_at_timestamp()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'user_ig_account_identities_set_updated_at'
  ) then
    create trigger user_ig_account_identities_set_updated_at
    before update on public.user_ig_account_identities
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end
$$;

alter table public.user_ig_account_identities enable row level security;

drop policy if exists "user_ig_account_identities_select_own" on public.user_ig_account_identities;
drop policy if exists "user_ig_account_identities_insert_own" on public.user_ig_account_identities;
drop policy if exists "user_ig_account_identities_update_own" on public.user_ig_account_identities;
drop policy if exists "user_ig_account_identities_delete_own" on public.user_ig_account_identities;

create policy "user_ig_account_identities_select_own"
  on public.user_ig_account_identities
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_ig_account_identities_insert_own"
  on public.user_ig_account_identities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_ig_account_identities_update_own"
  on public.user_ig_account_identities
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_ig_account_identities_delete_own"
  on public.user_ig_account_identities
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Rollback (manual):
--   drop index if exists public.user_ig_account_identities_user_provider_ig_uidx;
--   drop index if exists public.user_ig_account_identities_user_id_idx;
--   drop index if exists public.user_ig_account_identities_ig_user_id_idx;
--   drop index if exists public.user_ig_account_identities_user_provider_idx;
--   drop trigger if exists user_ig_account_identities_set_updated_at on public.user_ig_account_identities;
--   alter table public.user_ig_account_identities disable row level security;
--   drop table if exists public.user_ig_account_identities;
