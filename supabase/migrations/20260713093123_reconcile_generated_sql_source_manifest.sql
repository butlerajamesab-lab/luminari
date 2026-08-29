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
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', '009_legal_aid_wa_schema.json', 22),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', '0b4fa410-355f-11f1-be9f-01c156bf41be.json', 1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', '1539b5d0-34b3-11f1-9e0e-353c14cede12.json', 1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', '17fd43d0-1c63-11f1-a004-e3dd95325e46.json', 1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'LUMINARI_MASTER_SYNTHESIS-9.docx', 5),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'advocacy_targets_import_snake_case.json', 16),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'coalition_agencies_import_snake_case.json', 31),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'legal_statutes.csv', 862),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'legislator_contacts_import_snake_case.json', 12),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ALABAMA-RESOURCE-DIRECTORY-2026-2.docx', 89),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ALASKA-RESOURCE-DIRECTORY-2026.docx', 100),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-AMERICAN-SAMOA-RESOURCE-DIRECTORY-2026-1.docx', 75),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ARIZONA-RESOURCE-DIRECTORY-2026.docx', 92),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ARKANSAS-RESOURCE-DIRECTORY-2026-2 (1).docx', 77),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-CALIFORNIA-RESOURCE-DIRECTORY-2026.docx', 96),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-CNMI-RESOURCE-DIRECTORY-2026-2.docx', 81),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-COLORADO-RESOURCE-DIRECTORY-2026.docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-CONNECTICUT-RESOURCE-DIRECTORY-2026-1.docx', 94),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-DELAWARE-RESOURCE-DIRECTORY-2026-2.docx', 83),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026-2.docx', 334),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-FLORIDA-RESOURCE-DIRECTORY-2026-1.docx', 92),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-GEORGIA-RESOURCE-DIRECTORY-2026-1.docx', 88),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-GUAM-RESOURCE-DIRECTORY-2026-2.docx', 91),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-HAWAII-RESOURCE-DIRECTORY-2026.docx', 88),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-HOUSING-DEEP-DIVE-2026.docx', 347),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-IDAHO-RESOURCE-DIRECTORY-2026.docx', 112),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ILLINOIS-RESOURCE-DIRECTORY-2026.docx', 86),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-INDIANA-RESOURCE-DIRECTORY-2026 (1).docx', 83),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-IOWA-RESOURCE-DIRECTORY-2026 (1).docx', 78),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-KANSAS-RESOURCE-DIRECTORY-2026.docx', 80),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-KENTUCKY-RESOURCE-DIRECTORY-2026.docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-LABOR-EMPLOYMENT-DEEP-DIVE-2026.docx', 300),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-LATINO-HISPANIC-DEEP-DIVE-2026-1.docx', 289),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-LOUISIANA-RESOURCE-DIRECTORY-2026.docx', 92),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MAINE-RESOURCE-DIRECTORY-2026.docx', 100),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MARYLAND-RESOURCE-DIRECTORY-2026.docx', 86),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MASSACHUSETTS-RESOURCE-DIRECTORY-2026.docx', 99),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MENTAL-HEALTH-DEEP-DIVE-2026-3.docx', 650),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MICHIGAN-RESOURCE-DIRECTORY-2026-1.docx', 86),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MISSISSIPPI-RESOURCE-DIRECTORY-2026-3.docx', 86),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MISSOURI-RESOURCE-DIRECTORY-2026 (1).docx', 80),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-MONTANA-RESOURCE-DIRECTORY-2026-1.docx', 82),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NATIVE-AMERICAN-TRIBAL-DEEP-DIVE-2026-1.docx', 299),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEBRASKA-RESOURCE-DIRECTORY-2026.docx', 79),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEVADA-RESOURCE-DIRECTORY-2026.docx', 82),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEW-HAMPSHIRE-RESOURCE-DIRECTORY-2026.docx', 91),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEW-JERSEY-RESOURCE-DIRECTORY-2026-1.docx', 105),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEW-YORK-RESOURCE-DIRECTORY-2026.docx', 105),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NEWMEXICO-RESOURCE-DIRECTORY-2026-1.docx', 98),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NORTHCAROLINA-RESOURCE-DIRECTORY-2026-2.docx', 90),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-NORTHDAKOTA-RESOURCE-DIRECTORY-2026.docx', 78),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-OHIO-RESOURCE-DIRECTORY-2026.docx', 87),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-OKLAHOMA-RESOURCE-DIRECTORY-2026.docx', 85),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-OREGON-RESOURCE-DIRECTORY-2026 (1).docx', 112),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-PENNSYLVANIA-RESOURCE-DIRECTORY-2026-1.docx', 89),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-PUERTO-RICO-RESOURCE-DIRECTORY-2026-1.docx', 103),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-RHODE-ISLAND-RESOURCE-DIRECTORY-2026-3.docx', 62),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-SOUTHCAROLINA-RESOURCE-DIRECTORY-2026-1.docx', 82),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-SOUTHDAKOTA-RESOURCE-DIRECTORY-2026.docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-SUBSTANCE-USE-RECOVERY-RESOURCE-DIRECTORY-2026.docx', 1073),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-TENNESSEE-RESOURCE-DIRECTORY-2026-1.docx', 82),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-TEXAS-RESOURCE-DIRECTORY-2026-1.docx', 92),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-US-VIRGIN-ISLANDS-RESOURCE-DIRECTORY-2026-1.docx', 97),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-UTAH-RESOURCE-DIRECTORY-2026.docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-VERMONT-RESOURCE-DIRECTORY-2026.docx', 95),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-VIRGINIA-RESOURCE-DIRECTORY-2026.docx', 86),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-WASHINGTON-DC-RESOURCE-DIRECTORY-2026-1.docx', 100),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-WESTVIRGINIA-RESOURCE-DIRECTORY-2026.docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-WISCONSIN-RESOURCE-DIRECTORY-2026 (1).docx', 84),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-WYOMING-RESOURCE-DIRECTORY-2026.docx', 81),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-advocacy-coalition-network(2).json', 87),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-alabama-ENRICHED-PASS3-2026-3.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-alaska-ENRICHED-PASS3-2026.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-alaska-TRIBAL-ADDENDUM-2026.docx', 13),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-american-samoa-ENRICHED-PASS3-2026-1.docx', 30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-arizona-ENRICHED-PASS3-2026-1.docx', 46),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-arkansas-ENRICHED-PASS3-2026.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-benefits-cascade-4.docx', 124),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-california-ENRICHED-PASS3-2026-2.docx', 49),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-claim-catalog-enriched.docx', 310),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-colorado-ENRICHED-PASS2-2026.docx', 26),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-colorado-registry-3.docx', 24),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-connecticut-ENRICHED-PASS3-2026-1.docx', 36),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-delaware-ENRICHED-PASS3-2026.docx', 34),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-federal-master-1.docx', 43),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-florida-ENRICHED-PASS3-2026.docx', 54),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-gap-playbook.docx', 30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-georgia-ENRICHED-PASS3-2026.docx', 43),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-guam-ENRICHED-PASS3-2026-3.docx', 25),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-hawaii-ENRICHED-PASS3-2026 (1).docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-idaho-ENRICHED-PASS3-2026.docx', 46),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-illinois-ENRICHED-PASS3-2026.docx', 41),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-indiana-ENRICHED-PASS3-2026-1.docx', 39),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-iowa-ENRICHED-PASS3-2026.docx', 26),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-kansas-ENRICHED-PASS3-2026.docx', 26),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-kentucky-ENRICHED-PASS3-2026.docx', 39),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-louisiana-ENRICHED-PASS3-2026.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-maine-ENRICHED-PASS3-2026-1.docx', 34),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-maryland-ENRICHED-PASS3-2026-1.docx', 37),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-massachusetts-ENRICHED-PASS3-2026-3.docx', 38),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-michigan-ENRICHED-PASS3-2026-1.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-minnesota-ENRICHED-PASS3-2026.docx', 41),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-minnesota-registry-3.docx', 24),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-mississippi-ENRICHED-PASS3-2026.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-missouri-ENRICHED-PASS3-2026.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-montana-ENRICHED-PASS3-2026.docx', 38),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-national-tribal-addendum.docx', 17),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-nebraska-ENRICHED-PASS3-2026.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-nevada-ENRICHED-PASS3-2026-1.docx', 40),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-new-hampshire-ENRICHED-PASS3-2026.docx', 29),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-new-hampshire-registry-2.docx', 16),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-new-jersey-ENRICHED-PASS3-2026.docx', 41),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-new-mexico-ENRICHED-PASS3-2026.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-new-york-ENRICHED-PASS3-2026.docx', 43),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-north-carolina-ENRICHED-PASS3-2026-1.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-north-dakota-ENRICHED-PASS3-2026.docx', 29),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-northern-mariana-islands-ENRICHED-PASS3-2026-1.docx', 25),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-ohio-ENRICHED-PASS3-2026.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-oklahoma-ENRICHED-PASS3-2026.docx', 39),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-oregon-ENRICHED-PASS3-2026.docx', 51),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-pennsylvania-ENRICHED-PASS3-2026.docx', 47),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-puerto-rico-ENRICHED-PASS3-2026-1.docx', 34),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-rhode-island-ENRICHED-PASS3-2026.docx', 29),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-sol-collision.docx', 30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-south-carolina-ENRICHED-PASS3-2026-1.docx', 39),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-south-dakota-ENRICHED-PASS3-2026.docx', 29),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-tennessee-ENRICHED-PASS3-2026.docx', 39),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-texas-ENRICHED-PASS3-2026 (1).docx', 44),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-unrecognized-tribes-addendum.docx', 16),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-us-territories.docx', 19),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-us-virgin-islands-ENRICHED-PASS3-2026-1.docx', 25),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-utah-ENRICHED-PASS3-2026.docx', 26),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-vermont-ENRICHED-PASS3-2026.docx', 34),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-virginia-ENRICHED-PASS3-2026.docx', 41),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-washington-ENRICHED-PASS3-2026.docx', 45),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-washington-dc-ENRICHED-PASS3-2026-1.docx', 30),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-washington-state-registry.docx', 65),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-west-virginia-ENRICHED-PASS3-2026.docx', 38),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-wisconsin-ENRICHED-PASS3-2026.docx', 42),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari-wyoming-ENRICHED-PASS3-2026.docx', 29),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminari_specification_extraction.json', 200),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'luminary-benefits-Federal.docx', 1),
('9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be', 'registry_programs_clean_partial.json', 8361)
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
