begin;

-- Mission Control and canonical-core surfaces need the current reviewed
-- situation/action binding set for one action at a time. The prior function
-- ranked the entire binding universe and only then filtered to p_action_key.
-- A binding_key is owned by exactly one action in production, so pushing the
-- action predicate ahead of row_number() is semantically exact and allows the
-- existing action_key index to bound each hydration call.
create or replace function public.luminari_action_supporting_bindings_json_v1(p_action_key text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
  with winner_binding_revisions as (
    select
      b.*,
      row_number() over (
        partition by b.binding_key
        order by
          o.activated_at desc,
          o.run_completed_at desc nulls last,
          b.created_at desc,
          b.binding_revision_id desc
      ) as binding_rank
    from public.luminari_situation_action_binding_revision_v1 b
    join public.v_luminari_reviewed_source_overlay_current_v1 o
      on o.active_run_id = b.run_id
    where b.action_key = p_action_key
  ), current_bindings as (
    select *
    from winner_binding_revisions
    where binding_rank = 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'binding_key', b.binding_key,
        'source_subcategory', b.source_subcategory,
        'source_jurisdiction_level', b.source_jurisdiction_level,
        'source_jurisdiction', b.source_jurisdiction,
        'supporting_name', b.supporting_name,
        'supporting_source_id', b.supporting_source_id,
        'source_service_type', b.source_service_type,
        'what_the_person_can_do', b.what_the_person_can_do,
        'route_instructions', b.route_instructions,
        'filing_or_complaint_url', b.filing_or_complaint_url,
        'phone', b.phone,
        'email', b.email,
        'website', b.website,
        'address', b.address,
        'statutory_authority', b.statutory_authority,
        'verification_status', b.verification_status,
        'supporting_object_class', b.supporting_object_class,
        'supporting_target_surface', b.supporting_target_surface,
        'direct_source_reference', b.binding_payload->>'direct_source_reference',
        'statutory_authority_url', b.binding_payload->>'statutory_authority_url',
        'filing_deadline', b.binding_payload->>'filing_deadline',
        'filing_deadline_source', b.binding_payload->>'filing_deadline_source',
        'source_record_revision_id', b.source_record_revision_id,
        'source_filename', r.source_filename,
        'source_content_sha256', r.source_content_sha256,
        'source_record_id', r.source_record_id,
        'raw_source_record_id', r.raw_source_record_id,
        'source_page', r.source_page,
        'source_table_index', r.source_table_index,
        'source_title', r.source_title
      ) order by
        (b.verification_status = 'VERIFIED') desc,
        b.supporting_name,
        b.binding_key
    ),
    '[]'::jsonb
  )
  from current_bindings b
  left join public.luminari_reviewed_source_record_revision_v1 r
    on r.source_record_revision_id = b.source_record_revision_id
  where b.action_key = p_action_key;
$function$;

revoke execute on function public.luminari_action_supporting_bindings_json_v1(text)
  from public, anon, authenticated;
grant execute on function public.luminari_action_supporting_bindings_json_v1(text)
  to service_role;
comment on function public.luminari_action_supporting_bindings_json_v1(text) is
  'Returns reviewed supporting bindings only from current per-source overlay winners; superseded source generations remain preserved but cannot publish.';

