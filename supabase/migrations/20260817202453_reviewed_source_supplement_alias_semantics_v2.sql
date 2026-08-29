-- Extend only the service-only reviewed-source alias validator so truthful
-- lineage is not forced into a singular URL-supersession shape. Apply after:
--   20260817163000_reviewed_source_supplement_substrate_v1.sql
--   20260817170000_reviewed_source_supplement_alias_resolution_v1.sql
--
-- This migration does not alter/delete stored rows, create public access, or
-- change the register_luminari_reviewed_source_supplement_v1 RPC signature.

create or replace function public.assert_luminari_reviewed_source_alias_semantics_v2(
  p_record jsonb
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_alias jsonb := p_record #> '{record_payload,alias_resolution}';
  v_resolution_mode_count integer := 0;
begin
  if jsonb_typeof(v_alias) is distinct from 'object' then
    raise exception 'source alias/resolution records require an alias_resolution object';
  end if;

  if nullif(btrim(v_alias->>'alias_key'), '') is null
     or nullif(btrim(v_alias->>'relation'), '') is null
     or nullif(btrim(v_alias->>'status'), '') is null then
    raise exception 'source alias/resolution records require exact alias identity, relation, and status';
  end if;

  if nullif(btrim(v_alias->>'observed_url'), '') is null
     and nullif(btrim(v_alias->>'observed_contact'), '') is null then
    raise exception 'source alias/resolution records require observed URL or contact lineage';
  end if;

  if coalesce((v_alias->>'visible')::boolean, true) is not false then
    raise exception 'reviewed source aliases must remain nonpublic lineage';
  end if;

  v_resolution_mode_count :=
      case when nullif(btrim(v_alias->>'superseded_by_route_id'), '') is not null then 1 else 0 end
    + case when nullif(btrim(v_alias->>'resolved_by_route_id'), '') is not null then 1 else 0 end
    + case when v_alias ? 'resolved_by_route_ids' then 1 else 0 end;

  if v_resolution_mode_count <> 1 then
    raise exception 'source alias/resolution records require exactly one truthful resolution mode';
  end if;

  if v_alias ? 'resolved_by_route_ids' then
    if jsonb_typeof(v_alias->'resolved_by_route_ids') is distinct from 'array'
       or jsonb_array_length(v_alias->'resolved_by_route_ids') = 0
       or exists (
         select 1
         from jsonb_array_elements(v_alias->'resolved_by_route_ids') as routes(value)
         where jsonb_typeof(value) is distinct from 'string'
            or nullif(btrim(value #>> '{}'), '') is null
       ) then
      raise exception 'one-to-many alias resolution requires nonempty reviewed route ids';
    end if;
  end if;
end;
$function$;

revoke all on function public.assert_luminari_reviewed_source_alias_semantics_v2(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.assert_luminari_reviewed_source_alias_semantics_v2(jsonb)
  to service_role;

comment on function public.assert_luminari_reviewed_source_alias_semantics_v2(jsonb) is
  'Validates service-only alias lineage without coercing URL/contact, supersession, same-route, parent-detail, or one-to-many resolution semantics.';

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
  if v_type = 'source_alias_resolution' then
    perform public.assert_luminari_reviewed_source_alias_semantics_v2(p_record);
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
    select supplement_revision_id, supplement_revision_key, record_payload_sha256
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

comment on function public.register_luminari_reviewed_source_supplement_v1(uuid, jsonb, jsonb) is
  'Append-only reviewed-source supplement registration with truthful URL/contact and one-to-many alias lineage validation (v2).';
