# Workbook parser integration checkpoint

Observed September 12, 2026. PR #634 head before this checkpoint was
`9434646db9a532048f1d509a13d2a885c9a96696`. Its six returned executable GitHub
workflows passed. The outstanding, outdated empty-worksheet review finding is
implemented by `audit_registry_workbook`, which seeds its receipt from the
resolved sheet list and has passing empty/blank-sheet regression coverage.

Current `main` (`f6c7c6e75f5fd9f7dd7e2d8484e7c677a0da702b`, including #638) was
merged into this branch without conflicts. No source checkout was overwritten.

## Additional runtime repair

The audit rejected malformed worksheet structures and invalid shared-string
references, while both runtime parser paths could still accept the same input
as a successfully parsed empty worksheet. Both runtime readers now validate the
nesting/completion of the `worksheet`, `sheetData`, `row`, and `c` structural
subset and reject unresolved shared-string indexes. The streaming reader checks
this subset incrementally; it does not load the full worksheet XML to perform
these checks. This is not a complete XML or OOXML schema validator. Comments,
CDATA and processing instructions are skipped for these structural checks;
that does not certify full cell-extraction support for every XML construct.

The streaming reader now decodes UTF-8 across chunk boundaries with
`StringDecoder`, preserving multibyte characters that previously became
replacement characters when split across chunks. A boundary-aligned regression
fixture verifies the original cell value survives unchanged.

The revised implementations have new immutable parser identifiers:
`fresh_atomic_parser_v1.0.2` and `fresh_registry_typed_parser_v1.2.4`. The typed
engine is `fresh_corpus_reconciliation_v1.2.4`, keeping its new queued runs
separate from the older engine version. Prior receipts are not relabeled.
Typed candidate keys already include parser version, and artifact/run receipts
record their parser version. Atomic content keys remain based on original
source and extracted content, preserving existing content-deduplication semantics.
The corresponding implementation file hashes are recorded in
`workbook-parser-manifest-20260912.json`.

## Original source verification

The recovered workbook was read again from original local source bytes, with
SHA-256 `a8edb63c60d7a7738446260f288b81a89dd5e7844d5c63532f40a3df4552eb12`.

| Reader | Observed result |
| --- | --- |
| Preservation reader and audit | 201 sheets; 74,921 nonempty rows; receipt exactly matches the existing committed sheet-level receipt |
| Independent openpyxl recount | 201 sheets; 74,921 nonempty rows; zero per-sheet count mismatches; no duplicate headers in this source |
| Atomic reader | 74,715 records across 200 sheets; every record retains the input source hash |

These are different accounting contracts. The preservation receipt identifies
74,714 data rows, 201 header rows and six preamble rows. The atomic reader
excludes headers/preambles but treats the first single-column README row as data;
that creates one additional record. `state_registry_policy_alert` has only a
header and produces no atomic data record. This checkpoint preserves those
existing semantics and does not claim that atomic count is the full workbook
preservation count or a count of unique entities.

Validation completed locally: 54 focused test files, 99 passing tests; TypeScript
no-emit check; production client build, server bundle, and health contracts.
The original-source audit also passed after the runtime changes.

## Parallel PR compatibility and release limits

PR #637 was inspected at `0af46fafd412e99d3536cc10ef96b4d81e4050a0`. It remained
a draft. A local `git merge-tree` comparison proves that it conflicts in
`server/services/fresh-corpus-atomic-v1.ts`: imports, the exported workbook-parser
return type, and initialization of resolved sheets/record array. Its reconciliation
reader changes merge automatically. A later integration must retain:

- The workbook resolver, structural/shared-string checks and workbook parser export.
- #637's private downloader, Batch parser, transaction/queue changes and renamed
  `atomic_record` type. The combined workbook signature returns `Promise<atomic_record[]>`.
- The advanced workbook parser versions, rather than restoring the old values.

No #637 code was merged into this branch. No Supabase write, workbook replay,
worker activation, canonical publication or production deployment was performed.
Public consumer integration and workbook replay remain separately unverified.
