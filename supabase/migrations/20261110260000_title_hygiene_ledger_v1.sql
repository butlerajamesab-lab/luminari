-- Title hygiene ledger v1 (2026-11-12).
--
-- The content census (luminari-recovery/content-census/REPORT.md,
-- measured read-only 2026-11-11) found person-facing catalog titles
-- that are not names at all: ZIP codes baked into agency names,
-- serialized objects stored as titles, workbook bracket codes and
-- "PARTIAL — verify remaining fields" riders, street addresses, and
-- editorial process text — plus 233 records serving a bare source
-- filename as their description text. The repair wave (design:
-- luminari-recovery/content-repair-c1/DESIGN.md) is deterministic
-- only: 416 titles are restored by mechanical rules re-derived from
-- each title's own text (ZIP-prefix strip, serialized-english parse,
-- bracket-code strip, editorial strip, one enumerated inversion),
-- and 233 filename-valued text fields are cleared to NULL. Titles no
-- rule can restore stay as they are and are held out of person-facing
-- results by the widened name test that ships with the wave.
--
-- This migration creates ONLY the repair ledger. The repair runner
-- (scripts/apply-title-hygiene.mjs) writes one ledger row per repair
-- BEFORE updating the entity, in the same transaction (one per repair
-- kind). The ledger is the receipt and the rollback source: the old
-- title or filename survives here after the entity is repaired.
-- Rollback is an UPDATE of the entity from old_value keyed by
-- resource_entity_id (+ field_name for clears); no other table is
-- touched by the repair.
--
-- No document-family contract row is registered here, deliberately —
-- the same reasoning as the naming-repair ledger: this repair inserts
-- no entities and sets no source_family_key; it repairs existing
-- entities in place and records the repairs in a standalone ledger
-- whose only foreign key is to the entity itself.

create table if not exists public.luminari_title_hygiene_repairs (
  id bigint generated always as identity primary key,
  resource_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  repair_kind text not null check (
    repair_kind in ('title_rename', 'filename_clear')
  ),
  -- '' for renames; the cleared column name for filename clears.
  field_name text not null default '',
  old_value text not null,
  new_value text,
  rule text not null,
  repair_version text not null,
  applied_at timestamptz not null default now(),
  unique (resource_entity_id, repair_kind, field_name)
);

create index if not exists idx_luminari_title_hygiene_repairs_kind
  on public.luminari_title_hygiene_repairs (repair_kind);

comment on table public.luminari_title_hygiene_repairs is
  'Title hygiene v1 ledger: one row per deterministic catalog repair — a non-name title restored by a mechanical rule re-derived from the title''s own text, or a filename-valued text field cleared to NULL. Written before the entity update, in the same per-kind transaction; the rollback source for the repair wave.';
