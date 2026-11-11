-- Category pass ledger v1 (2026-11-10).
--
-- The category census (luminari-recovery/category-pass/REPORT.md,
-- measured read-only 2026-11-10) derived canonical categories for
-- the step-4 remainder population with declared deterministic rules
-- — R2 section headings, R3a workbook-column labels, R4 service-text
-- keywords — gated by the workbook-fidelity audit
-- (luminari-recovery/workbook-fidelity/REPORT.md): view-prose-label
-- primaries (sampled 3/3 wrong), suspect labels, section/label
-- conflicts, benefits_program_master-anchored evidence, and the 161
-- fidelity-held naming rows are all quarantined out of the apply
-- set. 1,777 of the 4,797 unreviewed entities carry a clean primary.
--
-- Why a NEW ledger instead of rows in
-- public.luminari_resource_category_revision_v1: that table's
-- BEFORE INSERT guard (guard_luminari_resource_category_v1) admits
-- only paragraph-anchored individual reviews — it requires an exact
-- admitted target in v_lighthouse_resource_program_catalog_v2 whose
-- stable-uuid entity owns the corpus record, a word/document.xml
-- xpath span, a heading quote contained in the record text, and
-- membership quotes with P-paragraph anchors also contained in the
-- record text. Workbook- and lines-anchored deterministic evidence
-- cannot honestly satisfy that contract, and amending a governance
-- guard so one's own pass can pass it is not this migration's call.
-- So, like the naming repair before it, the category pass keeps its
-- own ledger: this table is the pass's receipt and rollback source,
-- the runner (scripts/apply-category-revisions.mjs) writes one row
-- per classification BEFORE updating the entity in the same per-tier
-- transaction, and the guarded revision table is not touched.
--
-- Rollback is an UPDATE of luminari_resource_entities setting
-- resource_category = NULL and service_categories = '{}' for the
-- entities listed here (the pass only ever classifies entities
-- whose category was NULL — its drift guard skips anything else).
--
-- No document-family contract row is registered here, deliberately:
-- the family registry governs families that INSERT entities into
-- luminari_resource_entities. This pass inserts no entities and
-- sets no source_family_key; the ledger's only foreign key is to
-- the entity itself.

create table if not exists public.luminari_category_pass_classifications (
  resource_entity_id uuid primary key
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  canonical_id text,
  primary_category text not null check (
    primary_category in (
      'housing',
      'healthcare',
      'legal_civil_rights',
      'cash_assistance',
      'food_nutrition',
      'tribal',
      'safety_crisis',
      'utilities',
      'employment_labor'
    )
  ),
  primary_tier text not null check (
    primary_tier in ('R2', 'R3a_workbook', 'R4')
  ),
  primary_evidence text not null,
  memberships jsonb not null default '[]'::jsonb
    check (jsonb_typeof(memberships) = 'array'),
  civic_object_uid text,
  artifact_key text,
  source_locator text,
  before_category text,
  pass_version text not null,
  applied_at timestamptz not null default now()
);

create index if not exists idx_luminari_category_pass_classifications_tier
  on public.luminari_category_pass_classifications (primary_tier);

create index if not exists idx_luminari_category_pass_classifications_category
  on public.luminari_category_pass_classifications (primary_category);

comment on table public.luminari_category_pass_classifications is
  'Category pass v1 ledger: one row per remainder-population entity classified by the deterministic category pass (tiers R2/R3a_workbook/R4, fidelity-gated), written before the entity update in the same per-tier transaction; the rollback source for the pass. The guarded individual-review ledger (luminari_resource_category_revision_v1) is a separate contract and is not written by this pass.';
