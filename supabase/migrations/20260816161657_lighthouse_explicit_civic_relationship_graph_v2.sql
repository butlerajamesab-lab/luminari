create or replace view public.v_lighthouse_graph_relationship_payloads_v1
with (security_invoker = true) as
select
  c.civic_object_uid,
  c.object_class,
  c.object_ref,
  c.name,
  c.organization_name,
  c.source_candidate_hash,
  c.artifact_key,
  c.source_locator,
  c.parser_version,
  min(p.payload::text)::jsonb as payload
from public.v_lighthouse_civic_object_current_v1 c
join public.luminari_corpus_candidate_v1 p
  on p.candidate_hash = c.source_candidate_hash
 and p.artifact_key = c.artifact_key
where c.object_class in (
  'relationship_bundle',
  'relationship_record',
  'agency',
  'organization',
  'legislator',
  'advocacy_target',
  'enforcement_pathway'
)
group by
  c.civic_object_uid,
  c.object_class,
  c.object_ref,
  c.name,
  c.organization_name,
  c.source_candidate_hash,
  c.artifact_key,
  c.source_locator,
  c.parser_version;

create or replace view public.v_lighthouse_graph_relationship_declarations_v1
with (security_invoker = true) as
with payloads as materialized (
  select * from public.v_lighthouse_graph_relationship_payloads_v1
),
typed_targets as (
  select
    civic_object_uid,
    object_class,
    name,
    case
      when object_class = 'agency' then coalesce(
        nullif(payload->'record'->>'agency_id',''),
        nullif(payload->'record'->>'id',''),
        nullif(payload->'row'->>'agency_id',''),
        nullif(payload->'row'->>'id','')
      )
      when object_class = 'organization' then coalesce(
        nullif(payload->'record'->>'org_id',''),
        nullif(payload->'record'->>'id',''),
        nullif(payload->'row'->>'org_id',''),
        nullif(payload->'row'->>'id','')
      )
      when object_class = 'legislator' then coalesce(
        nullif(payload->'record'->>'legislator_id',''),
        nullif(payload->'row'->>'legislator_id',''),
        nullif(payload->'row'->>'entity_uuid',''),
        nullif(payload->'row'->>'bioguide_id','')
      )
      when object_class = 'advocacy_target' then coalesce(
        nullif(payload->'record'->>'target_id',''),
        nullif(payload->'record'->>'id',''),
        nullif(payload->'row'->>'target_id',''),
        nullif(payload->'row'->>'id','')
      )
      else null
    end as stable_id
  from payloads
  where object_class in ('agency','organization','legislator','advocacy_target')
),
typed_resolution as (
  select object_class, stable_id, count(*)::int as match_count, min(civic_object_uid) as target_uid
  from typed_targets
  where stable_id is not null
  group by object_class, stable_id
),
bundle_targets as (
  select
    civic_object_uid,
    name,
    case
      when nullif(payload->'record'->>'agency_id','') is not null then 'agency'
      when nullif(payload->'record'->>'org_id','') is not null then 'organization'
      when nullif(payload->'record'->>'legislator_id','') is not null then 'legislator'
      when nullif(payload->'record'->>'target_id','') is not null then 'advocacy_target'
      else null
    end as target_class,
    coalesce(
      nullif(payload->'record'->>'agency_id',''),
      nullif(payload->'record'->>'org_id',''),
      nullif(payload->'record'->>'legislator_id',''),
      nullif(payload->'record'->>'target_id','')
    ) as stable_id
  from payloads
  where object_class = 'relationship_bundle'
),
bundle_resolution as (
  select target_class, stable_id, count(*)::int as match_count, min(civic_object_uid) as target_uid
  from bundle_targets
  where target_class is not null and stable_id is not null
  group by target_class, stable_id
),
domain_refs as (
  select
    p.civic_object_uid as from_uid,
    p.source_candidate_hash,
    p.artifact_key,
    p.source_locator,
    p.parser_version,
    'agency'::text as target_class,
    'declares_agency'::text as edge_type,
    'government_agencies'::text as source_field,
    e->>'agency_id' as target_reference
  from payloads p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.payload->'record'->'government_agencies') = 'array'
      then p.payload->'record'->'government_agencies' else '[]'::jsonb end
  ) e
  where p.object_class = 'relationship_bundle'
  union all
  select p.civic_object_uid,p.source_candidate_hash,p.artifact_key,p.source_locator,p.parser_version,
         'organization','declares_organization','advocacy_organizations',e->>'org_id'
  from payloads p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.payload->'record'->'advocacy_organizations') = 'array'
      then p.payload->'record'->'advocacy_organizations' else '[]'::jsonb end
  ) e
  where p.object_class = 'relationship_bundle'
  union all
  select p.civic_object_uid,p.source_candidate_hash,p.artifact_key,p.source_locator,p.parser_version,
         'legislator','declares_legislator','legislators',e->>'legislator_id'
  from payloads p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.payload->'record'->'legislators') = 'array'
      then p.payload->'record'->'legislators' else '[]'::jsonb end
  ) e
  where p.object_class = 'relationship_bundle'
  union all
  select p.civic_object_uid,p.source_candidate_hash,p.artifact_key,p.source_locator,p.parser_version,
         'advocacy_target','declares_advocacy_target','advocacy_targets',e->>'target_id'
  from payloads p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.payload->'record'->'advocacy_targets') = 'array'
      then p.payload->'record'->'advocacy_targets' else '[]'::jsonb end
  ) e
  where p.object_class = 'relationship_bundle'
),
domain_declarations as (
  select distinct
    'declaration:' || md5('domain|' || d.from_uid || '|' || d.edge_type || '|' || d.target_reference) as declaration_id,
    'object:' || d.from_uid as from_node_id,
    case
      when tr.match_count = 1 then 'object:' || tr.target_uid
      when br.match_count = 1 then 'object:' || br.target_uid
      else null
    end as target_node_id,
    d.edge_type as intended_edge_type,
    d.source_field,
    d.target_reference,
    case
      when tr.match_count = 1 or br.match_count = 1 then 'resolved_exact'
      when greatest(coalesce(tr.match_count,0),coalesce(br.match_count,0)) > 1 then 'ambiguous_target'
      else 'missing_target'
    end as resolution_state,
    case
      when tr.match_count = 1 then 'stable_id_exact_typed'
      when br.match_count = 1 then 'stable_id_exact_bundle'
      else null
    end as match_strategy,
    greatest(coalesce(tr.match_count,0),coalesce(br.match_count,0))::int as target_match_count,
    d.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',d.artifact_key,
      'source_locator',d.source_locator,
      'parser_version',d.parser_version,
      'declared_target_class',d.target_class,
      'typed_match_count',coalesce(tr.match_count,0),
      'bundle_match_count',coalesce(br.match_count,0)
    ) as metadata
  from domain_refs d
  left join typed_resolution tr
    on tr.object_class = d.target_class and tr.stable_id = d.target_reference
  left join bundle_resolution br
    on br.target_class = d.target_class and br.stable_id = d.target_reference
  where nullif(d.target_reference,'') is not null
),
bundle_name_resolution as (
  select lower(btrim(name)) as name_key, count(*)::int as match_count, min(civic_object_uid) as target_uid
  from payloads
  where object_class = 'relationship_bundle' and nullif(btrim(name),'') is not null
  group by lower(btrim(name))
),
relationship_record_docs as (
  select
    civic_object_uid,
    name,
    source_candidate_hash,
    artifact_key,
    source_locator,
    parser_version,
    case
      when coalesce(payload->'row'->>'payload_json','') ~ '^\s*\{'
        then (payload->'row'->>'payload_json')::jsonb
      else '{}'::jsonb
    end as doc
  from payloads
  where object_class = 'relationship_record'
),
member_refs as (
  select r.civic_object_uid as from_uid,r.source_candidate_hash,r.artifact_key,r.source_locator,r.parser_version,
         'has_member_organization'::text as edge_type,'member_organizations'::text as source_field,
         jsonb_array_elements_text(coalesce(r.doc->'member_organizations','[]'::jsonb)) as target_reference
  from relationship_record_docs r
  union all
  select r.civic_object_uid,r.source_candidate_hash,r.artifact_key,r.source_locator,r.parser_version,
         'has_member_legislator','member_legislators',
         jsonb_array_elements_text(coalesce(r.doc->'member_legislators','[]'::jsonb))
  from relationship_record_docs r
),
member_declarations as (
  select distinct
    'declaration:' || md5('member|' || m.from_uid || '|' || m.edge_type || '|' || lower(btrim(m.target_reference))) as declaration_id,
    'object:' || m.from_uid as from_node_id,
    case when r.match_count = 1 then 'object:' || r.target_uid else null end as target_node_id,
    m.edge_type as intended_edge_type,
    m.source_field,
    m.target_reference,
    case when r.match_count = 1 then 'resolved_exact' when r.match_count > 1 then 'ambiguous_target' else 'missing_target' end as resolution_state,
    case when r.match_count = 1 then 'name_exact_unique' else null end as match_strategy,
    coalesce(r.match_count,0)::int as target_match_count,
    m.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',m.artifact_key,
      'source_locator',m.source_locator,
      'parser_version',m.parser_version
    ) as metadata
  from member_refs m
  left join bundle_name_resolution r on r.name_key = lower(btrim(m.target_reference))
),
relationship_record_name_resolution as (
  select lower(btrim(name)) as name_key, count(*)::int as match_count, min(civic_object_uid) as target_uid
  from payloads
  where object_class = 'relationship_record' and nullif(btrim(name),'') is not null
  group by lower(btrim(name))
),
coalition_refs as (
  select p.civic_object_uid as from_uid,p.source_candidate_hash,p.artifact_key,p.source_locator,p.parser_version,
         jsonb_array_elements_text(
           case when jsonb_typeof(p.payload->'record'->'coalitions') = 'array'
             then p.payload->'record'->'coalitions' else '[]'::jsonb end
         ) as target_reference
  from payloads p
  where p.object_class = 'relationship_bundle'
),
coalition_declarations as (
  select distinct
    'declaration:' || md5('coalition|' || c.from_uid || '|' || lower(btrim(c.target_reference))) as declaration_id,
    'object:' || c.from_uid as from_node_id,
    case when r.match_count = 1 then 'object:' || r.target_uid else null end as target_node_id,
    'member_of_coalition'::text as intended_edge_type,
    'coalitions'::text as source_field,
    c.target_reference,
    case when r.match_count = 1 then 'resolved_exact' when r.match_count > 1 then 'ambiguous_target' else 'missing_target' end as resolution_state,
    case when r.match_count = 1 then 'name_exact_unique' else null end as match_strategy,
    coalesce(r.match_count,0)::int as target_match_count,
    c.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',c.artifact_key,
      'source_locator',c.source_locator,
      'parser_version',c.parser_version
    ) as metadata
  from coalition_refs c
  left join relationship_record_name_resolution r on r.name_key = lower(btrim(c.target_reference))
),
agency_aliases as (
  select p.civic_object_uid, lower(btrim(v.alias)) as alias_key
  from payloads p
  cross join lateral (values
    (p.name),
    (p.payload->'record'->>'name'),
    (p.payload->'record'->>'acronym'),
    (p.payload->'row'->>'name'),
    (p.payload->'row'->>'acronym')
  ) v(alias)
  where p.object_class = 'agency' and nullif(btrim(v.alias),'') is not null
),
agency_alias_resolution as (
  select alias_key, count(distinct civic_object_uid)::int as match_count, min(civic_object_uid) as target_uid
  from agency_aliases
  group by alias_key
),
enforcement_roots as (
  select
    civic_object_uid,
    source_candidate_hash,
    artifact_key,
    source_locator,
    parser_version,
    payload->'row'->>'pathway_id' as pathway_id,
    payload->'row'->>'agency' as agency_name,
    case
      when coalesce(payload->'row'->>'process_steps','') ~ '^\s*\['
        then (payload->'row'->>'process_steps')::jsonb
      else '[]'::jsonb
    end as process_steps
  from payloads
  where object_class = 'enforcement_pathway'
    and nullif(payload->'row'->>'pathway_id','') is not null
),
enforcement_agency_declarations as (
  select
    'declaration:' || md5('enforcement_agency|' || r.civic_object_uid || '|' || lower(btrim(r.agency_name))) as declaration_id,
    'object:' || r.civic_object_uid as from_node_id,
    case when a.match_count = 1 then 'object:' || a.target_uid else null end as target_node_id,
    'administered_by_agency'::text as intended_edge_type,
    'agency'::text as source_field,
    r.agency_name as target_reference,
    case when a.match_count = 1 then 'resolved_exact' when a.match_count > 1 then 'ambiguous_target' else 'missing_target' end as resolution_state,
    case when a.match_count = 1 then 'declared_alias_exact_unique' else null end as match_strategy,
    coalesce(a.match_count,0)::int as target_match_count,
    r.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',r.artifact_key,
      'source_locator',r.source_locator,
      'parser_version',r.parser_version,
      'pathway_id',r.pathway_id
    ) as metadata
  from enforcement_roots r
  left join agency_alias_resolution a on a.alias_key = lower(btrim(r.agency_name))
),
enforcement_step_nodes as (
  select
    civic_object_uid,
    payload->'record'->>'step' as step_number,
    payload->'record'->>'name' as step_name,
    payload->'record'->>'timeline' as timeline,
    payload->'record'->>'description' as description
  from payloads
  where object_class = 'enforcement_pathway'
    and nullif(payload->'record'->>'step','') is not null
),
enforcement_step_resolution as (
  select step_number,step_name,timeline,description,count(*)::int as match_count,min(civic_object_uid) as target_uid
  from enforcement_step_nodes
  group by step_number,step_name,timeline,description
),
enforcement_root_steps as (
  select
    r.civic_object_uid as root_uid,
    r.pathway_id,
    r.source_candidate_hash,
    r.artifact_key,
    r.source_locator,
    r.parser_version,
    s.step_doc,
    s.ordinality::int as step_ordinal
  from enforcement_roots r
  cross join lateral jsonb_array_elements(r.process_steps) with ordinality as s(step_doc, ordinality)
),
enforcement_step_declarations as (
  select
    'declaration:' || md5('enforcement_step|' || s.root_uid || '|' || s.step_ordinal || '|' || coalesce(s.step_doc->>'name','')) as declaration_id,
    'object:' || s.root_uid as from_node_id,
    case when r.match_count = 1 then 'object:' || r.target_uid else null end as target_node_id,
    'contains_process_step'::text as intended_edge_type,
    'process_steps'::text as source_field,
    concat_ws('|',s.step_doc->>'step',s.step_doc->>'name',s.step_doc->>'timeline',s.step_doc->>'description') as target_reference,
    case when r.match_count = 1 then 'resolved_exact' when r.match_count > 1 then 'ambiguous_target' else 'missing_target' end as resolution_state,
    case when r.match_count = 1 then 'step_signature_exact_unique' else null end as match_strategy,
    coalesce(r.match_count,0)::int as target_match_count,
    s.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',s.artifact_key,
      'source_locator',s.source_locator,
      'parser_version',s.parser_version,
      'pathway_id',s.pathway_id,
      'step_ordinal',s.step_ordinal,
      'declared_step',s.step_doc
    ) as metadata
  from enforcement_root_steps s
  left join enforcement_step_resolution r
    on r.step_number = s.step_doc->>'step'
   and r.step_name = s.step_doc->>'name'
   and r.timeline = s.step_doc->>'timeline'
   and r.description = s.step_doc->>'description'
),
enforcement_ordered_step_declarations as (
  select
    'declaration:' || md5('enforcement_next|' || a.root_uid || '|' || a.step_ordinal || '|' || b.step_ordinal) as declaration_id,
    'object:' || ra.target_uid as from_node_id,
    'object:' || rb.target_uid as target_node_id,
    'routes_to_next_step'::text as intended_edge_type,
    'process_steps_order'::text as source_field,
    concat_ws('|',a.pathway_id,a.step_ordinal,b.step_ordinal) as target_reference,
    'resolved_exact'::text as resolution_state,
    'step_sequence_exact'::text as match_strategy,
    1::int as target_match_count,
    a.source_candidate_hash as evidence_hash,
    jsonb_build_object(
      'artifact_key',a.artifact_key,
      'source_locator',a.source_locator,
      'parser_version',a.parser_version,
      'pathway_id',a.pathway_id,
      'from_step_ordinal',a.step_ordinal,
      'to_step_ordinal',b.step_ordinal
    ) as metadata
  from enforcement_root_steps a
  join enforcement_root_steps b
    on b.root_uid = a.root_uid and b.step_ordinal = a.step_ordinal + 1
  join enforcement_step_resolution ra
    on ra.step_number = a.step_doc->>'step'
   and ra.step_name = a.step_doc->>'name'
   and ra.timeline = a.step_doc->>'timeline'
   and ra.description = a.step_doc->>'description'
   and ra.match_count = 1
  join enforcement_step_resolution rb
    on rb.step_number = b.step_doc->>'step'
   and rb.step_name = b.step_doc->>'name'
   and rb.timeline = b.step_doc->>'timeline'
   and rb.description = b.step_doc->>'description'
   and rb.match_count = 1
)
select * from domain_declarations
union all select * from member_declarations
union all select * from coalition_declarations
union all select * from enforcement_agency_declarations
union all select * from enforcement_step_declarations
union all select * from enforcement_ordered_step_declarations;

