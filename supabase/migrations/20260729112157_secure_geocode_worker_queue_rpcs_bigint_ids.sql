drop function if exists public.claim_geocode_queue_batch_secure(text, integer, integer);
drop function if exists public.finalize_geocode_queue_item_secure(text, integer, text, double precision, double precision, text);

create function public.claim_geocode_queue_batch_secure(
  p_candidate text,
  p_batch_size integer default 10,
  p_max_attempts integer default 5
)
returns table(
  id bigint,
  entity_domain text,
  entity_id text,
  address_text text,
  city text,
  state text,
  postal_code text,
  country text,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
begin
  if extensions.digest(coalesce(p_candidate, ''), 'sha256') <>
     decode('618a5889b17a54403e22cea7a576a3cbab6b3d6c1ee16054f80921143073f113', 'hex') then
    return;
  end if;

  return query
  with picked as (
    select q.id
    from public.coordinate_enrichment_queue_v1 q
    where q.queue_status = 'pending'
      and coalesce(q.attempts, 0) < greatest(1, least(coalesce(p_max_attempts, 5), 10))
    order by q.id
    limit greatest(1, least(coalesce(p_batch_size, 10), 100))
    for update skip locked
  ), updated as (
    update public.coordinate_enrichment_queue_v1 q
    set queue_status = 'processing',
        attempts = coalesce(q.attempts, 0) + 1,
        last_attempt_at = now()
    from picked
    where q.id = picked.id
    returning q.id, q.entity_domain, q.entity_id, q.address_text,
              q.city, q.state, q.postal_code, q.country, q.attempts
  )
  select * from updated;
end
$function$;

create function public.finalize_geocode_queue_item_secure(
  p_candidate text,
  p_id bigint,
  p_queue_status text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_precision text default null
)
returns table(success boolean, reason text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_row public.coordinate_enrichment_queue_v1%rowtype;
  v_updated integer := 0;
begin
  if extensions.digest(coalesce(p_candidate, ''), 'sha256') <>
     decode('618a5889b17a54403e22cea7a576a3cbab6b3d6c1ee16054f80921143073f113', 'hex') then
    return query select false, 'unauthorized';
    return;
  end if;

  if p_queue_status not in ('pending', 'completed', 'failed') then
    return query select false, 'invalid_queue_status';
    return;
  end if;

  select * into v_row
  from public.coordinate_enrichment_queue_v1
  where id = p_id
  for update;

  if not found then
    return query select false, 'queue_row_not_found';
    return;
  end if;

  if v_row.queue_status <> 'processing' then
    return query select false, 'queue_row_not_processing';
    return;
  end if;

  if p_queue_status = 'completed' then
    if p_latitude is null or p_longitude is null then
      return query select false, 'coordinates_required';
      return;
    end if;

    if v_row.entity_domain not in ('normalized_civic_resource', 'civic') then
      return query select false, 'unsupported_entity_domain';
      return;
    end if;

    update public.normalized_civic_resource
    set latitude = p_latitude,
        longitude = p_longitude,
        geocode_precision = coalesce(p_precision, 'unknown'),
        updated_at = now()
    where id::text = v_row.entity_id;
    get diagnostics v_updated = row_count;

    if v_updated <> 1 then
      return query select false, 'resource_update_failed';
      return;
    end if;
  end if;

  update public.coordinate_enrichment_queue_v1
  set queue_status = p_queue_status,
      last_attempt_at = now()
  where id = p_id;

  return query select true, 'ok';
end
$function$;

revoke all on function public.claim_geocode_queue_batch_secure(text, integer, integer) from public;
revoke all on function public.finalize_geocode_queue_item_secure(text, bigint, text, double precision, double precision, text) from public;
grant execute on function public.claim_geocode_queue_batch_secure(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.finalize_geocode_queue_item_secure(text, bigint, text, double precision, double precision, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
