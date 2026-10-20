# Lighthouse-only proposal: Civic Genome admission of Rosetta V12
Date: 2026-10-20. Status: **draft / quarantine remains closed**.

## Scope and absolute boundaries
- Repository: `butlerajamesab-lab/luminari` only; no cross-repository edits.
- Rosetta reads only: existing `GET /rest/v1/source_document_content` used by the
  human report and `GET /api/live-rule/:sourceContentId` with
  `contract=rosetta-rule-live-detail-v1`.
- No request to `/api/public/current-docket-result` (retired HTTP 410) and
  no replay, extraction, LegiScan request, generation-target write or production SQL.
- `is_genome_rosetta_publication_quarantined()` is **unchanged: `return true`**.
- V12 admission is NOT permission to publish: the legacy structural assembly
  adapter is explicitly blocked pending separate conversion/review.

## Exact source selector
The existing human-report source-content read is narrowed for admission:
`rosetta_source_document_id` + `source_content_hash` +
`source_metadata.docket_source_document_key` and, if already attached,
`rosetta_source_content_id`. A maximum of two rows establishes cardinality;
zero or two matches reject. Each field is rechecked against the response.
Newest-record heuristics and source-document-only matches are forbidden.

## Ordered checks (named failures)
1. Exact key/document/content ID and source SHA-256:
   `rosetta_v12_source_identity_mismatch`,
   `rosetta_v12_source_text_hash_mismatch`.
2. Selected target must say `identity_valid===true`, and expose exact
   `ruleset_version`, `ruleset_sha256`, `selected_at`.
   Errors: `rosetta_v12_target_identity_invalid`,
   `rosetta_v12_target_provenance_missing`.
3. Keep `hold_receipt` and `failure_receipts` visible with state `held` or
   `failed`. Never substitute a previous decomposition. Only
   `decomposition.outcome='decomposed'` can continue.
4. Each unit must be within source text bounds with
   `source_text.slice(raw_start,raw_end)===raw_text`. Offsets are treated
   as JavaScript string slice units; incompatible Rosetta offset semantics
   fail closed, and require a documented cross-runtime agreement.
5. Compute a local SHA-256 over the exact JSON output projection
   `{decomposition,sections,units,markup_events}`. Compare to a separate
   source/ruleset/output-bound certification receipt. **Rosetta has not yet
   published that certification receipt or read RPC** (inventory 2.22);
   the production provider intentionally returns null. Result:
   `rosetta_v12_certification_receipt_missing`. The receipt type is
   a *proposed matching interface*, not an assertion of a Rosetta contract.
6. The reader preserves Rosetta R, but the derived canonical-layer projection
   includes only H/W/A/O/D. No R-containing Genome publication is implemented.

All failures are named `rosetta_v12_*`; HTTP 404, HTTP 410, and timeout have
distinct codes. Any absent certification produces rejected, not admitted.
Even a hypothetical fixture admission cannot trigger a Genome assembly.

## Proposed target-column mapping, not applied
The existing Lighthouse table and observer (not modified) require this tuple:

| Lighthouse field | Live selected target input | Fail-closed behavior |
|---|---|---|
| `engine_version` | `target.engine_version` | reject if absent; do not assume a V12 engine name from a ruleset |
| `rule_set_version` | `target.ruleset_version` | exact nonempty string |
| `rule_manifest_hash` | `target.ruleset_sha256` | exact lowercase SHA-256 |
| `validation_test_name` | `target.validation_test_name` | reject if absent; certification SHA is **not** a test name |
| `promoted_at` | `target.selected_at` | proposed timestamp mapping, requiring review of selection vs promotion semantics |
| `contract` | `rosetta-rule-live-detail-v1` | fixed identity of the read contract, not a claim about legacy generation RPC |

The live-detail *presentation fixture* previously included
`identity_valid`, `ruleset_version`, and `ruleset_sha256`, but did not
establish `engine_version`, `validation_test_name`, or `selected_at`.
These fields remain **unverified** in production. The mapper rejects missing
values. No `rosetta_current_generation_v1()` call remains in target sync.

A future explicit bill-version selector
`ROSETTA_GENOME_TARGET_SOURCE_BILL_VERSION_ID` is required: arbitrary
latest-source sampling is not authority for a global target. The observer
remains behind both the publication quarantine and the missing certification.

## Proposed append-only ledger
`supabase/proposals/20261020_civic_genome_rosetta_v12_admission_receipt.proposal.sql`
is deliberately **not** under `supabase/migrations`. It stores bill-version,
source key/id/hash, target ruleset/hash/selection, local output SHA-256,
certification SHA-256, admitted boolean, state, reason and held/failed evidence.
It is neither installed nor populated. A separately reviewed SQL write
quarantine fence and receipt writer are required before any rollout.

## Fixture verification
- `pnpm exec vitest run server/civic-genome-rosetta-v12-admission.test.ts
  server/civic-genome-rosetta-evaluation.test.ts
  server/civic-genome-rosetta-generation-target-sync-v12.test.ts`
- `pnpm check` for TypeScript; existing integration/contract suites must run
  before approval. No test uses production database, live Rosetta endpoint,
  or LegiScan.

## Deferred issues (deliberately not fixed)
- The old structural assembler and operating-status adapter still contain
  legacy current-result assumptions. Their reader export now fails closed;
  separately migrate those consumers instead of reviving the retired endpoint.
- Existing reconciliation SQL and historical tests refer to legacy
  `rosetta_public_current_docket_result_*` queue hold codes. No database
  migration or historic row conversion has been attempted.
- Rosetta's independent V12 certification interface, canonical output hash
  encoding, byte/character offset semantics, and trustworthy target-engine
  and validation-test identities have not been proved at this boundary.
