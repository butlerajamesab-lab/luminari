create or replace view public.v_lighthouse_graph_nodes_v1
with (security_invoker = true) as
with current_objects as (
  select * from public.v_lighthouse_civic_object_current_v1
), jurisdiction_nodes as (
  select distinct coalesce(nullif(state_code,''), nullif(jurisdiction,'')) as jurisdiction_code
  from current_objects
  where coalesce(nullif(state_code,''), nullif(jurisdiction,'')) is not null
), artifact_nodes as (
  select distinct c.artifact_key,
         a.object_name,
         a.artifact_role,
         a.semantic_family,
         a.content_sha256,
         a.extraction_status
  from current_objects c
  left join public.luminari_corpus_source_artifact_v1 a on a.artifact_key = c.artifact_key
  where c.artifact_key is not null
)
select
  'object:' || civic_object_uid as node_id,
  object_class as node_type,
  coalesce(nullif(name,''), nullif(organization_name,''), object_class || ' ' || left(object_ref, 16)) as label,
  coalesce(nullif(state_code,''), nullif(jurisdiction,'')) as jurisdiction_code,
  'civic_object'::text as node_origin,
  case when typed_ready then 'ready' else 'held' end as node_state,
  object_ref,
  artifact_key,
  source_locator,
  source_content_sha256,
  source_candidate_hash,
  jsonb_build_object(
    'target_surface', target_surface,
    'category', category,
    'section_name', section_name,
    'parser_version', parser_version,
    'current_run_role', current_run_role,
    'data_state', data_state,
    'typed_ready', typed_ready,
    'jurisdiction_ready', jurisdiction_ready,
    'direct_access_ready', direct_access_ready,
    'field_provenance', coalesce(field_provenance, '{}'::jsonb)
  ) as metadata
from current_objects
union all
select
  'jurisdiction:' || jurisdiction_code,
  'jurisdiction',
  jurisdiction_code,
  jurisdiction_code,
  'derived_anchor',
  'ready',
  null,
  null,
  null,
  null,
  null,
  jsonb_build_object('basis','current_civic_object_jurisdiction')
from jurisdiction_nodes
union all
select
  'artifact:' || md5(artifact_key),
  'source_artifact',
  coalesce(nullif(object_name,''), artifact_key),
  null,
  'derived_anchor',
  case when extraction_status is null or extraction_status like 'fresh_%' then 'ready' else 'observed' end,
  null,
  artifact_key,
  'artifact:0',
  content_sha256,
  null,
  jsonb_build_object(
    'artifact_role', artifact_role,
    'semantic_family', semantic_family,
    'extraction_status', extraction_status
  )
from artifact_nodes;

create or replace view public.v_lighthouse_graph_edges_v1
with (security_invoker = true) as
with current_objects as (
  select * from public.v_lighthouse_civic_object_current_v1
)
select
  'edge:' || md5('jurisdiction|' || civic_object_uid || '|' || coalesce(state_code,jurisdiction,'')) as edge_id,
  'object:' || civic_object_uid as from_node_id,
  'jurisdiction:' || coalesce(nullif(state_code,''), nullif(jurisdiction,'')) as to_node_id,
  'within_jurisdiction'::text as edge_type,
  'source_bound'::text as evidence_state,
  source_candidate_hash as evidence_hash,
  jsonb_build_object(
    'jurisdiction_resolution_state', jurisdiction_resolution_state,
    'source_locator', source_locator,
    'artifact_key', artifact_key
  ) as metadata
from current_objects
where coalesce(nullif(state_code,''), nullif(jurisdiction,'')) is not null
union all
select
  'edge:' || md5('artifact|' || civic_object_uid || '|' || artifact_key) as edge_id,
  'object:' || civic_object_uid as from_node_id,
  'artifact:' || md5(artifact_key) as to_node_id,
  'sourced_from'::text as edge_type,
  'source_bound'::text as evidence_state,
  coalesce(source_candidate_hash, source_content_sha256) as evidence_hash,
  jsonb_build_object(
    'source_locator', source_locator,
    'source_content_sha256', source_content_sha256,
    'parser_version', parser_version
  ) as metadata
from current_objects
where artifact_key is not null;

