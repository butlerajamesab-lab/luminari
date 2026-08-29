-- Extend the append-only reviewed-source supplement lane with exact Federal
-- Master service-only material types.  These types preserve the source's
-- agencies, observations, prompts, thresholds, overlaps, and fragment
-- lineage without coercing them into Resource Directory routes, canonical
-- actions, legal-statute rows, or public Knowledge Backbone entries.
--
-- This migration creates no public view or activation path.  The underlying
-- table still enforces service_only access and a separate publication gate.

alter table public.luminari_reviewed_source_supplement_revision_v1
  drop constraint if exists luminari_reviewed_source_supplement_type_check;

alter table public.luminari_reviewed_source_supplement_revision_v1
  add constraint luminari_reviewed_source_supplement_type_check
  check (supplement_type in (
    'authority',
    'jurisdiction_entry_point',
    'handoff',
    'integrity_flag',
    'source_alias_resolution',
    'primary_resource',
    'program',
    'deadline',
    'case_action_link',
    'cross_lens_binding',
    'held_binding',
    'agency',
    'agency_status',
    'observed_route',
    'claim_route',
    'optional_action',
    'employer_threshold',
    'regional_index',
    'strategy',
    'operating_context',
    'source_alias',
    'overlap_relationship',
    'source_fragment_lineage',
    'projection_hold'
  ));

create or replace function public.assert_luminari_reviewed_source_supplement_type_v3(
  p_type text
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if nullif(btrim(p_type), '') is null
     or nullif(btrim(p_type), '') not in (
    'authority',
    'jurisdiction_entry_point',
    'handoff',
    'integrity_flag',
    'source_alias_resolution',
    'primary_resource',
    'program',
    'deadline',
    'case_action_link',
    'cross_lens_binding',
    'held_binding',
    'agency',
    'agency_status',
    'observed_route',
    'claim_route',
    'optional_action',
    'employer_threshold',
    'regional_index',
    'strategy',
    'operating_context',
    'source_alias',
    'overlap_relationship',
    'source_fragment_lineage',
    'projection_hold'
  ) then
    raise exception 'unsupported reviewed supplement type %', p_type;
  end if;
end;
$function$;

revoke all on function public.assert_luminari_reviewed_source_supplement_type_v3(text)
  from public, anon, authenticated, service_role;
grant execute on function public.assert_luminari_reviewed_source_supplement_type_v3(text)
  to service_role;

create index if not exists luminari_reviewed_source_supplement_source_type_order_idx
  on public.luminari_reviewed_source_supplement_revision_v1
  (source_filename, supplement_type, source_order, run_id);

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
  perform public.assert_luminari_reviewed_source_supplement_type_v3(v_type);
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

comment on function public.assert_luminari_reviewed_source_supplement_type_v3(text) is
  'Validates existing reviewed supplement types plus exact Federal Master service-only source material types.';

comment on function public.register_luminari_reviewed_source_supplement_v1(uuid, jsonb, jsonb) is
  'Append-only exact-key reviewed-source supplement registration. All records remain service-only and separately gated; Federal observations do not become public routes or actions.';

comment on table public.luminari_reviewed_source_supplement_revision_v1 is
  'Append-only service-only reviewed source revisions, including exact Federal agencies, observations, claim prompts, deadlines, thresholds, strategies, overlaps, aliases, and fragment/hold lineage. Separate publication is always required.';
