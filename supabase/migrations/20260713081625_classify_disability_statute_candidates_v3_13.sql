begin;

insert into public.substrate_candidate_disposition (
    artifact_id,
    source_file,
    source_sha256,
    source_table_idx,
    source_row_idx,
    source_row_key,
    candidate_kind,
    target_table,
    target_identity,
    disposition,
    reason
)
select
    a.artifact_id,
    s.source_file,
    s.source_hash_raw,
    s.table_idx,
    s.row_idx,
    s.source_row_key,
    'normalized_statute',
    'legal_statutes',
    jsonb_build_object(
        'citation', s.payload ->> 'citation',
        'title', s.payload ->> 'statute___law'
    ),
    'unresolved',
    'Disability deep-dive statute summary staged; awaiting exact citation/title comparison against canonical legal_statutes.'
from public.domain_deep_dive_v3_13_stage s
cross join public.substrate_source_artifact a
where a.source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
  and s.source_file = 'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
  and s.row_shape = 'statute_summary'
on conflict (source_sha256, source_row_key) do update set
    candidate_kind = excluded.candidate_kind,
    target_table = excluded.target_table,
    target_identity = excluded.target_identity,
    disposition = excluded.disposition,
    reason = excluded.reason,
    updated_at = now();

update public.substrate_promotion_batch
set candidate_count = (
        select count(*)
        from public.domain_deep_dive_v3_13_stage
        where source_file = 'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
          and promotion_status = 'candidate'
    ),
    notes = 'First bounded sub-batch loaded: 10 disability statute summaries staged and classified. Resource and state-directory candidates remain pending.',
    updated_at = now()
where batch_name = 'v3_13_disability_deep_dive_001';

commit;
