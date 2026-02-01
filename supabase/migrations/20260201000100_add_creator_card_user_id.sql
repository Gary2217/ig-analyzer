alter table if exists public.creator_cards
  add column if not exists user_id uuid;

create index if not exists creator_cards_user_id_idx on public.creator_cards (user_id);
