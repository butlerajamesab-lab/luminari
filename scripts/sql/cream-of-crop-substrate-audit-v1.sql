-- Cream-of-the-crop substrate starter audit.
-- Read-only verification after running luminari_cream_of_crop_substrate.sql.
-- Does not mutate canonical production tables or doctrine_graph_edges.
begin read only;

-- 1) Confirm queue rows exist and count staged cream records.
select
  count(*) as staged_cream_rows,
  coalesce(sum(record_count_estimate), 0) as staged_cream_record_estimate
from public.corpus_import_queue
where source_name like 'cream:%';

-- 2) Count staged candidate edges.
select count(*) as staged_candidate_edges
from public.corpus_graph_candidate_edges;

-- 3) Group candidate edges by from_type, edge_type, to_type, strength.
select
  from_type,
  edge_type,
  to_type,
  strength,
  count(*) as edge_count
from public.corpus_graph_candidate_edges
group by from_type, edge_type, to_type, strength
order by edge_count desc, from_type, edge_type, to_type, strength;

-- 4) Identify staged records ready for canonical-import transform review.
-- "Ready" here means a single curated JSON payload has minimum source identity fields;
-- it is still not a canonical insert approval.
select
  id,
  source_name,
  source_type,
  target_hint,
  import_status,
  case
    when source_name like 'cream:legal_weak_joints_priority4.json:%'
      and payload ? 'weakJointId'
      and payload ? 'title'
      then 'ready_for_weak_joint_transform_review'
    when source_name like 'cream:legal_statutes_priority2.json:%'
      and payload ? 'citation'
      and (payload ? 'shortTitle' or payload ? 'short_title')
      then 'ready_for_statute_transform_review'
    else 'requires_transform_mapping_or_payload_review'
  end as import_readiness,
  coalesce(payload->>'weakJointId', payload->>'citation', payload->>'agency_name', payload->>'agencyName') as source_record_key,
  coalesce(payload->'domains', '[]'::jsonb) as domain_tags,
  coalesce(payload->>'jurisdiction', payload->>'state', 'unspecified') as jurisdiction
from public.corpus_import_queue
where source_name like 'cream:%'
order by source_name;

-- 5) Candidate edge promotion buckets.
-- Pending-review rows are never considered safe enough to promote.
select
  id,
  source_name,
  source_id,
  from_type,
  from_id,
  edge_type,
  to_type,
  to_id,
  strength,
  pipeline_context,
  user_lens,
  domain_tags,
  jurisdiction,
  evidence_basis,
  confidence,
  review_status,
  case
    when review_status in ('approved', 'ready_for_promotion', 'promote')
      and strength = 'strong'
      and confidence >= 0.85
      then 'safe_enough_after_review'
    else 'requires_review'
  end as promotion_bucket
from public.corpus_graph_candidate_edges
order by promotion_bucket, from_type, edge_type, to_type, strength, id;

-- 6) Canonical DB counts for comparison only.
with target_tables(table_name) as (
  values
    ('legal_weak_joints'),
    ('legal_statutes'),
    ('legal_statute_key_text'),
    ('legal_enforcement_records'),
    ('agency_authority_map'),
    ('government_benefits_registry'),
    ('workflow_registry'),
    ('registry_workflows'),
    ('escalation_registry'),
    ('escalation_routes'),
    ('committee_registry'),
    ('committee_membership_registry'),
    ('committee_memberships'),
    ('legislator_registry'),
    ('claim_element_matrix'),
    ('barrier_decision_tree'),
    ('accountability_routes'),
    ('registry_oversight_bodies'),
    ('doctrine_graph_edges')
), existing_tables as (
  select t.table_name
  from target_tables t
  join information_schema.tables ist
    on ist.table_schema = 'public'
   and ist.table_name = t.table_name
)
select
  t.table_name,
  (e.table_name is not null) as table_exists,
  case
    when e.table_name is null then null
    else (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from public.%I', t.table_name), true, false, '')))[1]::text::bigint
  end as row_count
from target_tables t
left join existing_tables e using (table_name)
order by t.table_name;

rollback;
