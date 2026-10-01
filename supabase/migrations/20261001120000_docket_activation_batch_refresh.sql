begin;

-- One cache generation can register hundreds of bills.  The binding trigger is
-- still required for ordinary single-row writes, but running its aggregate
-- count query for each row turns one cache upsert into N full aggregates.
--
-- This transaction-local guard changes only the bulk-registration path below.
-- The final refresh preserves the exact same activation summary that the last
-- row-level refresh would have produced; no queue or binding is skipped.

create or replace function public.refresh_docket_activation_after_binding()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if current_setting('rosetta.bulk_docket_activation_registration', true) = 'on' then
    return new;
  end if;

  perform public.refresh_docket_jurisdiction_activation_run(new.activation_id);
  return new;
end;
$function$;

create or replace function public.register_docket_jurisdiction_activation(
  p_state text,
  p_session_id integer,
  p_session_title text,
  p_bills jsonb,
  p_bill_count integer,
  p_cache_fetched_at timestamptz,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_activation_id uuid;
  v_bill jsonb;
  v_source_bill_id integer;
  v_summary_fingerprint text;
  v_queue_id uuid;
begin
  if p_state is null or p_state !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_state';
  end if;
  if p_session_id is null or p_session_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_session';
  end if;
  if p_cache_fetched_at is null then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_fetched_at';
  end if;
  if jsonb_typeof(coalesce(p_bills, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_docket_activation_bills';
  end if;

  insert into public.docket_jurisdiction_activation_run (
    state,
    session_id,
    session_title,
    cache_fetched_at,
    source,
    bill_count
  ) values (
    p_state,
    p_session_id,
    p_session_title,
    p_cache_fetched_at,
    coalesce(nullif(p_source, ''), 'docket_state_cache'),
    greatest(coalesce(p_bill_count, jsonb_array_length(coalesce(p_bills, '[]'::jsonb))), 0)
  )
  on conflict (state, session_id, cache_fetched_at) do update
  set session_title = excluded.session_title,
      source = excluded.source,
      bill_count = excluded.bill_count,
      updated_at = now()
  returning activation_id into v_activation_id;

  -- The guard is local to this transaction and therefore cannot suppress
  -- refreshes from later queue-state changes or unrelated requests.
  perform set_config('rosetta.bulk_docket_activation_registration', 'on', true);

  for v_bill in
    select item.value
    from jsonb_array_elements(coalesce(p_bills, '[]'::jsonb)) item(value)
  loop
    v_source_bill_id := case
      when coalesce(v_bill ->> 'bill_id', '') ~ '^[0-9]+$'
        then (v_bill ->> 'bill_id')::integer
      else null
    end;
    if v_source_bill_id is null or v_source_bill_id <= 0 then
      continue;
    end if;

    v_summary_fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'state', p_state,
            'session_id', p_session_id,
            'source_bill_id', v_source_bill_id,
            'summary', v_bill
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.docket_bill_processing_queue (
      source_bill_id,
      summary_fingerprint,
      summary_json,
      observed_change_hash
    ) values (
      v_source_bill_id,
      v_summary_fingerprint,
      v_bill,
      nullif(v_bill ->> 'change_hash', '')
    )
    on conflict (source_bill_id, summary_fingerprint) do update
    set summary_json = excluded.summary_json,
        observed_change_hash = excluded.observed_change_hash,
        updated_at = now()
    returning queue_id into v_queue_id;

    insert into public.docket_jurisdiction_activation_bill (
      activation_id,
      queue_id,
      state,
      session_id,
      source_bill_id
    ) values (
      v_activation_id,
      v_queue_id,
      p_state,
      p_session_id,
      v_source_bill_id
    )
    on conflict (activation_id, source_bill_id) do nothing;
  end loop;

  -- Required, once: this is the same aggregation the row trigger performs.
  perform public.refresh_docket_jurisdiction_activation_run(v_activation_id);
  return v_activation_id;
end;
$function$;

revoke all on function public.register_docket_jurisdiction_activation(text, integer, text, jsonb, integer, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.refresh_docket_activation_after_binding()
  from public, anon, authenticated;
grant execute on function public.register_docket_jurisdiction_activation(text, integer, text, jsonb, integer, timestamptz, text)
  to service_role;

commit;
