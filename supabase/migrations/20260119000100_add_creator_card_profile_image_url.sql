alter table if exists public.creator_cards
  add column if not exists profile_image_url text;
