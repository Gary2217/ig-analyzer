-- Add collaboration_methods column to creator_profiles
-- Run this in Supabase SQL Editor

alter table public.creator_profiles
add column if not exists collaboration_methods text[];

-- Optional: Insert sample data for testing (remove in production)
-- update public.creator_profiles
-- set collaboration_methods = array['品牌合作', '產品置入', '活動出席']
-- where creator_slug = 'emma-chen';
