create table if not exists public.user_ig_account_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'instagram',
  ig_user_id text not null,
  access_token text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.user_ig_account_tokens
    add constraint user_ig_account_tokens_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete cascade;
exception
  when undefined_table then
    null;
end
$$;

create unique index if not exists user_ig_account_tokens_user_provider_ig_uidx
  on public.user_ig_account_tokens (user_id, provider, ig_user_id);

create index if not exists user_ig_account_tokens_user_id_idx
  on public.user_ig_account_tokens (user_id);

create index if not exists user_ig_account_tokens_ig_user_id_idx
  on public.user_ig_account_tokens (ig_user_id);

create index if not exists user_ig_account_tokens_user_provider_idx
  on public.user_ig_account_tokens (user_id, provider);

alter table public.user_ig_account_tokens enable row level security;

drop policy if exists "user_ig_account_tokens_select_own" on public.user_ig_account_tokens;
drop policy if exists "user_ig_account_tokens_insert_own" on public.user_ig_account_tokens;
drop policy if exists "user_ig_account_tokens_update_own" on public.user_ig_account_tokens;
drop policy if exists "user_ig_account_tokens_delete_own" on public.user_ig_account_tokens;

create policy "user_ig_account_tokens_select_own"
  on public.user_ig_account_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_ig_account_tokens_insert_own"
  on public.user_ig_account_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_ig_account_tokens_update_own"
  on public.user_ig_account_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_ig_account_tokens_delete_own"
  on public.user_ig_account_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Rollback (manual):
--   drop policy if exists "user_ig_account_tokens_select_own" on public.user_ig_account_tokens;
--   drop policy if exists "user_ig_account_tokens_insert_own" on public.user_ig_account_tokens;
--   drop policy if exists "user_ig_account_tokens_update_own" on public.user_ig_account_tokens;
--   drop policy if exists "user_ig_account_tokens_delete_own" on public.user_ig_account_tokens;
--   drop index if exists public.user_ig_account_tokens_user_provider_ig_uidx;
--   drop index if exists public.user_ig_account_tokens_user_id_idx;
--   drop index if exists public.user_ig_account_tokens_ig_user_id_idx;
--   drop index if exists public.user_ig_account_tokens_user_provider_idx;
--   drop table if exists public.user_ig_account_tokens;
