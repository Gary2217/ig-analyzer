create extension if not exists pgcrypto;

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.creator_card_ig_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.creator_cards(id) on delete cascade,
  posts jsonb not null default '[]'::jsonb,
  snapshot_at timestamptz not null default now(),
  source text not null default 'instagram_api',
  updated_at timestamptz not null default now(),
  unique (user_id, card_id)
);

-- Keep updated_at current
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'creator_card_ig_posts_set_updated_at'
  ) then
    create trigger creator_card_ig_posts_set_updated_at
    before update on public.creator_card_ig_posts
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end$$;

alter table public.creator_card_ig_posts enable row level security;

create policy "creator_card_ig_posts_select_own"
  on public.creator_card_ig_posts
  for select
  using (user_id = auth.uid());

create policy "creator_card_ig_posts_insert_own"
  on public.creator_card_ig_posts
  for insert
  with check (user_id = auth.uid());

create policy "creator_card_ig_posts_update_own"
  on public.creator_card_ig_posts
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists creator_card_ig_posts_user_card_idx
  on public.creator_card_ig_posts (user_id, card_id);

create index if not exists creator_card_ig_posts_updated_at_desc_idx
  on public.creator_card_ig_posts (updated_at desc);
