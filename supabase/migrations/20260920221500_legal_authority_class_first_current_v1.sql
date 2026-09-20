-- Legal Library read model: keep the source-first winner contract while
-- restricting the winner window to legal classes before row_number().
--
-- Production equivalence audit before this migration:
-- no source_candidate_hash currently spans more than one object_class.
-- The class-first window therefore preserves the same winner for every legal
-- source candidate while avoiding a full-corpus WindowAgg on each Legal Library read.

create or replace view public.v_lighthouse_legal_authority_current_fast_v1
with (security_invoker = true) as
with fresh as (
  select run_id, engine_version, completed_at,
         10::int as run_priority, 'fresh_corpus'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_corpus_reconciliation_v%'
    and status = 'completed'
    and not coalesce(result_json ? 'superseded_by_run_id', false)
), enrichment as (
  select run_id, engine_version, completed_at,
         20::int as run_priority, 'state_enrichment'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_state_enrichment_reconciliation_v%'
    and status = 'completed'
), reviewed_overlays as (
  select r.run_id, r.engine_version, r.completed_at,
         30::int as run_priority, 'reviewed_source_overlay'::text as run_role
  from public.v_luminari_reviewed_source_overlay_current_v1 o
  join public.luminari_corpus_rebuild_run_v1 r
    on r.run_id = o.active_run_id
  where r.status = 'completed'
    and r.engine_version like 'manual_source_review_reconciliation_v%'
), current_runs as (
  select * from fresh
  union all
  select * from enrichment
  union all
  select * from reviewed_overlays
), ranked as (
  select
    r.*,
    cr.run_role as current_run_role,
    cr.engine_version as current_run_engine_version,
    cr.completed_at as current_run_completed_at,
    row_number() over (
      partition by r.source_candidate_hash
      order by cr.run_priority desc, cr.completed_at desc nulls last,
               r.reconciled_at desc, r.object_ref
    ) as exact_source_rank
  from public.luminari_civic_object_reconciliation_v1 r
  join current_runs cr using (run_id)
  where r.object_class in ('legal_authority','unresolved_legal_reference')
), hydrated as (
  select
    ranked.*,
    case
      when source_object_type = 'situation_action' then
        public.luminari_action_supporting_bindings_json_v1(
          field_provenance #>> '{situation_action,action_key}'
        )
      else null::jsonb
    end as current_supporting_bindings
  from ranked
  where exact_source_rank = 1
), prepared as (
  select
    hydrated.*,
    case
      when source_object_type = 'situation_action' then
        coalesce(field_provenance, '{}'::jsonb)
        || jsonb_build_object(
          'source_review',
          coalesce(field_provenance->'source_review', '{}'::jsonb)
            || jsonb_build_object(
              'record_count', jsonb_array_length(coalesce(current_supporting_bindings, '[]'::jsonb)),
              'binding_hydration_contract', 'current_normalized_overlay_union_v1'
            ),
          'supporting_bindings', coalesce(current_supporting_bindings, '[]'::jsonb)
        )
      else field_provenance
    end as resolved_field_provenance,
    case
      when source_object_type = 'situation_action' then exists (
        select 1
        from jsonb_array_elements(coalesce(current_supporting_bindings, '[]'::jsonb)) as route(value)
        where nullif(btrim(route.value->>'filing_or_complaint_url'), '') is not null
           or nullif(btrim(route.value->>'phone'), '') is not null
           or nullif(btrim(route.value->>'email'), '') is not null
           or nullif(btrim(route.value->>'website'), '') is not null
      )
      else has_access_point
    end as resolved_has_access_point
  from hydrated
)
select
  'corpus:' || object_ref as civic_object_uid,
  object_ref,
  source_object_type,
  object_class,
  target_surface,
  run_id,
  current_run_role,
  current_run_engine_version,
  current_run_completed_at,
  artifact_key,
  artifact_role,
  source_locator,
  source_content_sha256,
  source_candidate_hash,
  parser_version,
  jurisdiction,
  state_code,
  jurisdiction_resolution_state,
  section_name,
  name,
  organization_name,
  category,
  layer,
  phone,
  email,
  website_url,
  address,
  eligibility_summary,
  apply_notes,
  description,
  filing_portal,
  filing_portal_url,
  statutory_authority,
  deadline,
  hours,
  languages,
  organization_type,
  candidate_state,
  source_created_at,
  resolved_field_provenance as field_provenance,
  resolved_has_access_point as has_access_point,
  projection_state,
  projection_version,
  reconciled_at,
  (object_class not in ('unresolved_source_record','unresolved_legal_reference')
    and candidate_state not in ('unresolved','identity_conflict')) as typed_ready,
  (jurisdiction_resolution_state not in ('unresolved','conflict')) as jurisdiction_ready,
  (object_class = 'resource'
    and nullif(btrim(name),'') is not null
    and resolved_has_access_point
    and candidate_state not in ('unresolved','identity_conflict')
    and jurisdiction_resolution_state not in ('unresolved','conflict')) as direct_access_ready,
  case
    when object_class = 'unresolved_source_record' then 'unresolved_type'
    when object_class = 'unresolved_legal_reference' then 'unresolved_legal_reference'
    when candidate_state = 'identity_conflict' then 'identity_conflict'
    when candidate_state = 'unresolved' then 'identity_unresolved'
    when jurisdiction_resolution_state = 'conflict' then 'jurisdiction_conflict'
    when jurisdiction_resolution_state = 'unresolved' then 'jurisdiction_unresolved'
    when object_class = 'resource' and nullif(btrim(name),'') is null then 'resource_identity_unresolved'
    when object_class = 'resource' and not resolved_has_access_point then 'resource_access_unresolved'
    else 'current_typed'
  end as data_state
from prepared;

comment on view public.v_lighthouse_legal_authority_current_fast_v1 is
  'Class-first source-winner projection for legal authority reads. It preserves the canonical current-run/run-priority/source-candidate winner contract while avoiding whole-corpus ranking.';

create or replace view public.v_lighthouse_legal_authority_catalog_v2
with (security_invoker = true) as
select
  c.*,
  (object_class='legal_authority'
    and typed_ready
    and jurisdiction_ready
    and coalesce(nullif(btrim(name),''),nullif(btrim(statutory_authority),'')) is not null) as legal_catalog_ready
from public.v_lighthouse_legal_authority_current_fast_v1 c;

revoke all on public.v_lighthouse_legal_authority_current_fast_v1
  from public, anon, authenticated;
revoke all on public.v_lighthouse_legal_authority_catalog_v2
  from public, anon, authenticated;
grant select on public.v_lighthouse_legal_authority_current_fast_v1 to service_role;
grant select on public.v_lighthouse_legal_authority_catalog_v2 to service_role;
