begin;

create table if not exists public.domain_deep_dive_v3_13_stage (
    stage_row_id bigserial primary key,
    source_file text not null,
    source_hash_raw text,
    source_hash_kind text not null default 'unknown'
        check (source_hash_kind in ('md5_prefix_8','md5_full_32','sha256_full_64','unknown')),
    source_kind text not null,
    source_key text not null,
    table_idx integer not null,
    row_idx integer not null,
    payload jsonb not null,
    payload_md5 text generated always as (md5(payload::text)) stored,
    source_row_key text generated always as (
        source_file || ':' || table_idx::text || ':' || row_idx::text || ':' || md5(payload::text)
    ) stored,
    row_shape text not null default 'other'
        check (row_shape in (
            'normalized_resource',
            'state_directory_entry',
            'statute_summary',
            'exploded_field',
            'other'
        )),
    promotion_status text not null default 'unresolved'
        check (promotion_status in (
            'unresolved','provenance_only','candidate','duplicate','hold','rejected','promoted'
        )),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (source_row_key)
);

create index if not exists idx_domain_deep_dive_v3_13_stage_source
    on public.domain_deep_dive_v3_13_stage(source_file, table_idx, row_idx);

create index if not exists idx_domain_deep_dive_v3_13_stage_shape
    on public.domain_deep_dive_v3_13_stage(row_shape, promotion_status);

create index if not exists idx_domain_deep_dive_v3_13_stage_payload
    on public.domain_deep_dive_v3_13_stage using gin(payload);

create or replace function public.classify_domain_deep_dive_v3_13_payload(p_payload jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when p_payload ? 'resource_id' and p_payload ? 'organization_name'
            then 'normalized_resource'
        when p_payload ? 'state' and p_payload ? 'agency_name'
            then 'state_directory_entry'
        when p_payload ? 'statute___law'
            then 'statute_summary'
        when p_payload ? 'col_1'
            then 'exploded_field'
        else 'other'
    end
$$;

create or replace function public.normalize_domain_deep_dive_v3_13_stage_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.source_hash_kind := case
        when new.source_hash_raw ~ '^[0-9a-fA-F]{8}$' then 'md5_prefix_8'
        when new.source_hash_raw ~ '^[0-9a-fA-F]{32}$' then 'md5_full_32'
        when new.source_hash_raw ~ '^[0-9a-fA-F]{64}$' then 'sha256_full_64'
        else 'unknown'
    end;

    new.row_shape := public.classify_domain_deep_dive_v3_13_payload(new.payload);

    new.promotion_status := case new.row_shape
        when 'exploded_field' then 'provenance_only'
        when 'normalized_resource' then 'candidate'
        when 'state_directory_entry' then 'candidate'
        when 'statute_summary' then 'candidate'
        else 'hold'
    end;

    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_normalize_domain_deep_dive_v3_13_stage
    on public.domain_deep_dive_v3_13_stage;

create trigger trg_normalize_domain_deep_dive_v3_13_stage
before insert or update of source_hash_raw, payload
on public.domain_deep_dive_v3_13_stage
for each row
execute function public.normalize_domain_deep_dive_v3_13_stage_row();

create or replace view public.v_domain_deep_dive_v3_13_stage_summary as
select
    source_file,
    source_hash_kind,
    row_shape,
    promotion_status,
    count(*)::bigint as row_count
from public.domain_deep_dive_v3_13_stage
group by source_file, source_hash_kind, row_shape, promotion_status;

insert into public.substrate_promotion_batch (
    batch_name,
    domain_key,
    source_artifact_id,
    status,
    candidate_count,
    notes
)
select
    'v3_13_disability_deep_dive_001',
    'disability_services',
    artifact_id,
    'planned',
    91,
    'Bounded first lane: 334 extracted disability rows expected, including 25 normalized resources, 56 state/territory directory entries, 10 statute summaries, and 243 provenance/other rows. No canonical promotion performed.'
from public.substrate_source_artifact
where source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
on conflict (batch_name) do update set
    candidate_count = excluded.candidate_count,
    notes = excluded.notes,
    updated_at = now();

update public.substrate_target_reconciliation r
set schema_compatible = true,
    recommended_action = 'load_stage',
    notes = 'Corrected shared staging schema is available. Load the bounded disability lane before identity comparison.',
    updated_at = now()
from public.substrate_source_artifact a
where r.artifact_id = a.artifact_id
  and a.source_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
  and r.target_table = 'domain_deep_dive_records_v3_13';

commit;
