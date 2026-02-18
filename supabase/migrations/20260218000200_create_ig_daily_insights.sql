create table if not exists public.ig_daily_insights (
  ig_account_id uuid not null,
  day date not null,
  ig_user_id text null,
  reach bigint null,
  impressions bigint null,
  total_interactions bigint null,
  accounts_engaged bigint null,
  captured_at timestamptz not null default now(),
  source text null
);

do $$
declare
  pk_name text;
begin
  select c.conname
    into pk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'ig_daily_insights'
    and c.contype = 'p'
  limit 1;

  if pk_name is not null then
    execute format('alter table public.ig_daily_insights drop constraint %I', pk_name);
  end if;
end $$;

alter table public.ig_daily_insights
  add column if not exists ig_account_id uuid;

alter table public.ig_daily_insights
  add column if not exists day date;

alter table public.ig_daily_insights
  add column if not exists ig_user_id text;

alter table public.ig_daily_insights
  add column if not exists reach bigint;

alter table public.ig_daily_insights
  add column if not exists impressions bigint;

alter table public.ig_daily_insights
  add column if not exists total_interactions bigint;

alter table public.ig_daily_insights
  add column if not exists accounts_engaged bigint;

alter table public.ig_daily_insights
  add column if not exists captured_at timestamptz;

alter table public.ig_daily_insights
  add column if not exists source text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ig_daily_insights'
      and column_name = 'ig_account_id'
  ) then
    if not exists (select 1 from public.ig_daily_insights where ig_account_id is null limit 1) then
      alter table public.ig_daily_insights alter column ig_account_id set not null;
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ig_daily_insights'
      and column_name = 'day'
  ) then
    if not exists (select 1 from public.ig_daily_insights where day is null limit 1) then
      alter table public.ig_daily_insights alter column day set not null;
    end if;
  end if;
end $$;

create unique index if not exists uq_ig_daily_insights_account_day
  on public.ig_daily_insights (ig_account_id, day);

create index if not exists idx_ig_daily_insights_day
  on public.ig_daily_insights (day);

alter table public.ig_daily_insights
  alter column captured_at set default now();

alter table public.ig_daily_insights enable row level security;
