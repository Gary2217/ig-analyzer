-- ============================================================
-- Migration: Extend user_ig_accounts for SaaS token metadata
-- Date: 2026-02-16
-- Risk: LOW (additive) — does NOT modify existing queries/rows
-- ============================================================

alter table if exists public.user_ig_accounts
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- Backfill created_at for any pre-existing rows (idempotent)
update public.user_ig_accounts
set created_at = now()
where created_at is null;

-- Helpful index for token expiry scans (optional)
create index if not exists user_ig_accounts_expires_at_idx
  on public.user_ig_accounts (expires_at);

-- ============================================================
-- Rollback (manual):
--   alter table public.user_ig_accounts drop column if exists expires_at;
--   alter table public.user_ig_accounts drop column if exists created_at;
--   drop index if exists public.user_ig_accounts_expires_at_idx;
-- ============================================================
