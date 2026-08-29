begin;

create table if not exists public.corpus_artifact_manifest (
    artifact_manifest_id bigserial primary key,
    bucket_id text not null,
    object_name text not null,
    object_created_at timestamptz,
    object_updated_at timestamptz,
    size_bytes bigint,
    file_extension text,
    jurisdiction_key text,
    artifact_class text not null,
    artifact_generation text,
    source_sha256 text,
    workbook_present boolean,
    generated_sql_present boolean,
    corpus_queue_present boolean,
    parsed boolean not null default false,
    staged boolean not null default false,
    reconciled boolean not null default false,
    promoted boolean not null default false,
    superseded_by_manifest_id bigint references public.corpus_artifact_manifest(artifact_manifest_id),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, object_name)
);

create index if not exists idx_corpus_artifact_manifest_jurisdiction
    on public.corpus_artifact_manifest(jurisdiction_key, artifact_class);

create index if not exists idx_corpus_artifact_manifest_status
    on public.corpus_artifact_manifest(parsed, staged, reconciled, promoted);

create or replace function public.classify_corpus_artifact_name(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when p_name ilike '%RESOURCE-DIRECTORY%' then 'resource_directory'
        when p_name ilike '%ENRICHED-PASS3%' then 'enriched_pass_3'
        when p_name ilike '%ENRICHED-PASS2%' then 'enriched_pass_2'
        when p_name ilike '%registry-3%' then 'registry_pass_3'
        when p_name ilike '%registry-2%' then 'registry_pass_2'
        when p_name ilike '%TRIBAL-ADDENDUM%' then 'tribal_addendum'
        when p_name ilike '%DEEP-DIVE%' then 'deep_dive'
        when p_name ilike '%FEDERAL-MASTER%' then 'federal_master'
        when p_name ilike '%FEDERAL-STATUTORY-REFERENCE-ANCHOR%' then 'federal_statutory_anchor'
        when p_name ilike '%CLAIM-CATALOG%' then 'claim_catalog'
        when p_name ilike '%BENEFITS-CASCADE%' then 'benefits_cascade'
        when p_name ilike '%GAP-PLAYBOOK%' then 'gap_playbook'
        when p_name ilike '%SOL-COLLISION%' then 'sol_collision'
        when p_name ilike '%.xlsx' or p_name ilike '%.xls' then 'workbook'
        when p_name ilike '%.sql' then 'sql_bundle'
        when p_name ilike '%.zip' then 'archive'
        when p_name ilike '%.json' or p_name ilike '%.jsonl' then 'structured_data'
        when p_name ilike '%.md' then 'markdown_directory'
        else 'other'
    end
$$;

create or replace function public.derive_corpus_jurisdiction_key(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select case
        when p_name ilike '%AMERICAN-SAMOA%' then 'american_samoa'
        when p_name ilike '%NORTHERN-MARIANA%' or p_name ilike '%CNMI%' then 'northern_mariana_islands'
        when p_name ilike '%US-VIRGIN%' or p_name ilike '%US-VIRGIN-ISLANDS%' then 'us_virgin_islands'
        when p_name ilike '%PUERTO-RICO%' then 'puerto_rico'
        when p_name ilike '%WASHINGTON-DC%' then 'district_of_columbia'
        when p_name ilike '%GUAM%' then 'guam'
        when p_name ilike '%ALABAMA%' then 'alabama'
        when p_name ilike '%ALASKA%' then 'alaska'
        when p_name ilike '%ARIZONA%' then 'arizona'
        when p_name ilike '%ARKANSAS%' then 'arkansas'
        when p_name ilike '%CALIFORNIA%' then 'california'
        when p_name ilike '%COLORADO%' then 'colorado'
        when p_name ilike '%CONNECTICUT%' then 'connecticut'
        when p_name ilike '%DELAWARE%' then 'delaware'
        when p_name ilike '%FLORIDA%' then 'florida'
        when p_name ilike '%GEORGIA%' then 'georgia'
        when p_name ilike '%HAWAII%' then 'hawaii'
        when p_name ilike '%IDAHO%' then 'idaho'
        when p_name ilike '%ILLINOIS%' then 'illinois'
        when p_name ilike '%INDIANA%' then 'indiana'
        when p_name ilike '%IOWA%' then 'iowa'
        when p_name ilike '%KANSAS%' then 'kansas'
        when p_name ilike '%KENTUCKY%' then 'kentucky'
        when p_name ilike '%LOUISIANA%' then 'louisiana'
        when p_name ilike '%MAINE%' then 'maine'
        when p_name ilike '%MARYLAND%' then 'maryland'
        when p_name ilike '%MASSACHUSETTS%' then 'massachusetts'
        when p_name ilike '%MICHIGAN%' then 'michigan'
        when p_name ilike '%MINNESOTA%' then 'minnesota'
        when p_name ilike '%MISSISSIPPI%' then 'mississippi'
        when p_name ilike '%MISSOURI%' then 'missouri'
        when p_name ilike '%MONTANA%' then 'montana'
        when p_name ilike '%NEBRASKA%' then 'nebraska'
        when p_name ilike '%NEVADA%' then 'nevada'
        when p_name ilike '%NEW-HAMPSHIRE%' then 'new_hampshire'
        when p_name ilike '%NEW-JERSEY%' then 'new_jersey'
        when p_name ilike '%NEW-MEXICO%' or p_name ilike '%NEWMEXICO%' then 'new_mexico'
        when p_name ilike '%NEW-YORK%' then 'new_york'
        when p_name ilike '%NORTH-CAROLINA%' or p_name ilike '%NORTHCAROLINA%' then 'north_carolina'
        when p_name ilike '%NORTH-DAKOTA%' or p_name ilike '%NORTHDAKOTA%' then 'north_dakota'
        when p_name ilike '%OHIO%' then 'ohio'
        when p_name ilike '%OKLAHOMA%' then 'oklahoma'
        when p_name ilike '%OREGON%' then 'oregon'
        when p_name ilike '%PENNSYLVANIA%' then 'pennsylvania'
        when p_name ilike '%RHODE-ISLAND%' then 'rhode_island'
        when p_name ilike '%SOUTH-CAROLINA%' or p_name ilike '%SOUTHCAROLINA%' then 'south_carolina'
        when p_name ilike '%SOUTH-DAKOTA%' or p_name ilike '%SOUTHDAKOTA%' then 'south_dakota'
        when p_name ilike '%TENNESSEE%' then 'tennessee'
        when p_name ilike '%TEXAS%' then 'texas'
        when p_name ilike '%UTAH%' then 'utah'
        when p_name ilike '%VERMONT%' then 'vermont'
        when p_name ilike '%VIRGINIA%' and p_name not ilike '%WEST-VIRGINIA%' and p_name not ilike '%WESTVIRGINIA%' then 'virginia'
        when p_name ilike '%WASHINGTON%' and p_name not ilike '%WASHINGTON-DC%' then 'washington'
        when p_name ilike '%WEST-VIRGINIA%' or p_name ilike '%WESTVIRGINIA%' then 'west_virginia'
        when p_name ilike '%WISCONSIN%' then 'wisconsin'
        when p_name ilike '%WYOMING%' then 'wyoming'
        when p_name ilike '%FEDERAL%' then 'federal'
        when p_name ilike '%NATIONAL%' then 'national'
        else null
    end
$$;

insert into public.corpus_artifact_manifest (
    bucket_id,
    object_name,
    object_created_at,
    object_updated_at,
    size_bytes,
    file_extension,
    jurisdiction_key,
    artifact_class,
    corpus_queue_present,
    parsed,
    notes
)
select
    o.bucket_id,
    o.name,
    o.created_at,
    o.updated_at,
    nullif(o.metadata ->> 'size','')::bigint,
    lower(nullif(regexp_replace(o.name, '^.*\.', ''), o.name)),
    public.derive_corpus_jurisdiction_key(o.name),
    public.classify_corpus_artifact_name(o.name),
    exists (
        select 1
        from public.corpus_import_queue q
        where q.storage_bucket = o.bucket_id
          and q.storage_path = o.name
    ),
    exists (
        select 1
        from public.corpus_import_queue q
        where q.storage_bucket = o.bucket_id
          and q.storage_path = o.name
          and coalesce(q.normalized_text_chars,0) > 0
    ),
    'Backfilled from Supabase storage.objects. Workbook and generated-SQL membership remain to be reconciled.'
from storage.objects o
where o.bucket_id in ('State Enriched Registry bucket','Everything backbone related')
on conflict (bucket_id, object_name) do update set
    object_created_at = excluded.object_created_at,
    object_updated_at = excluded.object_updated_at,
    size_bytes = excluded.size_bytes,
    file_extension = excluded.file_extension,
    jurisdiction_key = excluded.jurisdiction_key,
    artifact_class = excluded.artifact_class,
    corpus_queue_present = excluded.corpus_queue_present,
    parsed = excluded.parsed,
    updated_at = now();

create or replace view public.v_corpus_artifact_coverage as
select
    jurisdiction_key,
    artifact_class,
    count(*)::bigint as artifact_count,
    count(*) filter (where corpus_queue_present)::bigint as queued_count,
    count(*) filter (where parsed)::bigint as parsed_count,
    count(*) filter (where staged)::bigint as staged_count,
    count(*) filter (where reconciled)::bigint as reconciled_count,
    count(*) filter (where promoted)::bigint as promoted_count,
    count(*) filter (where workbook_present is true)::bigint as workbook_present_count,
    count(*) filter (where generated_sql_present is true)::bigint as generated_sql_present_count
from public.corpus_artifact_manifest
where superseded_by_manifest_id is null
group by jurisdiction_key, artifact_class;

commit;
