# Exact current-result handoff: September 16, 2026

## Changes in this revision

The consumer requires the exact Docket source key and content hash before reading assembly data. A document ID or extraction run alone cannot select the source. It first reads the compact current-result endpoint, rejects non-ready statuses, then requests only the selected extraction run and checks its identity, output hash, engine, rules, manifest, and configuration. Missing exact data cannot fall back to the latest document run.

The public response validator rejects complete-without-result, non-complete-with-result, non-admissible results, invalid run IDs, and timestamps without a time zone. Coverage accepts only the five named layers with status, optional reason, and optional validation timestamp. Validation summary accepts only terminal and validator count. Unknown nested fields are rejected, preventing attempts and historical payloads from entering through extensible objects. The merged main-branch separation of published snapshot/history remains in place; the compact UI uses “Decomposition complete.”

## Paired implementation and deployment gates

- Rosetta PR #122 now implements a dedicated compact endpoint backed by an exact-key/hash projection. Its internal writer validates authorized source-route ancestry and terminal evidence. Public reads do not scan attempts, cohorts, or historical validation.
- Current assembly uses `/api/internal/current-docket-structure`, authenticated by `ROSETTA_CURRENT_HANDOFF_TOKEN`, rather than the public-generation view. Its key/hash/run/output selector must still match the producer's current projection; a changed selection fails closed.
- The producer and consumer enforce named coverage fields and a compact validation summary. Unknown source identities are represented only as unavailable, with no fabricated registry UUID.
- Deploy the database migration and Rosetta producer first, configure the shared server-only handoff credential, verify the projection and its live cost, then deploy the consumer. Complete executed CI/review and a real persisted assembly trace before calling the integration closed.

Do not deploy the consumer alone. No engine promotion or source processing rerun is part of these paired revisions. Projection refresh is separate from source processing and never runs on a public read.

## Verification

Focused consumer, assembly, and UI tests cover the exact selector, non-ready statuses, receipt mismatches, malformed responses, timeouts, and the absence of document fallback. Assembly-entry tests prove that blocked results do not read assembly data and a ready result selects only its exact run.

These are local contract tests, not proof of a live end-to-end handoff. The final acceptance test must trace one Docket key/hash through the authorized Rosetta result, matching structural export, persisted Genome assembly, and displayed version.

## Producer activation and caller reconciliation

Rosetta PR #122 merged as `f6aaec29674ca4c588db5588eeb4e43a8565db86`.
The production migration ledger assigned `20260916180622_current_docket_projection`
to repository artifact `20260916173855_current_docket_projection.sql`. This is an
explicit deployment identity mapping; no historical migration was renamed.

The live public compact API returned `complete` for `text:1921589:3249036`,
source SHA-256 `7c914b0e52aadac78ff21293dd5d4ffc6c780f2691b2b0da18c4b81471deb9dd`,
run `1004769`, output SHA-256
`0253ed403fe2570cef14db3ffdf8cd91c090b43da5a57852bb5dbd1bf2fd5b46`.
The result has all five terminal layers and exactly nine passing validators.
This is candidate read-model activation, not canonical generation promotion.

The consumer now requires exact key/hash at assembly entry points. Existing queue
jobs resolve a unique persisted local binding before requesting a Rosetta result;
ambiguous bindings stop for review. Administrative backfill and startup activation
must supply explicit source selectors. No result lookup falls back to document ID.
The local binding query no longer filters on its historical extraction-run pointer.

Legislative-version processing ingests source bytes, then consumes the compact
current result instead of invoking the old extraction engine. Missing current
results retain their explicit status and hold the queue without consuming another
attempt. Held jobs require explicit reconciliation before resumption. The stored
current receipt does not invent a historical run-version or replay flag.

Still required: finish consumer review/CI, merge/deploy #667, verify the private
structural handoff, persist the exact assembly, inspect the displayed Genome record,
and activate a cost-checked bounded projection refresh worker. Existing generation
upgrade/legacy extraction workers need further review before claiming all ingestion
paths follow the current one-pass execution model. The public authority remains
v2.5.11 until separate governed promotion succeeds.
