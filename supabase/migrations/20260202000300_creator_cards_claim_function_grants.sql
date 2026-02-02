-- Adjust EXECUTE privileges for claim_creator_card_legacy
-- Goal:
-- - Keep function hardened (SECURITY DEFINER + pinned search_path)
-- - Prevent anon/public execution
-- - Allow server routes to call in environments where service_role key may be unavailable

revoke all on function public.claim_creator_card_legacy(text, uuid) from public;

-- Allow authenticated callers (server routes using per-request session) to execute.
grant execute on function public.claim_creator_card_legacy(text, uuid) to authenticated;

-- Also allow service_role when available.
grant execute on function public.claim_creator_card_legacy(text, uuid) to service_role;
