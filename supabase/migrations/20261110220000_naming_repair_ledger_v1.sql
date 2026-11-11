-- Naming repair ledger v1 (2026-11-10).
--
-- The U3 human-surface ruling (Alexander, 2026-11-10): a person-facing
-- record must carry a real place name — a UUID, a bare hash, or a
-- pipeline artifact label is never a title. The unified catalog holds
-- such records out of person-facing results (held for naming). The
-- naming-repair census (luminari-recovery/naming-repair/REPORT.md,
-- measured read-only 2026-11-10/11) counted 3,282 catalog entities
-- failing the person-facing name test and recovered a proven name for
-- 2,316 of them from the entity's OWN workbook source rows — identity
-- tiers only (identity_direct / identity_uuid / identity_mirror) plus
-- the single reviewed (c) cascade survivor. The remaining 966 stay
-- held: 843 registry shells no accessible source names, 122 bundle
-- entities whose source rows name several distinct programs (a
-- decomposition decision, not a rename), and 1 genuine name the test
-- itself false-positives on.
--
-- This migration creates ONLY the repair ledger. The repair runner
-- (scripts/apply-naming-repairs.mjs) writes one ledger row per repair
-- BEFORE updating the entity, then updates
-- public.luminari_resource_entities.resource_name in the same
-- transaction (one transaction per tier). The ledger is the receipt
-- and the rollback source: the artifact name an entity carried
-- survives here (and in the link tables' provenance and the
-- classified view) after resource_name is repaired. Rollback is an
-- UPDATE of resource_name from old_name keyed by resource_entity_id;
-- no other table is touched by the repair.
--
-- No document-family contract row is registered here, deliberately:
-- the family registry governs families that INSERT entities into
-- luminari_resource_entities (their source_family_key is a foreign
-- key into luminari_document_family_contracts). This repair inserts
-- no entities and sets no source_family_key — it renames existing
-- entities in place and records the renames in a standalone ledger
-- whose only foreign key is to the entity itself. Registering a
-- family for a table nothing joins through the family contract would
-- misstate the data model.

create table if not exists public.luminari_naming_repairs (
  resource_entity_id uuid primary key
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  old_name text not null,
  new_name text not null,
  match_tier text not null check (
    match_tier in (
      'identity_direct',
      'identity_uuid',
      'identity_mirror',
      'c_strong'
    )
  ),
  evidence text,
  repair_version text not null,
  applied_at timestamptz not null default now()
);

create index if not exists idx_luminari_naming_repairs_tier
  on public.luminari_naming_repairs (match_tier);

comment on table public.luminari_naming_repairs is
  'Naming repair v1 ledger: one row per catalog entity whose artifact/UUID resource_name was repaired to the proven name carried by its own source rows. Written before the entity update, in the same per-tier transaction; the rollback source for the repair wave.';
