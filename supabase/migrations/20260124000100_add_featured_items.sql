alter table if exists public.creator_cards
  add column if not exists featured_items jsonb default '[]'::jsonb;