create or replace view public.v_lighthouse_graph_relationship_edges_v1
with (security_invoker = true) as
select
  'edge:' || md5('semantic|' || declaration_id) as edge_id,
  from_node_id,
  target_node_id as to_node_id,
  intended_edge_type as edge_type,
  'source_declared_exact'::text as evidence_state,
  evidence_hash,
  metadata || jsonb_build_object(
    'declaration_id',declaration_id,
    'source_field',source_field,
    'target_reference',target_reference,
    'match_strategy',match_strategy
  ) as metadata
from public.v_lighthouse_graph_relationship_declarations_v1
where resolution_state = 'resolved_exact'
  and target_node_id is not null;

create or replace view public.v_lighthouse_graph_unresolved_relationships_v1
with (security_invoker = true) as
select
  declaration_id,
  from_node_id,
  intended_edge_type,
  source_field,
  target_reference,
  resolution_state,
  target_match_count,
  evidence_hash,
  metadata
from public.v_lighthouse_graph_relationship_declarations_v1
where resolution_state <> 'resolved_exact'
   or target_node_id is null;

create or replace view public.v_lighthouse_graph_edges_v2
with (security_invoker = true) as
select edge_id,from_node_id,to_node_id,edge_type,evidence_state,evidence_hash,metadata
from public.v_lighthouse_graph_edges_v1
union all
select edge_id,from_node_id,to_node_id,edge_type,evidence_state,evidence_hash,metadata
from public.v_lighthouse_graph_relationship_edges_v1;

