-- Doctrine Graph candidate edge audit v1
-- Dry-run only: SELECT statements only. No schema changes, migrations, RLS,
-- indexes, Atlas changes, or canonical inserts are performed by this file.

begin;
set transaction read only;

-- 1) Confirm corpus staging queue rows exist and display requested payload audit fields.
select
  source_name,
  source_type,
  target_hint,
  record_count_estimate,
  byte_size,
  import_status
from public.corpus_import_queue
order by source_name;

-- 2) Canonical corpus table counts inspected by the import audit.
with target_tables(table_name) as (
  values
    ('legal_statutes'),
    ('legal_weak_joints'),
    ('legal_enforcement_records'),
    ('agency_authority_map'),
    ('government_benefits_registry'),
    ('workflow_registry'),
    ('registry_workflows'),
    ('workflow_definitions'),
    ('workflow_master'),
    ('escalation_registry'),
    ('escalation_routes'),
    ('committee_registry'),
    ('committee_membership_registry'),
    ('committee_memberships'),
    ('legislator_registry'),
    ('legislator_contacts'),
    ('claim_element_matrix'),
    ('barrier_decision_tree'),
    ('legal_statute_key_text'),
    ('accountability_routes'),
    ('registry_oversight_bodies')
), existing_tables as (
  select t.table_name
  from target_tables t
  join information_schema.tables ist
    on ist.table_schema = 'public'
   and ist.table_name = t.table_name
)
select
  t.table_name,
  case when e.table_name is null then false else true end as table_exists,
  case
    when e.table_name is null then null
    else (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from public.%I', t.table_name), true, false, '')))[1]::text::bigint
  end as row_count
from target_tables t
left join existing_tables e using (table_name)
order by t.table_name;

-- 3) Existing Doctrine Graph shape. This verifies the current graph without inserting candidates.
select
  "fromType" as from_type,
  "toType" as to_type,
  "edgeType" as edge_type,
  strength,
  count(*) as edge_count
from public.doctrine_graph_edges
group by "fromType", "toType", "edgeType", strength
order by edge_count desc, from_type, to_type, edge_type, strength;

-- 4) Candidate edge audit: doctrine -> weak_joint high-confidence phrase rules.
-- These are candidate rows only; review before inserting into doctrine_graph_edges.
with phrase_rules(rule_key, phrase_regex, doctrine_name, edge_type, strength, notes) as (
  values
    ('qualified_immunity_to_sovereign_immunity', '\mqualified immunity\M', 'Sovereign Immunity', 'associated_with', 'strong', 'High-confidence phrase rule: qualified immunity maps to sovereign-immunity review.'),
    ('brady_to_due_process', '\mbrady\M', 'Due Process', 'associated_with', 'strong', 'High-confidence phrase rule: Brady disclosure issues map to due process.'),
    ('foia_delay_to_exhaustion', '(foia|freedom of information).*(delay|non[- ]?compliance)|(delay|non[- ]?compliance).*(foia|freedom of information)', 'Exhaustion', 'associated_with', 'strong', 'High-confidence phrase rule: FOIA delay/non-compliance maps to exhaustion review.'),
    ('deadline_to_limitations', '(deadline|one[- ]year bar|statute of limitations|limitations period)', 'Statute of Limitations', 'associated_with', 'strong', 'High-confidence phrase rule: deadline and one-year-bar language maps to limitations doctrine.'),
    ('discrimination_burden_to_burden_shifting', '(discrimination|burden)', 'Burden Shifting', 'associated_with', 'strong', 'High-confidence phrase rule: discrimination/burden language maps to burden shifting.')
)
select
  'public.legal_weak_joints' as source_table,
  w.id::text as source_id,
  'doctrine' as from_type,
  d.id::text as from_id,
  r.edge_type,
  'weak_joint' as to_type,
  w.id::text as to_id,
  r.strength,
  r.notes,
  'title/description/metadata phrase match' as evidence_basis,
  array['admin', 'advocate']::text[] as user_lens,
  coalesce(w.metadata->'pipeline_context', '[]'::jsonb) as pipeline_context,
  coalesce(w.metadata->'domain_tags', '[]'::jsonb) as domain_tags,
  null::text as jurisdiction,
  'high' as confidence
from public.legal_weak_joints w
join phrase_rules r
  on concat_ws(' ', w.title, w.description, w.metadata::text) ~* r.phrase_regex
join public.doctrine_registry d
  on lower(d.name) = lower(r.doctrine_name)
order by r.rule_key, w.title;

-- 5) Candidate edge audit: agency -> statute by exact citation in agency authority map.
select
  'public.agency_authority_map' as source_table,
  aam.id::text as source_id,
  'agency' as from_type,
  coalesce(aam."agencyShort", aam.agency) as from_id,
  'enforced_by' as edge_type,
  'statute' as to_type,
  s.id::text as to_id,
  'strong' as strength,
  'Exact citation appears in agency_authority_map.statute or statutoryAuthority.' as notes,
  concat_ws(' ', aam.statute, aam."statutoryAuthority"::text) as evidence_basis,
  array['admin', 'advocate']::text[] as user_lens,
  array[aam.domain]::text[] as pipeline_context,
  array[aam.domain]::text[] as domain_tags,
  s.jurisdiction,
  'high' as confidence
from public.agency_authority_map aam
join public.legal_statutes s
  on concat_ws(' ', aam.statute, aam."statutoryAuthority"::text) ilike '%' || s.citation || '%'
order by aam.agency, s.citation;

-- 6) Candidate edge audit: weak_joint -> statute by exact citation or exact short title.
select
  'public.legal_weak_joints' as source_table,
  w.id::text as source_id,
  'weak_joint' as from_type,
  w.id::text as from_id,
  'fails_at' as edge_type,
  'statute' as to_type,
  s.id::text as to_id,
  'strong' as strength,
  'Exact statute citation or short-title reference appears in weak-joint title/description/metadata.' as notes,
  concat_ws(' ', w.title, w.description, w.metadata::text) as evidence_basis,
  array['admin', 'advocate']::text[] as user_lens,
  coalesce(w.metadata->'pipeline_context', s.domains, '[]'::jsonb) as pipeline_context,
  coalesce(w.metadata->'domain_tags', s.domains, '[]'::jsonb) as domain_tags,
  s.jurisdiction,
  'high' as confidence
from public.legal_weak_joints w
join public.legal_statutes s
  on concat_ws(' ', w.title, w.description, w.metadata::text) ilike '%' || s.citation || '%'
  or (s.short_title is not null and length(s.short_title) >= 5 and concat_ws(' ', w.title, w.description, w.metadata::text) ilike '%' || s.short_title || '%')
order by w.title, s.citation;

-- 7) Domain-only review bucket count. This is intentionally excluded from first-pass candidates.
select
  'domain_only_review_bucket' as bucket,
  count(*) as candidate_count
from public.legal_weak_joints w
join public.legal_statutes s
  on s.domains is not null
where concat_ws(' ', w.title, w.description, w.metadata::text) <> '';

rollback;
