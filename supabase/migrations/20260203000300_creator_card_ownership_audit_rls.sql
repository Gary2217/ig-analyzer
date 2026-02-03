alter table public.creator_card_ownership_audit enable row level security;

revoke all on table public.creator_card_ownership_audit from public;
revoke all on table public.creator_card_ownership_audit from anon;
revoke all on table public.creator_card_ownership_audit from authenticated;

grant select, insert, update, delete on table public.creator_card_ownership_audit to service_role;
