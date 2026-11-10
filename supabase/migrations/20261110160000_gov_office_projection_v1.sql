-- Gov office projection v1 (2026-11-10).
--
-- The anchor agency-locator loads live in public.gov_offices (59,979
-- offices across 10 families). Alexander's unification ruling
-- (2026-11-10): every resource lives in the Resource Directory
-- catalog, categorized — a side table with map pins is not
-- integration. The projection derives one catalog entity per office
-- (dedupe by projection, never by deletion: gov_offices rows are
-- preserved and linked here), with primary category + memberships
-- from the U1 family->category map (VA assigned at office_type
-- grain). Offices colliding with an existing catalog site
-- (state + ZIP5 + normalized street) attach to that entity instead
-- of minting a second one; name+city-only collisions are held for
-- human review and are not projected.
--
-- Entities live in public.luminari_resource_entities with
-- source_table = 'gov_office_projection_v1' and canonical_id = the
-- office_id itself (already a stable content hash); their base
-- locations live in public.luminari_resource_locations with the
-- same source_table and carry the office's source coordinates
-- where the locator source supplied them.

-- The runner inserts entities with
-- source_family_key = 'gov_office_projection', which
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
  'gov_office_projection',
  'Gov Office Projection',
  'Deterministic projection of the anchored government-office locator rows (public.gov_offices) into the Resource Directory catalog: one entity per office with a base location (source coordinates carried where the locator source supplied them), U1 family-map categories (VA at office_type grain), and every contributing office linked. Dedupe by projection, never by deletion — gov_offices rows are preserved unchanged; offices colliding with an existing catalog site attach to that entity, and name+city-only collisions are held for human review.',
  array['projected_offices', 'office_locations', 'source_row_links'],
  array['v_ui_civic_map_v2', 'v_ui_registry_quality_v1'],
  'Projected offices land in luminari_resource_entities with source_table ''gov_office_projection_v1'' and canonical_id equal to the gov_offices office_id; base locations land in luminari_resource_locations with the same source_table; contributing offices are linked in luminari_anchor_office_source_rows. The projection is derived and rebuildable from gov_offices; it is never a source of truth over the office rows themselves.'
)
on conflict (family_key) do nothing;

create table if not exists public.luminari_anchor_office_source_rows (
  office_id text not null primary key,
  resource_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  match_kind text not null check (match_kind in ('minted', 'tier_a_merge')),
  projection_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_luminari_anchor_office_source_rows_entity
  on public.luminari_anchor_office_source_rows (resource_entity_id);

comment on table public.luminari_anchor_office_source_rows is
  'Gov office projection v1: links each projected catalog entity to the gov_offices office it was projected from (minted), or to the pre-existing catalog entity the office collided with (tier_a_merge). Derived and rebuildable from gov_offices; office rows are preserved.';
