# Supabase migration ledger drift — 2026-09-09

## Scope

This receipt records the migration-history failure affecting the Lighthouse
Supabase production branch and the GitHub `main` migration directory. It is a
reconciliation record, not evidence that the remaining production changes have
already been applied.

## Observed failure

The Supabase GitHub integration for the production branch stopped before
applying migrations with:

```text
Remote migration versions not found in local migrations directory.
```

At `main` commit `7283333efdf249f51bd5b5f27756159810f23bb8`:

- production ledger entries matched by version and name: 477
- production-only versions: 7
- repository-only versions: 27

The production project remained active, but its branch workflow was
`MIGRATIONS_FAILED`. GitHub build/test checks alone did not detect this state.

## Production-only source recovery

The exact ordered statement body for each production-only ledger entry was
recovered into the matching migration filename:

| Version | Migration |
| --- | --- |
| `20260906102726` | `docket_calendar_event_observation_v1` |
| `20260906103011` | `docket_radar_views_v1` |
| `20260906103134` | `docket_radar_views_v1_1_drift_coverage_flag` |
| `20260906105716` | `docket_impact_callouts_v1` |
| `20260906105738` | `case_resource_links_rls_v1` |
| `20260906110233` | `docket_obligation_checklist_v1` |
| `20260906112818` | `docket_radar_views_v1_2_velocity_canonical_source` |

`supabase/verification/production_migration_receipts_20260909_addendum.tsv`
binds the live statement-array checksum and executable-file checksum for every
recovered file. The repository parity audit consumes that addendum.

## Repository-only versions still requiring convergence

Twenty-seven repository migrations are not recorded in the production ledger.
They must not be blindly marked as applied. Their effects are being verified
against production before history reconciliation:

```text
20260815081130  20260815140500  20260816063000  20260816124000
20260817070000  20260817194630  20260818084500  20260818090000
20260818095500  20260818210000  20260820063000  20260821051200
20260821093830  20260821123000  20260821123100  20260821235951
20260822002000  20260822003000  20260822012500  20260822055000
20260822055100  20260822203000  20260826130000  20260829093000
20260829094000  20260905080000  20260905100000
```

Twelve are explicit no-op replay aliases. The others are guarded foundation,
function/view, security, or data-correction migrations. Production and a clean
replay are not structurally equivalent, so ledger repair and schema convergence
are separate acceptance gates.

## Runtime impact discovered during reconciliation

- production public/private relations: 838
- clean-replay public/private relations: 553
- relations with an existence, kind, or column-signature difference: 459
- Render Lighthouse HTTP 500 responses observed from 2026-09-02 through
  2026-09-09: 294 across 60 distinct request paths

These counts explain why source-only unit tests can pass while live surfaces
fail. A clean replay, production ledger parity, and database-backed runtime
smoke checks are all required before the backbone can be declared converged.

## Acceptance gates

1. The seven production-only migration bodies exist in GitHub with matching
   receipts.
2. A zero-state Supabase replay succeeds.
3. Every repository-only version is either applied through the migration path
   or has a verified, explicit supersession receipt.
4. Production and the clean replay satisfy the same active Lighthouse runtime
   relation/column contract.
5. The observed live 500 paths pass database-backed smoke tests.
6. The production Supabase branch workflow is green.

No production ledger row or production schema object was changed while creating
this receipt.

## Production-view convergence repair — 2026-09-10

The GitHub integration reached the pending foundation chain after the ledger
sources were reconciled. The run triggered by main `0672663` failed at
`20260815081130`: `entities` is a canonical production view, so table RLS cannot
be enabled on it. A read-only catalog check also found `unified_resources` is a
view; the subsequent `20260816063000` foundation had the same incompatibility.
The other 21 relations named by the pending foundation migrations are tables.

Neither of those two foundation versions is recorded in the production ledger.
Their source is corrected to keep existing views and apply `security_invoker`,
while enabling RLS and creating service-role policies only for physical tables.
The repository-only checksums are updated explicitly. Applied production
migration sources and production ledger rows are not rewritten or marked as
applied. Preview databases that have already applied the empty-table variant
retain the same table behavior; the new PostgreSQL fixture also executes each
corrected foundation twice against both shapes.

The production backlog before this rollout is 30 migrations, including the
three September 9 repair/hardening versions. Their application and the live
runtime checks remain separate from the successful clean-replay test.

### Recorded signal-view successor

After #616 merged at `13eaf4a`, production applied eight pending versions and
reached 492 ledger entries. The next pending version, `20260818095500`, failed
with `cannot drop columns from view`: its 13-column signal-integrity definition
would remove `live_data_candidate_count` and `live_data_promoted_count`.

