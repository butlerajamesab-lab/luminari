# VA UI scaffolding — on the legislators pattern

Status: SCAFFOLD, files only. Nothing here is applied to any
database, merged into the Luminari repo, or live anywhere. Drafted
2026-10-30 on Alexander's direction: build the VA interface the way
the legislator slate was built (PRs #756–#759 — see
~/workspace/luminari-recovery/LEGISLATORS-BUILD-BACKGROUND-2026-10-30.md).

## The pattern, in one paragraph

Pull the dataset once into a receipted local baseline. Generate new
tables beside the old schema. Carry provenance on every row. Serve
the page from ONE resolver and ONE card component that answer scoped
questions only — state, then facility type, then city/ZIP — never a
facility dump. Unknown scopes stop at a held notice with the valid
list. The live API's only job after the baseline is reconciliation
on refresh. Ordinary page views draw zero API calls.

## Contents

- `DESIGN.md` — the design contract: flow, resolver procedures,
  card fields, Civic Map integration, phases, open questions.
- `schema/20261030000001_va_facilities_new_format_schema.sql` —
  DRAFT DDL for `public.va_facilities` and
  `public.va_facility_services`, written in the legislators schema's
  conventions. Not applied; application is a gated step.
- `server/va-facilities-router.draft.ts` — DRAFT resolver mirroring
  `server/routers/legislators-router.ts` (raw parameterized SQL,
  public read-only procedures, result caps, held semantics).
- `client/VaFacilities.draft.tsx` — DRAFT page skeleton mirroring
  `client/src/pages/Legislators.tsx` state flow.
- `client/VaFacilityCard.draft.tsx` — DRAFT card mirroring
  LegislatorCard's honesty rules (absent values render as labeled
  gaps, never invented).
- `../stage_va_facilities.py` — transform from the receipted
  baseline pull to staged canonical rows.
- `../staged/va-facilities-staged-2026-10-30.jsonl` + summary —
  the staged set produced from the sandbox baseline (2,591 rows).

## Gates before any of this goes live

Dataset approval → schema application (own approval, with receipts
in the #757 style) → production facilities pull (needs VA
production access, 1–3 months) → page PR. Each is Alexander's call,
separately. The sandbox baseline proves shape; it is not the
production dataset.
