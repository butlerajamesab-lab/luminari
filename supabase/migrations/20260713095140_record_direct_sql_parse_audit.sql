begin;

create table if not exists public.generated_sql_bundle_audit (
    bundle_sha256 text primary key,
    source_file text not null,
    byte_count bigint not null,
    line_count bigint not null,
    tuple_row_count bigint not null,
    distinct_row_source_count bigint not null,
    manifest_source_count bigint,
    manifest_generated_row_count bigint,
    source_count_delta bigint,
    row_count_delta bigint,
    audit_status text not null check (audit_status in ('verified','partial','mismatch','held')),
    notes text,
    audited_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.generated_sql_bundle_audit (
    bundle_sha256,
    source_file,
    byte_count,
    line_count,
    tuple_row_count,
    distinct_row_source_count,
    manifest_source_count,
    manifest_generated_row_count,
    source_count_delta,
    row_count_delta,
    audit_status,
    notes
)
select
    '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be',
    'v3_13_full_substrate_ingest (1).sql',
    13908344,
    37576,
    35954,
    160,
    count(*),
    coalesce(sum(generated_row_count),0),
    160 - count(*),
    35954 - coalesce(sum(generated_row_count),0),
    case
        when count(*) = 160 and coalesce(sum(generated_row_count),0) = 35954 then 'verified'
        else 'mismatch'
    end,
    'Direct local parse of the uploaded SQL found 160 distinct row-bearing source files and 35,954 tuple rows matching the canonical source/hash/kind/key/table_idx/row_idx/payload shape. This supersedes the earlier hand-seeded source-manifest estimate and requires exact manifest regeneration before workbook reconciliation is treated as complete.'
from public.generated_sql_source_manifest
where bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
on conflict (bundle_sha256) do update set
    source_file = excluded.source_file,
    byte_count = excluded.byte_count,
    line_count = excluded.line_count,
    tuple_row_count = excluded.tuple_row_count,
    distinct_row_source_count = excluded.distinct_row_source_count,
    manifest_source_count = excluded.manifest_source_count,
    manifest_generated_row_count = excluded.manifest_generated_row_count,
    source_count_delta = excluded.source_count_delta,
    row_count_delta = excluded.row_count_delta,
    audit_status = excluded.audit_status,
    notes = excluded.notes,
    audited_at = now(),
    updated_at = now();

update public.substrate_source_artifact
set source_bytes = 13908344,
    source_files_expected = 160,
    source_rows_expected = 35954,
    deployment_status = 'held',
    notes = 'Direct parse verified 160 distinct row-bearing sources and 35,954 canonical tuple rows. Existing generated_sql_source_manifest is incomplete and must be regenerated exactly before broad promotion.',
    updated_at = now()
where source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be';

create or replace view public.v_generated_sql_bundle_audit as
select
    bundle_sha256,
    source_file,
    byte_count,
    line_count,
    tuple_row_count,
    distinct_row_source_count,
    manifest_source_count,
    manifest_generated_row_count,
    source_count_delta,
    row_count_delta,
    audit_status,
    audited_at
from public.generated_sql_bundle_audit;

commit;
