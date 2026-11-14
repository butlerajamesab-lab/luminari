-- Unattributable-row retirements ledger v1 (2026-11-14).
--
-- The bundle-decomposition census (luminari-recovery/
-- bundle-decomposition/REPORT.md) attributed the workbook rows
-- linked to the 122 bundle entities: 927 rows resolve to a program
-- name by identity (directly, or mirrored against the v3_13
-- generation by exact phone/website agreement), and 371 rows do
-- not resolve at all. Those 371 are all (9)-generation rows whose
-- view rows carry no name, no phone, and no website — their only
-- payload is a ZIP-fragment address — so nothing exists to
-- corroborate a mirror against, and the two workbook generations
-- are proven not row-aligned, so positional attribution would be
-- guessing. Their true names exist only in the (9) workbook.
--
-- Alexander's decision (2026-11-14, brief item 3): RETIRE — for
-- bundles whose v3_13 set is complete (every attributed name in
-- the bundle carries at least one direct v3_13 row, so the
-- surviving generation demonstrably covers the bundle's whole
-- program set), retire the unattributable rows with their shells
-- as enumerated degraded duplicates. All 39 affected bundles pass
-- the completeness test, so the enumerated set is all 371 rows.
-- ZIP consistency was measured per row and is recorded as the
-- evidence tier (110 consistent, 0 mismatched, 222 unverifiable
-- because their bundles carry no addresses at all, 39 with no ZIP
-- fragment); the tier is the honest evidence record, not a gate.
--
-- Retirement is bookkeeping only: this ledger enumerates the
-- retired rows so future bundle censuses and decomposition waves
-- exclude them from constituent accounting. No entity, location,
-- contact, or workbook row is created, changed, or deleted; the
-- rows never carried anything person-facing, so no surface moves.
-- Reversal is a status flip to 'restored' on the ledger row (or
-- deleting it); the underlying source rows are never touched.

create table if not exists public.luminari_unattributable_row_retirements (
  id bigint generated always as identity primary key,
  bundle_entity_id uuid not null
    references public.luminari_resource_entities(resource_entity_id)
    on delete cascade,
  -- The transcribed workbook row's object uid ('corpus:<sha256>').
  row_uid text not null,
  sheet text not null,
  row_number integer not null,
  generation text not null default '(9)',
  evidence_tier text not null check (
    evidence_tier in (
      'zip_consistent',
      'zip_mismatch',
      'zip_unverifiable_no_bundle_zips',
      'no_zip_on_row'
    )
  ),
  address_fragment text,
  status text not null default 'retired' check (
    status in ('retired', 'restored')
  ),
  repair_version text not null,
  applied_at timestamptz not null default now(),
  unique (bundle_entity_id, row_uid)
);

create index if not exists idx_luminari_unattributable_row_retirements_bundle
  on public.luminari_unattributable_row_retirements (bundle_entity_id);

comment on table public.luminari_unattributable_row_retirements is
  'Enumerated retirement of the 371 unattributable (9)-generation workbook rows linked to bundle entities whose v3_13 constituent set is complete (Alexander''s decision, 2026-11-14). Bookkeeping only — no entity, location, contact, or source row is touched; reversal is a status flip to ''restored''. Evidence tier records the per-row ZIP-consistency measurement (not a gate).';
