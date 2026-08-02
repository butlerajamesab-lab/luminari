begin;

create table if not exists public.substrate_source_artifact (
    artifact_id uuid primary key default gen_random_uuid(),
    source_file text not null,
    source_sha256 text not null,
    source_kind text not null,
    source_bytes bigint,
    source_rows_expected bigint,
    source_files_expected integer,
    deployment_status text not null default 'registered'
        check (deployment_status in (
            'registered',
            'staging_ready',
            'staged',
            'reconciled',
            'promoted',
            'held',
            'retired'
        )),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_sha256)
);

create table if not exists public.substrate_target_reconciliation (
    reconciliation_id uuid primary key default gen_random_uuid(),
    artifact_id uuid references public.substrate_source_artifact(artifact_id) on delete cascade,
    target_schema text not null default 'public',
    target_table text not null,
    target_kind text not null
        check (target_kind in (
            'new_staging',
            'existing_canonical',
            'new_canonical',
            'provenance_only',
            'wrapper',
            'hold'
        )),
    generated_rows_expected bigint,
    live_table_exists boolean,
    live_rows_observed bigint,
    schema_compatible boolean,
    duplicate_risk text not null default 'unknown'
        check (duplicate_risk in ('none', 'low', 'medium', 'high', 'unknown')),
    recommended_action text not null default 'inspect'
        check (recommended_action in (
            'create_stage',
            'load_stage',
            'compare',
            'insert',
            'enrich',
            'hold',
            'retire',
            'inspect'
        )),
    last_verified_at timestamptz,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (artifact_id, target_schema, target_table)
);

create table if not exists public.substrate_candidate_disposition (
    disposition_id uuid primary key default gen_random_uuid(),
    artifact_id uuid references public.substrate_source_artifact(artifact_id) on delete cascade,
    source_file text not null,
    source_sha256 text not null,
    source_table_idx integer,
    source_row_idx integer,
    source_row_key text not null,
    candidate_kind text not null
        check (candidate_kind in (
            'exploded_field',
            'normalized_resource',
            'normalized_program',
            'normalized_statute',
            'normalized_case_law',
            'normalized_contact',
            'normalized_location',
            'workflow',
            'deadline',
            'signal',
            'other'
        )),
    target_table text,
    target_identity jsonb,
    disposition text not null default 'unresolved'
        check (disposition in (
            'unresolved',
            'insert',
            'enrich',
            'duplicate',
            'hold',
            'reject',
            'provenance_only'
        )),
    canonical_source_sha256 text,
    duplicate_of_disposition_id uuid references public.substrate_candidate_disposition(disposition_id),
    reason text,
    decided_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_sha256, source_row_key)
);