create or replace function public.get_lighthouse_canonical_state_v2()
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.get_lighthouse_canonical_state_v1() || jsonb_build_object(
    'contract','lighthouse_canonical_state_v2',
    'graph_edges',(select count(*) from public.v_lighthouse_graph_edges_v2),
    'structural_graph_edges',(select count(*) from public.v_lighthouse_graph_edges_v1),
    'semantic_graph_edges',(select count(*) from public.v_lighthouse_graph_relationship_edges_v1),
    'unresolved_relationships',(select count(*) from public.v_lighthouse_graph_unresolved_relationships_v1),
    'graph_edge_types',(
      select coalesce(jsonb_object_agg(edge_type,cnt),'{}'::jsonb)
      from (
        select edge_type,count(*)::int as cnt
        from public.v_lighthouse_graph_edges_v2
        group by edge_type
      ) x
    )
  );
$$;

revoke all on public.v_lighthouse_graph_relationship_payloads_v1 from public, anon, authenticated;
revoke all on public.v_lighthouse_graph_relationship_declarations_v1 from public, anon, authenticated;
revoke all on public.v_lighthouse_graph_relationship_edges_v1 from public, anon, authenticated;
revoke all on public.v_lighthouse_graph_unresolved_relationships_v1 from public, anon, authenticated;
revoke all on public.v_lighthouse_graph_edges_v2 from public, anon, authenticated;
grant select on public.v_lighthouse_graph_relationship_payloads_v1 to service_role;
grant select on public.v_lighthouse_graph_relationship_declarations_v1 to service_role;
grant select on public.v_lighthouse_graph_relationship_edges_v1 to service_role;
grant select on public.v_lighthouse_graph_unresolved_relationships_v1 to service_role;
grant select on public.v_lighthouse_graph_edges_v2 to service_role;
revoke execute on function public.get_lighthouse_canonical_state_v2() from public, anon, authenticated;
grant execute on function public.get_lighthouse_canonical_state_v2() to service_role;

comment on view public.v_lighthouse_graph_relationship_payloads_v1 is 'Source-exact payload projection for current civic objects that carry explicit relationship declarations. Candidate hashes are resolved within the current source artifact to prevent repeated source copies from multiplying edges.';
comment on view public.v_lighthouse_graph_relationship_declarations_v1 is 'Deterministic source-declared civic relationship declarations. Exact stable identifiers and exact unique source names may resolve edges; ambiguous or missing targets remain explicit unresolved declarations.';
comment on view public.v_lighthouse_graph_relationship_edges_v1 is 'Resolved semantic civic graph edges derived only from explicit source declarations; no fuzzy, inferred, or similarity-based relationships.';
comment on view public.v_lighthouse_graph_unresolved_relationships_v1 is 'Source-declared relationships that cannot be resolved uniquely without inference.';
comment on view public.v_lighthouse_graph_edges_v2 is 'Current Lighthouse graph: v1 structural provenance/jurisdiction edges plus explicit source-declared semantic relationships.';
comment on function public.get_lighthouse_canonical_state_v2() is 'Canonical Lighthouse state with structural and semantic graph edge counts kept separately and unresolved source relationships reported explicitly.';
