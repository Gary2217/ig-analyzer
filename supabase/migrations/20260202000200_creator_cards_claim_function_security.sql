-- Security hardening for legacy claim helper

create or replace function public.claim_creator_card_legacy(p_ig_user_id text, p_user_id uuid)
returns setof public.creator_cards
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.creator_cards
  set user_id = p_user_id,
      updated_at = now()
  where id = (
    select id
    from public.creator_cards
    where ig_user_id = p_ig_user_id
      and user_id is null
    order by updated_at desc nulls last, created_at desc nulls last, id asc
    limit 1
  )
  returning *;
$$;

revoke all on function public.claim_creator_card_legacy(text, uuid) from public;

-- Only allow server-side execution (service role). This prevents clients from calling the function directly.
grant execute on function public.claim_creator_card_legacy(text, uuid) to service_role;
