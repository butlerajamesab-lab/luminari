# Rosetta 2.5.13 regression-repair validation — 2026-08-30

Status: **bounded repair validation passed; full sealed-corpus validation is blocked and unknown**.

This report does not claim production readiness, promotion, deployment, or
cutover. Production was queried read-only for provenance/preflight counts and
was not changed.

## Source integrity

- Base repository/commit: `butlerajamesab-lab/luminari` at
  `05327dca408c12b63268ea1c6ef80ee3775bb643`.
- Original root: `rosetta-candidates/20260824-v2513`.
- Original `SHA256SUMS` hash:
  `c91257d43357d8cc740fda145a71284fcf2d4732da6869d6f0091ebe8d123aca`.
- All 125 original manifest members passed before edits; with the checksum
  file, the original directory contained 126 files.
- The captured 2.5.11 closure remains 51/51 byte-faithful.

## Implemented closures

1. C3 masks exact standalone `PAGE n-HOUSE/SENATE BILL` lines while preserving
   projection length and line boundaries.
2. C3 excludes a standalone Louisiana `DIGEST` only when it is followed by the
   authoritative statement that it constitutes no part of the legislative
   instrument.
3. C5 protects a capitalized person-name middle initial in a narrow
   given-name/initial/surname context, with structural-label and sentence-start
   negative controls.
4. C3 and the replay identity boundary reject non-null reference dates earlier
   than `1970-01-01` with SQLSTATE `P1A08`.
5. The separated-transaction test now uses explicit source-registry joins; its
   prior `USING(source_registry_id)` was ambiguous after joining two tables
   that both carry that column.

Generated migrations 06, 08, and 17 were regenerated from `tools/generate.py`.
Migration 12 is not generator-owned and was updated directly.

## Disposable PostgreSQL 17 evidence

Final branch: `rosetta-v2513-regression-repair-final-20260830`
(`gjqoiutzuicocfcbynqu`), PostgreSQL 17.6, data-less and non-default.

- Canonical migration order compiled: 01–10, 17, 11–16, 18.
- SQL tests 01–07 and security test 10 passed.
- Exact fixture hashes for runs 24592/24593 passed.
- Run 24592: DIGEST-derived normative clauses changed from 7 to 0; the
  `David R. Poynter` initial is protected; the annual-report clause remains one
  complete clause.
- Run 24593: surviving page-bill lines changed from 6 to 0.
- Candidate and replay identity gates reject `1969-12-31`; `1970-01-01` and
  null remain accepted.
- Control, C1–C7, and convergence each completed with exact
  source→run→output bindings and nonempty structural output.
- A forced 50 ms timeout finalized as `timed_out`/`57014` with no run binding.

These separate-transaction calls used independent Supabase connector
invocations. They are MCP-equivalent runtime evidence, not a canonical local
`psql` execution of `tests/run_all.py`.

## Full-corpus blocker

Read-only production preflight found every preserved quarantine run ID and its
source text, but the 1,038 IDs map to 1,000 unique source-content IDs. Twenty-five
sources have multiple preserved control runs, accounting for 38 additional run
memberships; one source has eight control runs.

The current immutable schema permits one sealed member and one `control_run_id`
per source (`unique (manifest_id, source_registry_id)`). G10 simultaneously
requires every one of the 1,038 quarantine `control_run_id` values to appear on
a flagged sealed member. Those contracts cannot both be satisfied for the
observed mapping.

No baseline-selection rule or manifest redesign was invented. Therefore:

- the canonical full-corpus worker was not run;
- terminal tallies and complete full-outer diffs are unknown;
- G1–G9 are not full-corpus results;
- G10 is structurally blocked;
- G11 was not requested and no human authorization was created.

## Production state

Production remains PostgreSQL 17.6, registers engine/rules 2.5.11, and contains
neither `rosetta_v2513` nor `rosetta_replay`. No production, Render, promotion,
publication, or cutover write was performed.

Machine-readable details are in
`tests/SUPABASE_BRANCH_REGRESSION_REPAIR_RESULTS.json`.
