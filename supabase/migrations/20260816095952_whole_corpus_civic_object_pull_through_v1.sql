-- Whole-corpus civic object pull-through.
-- Additive only: preserves source rows and existing consumer views.

create or replace view public.v_lighthouse_civic_object_current_v1
with (security_invoker = true) as
with fresh as (
  select run_id, engine_version, completed_at, 10::int as run_priority, 'fresh_corpus'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_corpus_reconciliation_v%'
    and status = 'completed'
    and not coalesce(result_json ? 'superseded_by_run_id', false)
  order by completed_at desc, run_id desc
  limit 1
), enrichment as (
  select run_id, engine_version, completed_at, 20::int as run_priority, 'state_enrichment'::text as run_role
  from public.luminari_corpus_rebuild_run_v1
  where engine_version like 'fresh_state_enrichment_reconciliation_v%'
    and status = 'completed'
  order by completed_at desc, run_id desc
  limit 1
), current_runs as (
  select * from fresh
  union all
  select * from enrichment
), ranked as (
  select
    r.*,
    cr.run_role as current_run_role,
    cr.engine_version as current_run_engine_version,
    cr.completed_at as current_run_completed_at,
    row_number() over (
      partition by r.source_candidate_hash
      order by cr.run_priority desc, r.reconciled_at desc, r.object_ref
    ) as exact_source_rank
  from public.luminari_civic_object_reconciliation_v1 r
  join current_runs cr using (run_id)
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
  field_provenance,
  has_access_point,
  projection_state,
  projection_version,
  reconciled_at,
  (object_class not in ('unresolved_source_record','unresolved_legal_reference')
    and candidate_state not in ('unresolved','identity_conflict')) as typed_ready,
  (jurisdiction_resolution_state not in ('unresolved','conflict')) as jurisdiction_ready,
  (object_class = 'resource'
    and nullif(btrim(name),'') is not null
    and has_access_point
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
    when object_class = 'resource' and not has_access_point then 'resource_access_unresolved'
    else 'current_typed'
  end as data_state
from ranked
where exact_source_rank = 1;

create or replace view public.v_lighthouse_civic_object_current_summary_v1
with (security_invoker = true) as
select
  object_class,
  target_surface,
  count(*)::bigint as object_count,
  count(*) filter (where typed_ready)::bigint as typed_ready_count,
  count(*) filter (where jurisdiction_ready)::bigint as jurisdiction_ready_count,
  count(*) filter (where has_access_point)::bigint as access_point_count,
  count(*) filter (where direct_access_ready)::bigint as direct_access_ready_count,
  count(*) filter (where data_state <> 'current_typed')::bigint as unresolved_or_held_count,
  max(reconciled_at) as latest_reconciled_at
from public.v_lighthouse_civic_object_current_v1
group by object_class, target_surface;

create or replace view public.v_lighthouse_resource_program_catalog_v2
with (security_invoker = true) as
select
  c.*,
  case when object_class='resource' then 'direct_or_referral_resource' else 'program_or_benefit' end as catalog_kind,
  case
    when object_class='resource' then direct_access_ready
    when object_class='program' then typed_ready and jurisdiction_ready and nullif(btrim(name),'') is not null
    else false
  end as person_facing_ready
from public.v_lighthouse_civic_object_current_v1 c
where object_class in ('resource','program');

create or replace view public.v_lighthouse_legal_authority_catalog_v2
with (security_invoker = true) as
select
  c.*,
  (object_class='legal_authority'
    and typed_ready
    and jurisdiction_ready
    and coalesce(nullif(btrim(name),''),nullif(btrim(statutory_authority),'')) is not null) as legal_catalog_ready
from public.v_lighthouse_civic_object_current_v1 c
where object_class in ('legal_authority','unresolved_legal_reference');

create or replace view public.v_lighthouse_workflow_accountability_catalog_v1
with (security_invoker = true) as
select
  c.*,
  case
    when object_class='workflow' then 'workflow'
    when object_class='deadline' then 'deadline'
    when object_class='enforcement_pathway' then 'enforcement'
    when object_class='oversight_route' then 'oversight_route'
    when object_class='oversight_body' then 'oversight_body'
    when object_class='agency' then 'agency'
    when object_class='agency_status' then 'agency_status'
    else 'accountability'
  end as accountability_kind,
  (typed_ready and (jurisdiction_ready or object_class in ('oversight_body','agency_status'))) as workflow_catalog_ready
from public.v_lighthouse_civic_object_current_v1 c
where object_class in ('workflow','deadline','enforcement_pathway','oversight_route','oversight_body','agency','agency_status');

create or replace view public.v_lighthouse_civic_directory_v1
with (security_invoker = true) as
select
  c.*,
  case
    when object_class='contact_record' then 'contact'
    when object_class='organization' then 'organization'
    when object_class='tribal_governance_record' then 'tribal_governance'
    when object_class in ('jurisdiction_fact','jurisdiction_override') then 'jurisdiction'
    when object_class='legislator' then 'legislator'
    when object_class='advocacy_target' then 'advocacy_target'
    when object_class='policy_domain' then 'policy_domain'
    when object_class in ('relationship_bundle','relationship_record') then 'relationship'
    when object_class='document_reference' then 'document_reference'
    else 'directory_object'
  end as directory_kind
from public.v_lighthouse_civic_object_current_v1 c
where object_class in (
  'contact_record','organization','tribal_governance_record','jurisdiction_fact','jurisdiction_override',
  'legislator','advocacy_target','policy_domain','relationship_bundle','relationship_record','document_reference'
);

create or replace view public.v_lighthouse_signal_context_v2
with (security_invoker = true) as
select
  c.*,
  false as is_canonical_signal,
  'context_only_not_signal'::text as signal_semantics
from public.v_lighthouse_civic_object_current_v1 c
where object_class in ('policy_alert','policy_pattern','pressure_indicator');

create or replace view public.v_lighthouse_case_attachable_objects_v1
with (security_invoker = true) as
select
  c.*,
  'civic:' || object_ref as attachment_key,
  case
    when object_class in ('resource','program') then 'recommended_resource_or_program'
    when object_class in ('legal_authority','unresolved_legal_reference') then 'governing_or_relevant_authority'
    when object_class='workflow' then 'procedure_or_workflow'
    when object_class='deadline' then 'deadline_or_clock'
    when object_class in ('agency','enforcement_pathway','oversight_route','oversight_body','agency_status') then 'agency_or_accountability_route'
    when object_class in ('contact_record','organization','tribal_governance_record','legislator','advocacy_target') then 'reference_entity'
    when object_class in ('jurisdiction_fact','jurisdiction_override') then 'jurisdiction_context'
    when object_class in ('policy_alert','policy_pattern','pressure_indicator') then 'context_not_signal'
    when object_class in ('case_evidence','case_finding','case_resolution_pathway','case_instance') then 'case_internal_object'
    else 'supporting_civic_object'
  end as suggested_attachment_role
from public.v_lighthouse_civic_object_current_v1 c
where object_class not in ('workbook_context','platform_specification','unresolved_source_record');

create or replace view public.v_lighthouse_unresolved_civic_objects_v1
with (security_invoker = true) as
select
  c.*,
  case
    when object_class='unresolved_source_record' then 'unresolved_object_type'
    when object_class='unresolved_legal_reference' then 'unresolved_legal_reference'
    when candidate_state='identity_conflict' then 'identity_conflict'
    when candidate_state='unresolved' then 'identity_unresolved'
    when jurisdiction_resolution_state='conflict' then 'jurisdiction_conflict'
    when jurisdiction_resolution_state='unresolved' then 'jurisdiction_unresolved'
    when object_class='resource' and nullif(btrim(name),'') is null then 'resource_identity_unresolved'
    when object_class='resource' and not has_access_point then 'resource_access_unresolved'
    else 'other_hold'
  end as unresolved_reason
from public.v_lighthouse_civic_object_current_v1 c
where data_state <> 'current_typed';

create or replace function public.search_lighthouse_civic_objects_v1(
  p_query text default null,
  p_jurisdiction text default null,
  p_object_classes text[] default null,
  p_ready_only boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
)
returns setof public.v_lighthouse_civic_object_current_v1
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $function$
  select c.*
  from public.v_lighthouse_civic_object_current_v1 c
  where (p_jurisdiction is null
         or upper(coalesce(c.state_code,'')) = upper(p_jurisdiction)
         or upper(coalesce(c.jurisdiction,'')) = upper(p_jurisdiction))
    and (p_object_classes is null or c.object_class = any(p_object_classes))
    and (not p_ready_only or c.typed_ready)
    and (
      nullif(btrim(p_query),'') is null
      or concat_ws(' ',c.name,c.organization_name,c.category,c.description,c.statutory_authority,c.section_name,c.source_locator)
           ilike '%' || btrim(p_query) || '%'
    )
  order by c.typed_ready desc, c.jurisdiction_ready desc, c.has_access_point desc,
           coalesce(c.name,c.organization_name,c.object_class), c.object_ref
  limit least(greatest(coalesce(p_limit,100),1),500)
  offset greatest(coalesce(p_offset,0),0);
$function$;

create or replace function public.get_lighthouse_civic_object_snapshot_v1()
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'total_current_objects', coalesce(sum(object_count),0),
    'typed_ready', coalesce(sum(typed_ready_count),0),
    'jurisdiction_ready', coalesce(sum(jurisdiction_ready_count),0),
    'with_access_point', coalesce(sum(access_point_count),0),
    'direct_access_ready', coalesce(sum(direct_access_ready_count),0),
    'unresolved_or_held', coalesce(sum(unresolved_or_held_count),0),
    'by_class', coalesce(jsonb_agg(to_jsonb(s) order by object_count desc),'[]'::jsonb),
    'generated_at', clock_timestamp()
  )
  from public.v_lighthouse_civic_object_current_summary_v1 s;
$function$;

revoke all on public.v_lighthouse_civic_object_current_v1 from anon, authenticated;
revoke all on public.v_lighthouse_civic_object_current_summary_v1 from anon, authenticated;
revoke all on public.v_lighthouse_resource_program_catalog_v2 from anon, authenticated;
revoke all on public.v_lighthouse_legal_authority_catalog_v2 from anon, authenticated;
revoke all on public.v_lighthouse_workflow_accountability_catalog_v1 from anon, authenticated;
revoke all on public.v_lighthouse_civic_directory_v1 from anon, authenticated;
revoke all on public.v_lighthouse_signal_context_v2 from anon, authenticated;
revoke all on public.v_lighthouse_case_attachable_objects_v1 from anon, authenticated;
revoke all on public.v_lighthouse_unresolved_civic_objects_v1 from anon, authenticated;
revoke all on function public.search_lighthouse_civic_objects_v1(text,text,text[],boolean,integer,integer) from public, anon, authenticated;
revoke all on function public.get_lighthouse_civic_object_snapshot_v1() from public, anon, authenticated;

grant select on public.v_lighthouse_civic_object_current_v1 to service_role;
grant select on public.v_lighthouse_civic_object_current_summary_v1 to service_role;
grant select on public.v_lighthouse_resource_program_catalog_v2 to service_role;
grant select on public.v_lighthouse_legal_authority_catalog_v2 to service_role;
grant select on public.v_lighthouse_workflow_accountability_catalog_v1 to service_role;
grant select on public.v_lighthouse_civic_directory_v1 to service_role;
grant select on public.v_lighthouse_signal_context_v2 to service_role;
grant select on public.v_lighthouse_case_attachable_objects_v1 to service_role;
grant select on public.v_lighthouse_unresolved_civic_objects_v1 to service_role;
grant execute on function public.search_lighthouse_civic_objects_v1(text,text,text[],boolean,integer,integer) to service_role;
grant execute on function public.get_lighthouse_civic_object_snapshot_v1() to service_role;
