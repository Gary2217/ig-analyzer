alter table if exists public.creator_cards
  add column if not exists min_price integer;
