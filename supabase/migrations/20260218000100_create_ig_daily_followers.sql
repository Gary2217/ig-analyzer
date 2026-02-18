create table if not exists public.ig_daily_followers (
  ig_user_id text not null,
  day date not null,
  followers_count bigint not null,
  captured_at timestamptz not null default now(),
  constraint ig_daily_followers_pkey primary key (ig_user_id, day)
);

delete from public.ig_daily_followers where followers_count is null;

alter table public.ig_daily_followers
  alter column followers_count set not null;

create index if not exists idx_ig_daily_followers_ig_user_day
  on public.ig_daily_followers (ig_user_id, day);

alter table public.ig_daily_followers enable row level security;

-- No policies by default; service role bypasses RLS.
