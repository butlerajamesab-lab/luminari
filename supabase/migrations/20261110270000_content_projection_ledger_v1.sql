-- Content projection ledger v1 (2026-11-12).
--
-- The content census (luminari-recovery/content-census/REPORT.md,
-- measured read-only 2026-11-11) found that the site / remainder /
-- bundle projections minted catalog entities, locations, and
-- categories but never copied the text and contacts sitting on the
-- entities' own linked source rows: 95.8% of the catalog served no
-- real description and 14,163 entities served zero contacts. The C2
-- repair wave (design: luminari-recovery/content-repair-c2/DESIGN.md)
-- projects description / eligibility_summary / apply_notes and mints
-- phone / website / email / portal contact points from each entity's
-- OWN identity-linked transcribed rows only — no name matching, no
-- cross-record borrowing.
--
-- Every contributing row passes the fidelity gate that mirrors the
-- naming repair (PR #801): DOCX-generation rows (transcriptions of
-- the source documents themselves) and v3_13-generation rows on the
-- workbook sheets the fidelity audit proved FAITHFUL may contribute;
-- the sibling-generation (9).xlsx never contributes; LOSSY and
-- UNVERIFIABLE sheets never contribute. Values are shape-validated
-- (NANP extraction for phones, whole-cell URL/email shapes, markup
-- and filename/undefined rejection for text). Entities whose rows
-- are all gated out are recorded here as held, with the reason —
-- a named queue, not a silent skip.
--
-- This migration creates ONLY the repair ledger. The repair runner
-- (scripts/apply-content-projection.mjs) writes one ledger row per
-- action BEFORE the entity update / contact insert it receipts, in
-- the same transaction (one per action kind). The ledger is the
-- receipt and the rollback source: text rollback is an UPDATE of
-- the entity field back to old_value (NULL for this wave) keyed by
-- resource_entity_id + field_name; contact rollback deletes the
-- minted contact points, which the ledger identifies by
-- resource_entity_id + contact type + value (repair_key).
--
-- No document-family contract row is registered here, deliberately —
-- the same reasoning as the naming-repair and title-hygiene ledgers:
-- this repair inserts no entities and sets no source_family_key; it
-- repairs existing entities in place and records the repairs in a
-- standalone ledger whose only foreign key is to the entity itself.

create table if not exists public.luminari_content_projection_repairs (
  id bigint generated always as identity primary key,
  resource_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  repair_kind text not null check (
    repair_kind in ('text_set', 'contact_mint', 'held', 'value_rejected')
  ),
  -- Idempotency key within the entity: 'text_set:<field>',
  -- 'contact_mint:<type>:<value>', 'held', or
  -- 'value_rejected:<field>:<sha256(source value) first 16 hex>'.
  repair_key text not null,
  -- The entity text field for text_set / value_rejected on a text
  -- field; the contact type for contact_mint / value_rejected on a
  -- contact field; '' for held rows.
  field_name text not null default '',
  old_value text,
  new_value text,
  rule text not null,
  source_civic_object_uid text,
  source_artifact_key text,
  source_section_name text,
  -- The raw source cell a minted or rejected value came from.
  source_value text,
  repair_version text not null,
  applied_at timestamptz not null default now(),
  unique (resource_entity_id, repair_key)
);

create index if not exists idx_luminari_content_projection_repairs_kind
  on public.luminari_content_projection_repairs (repair_kind);

comment on table public.luminari_content_projection_repairs is
  'Content projection v1 ledger: one row per C2 action — a text field projected from the entity''s own fidelity-cleared linked source rows, a contact point minted from the same, an entity held by the fidelity gate (with reason), or a source value rejected by shape validation. Written before the write it receipts, in the same per-kind transaction; the rollback source for the wave.';
