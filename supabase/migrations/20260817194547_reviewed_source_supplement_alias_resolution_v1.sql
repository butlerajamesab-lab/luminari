-- Add an explicit, service-only lineage kind for source URL aliases and their
-- reviewed resolution state. This remains append-only and does not create a
-- person-facing projection or publication gate.

alter table public.luminari_reviewed_source_supplement_revision_v1
  drop constraint if exists luminari_reviewed_source_supplement_type_check;

alter table public.luminari_reviewed_source_supplement_revision_v1
  add constraint luminari_reviewed_source_supplement_type_check
  check (supplement_type in (
    'authority',
    'jurisdiction_entry_point',
    'handoff',
    'integrity_flag',
    'source_alias_resolution'
  ));

comment on table public.luminari_reviewed_source_supplement_revision_v1 is
  'Append-only, service-only revisions for reviewed authorities, jurisdiction entry points, handoffs, integrity flags, and source alias/resolution lineage. A separate publication/access decision is required before any downstream public projection.';

create or replace function public.register_luminari_reviewed_source_supplement_v1(
  p_run_id uuid,
  p_source jsonb,
  p_record jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_source_filename text := nullif(btrim(p_source->>'filename'), '');
  v_source_sha text := nullif(btrim(p_source->>'content_sha256'), '');
  v_ledger_sha text := nullif(btrim(p_source->>'manual_review_ledger_sha256'), '');
  v_supplement_key text := nullif(btrim(p_record->>'supplement_key'), '');
  v_revision_key text := nullif(btrim(p_record->>'supplement_revision_key'), '');
  v_type text := nullif(btrim(p_record->>'supplement_type'), '');
  v_source_record_id text := nullif(btrim(p_record->>'source_record_id'), '');
  v_source_pages integer[];
  v_record_id uuid;
  v_existing_revision_key text;
  v_existing_payload_sha text;
begin
  perform public.assert_luminari_manual_review_run_v1(p_run_id);

  if v_source_filename is null
     or v_source_sha !~ '^[0-9a-f]{64}$'
     or v_ledger_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed supplement source filename and hashes are required';
  end if;
  if v_supplement_key is null
     or v_revision_key !~ '^[0-9a-f]{64}$'
     or v_source_record_id is null then
    raise exception 'reviewed supplement identity and revision key are required';
  end if;
  if v_type not in (
    'authority', 'jurisdiction_entry_point', 'handoff', 'integrity_flag',
    'source_alias_resolution'
  ) then
    raise exception 'unsupported reviewed supplement type %', v_type;
  end if;
  if nullif(btrim(p_record->>'source_section'), '') is null
     or nullif(btrim(p_record->>'source_status'), '') is null
     or nullif(btrim(p_record->>'title'), '') is null
     or coalesce((p_record->>'source_order')::integer, 0) <= 0 then
    raise exception 'reviewed supplement source position and title are required';
  end if;
  if p_record->>'access_state' is distinct from 'service_only'
     or coalesce((p_record->>'requires_separate_publication_gate')::boolean, false) is not true then
    raise exception 'reviewed supplements must remain service-only and separately gated';
  end if;
  if p_record->>'visibility_state' not in (
    'eligible_for_separate_gate', 'service_only',
    'withheld_missing_access_point', 'withheld_integrity', 'historical_only'
  ) then
    raise exception 'invalid reviewed supplement visibility state';
  end if;
  if coalesce(p_record->>'record_payload_sha256', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_record->'record_payload') is distinct from 'object'
     or jsonb_typeof(p_record->'field_provenance') is distinct from 'object' then
    raise exception 'reviewed supplement payload and provenance are required';
  end if;
  if v_type = 'source_alias_resolution'
     and (
       jsonb_typeof(p_record #> '{record_payload,alias_resolution}')
         is distinct from 'object'
       or nullif(btrim(p_record #>> '{record_payload,alias_resolution,observed_url}'), '')
         is null
       or nullif(btrim(p_record #>> '{record_payload,alias_resolution,superseded_by_route_id}'), '')
         is null
     ) then
    raise exception 'source alias/resolution records require an observed URL and reviewed route resolution';
  end if;

  select array_agg(value::integer order by ordinality)
    into v_source_pages
  from jsonb_array_elements_text(p_record->'source_pages')
    with ordinality as pages(value, ordinality);

  if coalesce(cardinality(v_source_pages), 0) = 0
     or exists (
       select 1
       from unnest(v_source_pages) as pages(page)
       where page <= 0
     ) then
    raise exception 'reviewed supplement page provenance is required';
  end if;

  insert into public.luminari_reviewed_source_supplement_revision_v1 (
    run_id, supplement_revision_key, supplement_key, supplement_type,
    source_filename, source_content_sha256, manual_review_ledger_sha256,
    source_record_id, source_order, source_pages, source_section,
    source_status, title, jurisdiction_code, access_state, visibility_state,
    requires_separate_publication_gate, publication_candidate_surface,
    record_payload_sha256, record_payload, field_provenance
  ) values (
    p_run_id, v_revision_key, v_supplement_key, v_type,
    v_source_filename, v_source_sha, v_ledger_sha, v_source_record_id,
    (p_record->>'source_order')::integer, v_source_pages,
    p_record->>'source_section', p_record->>'source_status',
    p_record->>'title', nullif(btrim(p_record->>'jurisdiction_code'), ''),
    'service_only', p_record->>'visibility_state', true,
    nullif(btrim(p_record->>'publication_candidate_surface'), ''),
    p_record->>'record_payload_sha256', p_record->'record_payload',
    p_record->'field_provenance'
  )
  on conflict (run_id, supplement_key) do nothing
  returning supplement_revision_id into v_record_id;

  if v_record_id is null then
    select supplement_revision_id, supplement_revision_key,
           record_payload_sha256
      into v_record_id, v_existing_revision_key, v_existing_payload_sha
    from public.luminari_reviewed_source_supplement_revision_v1
    where run_id = p_run_id and supplement_key = v_supplement_key;

    if v_existing_revision_key is distinct from v_revision_key
       or v_existing_payload_sha is distinct from p_record->>'record_payload_sha256' then
      raise exception
        'same reviewed supplement key was presented with different content: %',
        v_supplement_key;
    end if;
  end if;

  return jsonb_build_object(
    'supplement_revision_id', v_record_id,
    'supplement_key', v_supplement_key,
    'supplement_revision_key', v_revision_key,
    'supplement_type', v_type,
    'access_state', 'service_only',
    'requires_separate_publication_gate', true
  );
end;
$function$;

revoke all on function public.register_luminari_reviewed_source_supplement_v1(
  uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.register_luminari_reviewed_source_supplement_v1(
  uuid, jsonb, jsonb
) to service_role;
