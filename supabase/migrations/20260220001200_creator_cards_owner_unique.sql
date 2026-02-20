-- ============================================================
-- Migration: Enforce exactly one owner card per user
-- Risk: LOW — additive index + cleanup UPDATE only
-- ============================================================

-- 1) Cleanup: demote duplicate owner cards, keep newest per user
with ranked as (
  select id, user_id,
         row_number() over (
           partition by user_id
           order by updated_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.creator_cards
  where is_owner_card = true
)
update public.creator_cards c
set is_owner_card = false
from ranked r
where c.id = r.id
  and r.rn > 1;

-- 2) Partial unique index: only one is_owner_card=true per user_id
create unique index if not exists creator_cards_one_owner_per_user
  on public.creator_cards (user_id)
  where is_owner_card = true;
