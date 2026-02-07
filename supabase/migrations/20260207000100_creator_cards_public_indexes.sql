-- ============================================================
-- Migration: Add indexes for public creator card lookups
-- Date: 2025-02-07
-- Risk: LOW — additive only, no schema changes, no RLS impact
-- ============================================================

-- 1. Index for public card page lookup by handle + is_public
--    Hot path: GET /api/creator-card/public?handle=...
--    Query:  .eq("handle", handle).eq("is_public", true)
create index if not exists creator_cards_handle_is_public_idx
  on public.creator_cards (handle, is_public)
  where is_public = true;

-- 2. Index for public card page lookup by id + is_public
--    Hot path: GET /api/creator-card/public-card?id=...
--    Also used by: app/[locale]/card/[id]/page.tsx SSR fetch
--    Query:  .eq("id", id).eq("is_public", true)
create index if not exists creator_cards_id_is_public_idx
  on public.creator_cards (id)
  where is_public = true;

-- 3. Composite index for upsert route's "select existing by ig_user_id"
--    Already covered by unique index creator_cards_ig_user_id_uidx — NO ACTION NEEDED

-- 4. Index for /api/creator-card/me lookup by user_id
--    Already covered by creator_cards_user_id_idx — NO ACTION NEEDED

-- 5. creator_stats.creator_id is already PRIMARY KEY — NO ACTION NEEDED

-- 6. creator_card_ig_posts (user_id, card_id) already indexed — NO ACTION NEEDED

-- ============================================================
-- NOTES:
-- • All indexes use IF NOT EXISTS — safe to re-run.
-- • Partial indexes (WHERE is_public = true) keep index small
--   and only cover the rows that public queries actually need.
-- • No columns added, no RLS policies affected.
-- • For production with heavy traffic, consider running with
--   CONCURRENTLY (requires outside a transaction):
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS creator_cards_handle_is_public_idx
--     ON public.creator_cards (handle, is_public) WHERE is_public = true;
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS creator_cards_id_is_public_idx
--     ON public.creator_cards (id) WHERE is_public = true;
-- ============================================================
