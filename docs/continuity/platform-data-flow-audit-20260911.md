# Luminari intake-to-output integration: verified state

Observed September 11, 2026. This is an evidence record, not an end-to-end
completion certificate. A healthy HTTP endpoint, preserved source row, route
label, candidate, governed workflow, and completed output are different gates.

## Repairs and exact source counts

The interrupted SAIS import has been recovered in the existing Lighthouse
`sais_import` schema. Its 26 documents, 192 candidates, 260 routing items, 656
deadline fields and 19 overlap groups now match the inspected seed. Recovery
added 1,126 rows; resource/routing/deadline fingerprints and parent bindings
replay without mismatches. The run is staged, not independently verified or
promoted. See `sais-source-recovery-20260911.md`.

The recovered `luminari_resource_directory_v3_13.xlsx` has SHA-256
`a8edb63c60d7a7738446260f288b81a89dd5e7844d5c63532f40a3df4552eb12`.
Both live-source workbook parsers required XML `Id` before `Target`, although
attribute order is insignificant. The workbook uses `Target` before `Id`.
Before the repair, the production parser emitted **zero rows** for these bytes.
The live source ledger nevertheless says `fresh_parsed`; no typed candidate or
atomic record was found for this exact workbook hash.

After the shared relationship parser fix, the streaming parser emits exactly
**74,921 nonempty rows across all 201 sheets**. An independent openpyxl read
matches every sheet count: 74,714 data rows, 201 headers and 6 preamble rows.
The earlier 74,901 count counted nonempty rows after physical row one; many
sheets have a blank physical first row. It is not an exact business-record count.
The full sheet-level audit is `workbook-source-audit-20260911.json`.

The patch rejects unresolved worksheets rather than treating them as empty.
It fixes both parsers, preserves the streaming path's cells and formulas, and
adds regression fixtures for both attribute orders and missing workbook parts.
It does not itself replay the workbook into production.

## Source-to-consumer gates

| Stage | Observed implementation and evidence | Remaining gate |
| --- | --- | --- |
| Original evidence | Original source artifacts, content hashes and source locators exist. The workbook and SAIS seed were recovered and independently counted. | `LUMINARI_EVERYTHING.zip` could not be opened: invalid central-directory magic. Obtain intact bytes before claiming complete archive coverage. |
| Source preservation | SAIS recovery is complete. Workbook parser repair produces 74,921 rows locally. | Replay the workbook through an isolated, resumable import and compare all 201 sheet counts and source hashes. |
| Typed mapping | Existing `workbookSheetRoute` assigns 72,248 data rows to generic `operator_review`. Only 409 data rows map directly to resource-directory candidates. | Explicit field and relationship mappings must be validated against each source schema. A worksheet name is insufficient. |
| Resource directory | `resource-directory.ts` → `resource-directory-fast-current.ts` → `v_lighthouse_resource_program_catalog_v2`; live summary reports 4,277 listings, 8,740 contacts, 58 jurisdictions, 12 categories. | Test source-specific drill-through, jurisdiction and access requirements before promoting new candidates. Total workbook rows are not a directory listing target. |
| Guided intake | `load_governed_legal_registry()` reads `claim_catalog`, verified `legal_workflow_deadlines`, active `workflow_master` and `workflow_steps`. Exact table counts: 48 claims, 109 deadline rows, 6 workflow masters, 32 steps. | The separate 482-row `workflow_registry` is not this loader's source. Build a reviewed conversion with trigger, step, deadline, jurisdiction and provenance contracts. The 109 count includes all deadline rows, not only verified ones. |
| Intake execution | 16 sessions exist; 4 say `governed_execution_complete`. All 260 observed layer runs are completed/sealed; 5 action-path runs exist. | Status counts alone do not establish correct outputs. Replay representative intake cases against assertions about selected resources, governing evidence and final outputs. |
| Prism | Live `/api/health` reports engine 2.4.0 and ready database and verification boundaries. The Lighthouse problem client signs a versioned observation contract and explicitly preserves `candidate_is_verified_correlation=false`. | Confirm a governed cross-platform receipt for each representative case; detector candidates must not become verified legal conclusions. |
| Rosetta | Live backend capability is valid; deterministic SQL engine and canonical HELP/WORKFLOW/ACCOUNTABILITY/OVERRIDES/DEFINITIONS contracts are advertised. | Its capabilities endpoint explicitly lists legacy gaps, including workflow deadlines and help-program contacts/locations. Preserve Rosetta's native ownership when mapping its results. |
| Atlas / Field Atlas | Atlas health responds. Field Atlas reports real pipeline support and restored signed proof for 36 scanned rows, with zero rejected rows; its declared invariant remains `dry_run=true`, `dispatch=none`. | Readiness is not evidence of a sent referral or executed external action. Test a permitted scenario through its receipt boundary. Field Atlas's project is outside the six projects available through the connected Supabase account. |
| Kaleidoscope | Live `/v1/status` reports 18 durable bindings, 18 snapshots, 261 components and zero projection runs/results. Later pipeline stages remain unpopulated. | Projection and feedback completion are unproven; do not infer them from accepted snapshots. |
| Esquire / outputs | The deployed web entry is `server/index.ts`, not the separate `src/server.ts`. Its `/api/health` responds with the deployed commit. The separate runtime service is suspended. | Verify the intended output runtime and a generated artifact tied to the same case/source/receipt chain. Web health does not prove output completion. |

The 30,250-row state-enriched worksheet is heterogeneous. Its columns include
source keys, resources, workflow steps, deadlines, statutes, jurisdiction facts,
and metrics. Mapping the whole sheet to “resource” would misclassify records.
Likewise, `program_master` and `resource_master` include `jurisdiction_code` and
verification fields requiring explicit adapters, while pass3 workflow summaries
and steps join by source document, jurisdiction and workflow letter.

## Safe replay and release boundary

The current civic-object view selects the latest **completed full fresh run**,
plus enrichment and approved overlays. Marking a partial source-only run as a
completed `fresh_corpus_reconciliation_v*` run could remove current directory
coverage. Use an isolated source-staging run, then validate a complete projection
or a deliberately reviewed overlay before changing the current run selection.

The Render front door is explicitly a web process. Existing runtime policy
requires both a worker role and a per-feature flag for background imports.
The patch preserves those controls. It does not enable heavy import work on the
web process, resume the suspended Esquire service, or change database ownership.

Acceptance for any scenario requires a stable case ID through intake, source
selection, jurisdiction and deadline evaluation, signed cross-platform receipts,
output generation and recorded outcome. A retry must reuse the intended identity
without duplicating a case, resource, referral or artifact. Missing evidence and
unsupported stages must remain visible. External sending requires its own
authorized action; no message or filing was sent in this recovery.

## Validation

- 41 targeted TypeScript tests pass across workbook parsing, queue/startup
  contracts, guided intake, finalization, resource drill-through and Prism intake.
- TypeScript no-emit checking, Vite client build, esbuild server bundle and health
  contract checks pass.
- Five SAIS parser/compiler tests pass and the live source recovery gates pass.
- All seven active platform HTTP health endpoints were checked using their actual
  deployed routes; these checks do not certify an authenticated end-to-end case.

Reproduce the read-only workbook audit with:

```sh
node --import tsx scripts/audit-registry-workbook.ts SOURCE.xlsx NEW_REPORT.json
```

The audit reports existing route labels as metadata, with
`consumer_integration_verified=false`; it does not imply successful delivery to
another platform.
