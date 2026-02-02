do $$
begin
  if exists (
    select 1
    from public.creator_cards
    where ig_user_id is not null
      and ig_user_id <> ''
    group by ig_user_id
    having count(*) > 1
  ) then
    with ranked as (
      select
        id,
        row_number() over (
          partition by ig_user_id
          order by updated_at desc nulls last, created_at desc nulls last, id asc
        ) as rn
      from public.creator_cards
      where ig_user_id is not null
        and ig_user_id <> ''
    )
    delete from public.creator_cards c
    using ranked r
    where c.id = r.id
      and r.rn > 1;
  end if;
end
$$;

create unique index if not exists creator_cards_ig_user_id_uidx
  on public.creator_cards (ig_user_id)
  where ig_user_id is not null
    and ig_user_id <> '';
