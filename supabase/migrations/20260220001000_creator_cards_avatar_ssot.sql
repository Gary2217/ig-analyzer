-- ============================================================
-- Migration: Creator cards avatar SSOT + is_owner_card ordering
-- Risk: LOW — additive only, no RLS changes
-- ============================================================

-- 1) Ensure avatar columns exist (avatar_url already added in 20260203000400)
alter table if exists public.creator_cards
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_updated_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- 2) is_owner_card: exactly one true per user (their own card)
alter table if exists public.creator_cards
  add column if not exists is_owner_card boolean not null default false;

-- 3) Keep updated_at fresh on every update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_creator_cards_updated_at on public.creator_cards;
create trigger trg_creator_cards_updated_at
  before update on public.creator_cards
  for each row execute function public.set_updated_at();

-- 4) Indexes
create index if not exists creator_cards_user_id_idx
  on public.creator_cards (user_id);

create index if not exists creator_cards_updated_at_idx
  on public.creator_cards (updated_at);

-- Composite index for the "owner card first" ordering query
create index if not exists creator_cards_owner_idx
  on public.creator_cards (user_id, is_owner_card desc, updated_at desc);

-- 5) Backfill is_owner_card=true for the single card per user that has user_id set.
--    Uses a CTE to pick the most-recently-updated card per user and mark it as owner.
with ranked as (
  select id,
         row_number() over (partition by user_id order by updated_at desc nulls last, id) as rn
  from public.creator_cards
  where user_id is not null
)
update public.creator_cards cc
set is_owner_card = true
from ranked r
where cc.id = r.id
  and r.rn = 1
  and cc.is_owner_card = false;
