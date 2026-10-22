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
2. The selected `current_target_v1` requires `identity_valid`,
   `engine_identity_valid`, and `read_identity_valid` all exactly `true`,
   plus `installed_ruleset_sha256 == ruleset_sha256`. Validate nonempty
   `ruleset_version`, SHA-256 `ruleset_sha256` and `read_contract_sha256`,
   and valid `selected_at`. A missing or false identity, absent hash, or
   installed-hash mismatch fails closed with a named V12 rejection.
3. Keep `hold_receipt` and `failure_receipts` visible with state `held` or
   `failed`. Never substitute a previous decomposition. Only
   `decomposition.outcome='decomposed'` can continue.
4. Each unit must be within source text bounds with
   `source_text.slice(raw_start,raw_end)===raw_text`. Offsets are treated
   as JavaScript string slice units; incompatible Rosetta offset semantics
   fail closed, and require a documented cross-runtime agreement.
5. Compute a local SHA-256 over the exact JSON output projection
   `{decomposition,sections,units,markup_events}`. Compare it with a separate
   source/ruleset/output-bound V12 certification receipt from the dedicated
   read-only endpoint. If absent or mismatched, reject. Receipt availability
   in live Rosetta is not implied by the fixture tests.
6. The reader preserves Rosetta R, but the derived canonical-layer projection
   includes only H/W/A/O/D. No R-containing Genome publication is implemented.

All failures are named `rosetta_v12_*`; HTTP 404, HTTP 410, and timeout have
distinct codes. Any absent certification produces rejected, not admitted.
Even a hypothetical fixture admission cannot trigger a Genome assembly.

## Corrected V12 current-target mapping (not applied)

Rosetta's verified live `current_target_v1` has **no** separate
`engine_version` and **no** `validation_test_name`. Those cannot be
invented by Lighthouse. The following is the exact contract implemented by
`map_v12_live_target_for_genome`:

| Lighthouse field | Verified Rosetta input | Rule |
|---|---|---|
| `engine_version` | `target.ruleset_version` | Same V-series ruleset identity, no separate engine version |
| `rule_set_version` | `target.ruleset_version` | Exact nonempty string |
| `rule_manifest_hash` | `target.ruleset_sha256` | Valid SHA-256 |
| `promoted_at` | `target.selected_at` | Selection-time timestamp |
| `read_contract_sha256` | `target.read_contract_sha256` | Exact read-contract SHA-256, retained in admission receipt |
| `installed_ruleset_sha256` | `target.installed_ruleset_sha256` | Must equal `ruleset_sha256` |
| `identity_valid`, `engine_identity_valid`, `read_identity_valid` | The three live target flags | All must be exactly true |
| `validation_test_name` | **No Rosetta source** | Never fabricate or populate for V12 |

The V12 mapper refuses an incomplete or invalid target and also checks
against the source-bound admission receipt, including
`read_contract_sha256` and installed ruleset hash. The old Lighthouse
`civic_genome_observe_rosetta_generation_target_v1` RPC has a required
`validation_test_name` and **cannot be reused** for V12.

The sync function references a **proposed** V12-specific observer:
`public.civic_genome_observe_rosetta_generation_target_v12`. It is **not
installed or called in this PR**. The SQL design lives outside the executable
migration tree at
`supabase/proposals/20261020_civic_genome_rosetta_v12_target_observer.proposal.sql`.
It proposes nullable `validation_test_name`, dedicated read-contract and
installed-hash fields, exact identity flags, and strict monotonic selection.
An additional approval and SQL write-quarantine review are required before
applying it. With `is_genome_rosetta_publication_quarantined()` returning
`true`, target-sync returns before any source read or database write.

No `rosetta_current_generation_v1()` call is made. No generation target is
selected by this PR.

## Proposed append-only ledger
`supabase/proposals/20261020_civic_genome_rosetta_v12_admission_receipt.proposal.sql`
is deliberately **not** under `supabase/migrations`. It stores bill-version,
source key/id/hash, target ruleset/hash/selection, local output SHA-256,
certification SHA-256, `read_contract_sha256`, installed ruleset SHA-256,
admitted boolean, state, reason and held/failed evidence.
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
- Independent V12 certification availability, canonical output hash encoding,
  and byte/character offset semantics require separate verification. The V-series
  has no separate engine-version or validation-test-name identity.
- The V12 target observer SQL and its surrounding database write quarantine
  remain unapplied; the installed legacy observer cannot accept V12 provenance.