create table if not exists public.substrate_promotion_batch (
    batch_id uuid primary key default gen_random_uuid(),
    batch_name text not null unique,
    domain_key text,
    source_artifact_id uuid references public.substrate_source_artifact(artifact_id),
    status text not null default 'planned'
        check (status in (
            'planned',
            'validated',
            'running',
            'completed',
            'failed',
            'rolled_back',
            'held'
        )),
    candidate_count bigint not null default 0,
    inserted_count bigint not null default 0,
    enriched_count bigint not null default 0,
    duplicate_count bigint not null default 0,
    rejected_count bigint not null default 0,
    started_at timestamptz,
    completed_at timestamptz,
    rollback_metadata jsonb,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_substrate_source_artifact_status
    on public.substrate_source_artifact(deployment_status);

create index if not exists idx_substrate_target_reconciliation_target
    on public.substrate_target_reconciliation(target_schema, target_table);

create index if not exists idx_substrate_candidate_disposition_status
    on public.substrate_candidate_disposition(disposition, candidate_kind);

create index if not exists idx_substrate_candidate_disposition_target_identity
    on public.substrate_candidate_disposition using gin(target_identity);

create index if not exists idx_substrate_promotion_batch_status
    on public.substrate_promotion_batch(status);

insert into public.substrate_source_artifact (
    source_file,
    source_sha256,
    source_kind,
    source_bytes,
    source_rows_expected,
    source_files_expected,
    deployment_status,
    notes
) values (
    'v3_13_full_substrate_ingest.sql',
    '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be',
    'generated_sql_bundle',
    14680064,
    36876,
    171,
    'registered',
    'Raw generated bundle. Do not execute directly. Requires hash normalization, exploded-row classification, and target reconciliation.'
)
on conflict (source_sha256) do update set
    source_file = excluded.source_file,
    source_kind = excluded.source_kind,
    source_bytes = excluded.source_bytes,
    source_rows_expected = excluded.source_rows_expected,
    source_files_expected = excluded.source_files_expected,
    notes = excluded.notes,
    updated_at = now();

with bundle as (
    select artifact_id
    from public.substrate_source_artifact
    where source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
)
insert into public.substrate_target_reconciliation (
    artifact_id,
    target_table,
    target_kind,
    generated_rows_expected,
    live_table_exists,
    live_rows_observed,
    schema_compatible,
    duplicate_risk,
    recommended_action,
    notes
)
select bundle.artifact_id, target_table, target_kind, generated_rows_expected,
       live_table_exists, live_rows_observed, null, duplicate_risk,
       recommended_action, notes
from bundle
cross join (values
    ('address_audit_v3_13', 'new_staging', 200::bigint, false, 0::bigint, 'medium', 'create_stage', 'Provenance and data-quality evidence.'),
    ('advocacy_targets_v3_13', 'new_staging', 16, false, 0, 'medium', 'create_stage', 'Inspect identity against existing advocacy structures.'),
    ('benefits_cascade_stages', 'new_staging', 124, false, 0, 'high', 'create_stage', 'Known short-hash/full-hash duplicate exposure.'),
    ('coalition_advocacy_orgs_v3_13_stage', 'new_staging', 31, false, 0, 'high', 'create_stage', 'Compare against populated coalition_advocacy_orgs.'),
    ('domain_deep_dive_records_v3_13', 'new_staging', 1980, false, 0, 'high', 'create_stage', 'Contains exploded field rows and normalized composite rows.'),
    ('ingest_staging_v3_13', 'new_staging', 310, false, 0, 'medium', 'create_stage', 'Source manifest and ingest evidence.'),
    ('legal_aid_wa_v3_13', 'new_staging', 22, false, 0, 'medium', 'create_stage', 'Compare against existing legal aid resources.'),
    ('legal_statutes_v3_13_stage', 'new_staging', 862, false, 0, 'high', 'create_stage', 'Compare against 1,598 live legal_statutes rows.'),
    ('legislator_contacts_v3_13_stage', 'new_staging', 29, false, 0, 'high', 'create_stage', 'Compare against 12 live legislator_contacts rows.'),
    ('luminari_batch_exports_v3_13', 'provenance_only', 65, false, 0, 'low', 'create_stage', 'Export provenance only.'),
    ('luminari_uuid_exports_v3_13', 'provenance_only', 215, false, 0, 'low', 'create_stage', 'UUID provenance only.'),
    ('master_template_docs_v3_13', 'new_staging', 184, false, 0, 'medium', 'create_stage', 'Template evidence; promotion requires document/workflow mapping.'),
    ('policy_layer_docs_v3_13', 'new_staging', 147, false, 0, 'medium', 'create_stage', 'Policy evidence; not direct canonical legal authority.'),
    ('programs_v3_13_stage', 'new_staging', 495, false, 0, 'high', 'create_stage', 'The proposed programs canonical destination is absent.'),
    ('registry_programs_v3_13_stage', 'new_staging', 1002, false, 0, 'high', 'create_stage', 'Compare against 8,361 live registry_programs rows.'),
    ('sol_collision_analysis_v3_13', 'new_staging', 178, false, 0, 'high', 'create_stage', 'Deadline records require jurisdiction and authority validation.'),
    ('specification_extraction_v3_13', 'new_staging', 42, false, 0, 'medium', 'create_stage', 'Specification evidence.'),
    ('state_enriched_directory_v3_13', 'new_staging', 30250, false, 0, 'high', 'create_stage', 'Largest lane; do not promote until entity/resource split is proven.'),
    ('tribal_jurisdictions_addendum_v3_13', 'new_staging', 724, false, 0, 'high', 'create_stage', 'Requires tribal-jurisdiction identity reconciliation.'),
    ('coalition_advocacy_orgs', 'existing_canonical', 31, true, 87, 'high', 'compare', 'Existing production table.'),
    ('legal_statutes', 'existing_canonical', 862, true, 1598, 'high', 'compare', 'Existing production table.'),
    ('legislator_contacts', 'existing_canonical', 29, true, 12, 'high', 'compare', 'Existing production table.'),
    ('programs', 'new_canonical', 495, false, 0, 'high', 'hold', 'Generated target does not exist in production.'),
    ('registry_programs', 'existing_canonical', 1002, true, 8361, 'high', 'compare', 'Existing production table; mixed entity-type risk.')
) as t(
    target_table,
    target_kind,
    generated_rows_expected,
    live_table_exists,
    live_rows_observed,
    duplicate_risk,
    recommended_action,
    notes
)
on conflict (artifact_id, target_schema, target_table) do update set
    target_kind = excluded.target_kind,
    generated_rows_expected = excluded.generated_rows_expected,
    live_table_exists = excluded.live_table_exists,
    live_rows_observed = excluded.live_rows_observed,
    duplicate_risk = excluded.duplicate_risk,
    recommended_action = excluded.recommended_action,
    notes = excluded.notes,
    updated_at = now();

commit;