-- The canonical-state contract only counts six fields from the current civic
-- object universe. Materializing SELECT * forces the fully hydrated object
-- payload—including supporting bindings and provenance JSON—for ~48k current
-- objects even though those fields are never read by this function. Keep the
-- exact same count formulas and live views while projecting only the columns
-- this state contract actually consumes.
create or replace function public.get_lighthouse_canonical_state_v2()
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $function$
with current_objects as materialized (
  select
    object_class,
    typed_ready,
    jurisdiction_ready,
    state_code,
    jurisdiction,
    artifact_key
  from public.v_lighthouse_civic_object_current_v1
), object_counts as materialized (
  select
    count(*)::bigint as current_civic_objects,
    count(*) filter (where typed_ready)::bigint as typed_ready,
    count(*) filter (where jurisdiction_ready)::bigint as jurisdiction_ready,
    count(*) filter (where not typed_ready or not jurisdiction_ready)::bigint as unresolved_or_held,
    count(distinct coalesce(nullif(state_code,''),nullif(jurisdiction,'')))
      filter (where coalesce(nullif(state_code,''),nullif(jurisdiction,'')) is not null)::bigint as jurisdictions,
    count(*) filter (where object_class='program')::bigint as programs,
    count(*) filter (where object_class='resource')::bigint as resources,
    count(*) filter (where object_class in ('agency','oversight_body'))::bigint as agencies,
    count(*) filter (where object_class in ('workflow','enforcement_pathway','oversight_route','deadline'))::bigint as workflows,
    count(*) filter (where object_class='legal_authority')::bigint as legal_authorities,
    count(*) filter (where object_class='contact_record')::bigint as contacts,
    count(*) filter (where object_class='organization')::bigint as organizations,
    count(*) filter (where artifact_key is not null)::bigint as sourced_from_edges,
    count(*) filter (where coalesce(nullif(state_code,''),nullif(jurisdiction,'')) is not null)::bigint as jurisdiction_edges,
    count(distinct artifact_key) filter (where artifact_key is not null)::bigint as graph_artifact_nodes
  from current_objects
), object_type_counts as materialized (
  select object_class as node_type,count(*)::int as cnt
  from current_objects
  group by object_class
), node_type_counts as materialized (
  select node_type,cnt from object_type_counts
  union all
  select 'jurisdiction',jurisdictions::int from object_counts where jurisdictions > 0
  union all
  select 'source_artifact',graph_artifact_nodes::int from object_counts where graph_artifact_nodes > 0
), semantic_counts as materialized (
  select
    intended_edge_type,
    count(*) filter (where resolution_state='resolved_exact' and target_node_id is not null)::int as resolved_count,
    count(*) filter (where resolution_state<>'resolved_exact' or target_node_id is null)::int as unresolved_count
  from public.v_lighthouse_graph_relationship_declarations_v1
  group by intended_edge_type
), semantic_totals as materialized (
  select
    coalesce(sum(resolved_count),0)::bigint as semantic_graph_edges,
    coalesce(sum(unresolved_count),0)::bigint as unresolved_relationships
  from semantic_counts
), edge_type_counts as materialized (
  select 'sourced_from'::text as edge_type,sourced_from_edges::int as cnt from object_counts
  union all
  select 'within_jurisdiction',jurisdiction_edges::int from object_counts
  union all
  select intended_edge_type,resolved_count from semantic_counts where resolved_count > 0
), signal_counts as materialized (
  select
    (select count(*)::bigint from public.intake_signals where is_current) as intake,
    (select count(*)::bigint from public.legal_patterns where is_current) as legal,
    (select count(*)::bigint from public.live_data_signals where is_current) as live_data,
    (select count(*)::bigint from public.signal_convergences where is_current) as convergence
), auxiliary_counts as materialized (
  select
    (select count(*)::bigint from public.luminari_corpus_source_artifact_v1 where coalesce(storage_state,'active') <> 'missing') as source_artifacts,
    (select count(*)::bigint from public.luminari_corpus_candidate_v1) as candidate_records,
    (select count(*)::bigint from public.cases) as cases,
    (select count(*)::bigint from public.documents) as documents,
    (select count(*)::bigint from public.claims) as claims,
    (select count(*)::bigint from public.findings) as findings,
    (select count(*)::bigint from public.world_nodes) as legacy_manual_world_nodes,
    (select count(*)::bigint from public.detected_signals) as legacy_detected_signals,
    (select count(*)::bigint from public.signal_flow_logs) as signal_flow_logs,
    (select count(*)::bigint from public.remedy_paths where signal_id is not null) as canonical_remedy_paths
)
select jsonb_build_object(
  'contract','lighthouse_canonical_state_v2',
  'source_artifacts',a.source_artifacts,
  'candidate_records',a.candidate_records,
  'current_civic_objects',o.current_civic_objects,
  'typed_ready',o.typed_ready,
  'jurisdiction_ready',o.jurisdiction_ready,
  'unresolved_or_held',o.unresolved_or_held,
  'jurisdictions',o.jurisdictions,
  'programs',o.programs,
  'resources',o.resources,
  'agencies',o.agencies,
  'workflows',o.workflows,
  'legal_authorities',o.legal_authorities,
  'contacts',o.contacts,
  'organizations',o.organizations,
  'current_signals',(s.intake+s.legal+s.live_data+s.convergence),
  'signal_domains',jsonb_build_object('intake',s.intake,'legal',s.legal,'live_data',s.live_data,'convergence',s.convergence),
  'cases',a.cases,
  'documents',a.documents,
  'claims',a.claims,
  'findings',a.findings,
  'graph_nodes',(o.current_civic_objects+o.jurisdictions+o.graph_artifact_nodes),
  'graph_object_nodes',o.current_civic_objects,
  'structural_graph_edges',(o.sourced_from_edges+o.jurisdiction_edges),
  'semantic_graph_edges',st.semantic_graph_edges,
  'unresolved_relationships',st.unresolved_relationships,
  'graph_edges',(o.sourced_from_edges+o.jurisdiction_edges+st.semantic_graph_edges),
  'graph_edge_types',(select coalesce(jsonb_object_agg(edge_type,cnt),'{}'::jsonb) from edge_type_counts),
  'graph_node_types',(select coalesce(jsonb_object_agg(node_type,cnt),'{}'::jsonb) from node_type_counts),
  'legacy_manual_world_nodes',a.legacy_manual_world_nodes,
  'legacy_detected_signals',a.legacy_detected_signals,
  'signal_flow_logs',a.signal_flow_logs,
  'canonical_remedy_paths',a.canonical_remedy_paths,
  'generated_at',clock_timestamp()
)
from object_counts o
cross join semantic_totals st
cross join signal_counts s
cross join auxiliary_counts a;
$function$;

revoke execute on function public.get_lighthouse_canonical_state_v2()
  from public, anon, authenticated;
grant execute on function public.get_lighthouse_canonical_state_v2()
  to service_role;
comment on function public.get_lighthouse_canonical_state_v2() is
  'Single-pass current Lighthouse state: only count-consumed civic-object columns are materialized; structural and explicit source-declared semantic graph counts remain live and exact.';

commit;
