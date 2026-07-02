# Authoritative Knowledge Landing Reconciliation — Forensic Trace for `source_queue_id = 215`

Date: 2026-07-02

## Verdict

This run did **not** prove authoritative knowledge reached canonical database tables.

The mission is blocked before patching because this execution environment has no configured `DATABASE_URL`. A live trace of `source_queue_id = 215`, candidate rows, verification output, promotion rows, and canonical table insert counts cannot be truthfully produced without database access.

Per the mission hard rules, this report does not guess and does not claim placeholder success.

## Phase 1 forensic trace status

| Stage | Status | Input available? | Output available? | Fields preserved/lost | Code location |
|---|---:|---:|---:|---|---|
| DOCX source row | Blocked | No: DB unavailable | No | Unknown | `public.corpus_import_queue` read path |
| raw extraction | Blocked | No row/bucket metadata for 215 | No | Unknown | `scripts/extract-docx-corpus-queue.mjs` via ingestion-control REST |
| normalized text | Blocked | No `normalized_text` for 215 | No | Unknown | `public.corpus_import_queue.normalized_text` |
| parser | Code reviewed only | No source text for 215 | No trace output for 215 | Unknown for row 215 | `build_candidates()` reads assembled records from normalized text |
| table representation | Code reviewed only | No source text for 215 | No trace output for 215 | Unknown for row 215 | `assemble_benefit_programs()` |
| section accumulator | Code reviewed only | No source text for 215 | No trace output for 215 | Unknown for row 215 | `assemble_benefit_programs()` current/source_lines state |
| field binder | Code reviewed only | No source text for 215 | No trace output for 215 | Unknown for row 215 | field-label detection, continuation, and `merge_field()` |
| candidate payload | Blocked | No candidate rows for 215 | No | Unknown | `registry_entity_extraction_v4` insert payload |
| candidate row | Blocked | No DB | No | Unknown | `public.registry_entity_extraction_v4` |
| verification | Blocked | No candidate row | No | Unknown | `verify_registry_candidate()` |
| promotion | Blocked | No candidate row / canonical DB | No | Unknown | `promote_registry_entity_candidates_apply()` |

## What can be established from code without database access

The current ingestion-control candidate conveyor uses this path:

1. Candidate creation selects ready queue rows from `public.corpus_import_queue` where `import_status = 'ready_for_review'` and `normalized_text` is non-empty.
2. `build_candidates(row)` hashes the normalized text and calls `assemble_benefit_programs(row.normalized_text)`.
3. `assemble_benefit_programs()` creates records from resource headings plus following field labels/values.
4. `build_candidates()` writes `agency`, `phone`, `email`, `website`, `url`, `address`, `eligibility`, `application_method`, `benefit_summary`, `service_type`, `fields`, `field_labels`, `source_excerpt`, and jurisdiction metadata into the candidate payload.
5. `insert_candidate()` inserts the payload into `public.registry_entity_extraction_v4`, including direct columns only when those columns exist.
6. Promotion later joins candidate rows back to `corpus_import_queue` by resolved `source_queue_id` and applies existing verification/promotion rules.

## First-loss point

No row-specific first-loss point can be established for `source_queue_id = 215` without the source row and candidate rows.

The earliest **code-level risk point** is the field-binding boundary in `assemble_benefit_programs()`:

- Field labels with no inline value consume following non-label lines as the value until another label is encountered.
- Generic section labels create a record with `section_context` instead of an entity name.
- A record can remain review-only when classification sees a generic section context, even if useful fields are present.

That is a risk assessment, not a verified loss for row 215.

## Form Signal Extractor comparison

The available Form Signal Extractor implementation in this repo is a stub service. It defines output fields (`submission_url`, `phone_number`, `mailing_address`, `agency_detected`, `workflow_hint`, `jurisdiction`) but its local engine returns empty arrays. There is no superior implemented binding model in the checked-in service to reuse for this mission.

## Database verification status

Because the database is unavailable, the required canonical-table verification cannot be truthfully completed.

| Jurisdiction | resources parsed | canonical rows inserted | review rows | generic labels rejected | URLs preserved | phones preserved | agency names preserved | source excerpts preserved |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Federal Anchor | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| Utah | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| Puerto Rico | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| Rhode Island | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |
| Colorado | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |

## Required next action before any patch

Run the forensic trace with a configured `DATABASE_URL` and capture:

- the `corpus_import_queue` row for id 215;
- raw/normalized text previews around one concrete resource;
- the exact assembled record for that resource;
- the exact candidate payload and candidate row;
- verification output;
- promotion output and canonical table rows;
- before/after counts for source documents, resources identified, canonical records inserted, review records, generic labels rejected, rows lost, rows missing URLs, rows missing phones, rows missing agencies, and rows missing excerpts.

Until those facts are available, patching the binder would violate the Phase 1 instruction to determine the first loss location before patching.
