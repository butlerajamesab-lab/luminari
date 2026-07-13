begin;

create or replace view public.v_substrate_promotion_readiness as
with bundle as (
    select
        a.bundle_sha256,
        a.tuple_row_count,
        a.distinct_row_source_count,
        a.manifest_source_count,
        a.manifest_generated_row_count,
        a.source_count_delta,
        a.row_count_delta,
        a.audit_status,
        s.deployment_status
    from public.generated_sql_bundle_audit a
    left join public.substrate_source_artifact s
      on s.source_sha256 = a.bundle_sha256
),
disability as (
    select
        count(*) filter (where d.candidate_kind = 'normalized_statute')::bigint as statute_candidates,
        count(*) filter (where d.candidate_kind = 'normalized_resource')::bigint as resource_candidates,
        count(*) filter (where d.disposition = 'unresolved')::bigint as unresolved_candidates,
        count(*) filter (where d.disposition = 'insert')::bigint as insert_candidates,
        count(*) filter (where d.disposition = 'enrich')::bigint as enrich_candidates,
        count(*) filter (where d.disposition = 'duplicate')::bigint as duplicate_candidates,
        count(*) filter (where d.disposition = 'hold')::bigint as held_candidates,
        count(*) filter (where d.disposition = 'provenance_only')::bigint as provenance_only_candidates
    from public.substrate_candidate_disposition d
    where d.source_file = 'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
),
stage as (
    select
        count(*)::bigint as staged_rows,
        count(*) filter (where row_shape = 'statute_summary')::bigint as staged_statutes,
        count(*) filter (where row_shape = 'normalized_resource')::bigint as staged_resources,
        count(*) filter (where row_shape = 'state_directory_entry')::bigint as staged_state_directory_entries
    from public.domain_deep_dive_v3_13_stage
    where source_file = 'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
)
select
    b.bundle_sha256,
    b.audit_status,
    b.deployment_status,
    b.distinct_row_source_count,
    b.manifest_source_count,
    b.tuple_row_count,
    b.manifest_generated_row_count,
    b.source_count_delta,
    b.row_count_delta,
    s.staged_rows,
    s.staged_statutes,
    s.staged_resources,
    s.staged_state_directory_entries,
    d.statute_candidates,
    d.resource_candidates,
    d.unresolved_candidates,
    d.insert_candidates,
    d.enrich_candidates,
    d.duplicate_candidates,
    d.held_candidates,
    d.provenance_only_candidates,
    (
        b.audit_status = 'verified'
        and b.deployment_status = 'staged'
        and b.source_count_delta = 0
        and b.row_count_delta = 0
        and s.staged_state_directory_entries >= 56
        and d.unresolved_candidates = 0
    ) as ready_for_canonical_promotion,
    case
        when b.audit_status <> 'verified' then 'bundle_manifest_not_verified'
        when b.deployment_status <> 'staged' then 'bundle_not_staged'
        when b.source_count_delta <> 0 or b.row_count_delta <> 0 then 'bundle_manifest_count_mismatch'
        when s.staged_state_directory_entries < 56 then 'disability_state_territory_entries_incomplete'
        when d.unresolved_candidates > 0 then 'candidate_dispositions_unresolved'
        else 'ready'
    end as blocking_reason
from bundle b
cross join disability d
cross join stage s;

comment on view public.v_substrate_promotion_readiness is
'Final deterministic gate for the bounded Disability Services promotion lane. Canonical promotion is ready only after the full SQL bundle manifest verifies, all 56 state/territory entries are staged, and every candidate has a non-unresolved disposition.';

commit;
