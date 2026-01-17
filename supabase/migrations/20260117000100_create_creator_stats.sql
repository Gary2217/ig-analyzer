create table if not exists public.creator_stats (
  creator_id text primary key,
  engagement_rate_pct double precision,
  followers integer,
  avg_likes integer,
  avg_comments integer,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'creator_stats_set_updated_at'
  ) then
    create trigger creator_stats_set_updated_at
    before update on public.creator_stats
    for each row
    execute function public.set_updated_at_timestamp();
  end if;
end$$;

create index if not exists creator_stats_updated_at_desc_idx
  on public.creator_stats (updated_at desc);
