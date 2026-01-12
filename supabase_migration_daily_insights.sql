create table if not exists public.ig_daily_insights (
  id bigserial primary key,
  ig_user_id bigint not null,
  page_id bigint not null,
  day date not null,
  reach integer not null default 0,
  total_interactions integer not null default 0,
  accounts_engaged integer not null default 0,
  impressions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ig_daily_insights_ig_user_id_page_id_day_key unique (ig_user_id, page_id, day)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ig_daily_insights'
  ) then
    -- Drop the older unique constraint if it exists.
    if exists (
      select 1
      from pg_constraint
      where conrelid = 'public.ig_daily_insights'::regclass
        and conname = 'ig_daily_insights_ig_user_id_day_key'
    ) then
      alter table public.ig_daily_insights drop constraint ig_daily_insights_ig_user_id_day_key;
    end if;

    -- Ensure the new unique constraint exists.
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.ig_daily_insights'::regclass
        and conname = 'ig_daily_insights_ig_user_id_page_id_day_key'
    ) then
      alter table public.ig_daily_insights
        add constraint ig_daily_insights_ig_user_id_page_id_day_key unique (ig_user_id, page_id, day);
    end if;
  end if;
end$$;

create index if not exists ig_daily_insights_ig_user_id_page_id_day_desc_idx
  on public.ig_daily_insights (ig_user_id, page_id, day desc);

-- (Optional) If an older index exists, it's safe to keep it; Postgres will use the best index.
