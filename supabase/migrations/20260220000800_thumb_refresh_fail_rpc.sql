create or replace function public.thumb_refresh_fail(p_url_hash text)
returns table (refresh_failures int, next_refresh_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_failures int;
  backoff_mins int;
  new_next timestamptz;
begin
  -- Belt-and-suspenders: only callable by service_role
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  -- Atomically increment failures and release lock
  update public.ig_thumbnail_cache
  set refresh_failures = coalesce(refresh_failures, 0) + 1,
      refreshing = false
  where url_hash = p_url_hash
  returning refresh_failures into new_failures;

  -- If no row matched, return empty result (no exception)
  if new_failures is null then
    return;
  end if;

  -- Postgres: use power() for exponent ( ^ is XOR )
  backoff_mins := least(360, power(2::numeric, new_failures::numeric)::int);
  new_next := now() + make_interval(mins => backoff_mins);

  update public.ig_thumbnail_cache
  set next_refresh_at = new_next
  where url_hash = p_url_hash;

  return query select new_failures, new_next;
end;
$$;

revoke execute on function public.thumb_refresh_fail(text) from anon, authenticated;
grant execute on function public.thumb_refresh_fail(text) to service_role;
