-- Create thumb-cache storage bucket if it doesn't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'thumb-cache',
  'thumb-cache',
  false,
  524288,  -- 512 KB max per object
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do nothing;

-- Allow service role full access (no RLS needed for server-only bucket)
-- Storage RLS is separate from table RLS; disable it for this bucket
delete from storage.policies where bucket_id = 'thumb-cache';
