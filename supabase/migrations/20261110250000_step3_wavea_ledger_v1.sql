-- Step-3 Wave A pin ledger v1 (2026-11-11).
--
-- Step 3 (2026-11-10) geocoded 4,514 of the 5,963 step-1 catalog
-- locations through the Census batch geocoder and held 1,449:
-- 768 PO Box mailing addresses (never pinned), 638 No_Match, 42 Tie,
-- and 1 state-conflict. The step-3 held-queue triage
-- (luminari-recovery/step3-triage/REPORT.md, 2026-11-11) classified
-- every held row and proved its repair rules on a 50-row sample:
-- only R-SPLIT-SEGMENT (57%) and R-DROP-PREFIX (47%) earn an apply;
-- the other three rules recovered 0% and are NOT applied. Wave A is
-- the apply of exactly what the evidence supports:
--
--   census_repair                   72 pins — the two proven rules'
--                                   rows re-batched through Census;
--                                   matches gated by state-FIPS
--                                   agreement and, for Non_Exact, a
--                                   street-name sanity check
--   census_tie_zip_state             3 pins — batch Ties whose
--                                   candidates exactly one ZIP+state
--                                   agreement resolves (Salisbury MD)
--   dc_mar                          25 pins — DC Master Address
--                                   Repository matches (DC's own
--                                   address authority)
--   hhs_state_conflict_correction    1 pin  — the held state-conflict
--                                   location: state WA -> DC, city
--                                   NULL -> Washington, coordinates
--                                   from DC MAR (MAR_ID 291713). The
--                                   ENTITY's canonical_id /
--                                   jurisdiction are NOT touched by
--                                   this wave (a separate decision).
--
-- This migration creates ONLY the wave ledger. The runner
-- (scripts/apply-step3-wave-a.mjs) writes one ledger row per pin
-- BEFORE updating its location, in the same per-class transaction;
-- the location update is guarded by latitude IS NULL (plus, for the
-- correction row, state = 'WA' AND city IS NULL). The ledger is the
-- receipt and the rollback source: it records the new coordinates
-- AND the location's prior coordinate_quality / geocode_source /
-- state / city, so a rollback restores the exact prior row (for
-- pins: latitude/longitude back to NULL and the prior quality /
-- source / state / city restored; ledger rows stay as the record).
--
-- No document-family contract row is registered here, for the same
-- reason as the naming-repair ledger (20261110220000): this wave
-- inserts no entities and sets no source_family_key — it updates
-- existing locations in place and records the updates in a
-- standalone ledger whose only foreign key is to the location
-- itself.

create table if not exists public.luminari_step3_wavea_pins (
  location_id uuid primary key
    references public.luminari_resource_locations(location_id)
    on delete cascade,
  resource_entity_id uuid,
  pin_class text not null check (
    pin_class in (
      'census_repair',
      'census_tie_zip_state',
      'dc_mar',
      'hhs_state_conflict_correction'
    )
  ),
  repair_rule text check (
    repair_rule in ('R-SPLIT-SEGMENT', 'R-DROP-PREFIX')
  ),
  latitude numeric not null,
  longitude numeric not null,
  coordinate_quality text not null,
  geocode_source text not null,
  matched_address text,
  evidence text,
  old_coordinate_quality text,
  old_geocode_source text,
  old_state text,
  new_state text,
  old_city text,
  new_city text,
  manifest_sha256 text not null,
  plan_version text not null,
  applied_at timestamptz not null default now()
);

create index if not exists idx_luminari_step3_wavea_pins_class
  on public.luminari_step3_wavea_pins (pin_class);

comment on table public.luminari_step3_wavea_pins is
  'Step-3 Wave A ledger: one row per held step-1 location pinned by the proven repair rules (Census re-batch), ZIP+state-resolved ties, DC MAR, or the HHS state-conflict location correction. Written before the location update, in the same per-class transaction; the rollback source for the wave.';
