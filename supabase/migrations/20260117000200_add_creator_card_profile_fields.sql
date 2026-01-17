alter table if exists public.creator_cards
  add column if not exists theme_types text[];

alter table if exists public.creator_cards
  add column if not exists audience_profiles text[];
