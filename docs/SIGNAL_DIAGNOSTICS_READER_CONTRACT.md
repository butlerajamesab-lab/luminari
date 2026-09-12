# Structural Diagnostics reader contract

Structural Diagnostics carries the three-domain architecture through its readers.
It does not promote observations or manufacture institutional attribution from catalog matches.

| Surface | Source | Meaning |
| --- | --- | --- |
| Current Atlas records | `public.live_data_signals`, `is_current` | Recorded candidate/promotion and verification states, independently preserved |
| Signal definitions | `public.signal_registry` | Definition counts, not observed occurrences |
| Institutions | `public.agency_authority_map` | Saved authority references; issue attribution is not established |
| Barrier references | `public.litigation_barriers` | Saved descriptions, authorities and workarounds; a working case route is not established |
| Case barrier alerts | Eligible catalog references | Text matches for inspection; absence of a match does not clear a case for filing |

## Current Domain 3

The existing `dualLens.getLiveSignalsForDiagnostics` and `getLiveSignalSummary`
procedure names are retained. Both require authentication, matching the canonical
artifact readers. There is no fallback to mixed legacy `detected_signals`.

Rows and summaries share the same currentness, exact jurisdiction, exact declared
stream domain, recorded severity, and normalized claim-text predicates. Text search
is a catalog search operation and does not establish a legal relationship. Pages
contain at most 100 records; the total survives an empty or superseded page.
Missing count results raise an availability error instead of becoming zero.

Cards retain canonical record IDs, signal hashes, method versions, recorded statistics,
verification and governance states. Each card links to the same current artifact in
Anomaly Viewfinder. An artifact hash is not an underlying observation payload hash.
Candidate counts are reported separately from `governance_status = 'promoted'`.

## Reference boundaries

Institution names no longer produce issue scores by matching shared words against
signal definitions or barrier descriptions. Compatibility count/score fields are
null, not zero; the response supplies the saved statute and `not_established`
attribution status. The interface shows authority references without ranking blame.

Explicit `ingestion` barrier domains are operational references. They remain
inspectable in the diagnostics panel, outside civic barrier counts and case alerts.
Rows derived from the legacy live-signals pipeline remain labeled reference context
and are excluded from case alerts. No records are deleted or reclassified in storage.
The summary's all-scope barrier catalog count is labeled separately.

Barrier reference panels display saved `leading_authorities` and `possible_workarounds`.
They do not select the first doctrine or statute sharing a word with a barrier type.
Case Resolution reads the same snake_case barrier fields, reports read errors, and
does not treat an empty catalog search as evidence that filing requirements are met.

## Artifact destinations

Legal artifact destination explanations require inspection of the saved check and
source version. Structural binding mismatches can reflect extraction or normalization;
the destination does not transform them into proof of a defect in governing law.
Titles, source references, hashes, rules, statuses, case links and ownership checks
are preserved.

## Verification and scope

Behavioral router tests cover current source selection, protected reads, exact
identity, shared filters, paging totals, unknown counts, reference classification,
and absent institutional attribution. Rendered diagnostics tests exercise the actual
wire adapter, candidate/promotion labels, exact links and sign-out behavior.

This reader repair needs no migration. It does not replay Atlas detections, revise
Prism extraction results, populate convergence records, or replace the parallel
database reconstruction work.
