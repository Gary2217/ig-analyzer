-- Creator Profiles Table for Contact Information
-- Run this in Supabase SQL Editor

create table if not exists public.creator_profiles (
  creator_slug text primary key,
  contact_email text,
  contact_instagram text,
  contact_website text,
  updated_at timestamptz not null default now()
);

create index if not exists creator_profiles_updated_at_idx on public.creator_profiles (updated_at desc);

-- RLS: enable and allow read-only public access
alter table public.creator_profiles enable row level security;

drop policy if exists "public read creator_profiles" on public.creator_profiles;
create policy "public read creator_profiles"
on public.creator_profiles
for select
to anon, authenticated
using (true);

-- Optional: Insert sample data for testing (remove in production)
-- insert into public.creator_profiles (creator_slug, contact_email, contact_instagram, contact_website)
-- values 
--   ('emma-chen', 'hello@emmachen.com', 'emmachen', 'https://emmachen.com'),
--   ('alex-wang', null, 'alexwang', null)
-- on conflict (creator_slug) do nothing;
