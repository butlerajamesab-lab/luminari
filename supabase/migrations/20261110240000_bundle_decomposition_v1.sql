-- Bundle decomposition v1 (2026-11-11).
--
-- The naming-repair census counted 122 catalog entities whose own
-- linked workbook source rows name several distinct programs
-- (conflict_identity bundles): step 1 / step 4 grouped rows by the
-- registry document's artifact name, so one entity swallowed every
-- program on the document. The bundle census
-- (luminari-recovery/bundle-decomposition/REPORT.md, measured
-- read-only 2026-11-11) attributed all 1,298 linked rows of the 122
-- bundles to 641 constituent program names and classified each
-- bundle's decomposition shape. Wave 1 is the mechanical universe:
-- 40 bundles (2 clean splits with disjoint sites per name, 38
-- shared-site splits) carrying 95 names and 190 fully attributed
-- rows. The other 82 bundles need recorded judgments (variant-pair
-- merge/split decisions, unattributable (9)-generation rows) and are
-- NOT touched by this wave; the WA 217-name bundle is its own wave.
--
-- This migration registers the bundle_decomposition family and
-- creates the decomposition's two tables:
--   - public.luminari_bundle_decomposition_source_rows: the link
--     table for source rows re-pointed to minted entities. The
--     original step-1 / step-4 link tables are NEVER mutated;
--     provenance stays with the bundle, and the decomposition's
--     attribution of each row (workbook sheet / row / generation /
--     via) is recorded here.
--   - public.luminari_bundle_decompositions: the ledger. One row
--     per (bundle, minted entity) plus one shell-retirement row per
--     bundle enumerating any held (unattributable) rows. The
--     ledger is the receipt and the rollback source: retiring a
--     shell is a publication resolution, not a deletion, and a
--     decomposition is undone by flipping that resolution back to
--     active and removing the minted entities it names here.
--
-- Minted entities live in public.luminari_resource_entities with
-- source_table = 'bundle_decomposition_v1' and
-- source_family_key = 'bundle_decomposition'; their locations live
-- in public.luminari_resource_locations with the same source_table.

-- The runner inserts entities with
-- source_family_key = 'bundle_decomposition', which
-- luminari_resource_entities references against
-- luminari_document_family_contracts(family_key). Register the
-- family in this same migration, before any entity insert can run,
-- so a database provisioned from the repository migrations accepts
-- the decomposition's first entity batch (the PR #791 / step-4
-- pattern).
insert into public.luminari_document_family_contracts (
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes
) values (
  'bundle_decomposition',
  'Bundle Decomposition',
  'Deterministic decomposition of catalog bundle entities — entities whose own linked workbook source rows name several distinct programs — into one catalog entity per constituent program name: minted entities with the program name verbatim from the workbook row, locations cloned per decomposition shape (clean split: each name''s own site; shared site: the bundle''s locations cloned to every minted entity), every attributed source row re-pointed in the decomposition link table, and the bundle shell retired by publication resolution (reversible, never a deletion). Variant-phrasing name pairs merge only on a recorded pair decision with agreeing phone/website evidence; unattributable rows are enumerated as held on the shell''s ledger row, never silently dropped.',
  array['projected_records', 'record_locations', 'source_row_links', 'provenance_spans'],
  array['v_ui_civic_map_v2', 'v_ui_registry_quality_v1'],
  'Minted records land in luminari_resource_entities with source_table ''bundle_decomposition_v1''; their locations land in luminari_resource_locations with the same source_table; re-pointed source rows are linked in luminari_bundle_decomposition_source_rows; the per-bundle receipt is luminari_bundle_decompositions. The decomposition is derived from the bundle census over the step-1 / step-4 projections and is rebuildable from it; the original projections and their link tables are never mutated.'
)
on conflict (family_key) do nothing;

create table if not exists public.luminari_bundle_decomposition_source_rows (
  minted_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  bundle_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  civic_object_uid text not null,
  object_ref text,
  artifact_key text,
  source_content_sha256 text,
  attribution_sheet text,
  attribution_row integer,
  attribution_generation text check (
    attribution_generation is null or attribution_generation in ('v3_13', '(9)')
  ),
  attribution_via text check (
    attribution_via is null or attribution_via in ('direct', 'mirror')
  ),
  projection_version text not null,
  created_at timestamptz not null default now(),
  primary key (minted_entity_id, civic_object_uid)
);

create index if not exists idx_luminari_bundle_decomposition_source_rows_uid
  on public.luminari_bundle_decomposition_source_rows (civic_object_uid);

create index if not exists idx_luminari_bundle_decomposition_source_rows_bundle
  on public.luminari_bundle_decomposition_source_rows (bundle_entity_id);

comment on table public.luminari_bundle_decomposition_source_rows is
  'Bundle decomposition v1: links each minted entity to the workbook source rows the bundle census attributed to its program name (sheet/row/generation/via recorded per row). The original step-1 / step-4 link rows are preserved unchanged; this table is the decomposition''s re-pointing, derived and rebuildable from the census.';

create table if not exists public.luminari_bundle_decompositions (
  ledger_row_id uuid primary key default gen_random_uuid(),
  row_kind text not null check (row_kind in ('mint', 'shell_retirement')),
  bundle_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  bundle_canonical_id text not null,
  minted_entity_id uuid
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  minted_canonical_id text,
  program_name text,
  shape text not null check (shape in ('clean_split', 'shared_site_split')),
  attribution_evidence jsonb,
  pair_decision text check (
    pair_decision is null or pair_decision in ('split', 'merged_into')
  ),
  pair_decider text,
  held_rows jsonb,
  batch_id text not null,
  manifest_sha256 text not null,
  decomposition_version text not null,
  applied_at timestamptz not null default now(),
  check ((row_kind = 'mint') = (minted_entity_id is not null)),
  check ((row_kind = 'mint') = (program_name is not null))
);

create unique index if not exists idx_luminari_bundle_decompositions_mint
  on public.luminari_bundle_decompositions (bundle_entity_id, minted_entity_id)
  where row_kind = 'mint';

create unique index if not exists idx_luminari_bundle_decompositions_shell
  on public.luminari_bundle_decompositions (bundle_entity_id)
  where row_kind = 'shell_retirement';

comment on table public.luminari_bundle_decompositions is
  'Bundle decomposition v1 ledger: one mint row per (bundle, minted entity) with the attribution evidence and pair decision behind it, plus one shell_retirement row per bundle enumerating held (unattributable) rows in held_rows. Written per bundle in the same transaction as the mints, before the shell''s publication resolution; the receipt and rollback source for the decomposition waves.';