Production already records `20260822080454`, whose checked-in definition adds
those two governance-state counts while retaining the original Atlas metrics.
The live view definition matches that successor's projection. The pending
version therefore preserves the successor only when its ledger entry exists
and the current view exposes both bigint counts and their expected source and
governance filters. An inconsistent recorded successor raises an exception.
Fresh replay still executes the original definition in chronological order.
The pending version's repository-only checksum is updated; the applied
successor source and production history are unchanged.

The PostgreSQL fixture checks ordered replay, repeat execution against the
recorded successor without changing its definition or counts, and rejection of
an invalid successor. Fixture ledger entries exist only inside rolled-back
transactions in the dedicated loopback test database.

The preservation guard compares PostgreSQL's complete normalized view definition
with the recorded successor, including every current-row predicate. Regression
fixtures reject historical Atlas, candidate, and promoted rows independently.

### Predecessor storage preflight

The automatic review of #616 completed after its merge and identified two
additional predecessor shapes. The original Drizzle patterns table used UUID
identities and timestamp columns; user workflow tables used quoted camelCase
columns and PostgreSQL enums. An additive preflight migration, ordered directly
before the runtime contract, normalizes their storage while retaining original
values, UUID references, ownership, source citations, and review decisions.
The runtime migration already applied in previews is unchanged.

The UUID fixture retains foreign-key references and verifies original dates and
signatures after two executions. The workflow fixture starts with populated
predecessor tables and checks ownership, nondefault enum values, content, and
timestamps after two executions. #617 must pass these PostgreSQL regressions,
fresh replay, preview checks, CI, and completed review before production resumes.

Review of the first #617 revision also identified the pattern write boundary.
A preceding additive identity migration preserves original UUID primary keys
and inbound references under `source_pattern_id`, adds deterministic numeric
runtime IDs, and retains UUID case provenance under `source_case_id`. New writes
can omit predecessor-only provenance. UUID occurrence links receive an exact
numeric mapping; unmatched legacy integer links retain their original values,
and numeric allocation starts above them to prevent invented associations.
Quoted companion pattern columns are renamed and the predecessor pattern-type
creation default is supplied. The expanded fixture inserts occurrences for
both an existing and a newly created pattern after two migration executions.

### Production compatibility-view dependencies

A read-only catalog check found five `compat` views depending on columns that
still use legacy text/integer types in production: `ingest_runs`,
`ingested_records`, `live_signals`, `remedy_paths`, and
`pattern_aggregation_runs`. PostgreSQL rejects their base-column type changes
while these views exist. The aliases have no additional dependent objects.

An additive type preflight converts these columns and restores each alias in
the same transaction, retaining its projection, owner, options, comments, and
effective table/column grants. It removes privileges inherited during recreation
before restoring the original grants. Original source values remain in provenance
columns, including invalid dates, numbers, and JSON. The regression first proves
the original runtime conversion fails against the aliases, then proves both the
preflight and the actual runtime conversion blocks succeed twice, with unchanged
alias metadata and no privilege expansion. Applied migration files remain intact.

### Existing function argument names

After #617 merged at `71a32c3`, production reached 508 ledger entries. The
pending `20260829094000` bridge migration then failed because the existing
`public.digest(text,text)` uses input names `data` and `type`, while the source
attempted to rename them. PostgreSQL rejects that replacement even when its
input types and return type are unchanged.

The pending source now reads and preserves existing input names for both
bridges and uses positional parameters in their bodies. Function OIDs and
dependent objects survive. Fresh databases retain the intended default names.
Regression fixtures cover both naming conventions, dependent views, named
calls, UTF-8 output, service-only grants, and two applications of the migration.
Its repository-only checksum is updated; production history is unchanged.

### Production immutable-observation backfill boundary

After #618 merged, the native production workflow at 2026-09-10 04:51 UTC
advanced to 513 recorded versions. The compatibility type preflight then
rolled back because `immutable_live_signal_observation` treats newly added
legacy-value receipts as observation changes. The runtime contract remains
pending until this preflight succeeds.

The pending preflight now takes an exclusive table lock, temporarily suspends
only that exact observation trigger, copies the original values and converts
storage, then restores the original trigger mode in the same DO transaction.
Concurrent writers cannot enter during the suspension; failures roll back the
data, alias, and trigger changes together. The immutable-observation function
and its allowed lifecycle fields are unchanged. This pending version's source
checksum is updated explicitly.

The production regression imports the original trigger/function migration,
reproduces the rejected provenance write, and exercises the actual preflight
twice under all four trigger modes. It verifies original values and private
aliases, rejects observation and provenance edits afterward, permits lifecycle
updates, and forces a conversion failure to prove rollback restores protection.
Both workflow path filters also watch the source of the fixture's guard.
