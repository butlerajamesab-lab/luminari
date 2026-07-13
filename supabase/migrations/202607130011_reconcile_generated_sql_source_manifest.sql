begin;

create table if not exists public.generated_sql_source_manifest (
    generated_source_id bigserial primary key,
    bundle_sha256 text not null,
    source_file text not null,
    generated_row_count bigint not null,
    matched_artifact_manifest_id bigint references public.corpus_artifact_manifest(artifact_manifest_id),
    match_method text check (match_method in ('exact','normalized','unmatched')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bundle_sha256, source_file)
);

create or replace function public.normalize_corpus_artifact_filename(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select lower(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(coalesce(p_name,''), '\s*\([0-9]+\)(?=\.[^.]+$)', '', 'gi'),
                    '-[0-9]+(?=\.docx$)', '', 'gi'
                ),
                '_[0-9]{6}_[0-9]{6}(?=\.docx$)', '', 'gi'
            ),
            '[^a-z0-9]+', '', 'gi'
        )
    )
$$;

insert into public.generated_sql_source_manifest (
    bundle_sha256, source_file, generated_row_count
)
values
('009_legal_aid_wa_schema.json', 22),
('0b4fa410-355f-11f1-be9f-01c156bf41be.json', 1),
('1539b5d0-34b3-11f1-9e0e-353c14cede12.json', 1),
('17fd43d0-1c63-11f1-a004-e3dd95325e46.json', 1),
('LUMINARI_MASTER_SYNTHESIS-9.docx', 5),
('advocacy_targets_import_snake_case.json', 16),
('coalition_agencies_import_snake_case.json', 31),
('legal_statutes.csv', 862),
('legislator_contacts_import_snake_case.json', 12),
('luminari-ALABAMA-RESOURCE-DIRECTORY-2026-2.docx', 89),
('luminari-ALASKA-RESOURCE-DIRECTORY-2026.docx', 100),
('luminari-AMERICAN-SAMOA-RESOURCE-DIRECTORY-2026-1.docx', 75),
('luminari-ARIZONA-RESOURCE-DIRECTORY-2026.docx', 92),
('luminari-ARKANSAS-RESOURCE-DIRECTORY-2026-2 (1).docx', 77),
('luminari-CALIFORNIA-RESOURCE-DIRECTORY-2026.docx', 96),
('luminari-CNMI-RESOURCE-DIRECTORY-2026-2.docx', 81),
('luminari-COLORADO-RESOURCE-DIRECTORY-2026.docx', 84),
('luminari-CONNECTICUT-RESOURCE-DIRECTORY-2026-1.docx', 94),
('luminari-DELAWARE-RESOURCE-DIRECTORY-2026-2.docx', 83),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026-2.docx', 334),
('luminari-FLORIDA-RESOURCE-DIRECTORY-2026-1.docx', 92),
('luminari-GEORGIA-RESOURCE-DIRECTORY-2026-1.docx', 88),
('luminari-GUAM-RESOURCE-DIRECTORY-2026-2.docx', 91),
('luminari-HAWAII-RESOURCE-DIRECTORY-2026.docx', 88),
('luminari-HOUSING-DEEP-DIVE-2026.docx', 347),
('luminari-IDAHO-RESOURCE-DIRECTORY-2026.docx', 112),
('luminari-ILLINOIS-RESOURCE-DIRECTORY-2026.docx', 86),
('luminari-INDIANA-RESOURCE-DIRECTORY-2026 (1).docx', 83),
('luminari-IOWA-RESOURCE-DIRECTORY-2026 (1).docx', 78),
('luminari-KANSAS-RESOURCE-DIRECTORY-2026.docx', 80),
('luminari-KENTUCKY-RESOURCE-DIRECTORY-2026.docx', 84),
('luminari-LABOR-EMPLOYMENT-DEEP-DIVE-2026.docx', 300),
('luminari-LATINO-HISPANIC-DEEP-DIVE-2026-1.docx', 289),
('luminari-LOUISIANA-RESOURCE-DIRECTORY-2026.docx', 92),
('luminari-MAINE-RESOURCE-DIRECTORY-2026.docx', 100),
('luminari-MARYLAND-RESOURCE-DIRECTORY-2026.docx', 86),
('luminari-MASSACHUSETTS-RESOURCE-DIRECTORY-2026.docx', 99),
('luminari-MENTAL-HEALTH-DEEP-DIVE-2026-3.docx', 650),
('luminari-MICHIGAN-RESOURCE-DIRECTORY-2026-1.docx', 86),
('luminari-MISSISSIPPI-RESOURCE-DIRECTORY-2026-3.docx', 86),
('luminari-MISSOURI-RESOURCE-DIRECTORY-2026 (1).docx', 80),
('luminari-MONTANA-RESOURCE-DIRECTORY-2026-1.docx', 82),
('luminari-NATIVE-AMERICAN-TRIBAL-DEEP-DIVE-2026-1.docx', 299),
('luminari-NEBRASKA-RESOURCE-DIRECTORY-2026.docx', 79),
('luminari-NEVADA-RESOURCE-DIRECTORY-2026.docx', 82),
('luminari-NEW-HAMPSHIRE-RESOURCE-DIRECTORY-2026.docx', 91),
('luminari-NEW-JERSEY-RESOURCE-DIRECTORY-2026-1.docx', 105),
('luminari-NEW-YORK-RESOURCE-DIRECTORY-2026.docx', 105),
('luminari-NEWMEXICO-RESOURCE-DIRECTORY-2026-1.docx', 98),
('luminari-NORTHCAROLINA-RESOURCE-DIRECTORY-2026-2.docx', 90),
('luminari-NORTHDAKOTA-RESOURCE-DIRECTORY-2026.docx', 78),
('luminari-OHIO-RESOURCE-DIRECTORY-2026.docx', 87),
('luminari-OKLAHOMA-RESOURCE-DIRECTORY-2026.docx', 85),
('luminari-OREGON-RESOURCE-DIRECTORY-2026 (1).docx', 112),
('luminari-PENNSYLVANIA-RESOURCE-DIRECTORY-2026-1.docx', 89),
('luminari-PUERTO-RICO-RESOURCE-DIRECTORY-2026-1.docx', 103),
('luminari-RHODE-ISLAND-RESOURCE-DIRECTORY-2026-3.docx', 62),
('luminari-SOUTHCAROLINA-RESOURCE-DIRECTORY-2026-1.docx', 82),
('luminari-SOUTHDAKOTA-RESOURCE-DIRECTORY-2026.docx', 84),
('luminari-SUBSTANCE-USE-RECOVERY-RESOURCE-DIRECTORY-2026.docx', 1073),
('luminari-TENNESSEE-RESOURCE-DIRECTORY-2026-1.docx', 82),
('luminari-TEXAS-RESOURCE-DIRECTORY-2026-1.docx', 92),
('luminari-US-VIRGIN-ISLANDS-RESOURCE-DIRECTORY-2026-1.docx', 97),
('luminari-UTAH-RESOURCE-DIRECTORY-2026.docx', 84),
('luminari-VERMONT-RESOURCE-DIRECTORY-2026.docx', 95),
('luminari-VIRGINIA-RESOURCE-DIRECTORY-2026.docx', 86),
('luminari-WASHINGTON-DC-RESOURCE-DIRECTORY-2026-1.docx', 100),
('luminari-WESTVIRGINIA-RESOURCE-DIRECTORY-2026.docx', 84),
('luminari-WISCONSIN-RESOURCE-DIRECTORY-2026 (1).docx', 84),
('luminari-WYOMING-RESOURCE-DIRECTORY-2026.docx', 81),
('luminari-advocacy-coalition-network(2).json', 87),
('luminari-alabama-ENRICHED-PASS3-2026-3.docx', 40),
('luminari-alaska-ENRICHED-PASS3-2026.docx', 40),
('luminari-alaska-TRIBAL-ADDENDUM-2026.docx', 13),
('luminari-american-samoa-ENRICHED-PASS3-2026-1.docx', 30),
('luminari-arizona-ENRICHED-PASS3-2026-1.docx', 46),
('luminari-arkansas-ENRICHED-PASS3-2026.docx', 40),
('luminari-benefits-cascade-4.docx', 124),
('luminari-california-ENRICHED-PASS3-2026-2.docx', 49),
('luminari-claim-catalog-enriched.docx', 310),
('luminari-colorado-ENRICHED-PASS2-2026.docx', 26),
('luminari-colorado-registry-3.docx', 24),
('luminari-connecticut-ENRICHED-PASS3-2026-1.docx', 36),
('luminari-delaware-ENRICHED-PASS3-2026.docx', 34),
('luminari-federal-master-1.docx', 43),
('luminari-florida-ENRICHED-PASS3-2026.docx', 54),
('luminari-gap-playbook.docx', 30),
('luminari-georgia-ENRICHED-PASS3-2026.docx', 43),
('luminari-guam-ENRICHED-PASS3-2026-3.docx', 25),
('luminari-hawaii-ENRICHED-PASS3-2026 (1).docx', 42),
('luminari-idaho-ENRICHED-PASS3-2026.docx', 46),
('luminari-illinois-ENRICHED-PASS3-2026.docx', 41),
('luminari-indiana-ENRICHED-PASS3-2026-1.docx', 39),
('luminari-iowa-ENRICHED-PASS3-2026.docx', 26),
('luminari-kansas-ENRICHED-PASS3-2026.docx', 26),
('luminari-kentucky-ENRICHED-PASS3-2026.docx', 39),
('luminari-louisiana-ENRICHED-PASS3-2026.docx', 42),
('luminari-maine-ENRICHED-PASS3-2026-1.docx', 34),
('luminari-maryland-ENRICHED-PASS3-2026-1.docx', 37),
('luminari-massachusetts-ENRICHED-PASS3-2026-3.docx', 38),
('luminari-michigan-ENRICHED-PASS3-2026-1.docx', 40),
('luminari-minnesota-ENRICHED-PASS3-2026.docx', 41),
('luminari-minnesota-registry-3.docx', 24),
('luminari-mississippi-ENRICHED-PASS3-2026.docx', 40),
('luminari-missouri-ENRICHED-PASS3-2026.docx', 42),
('luminari-montana-ENRICHED-PASS3-2026.docx', 38),
('luminari-national-tribal-addendum.docx', 17),
('luminari-nebraska-ENRICHED-PASS3-2026.docx', 40),
('luminari-nevada-ENRICHED-PASS3-2026-1.docx', 40),
('luminari-new-hampshire-ENRICHED-PASS3-2026.docx', 29),
('luminari-new-hampshire-registry-2.docx', 16),
('luminari-new-jersey-ENRICHED-PASS3-2026.docx', 41),
('luminari-new-mexico-ENRICHED-PASS3-2026.docx', 42),
('luminari-new-york-ENRICHED-PASS3-2026.docx', 43),
('luminari-north-carolina-ENRICHED-PASS3-2026-1.docx', 42),
('luminari-north-dakota-ENRICHED-PASS3-2026.docx', 29),
('luminari-northern-mariana-islands-ENRICHED-PASS3-2026-1.docx', 25),
('luminari-ohio-ENRICHED-PASS3-2026.docx', 42),
('luminari-oklahoma-ENRICHED-PASS3-2026.docx', 39),
('luminari-oregon-ENRICHED-PASS3-2026.docx', 51),
('luminari-pennsylvania-ENRICHED-PASS3-2026.docx', 47),
('luminari-puerto-rico-ENRICHED-PASS3-2026-1.docx', 34),
('luminari-rhode-island-ENRICHED-PASS3-2026.docx', 29),
('luminari-sol-collision.docx', 30),
('luminari-south-carolina-ENRICHED-PASS3-2026-1.docx', 39),
('luminari-south-dakota-ENRICHED-PASS3-2026.docx', 29),
('luminari-tennessee-ENRICHED-PASS3-2026.docx', 39),
('luminari-texas-ENRICHED-PASS3-2026 (1).docx', 44),
('luminari-unrecognized-tribes-addendum.docx', 16),
('luminari-us-territories.docx', 19),
('luminari-us-virgin-islands-ENRICHED-PASS3-2026-1.docx', 25),
('luminari-utah-ENRICHED-PASS3-2026.docx', 26),
('luminari-vermont-ENRICHED-PASS3-2026.docx', 34),
('luminari-virginia-ENRICHED-PASS3-2026.docx', 41),
('luminari-washington-ENRICHED-PASS3-2026.docx', 45),
('luminari-washington-dc-ENRICHED-PASS3-2026-1.docx', 30),
('luminari-washington-state-registry.docx', 65),
('luminari-west-virginia-ENRICHED-PASS3-2026.docx', 38),
('luminari-wisconsin-ENRICHED-PASS3-2026.docx', 42),
('luminari-wyoming-ENRICHED-PASS3-2026.docx', 29),
('luminari_specification_extraction.json', 200),
('luminary-benefits-Federal.docx', 1),
('registry_programs_clean_partial.json', 8361)
on conflict (bundle_sha256, source_file) do update set
    generated_row_count = excluded.generated_row_count,
    updated_at = now();

