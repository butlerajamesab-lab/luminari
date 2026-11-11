-- Catalog remainder projection v1 (2026-11-10).
--
-- Step 1 of the catalog projection (20261109211500) projected the
-- classified Resource Directory rows that carry a site or mailing
-- address segment into one entity per (organization, street address)
-- site. The rows that produce no site — no address text at all, or
-- address text that is notes (phones, URLs, "statewide", ZIP-only) —
-- were left unprojected: 12,452 of 21,647 classified rows, measured
-- live 2026-11-10. The unified catalog (U3) reads entities, so those
-- records are invisible to the directory and the Civic Map (the
-- cross-correlation re-run's bucket (d): 476 of Alexander's audited
-- document records sit in this remainder).
--
-- This projection extends step 1 to the remainder — the same
-- projection, not a new one. One entity per (organization, state)
-- group (step 1's site key with the address component absent), every
-- contributing source row preserved and linked, categories ONLY from
-- the category revision table's reviewed output as carried by the
-- classified view (unreviewed stays resource_category NULL — never
-- guessed), and base locations only where a member row's own address
-- text parses to a full street address (coordinates NULL; the
-- geocoding wave follows separately). Collisions with the existing
-- catalog follow the U2 tier discipline: state + ZIP5 + normalized
-- street attaches to the existing entity (tier A); name + state +
-- city alone is HELD for human review (tier B), never merged.
--
-- Entities live in public.luminari_resource_entities with
-- source_table = 'catalog_remainder_projection_v1'; their base
-- locations live in public.luminari_resource_locations with the
-- same source_table.

-- The runner inserts entities with
-- source_family_key = 'catalog_remainder_projection', which
-- luminari_resource_entities references against
-- luminari_document_family_contracts(family_key). Register the
-- family in this same migration, before any entity insert can run,
-- so a database provisioned from the repository migrations accepts
-- the projection's first entity batch (PR #791 review finding).
insert into public.luminari_document_family_contracts (
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes
) values (
  'catalog_remainder_projection',
  'Catalog Remainder Projection',
  'Deterministic projection of the classified Resource Directory rows step 1 could not turn into sites (no usable address segment) into one catalog entity per (organization, state): projected record entities with revision-governed categories only, base locations where a member row address parses to a full street address, and every contributing source row linked. Dedupe by projection, never by deletion — classified catalog rows are preserved unchanged; groups colliding with an existing catalog site attach to that entity, and name+city-only collisions are held for human review.',
  array['projected_records', 'record_locations', 'source_row_links', 'provenance_spans'],
  array['v_ui_civic_map_v2', 'v_ui_registry_quality_v1'],
  'Projected records land in luminari_resource_entities with source_table ''catalog_remainder_projection_v1''; base locations land in luminari_resource_locations with the same source_table; contributing catalog rows are linked in luminari_catalog_remainder_source_rows. The projection is derived and rebuildable from the classified catalog view; it is never a source of truth over the catalog rows themselves.'
)
on conflict (family_key) do nothing;

create table if not exists public.luminari_catalog_remainder_source_rows (
  resource_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  civic_object_uid text not null,
  object_ref text,
  artifact_key text,
  source_content_sha256 text,
  address_text text,
  match_kind text not null check (match_kind in ('minted', 'tier_a_merge')),
  projection_version text not null,
  created_at timestamptz not null default now(),
  primary key (resource_entity_id, civic_object_uid)
);

create index if not exists idx_luminari_catalog_remainder_source_rows_uid
  on public.luminari_catalog_remainder_source_rows (civic_object_uid);

comment on table public.luminari_catalog_remainder_source_rows is
  'Catalog remainder projection v1: links each projected remainder entity (or the existing entity a group tier-A merged into) to the classified catalog rows it was projected from. Derived and rebuildable from the classified view; source rows are preserved.';
