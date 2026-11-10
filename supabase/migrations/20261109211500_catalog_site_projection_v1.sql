-- Catalog site projection v1 (2026-11-09).
--
-- The Resource Directory's classified catalog holds 21,647 rows; the
-- same organization at the same address appears again and again across
-- source artifacts and sections. The projection derives one site per
-- (organization, street address) from those rows — dedupe by
-- projection, never by deletion: every source row is preserved in the
-- catalog and linked here to the site it evidences, with the exact
-- address segment it contributed.
--
-- Sites themselves live in public.luminari_resource_entities with
-- source_table = 'catalog_site_projection_v1'; their base locations
-- live in public.luminari_resource_locations with the same
-- source_table. Category review (step 2) and location approval
-- (step 3) attach through the existing ledgers, unchanged.

create table if not exists public.luminari_catalog_site_source_rows (
  site_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  civic_object_uid text not null,
  object_ref text,
  artifact_key text,
  source_content_sha256 text,
  segment_text text not null,
  segment_kind text not null check (segment_kind in ('physical', 'mailing')),
  projection_version text not null,
  created_at timestamptz not null default now(),
  primary key (site_entity_id, civic_object_uid, segment_text)
);

create index if not exists idx_luminari_catalog_site_source_rows_uid
  on public.luminari_catalog_site_source_rows (civic_object_uid);

comment on table public.luminari_catalog_site_source_rows is
  'Catalog site projection v1: links each projected site entity to the classified catalog rows (and the exact address segment) it was projected from. Derived and rebuildable from the classified view; source rows are preserved.';