with exact_matches as (
    select g.generated_source_id, m.artifact_manifest_id
    from public.generated_sql_source_manifest g
    join public.corpus_artifact_manifest m
      on lower(m.object_name) = lower(g.source_file)
    where g.bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
)
update public.generated_sql_source_manifest g
set matched_artifact_manifest_id = e.artifact_manifest_id,
    match_method = 'exact',
    updated_at = now()
from exact_matches e
where g.generated_source_id = e.generated_source_id;

with normalized_candidates as (
    select
        g.generated_source_id,
        min(m.artifact_manifest_id) as artifact_manifest_id,
        count(*) as match_count
    from public.generated_sql_source_manifest g
    join public.corpus_artifact_manifest m
      on public.normalize_corpus_artifact_filename(m.object_name)
       = public.normalize_corpus_artifact_filename(g.source_file)
    where g.bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
      and g.matched_artifact_manifest_id is null
    group by g.generated_source_id
)
update public.generated_sql_source_manifest g
set matched_artifact_manifest_id = n.artifact_manifest_id,
    match_method = 'normalized',
    updated_at = now()
from normalized_candidates n
where g.generated_source_id = n.generated_source_id
  and n.match_count = 1;

update public.generated_sql_source_manifest
set match_method = 'unmatched',
    updated_at = now()
where bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
  and matched_artifact_manifest_id is null;

update public.corpus_artifact_manifest m
set generated_sql_present = exists (
        select 1
        from public.generated_sql_source_manifest g
        where g.matched_artifact_manifest_id = m.artifact_manifest_id
          and g.bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
    ),
    updated_at = now();

create or replace view public.v_generated_sql_source_coverage as
select
    match_method,
    count(*)::bigint as source_file_count,
    sum(generated_row_count)::bigint as generated_row_count
from public.generated_sql_source_manifest
where bundle_sha256 = '9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
group by match_method;

commit;