create or replace function public.get_lighthouse_canonical_state_v1()
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'contract','lighthouse_canonical_state_v1',
    'source_artifacts',(select count(*) from public.luminari_corpus_source_artifact_v1 where coalesce(storage_state,'active') <> 'missing'),
    'candidate_records',(select count(*) from public.luminari_corpus_candidate_v1),
    'current_civic_objects',(select count(*) from public.v_lighthouse_civic_object_current_v1),
    'typed_ready',(select count(*) from public.v_lighthouse_civic_object_current_v1 where typed_ready),
    'jurisdiction_ready',(select count(*) from public.v_lighthouse_civic_object_current_v1 where jurisdiction_ready),
    'unresolved_or_held',(select count(*) from public.v_lighthouse_civic_object_current_v1 where not typed_ready or not jurisdiction_ready),
    'jurisdictions',(select count(distinct coalesce(nullif(state_code,''), nullif(jurisdiction,''))) from public.v_lighthouse_civic_object_current_v1 where coalesce(nullif(state_code,''), nullif(jurisdiction,'')) is not null),
    'programs',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class='program'),
    'resources',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class='resource'),
    'agencies',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class in ('agency','oversight_body')),
    'workflows',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class in ('workflow','enforcement_pathway','oversight_route','deadline')),
    'legal_authorities',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class='legal_authority'),
    'contacts',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class='contact_record'),
    'organizations',(select count(*) from public.v_lighthouse_civic_object_current_v1 where object_class='organization'),
    'current_signals',(
      (select count(*) from public.intake_signals where is_current)
      + (select count(*) from public.legal_patterns where is_current)
      + (select count(*) from public.live_data_signals where is_current)
      + (select count(*) from public.signal_convergences where is_current)
    ),
    'signal_domains',jsonb_build_object(
      'intake',(select count(*) from public.intake_signals where is_current),
      'legal',(select count(*) from public.legal_patterns where is_current),
      'live_data',(select count(*) from public.live_data_signals where is_current),
      'convergence',(select count(*) from public.signal_convergences where is_current)
    ),
    'cases',(select count(*) from public.cases),
    'documents',(select count(*) from public.documents),
    'claims',(select count(*) from public.claims),
    'findings',(select count(*) from public.findings),
    'graph_nodes',(select count(*) from public.v_lighthouse_graph_nodes_v1),
    'graph_object_nodes',(select count(*) from public.v_lighthouse_graph_nodes_v1 where node_origin='civic_object'),
    'graph_edges',(select count(*) from public.v_lighthouse_graph_edges_v1),
    'graph_edge_types',(select coalesce(jsonb_object_agg(edge_type,cnt),'{}'::jsonb) from (select edge_type,count(*)::int cnt from public.v_lighthouse_graph_edges_v1 group by edge_type) x),
    'graph_node_types',(select coalesce(jsonb_object_agg(node_type,cnt),'{}'::jsonb) from (select node_type,count(*)::int cnt from public.v_lighthouse_graph_nodes_v1 group by node_type) x),
    'legacy_manual_world_nodes',(select count(*) from public.world_nodes),
    'legacy_detected_signals',(select count(*) from public.detected_signals),
    'signal_flow_logs',(select count(*) from public.signal_flow_logs),
    'canonical_remedy_paths',(select count(*) from public.remedy_paths where signal_id is not null),
    'generated_at',clock_timestamp()
  );
$$;

revoke all on public.v_lighthouse_graph_nodes_v1 from public, anon, authenticated;
revoke all on public.v_lighthouse_graph_edges_v1 from public, anon, authenticated;
grant select on public.v_lighthouse_graph_nodes_v1 to service_role;
grant select on public.v_lighthouse_graph_edges_v1 to service_role;
revoke execute on function public.get_lighthouse_canonical_state_v1() from public, anon, authenticated;
grant execute on function public.get_lighthouse_canonical_state_v1() to service_role;

comment on view public.v_lighthouse_graph_nodes_v1 is 'Derived current civic graph nodes. Civic objects remain canonical; graph participation is a projection and never a publication gate.';
comment on view public.v_lighthouse_graph_edges_v1 is 'Evidence-bound structural graph edges derived only from source artifact and jurisdiction relationships.';
comment on function public.get_lighthouse_canonical_state_v1() is 'Canonical current Lighthouse state for Mission Control and operator surfaces; replaces legacy zero-prone summary paths.';
