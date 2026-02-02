-- Harden legacy creator_cards claiming:
-- 1) prevent duplicate legacy rows (user_id is null) per ig_user_id
-- 2) provide atomic single-row claim helper

do $$
begin
  if exists (
    select 1
    from public.creator_cards
    where user_id is null
      and ig_user_id is not null
      and ig_user_id <> ''
    group by ig_user_id
    having count(*) > 1
  ) then
    raise exception 'creator_cards contains duplicate legacy rows (user_id is null) for the same ig_user_id; cleanup required before applying unique index';
  end if;
end
$$;

create unique index if not exists creator_cards_legacy_ig_user_id_unclaimed_uidx
  on public.creator_cards (ig_user_id)
  where user_id is null
    and ig_user_id is not null
    and ig_user_id <> '';

create or replace function public.claim_creator_card_legacy(p_ig_user_id text, p_user_id uuid)
returns setof public.creator_cards
language sql
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
