drop view if exists public.v_substrate_promotion_readiness;
create view public.v_substrate_promotion_readiness as
with bundle as (
 select a.bundle_sha256,a.audit_status,s.deployment_status,a.distinct_row_source_count,a.manifest_source_count,
        a.tuple_row_count,a.manifest_generated_row_count,a.source_count_delta,a.row_count_delta
 from public.generated_sql_bundle_audit a
 left join public.substrate_source_artifact s on s.source_sha256=a.bundle_sha256
), disability as (
 select count(*) filter(where candidate_kind='normalized_statute')::bigint statute_candidates,
        count(*) filter(where candidate_kind='normalized_resource')::bigint resource_candidates,
        count(*) filter(where candidate_kind='state_directory_entry')::bigint jurisdiction_candidates,
        count(*) filter(where disposition='unresolved')::bigint unresolved_candidates,
        count(*) filter(where disposition='insert')::bigint insert_candidates,
        count(*) filter(where disposition='enrich')::bigint enrich_candidates,
        count(*) filter(where disposition='duplicate')::bigint duplicate_candidates,
        count(*) filter(where disposition='hold')::bigint held_candidates,
        count(*) filter(where disposition='provenance_only')::bigint provenance_only_candidates
 from public.substrate_candidate_disposition
 where source_file in ('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx')
), stage as (
 select count(*)::bigint staged_rows,
        count(*) filter(where row_shape='statute_summary')::bigint staged_statutes,
        count(*) filter(where row_shape='normalized_resource')::bigint staged_resources,
        count(*) filter(where row_shape='state_directory_entry')::bigint staged_state_directory_entries
 from public.domain_deep_dive_v3_13_stage
 where source_file in ('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx')
)
select b.*,s.staged_rows,s.staged_statutes,s.staged_resources,s.staged_state_directory_entries,
       d.statute_candidates,d.resource_candidates,d.jurisdiction_candidates,d.unresolved_candidates,
       d.insert_candidates,d.enrich_candidates,d.duplicate_candidates,d.held_candidates,d.provenance_only_candidates,
       (b.audit_status='verified' and b.deployment_status='staged' and b.source_count_delta=0 and b.row_count_delta=0
        and s.staged_state_directory_entries=56 and d.jurisdiction_candidates=56 and d.unresolved_candidates=0) ready_for_canonical_promotion,
       case when b.audit_status<>'verified' then 'bundle_manifest_not_verified'
            when b.deployment_status<>'staged' then 'bundle_not_staged'
            when b.source_count_delta<>0 or b.row_count_delta<>0 then 'bundle_manifest_count_mismatch'
            when s.staged_state_directory_entries<>56 then 'disability_state_territory_entries_incomplete'
            when d.jurisdiction_candidates<>56 then 'disability_jurisdiction_dispositions_incomplete'
            when d.unresolved_candidates>0 then 'candidate_dispositions_unresolved'
            else 'ready' end blocking_reason
from bundle b cross join disability d cross join stage s;
