# Exact current-result handoff: September 16, 2026

## Changes in this revision

The consumer requires the exact Docket source key and content hash before reading assembly data. A document ID or extraction run alone cannot select the source. It first reads the compact current-result endpoint, rejects non-ready statuses, then requests only the selected extraction run and checks its identity, output hash, engine, rules, manifest, and configuration. Missing exact data cannot fall back to the latest document run.

The public response validator rejects complete-without-result, non-complete-with-result, non-admissible results, invalid run IDs, and timestamps without a time zone. Coverage accepts only the five named layers with status, optional reason, and optional validation timestamp. Validation summary accepts only terminal and validator count. Unknown nested fields are rejected, preventing attempts and historical payloads from entering through extensible objects. The merged main-branch separation of published snapshot/history remains in place; the compact UI uses “Decomposition complete.”

## Deployment blockers

- Rosetta PR #122, inspected at `c82a1bfa70994147c5016adefc73ec43085d3925`, adds a field to the historical review response. It does not supply the dedicated `/api/public/current-docket-result` endpoint consumed here.
- The existing Rosetta review reader evaluates attempt and stage history. It cannot simply be wrapped by a public endpoint whose contract explicitly excludes those reads. A bounded exact-key/hash current read model and its authorized writer still need implementation and verification. Selecting the highest engine version is not an authority rule.
- Assembly reads `public.v_civic_genome_law_view_v1`, while the current candidate runs are stored separately. An exact run ID alone does not establish matching storage namespaces. The full receipt comparisons here fail closed, but the candidate structural export still needs an exact-source integration proof.
- The paired producer must implement the strict coverage and validation-summary field allowlists in `shared/rosetta-public-current-docket-result.ts`.

Keep this PR in draft until the paired producer, structural export, and executed CI are verified. Do not deploy the consumer alone. No engine promotion, processing rerun, or production database mutation is part of this revision.

## Verification

Focused consumer, assembly, and UI tests cover the exact selector, non-ready statuses, receipt mismatches, malformed responses, timeouts, and the absence of document fallback. Assembly-entry tests prove that blocked results do not read assembly data and a ready result selects only its exact run.

These are local contract tests, not proof of a live end-to-end handoff. The final acceptance test must trace one Docket key/hash through the authorized Rosetta result, matching structural export, persisted Genome assembly, and displayed version.
