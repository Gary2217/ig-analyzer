create extension if not exists pgcrypto;

create table if not exists public.creator_card_ownership_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ig_user_id text not null,
  creator_card_id uuid not null,
  previous_user_id uuid null,
  new_user_id uuid not null,
  reason text not null default 'reclaim',
  source text null,
  request_id text null,
  notes jsonb null
);

create index if not exists creator_card_ownership_audit_ig_user_id_idx
  on public.creator_card_ownership_audit (ig_user_id);

create index if not exists creator_card_ownership_audit_creator_card_id_idx
  on public.creator_card_ownership_audit (creator_card_id);

create index if not exists creator_card_ownership_audit_created_at_desc_idx
  on public.creator_card_ownership_audit (created_at desc);

create or replace function public.reclaim_creator_card(
  p_creator_card_id uuid,
  p_ig_user_id text,
  p_new_user_id uuid,
  p_source text default null
)
returns setof public.creator_cards
language sql
security definer
set search_path = public, pg_temp
as $$
  with locked as (
    select
      id,
      ig_user_id,
      user_id as previous_user_id
    from public.creator_cards
    where id = p_creator_card_id
      and ig_user_id = btrim(p_ig_user_id)
      and btrim(p_ig_user_id) <> ''
    for update
  ),
  updated as (
    update public.creator_cards c
    set user_id = p_new_user_id,
        updated_at = now()
    from locked l
    where c.id = l.id
    returning c.*
  ),
  aud as (
    insert into public.creator_card_ownership_audit (
      ig_user_id,
      creator_card_id,
      previous_user_id,
      new_user_id,
      reason,
      source
    )
    select
      l.ig_user_id,
      l.id,
      l.previous_user_id,
      p_new_user_id,
      case when l.previous_user_id = p_new_user_id then 'no_change' else 'reclaim' end,
      p_source
    from locked l
    returning 1
  )
  select * from updated;
$$;

revoke all on function public.reclaim_creator_card(uuid, text, uuid, text) from public;
revoke all on function public.reclaim_creator_card(uuid, text, uuid, text) from authenticated;

grant execute on function public.reclaim_creator_card(uuid, text, uuid, text) to service_role;
