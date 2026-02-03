do $$
begin
  insert into storage.buckets (id, name, public)
  values ('creator-card-avatars', 'creator-card-avatars', true)
  on conflict (id) do update set public = true;
exception
  when undefined_table then
    -- storage schema may not exist in some environments; ignore
    null;
end
$$;

alter table if exists storage.objects enable row level security;

drop policy if exists "creator_card_avatars_public_read" on storage.objects;
drop policy if exists "creator_card_avatars_no_client_insert" on storage.objects;
drop policy if exists "creator_card_avatars_no_client_update" on storage.objects;
drop policy if exists "creator_card_avatars_no_client_delete" on storage.objects;
drop policy if exists "creator_card_avatars_anon_read" on storage.objects;
drop policy if exists "creator_card_avatars_auth_read" on storage.objects;
drop policy if exists "creator_card_avatars_anon_write" on storage.objects;
drop policy if exists "creator_card_avatars_auth_write" on storage.objects;
drop policy if exists "creator_card_avatars_anon_insert" on storage.objects;
drop policy if exists "creator_card_avatars_auth_insert" on storage.objects;
drop policy if exists "creator_card_avatars_anon_update" on storage.objects;
drop policy if exists "creator_card_avatars_auth_update" on storage.objects;
drop policy if exists "creator_card_avatars_anon_delete" on storage.objects;
drop policy if exists "creator_card_avatars_auth_delete" on storage.objects;

create policy "creator_card_avatars_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'creator-card-avatars');
