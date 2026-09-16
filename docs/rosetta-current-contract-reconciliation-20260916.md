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
