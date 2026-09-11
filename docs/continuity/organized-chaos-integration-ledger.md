# Seed preservation and governed reconciliation ledger

Observed 2026-09-11. This work connects private Batch artifacts to the existing source substrate and an admin-only runtime reader, and prepares bounded canonical reconciliation previews. It does not authorize a production import or establish full public-consumer integration. Atlas owns canonical creation/promotion; Lighthouse reads and governs existing canonical objects.

## Source preservation

`scripts/build_registry.py` produces a local SQLite observation registry from explicit SQL, JSON, JSONL, NDJSON, CSV, XLSX, DOCX, Markdown/text, HTML, MJS and ZIP inputs. DOCX uses the same Node parser as the Batch worker; install the pinned project dependencies before running the Python scripts. Executable files are retained as source text, never executed. Raw artifact hashes and source paths identify origins. Duplicate artifact bytes receive separate manifest entries; this does not assert that different artifacts describe distinct canonical entities.

SQL literals with doubled apostrophes, comments, arrays and dollar quoting are parsed. Decimal/exponent lexemes remain exact source text; unsupported target conversions are held for an explicit adapter. Unsupported statements/expressions fail the build. Schema/transaction declarations are not counted as data records. XLSX relationships resolve relative and absolute targets; inline/shared strings, physical row coordinates, header/data/preamble roles and empty worksheets are retained. Unsupported files and archive members fail rather than disappear. A failed build preserves the preceding output and writes an error receipt beside it.

The original workbook `luminari_resource_directory_v3_13.xlsx`, SHA256 `a8edb63c60d7a7738446260f288b81a89dd5e7844d5c63532f40a3df4552eb12`, was replayed through both repaired parsers: 201 sheets, 74,921 nonempty rows, comprising 74,714 data rows, 201 headers and six preamble rows. This verifies that artifact, not the approximate 450-table/80,000-row corpus claim. The Python parser is separate from #634's TypeScript parser.

`record_correlation` and `v_registry_coverage` contain keyword route hints only. They do not call routes, establish canonical identity, or prove a reader serves a record. Run timestamps are observation metadata; binary-identical SQLite output is not promised.

## Existing-schema reconciliation

The earlier importer guessed tables and conflict keys, flattened incompatible sources, and could erase fields through sparse upserts. It has been replaced by a rollback-only preview requiring `--bindings` and `--receipt`:

```sh
python3 scripts/advocacy_lane_import.py \
  --source-root /preserved/source_directory \
  --bindings /reviewed/reconciliation_bindings.json \
  --output /review/advocacy_preview.sql \
  --receipt /review/advocacy_preview_receipt.json
```

Every source listed in the manifest must exist with the specified SHA256. Every selected record needs a stable explicit source record identity, JSON pointer, record hash, existing canonical primary key, identity evidence, observed existing values and field mappings. ZIP members are addressed through their exact member names, with JSON-pointer escaping where required. SQL sources expose parsed records grouped by original table name. JSONL/NDJSON and CSV members are read directly.

The manifest explicitly bounds the preview; it does not implicitly select the full corpus. `scripts/seed_pipeline_test.py::reconciliation_fixture` supplies an executable example using the actual legal table contract: source `caseName` maps to `case_name`, `holding` to `summary`, and lists to the verified JSONB `domains` and `key_quotes` columns. Original source values remain at the input boundary; canonical fields are explicitly named in snake_case.

The preview validates the checked-in observed schema snapshot again in PostgreSQL, locks the identified existing row, checks expected values, and fills only null/blank fields. Existing nonblank conflicts, missing inputs, changed hashes, incorrect keys, duplicate target bindings and unsupported conversions stop generation. Missing fields are never unioned into null assignments. It creates no tables or identities. It emits source/canonical readback receipts and always ends with `ROLLBACK`.

| Family | Observed existing home | Identity requirements still to resolve for full replay |
| --- | --- | --- |
| Case law | `public.legal_case_law` | UUID `id`; citation evidence; explicit field adapter |
| Legislators | `public.legislator_contacts` | Integer `id`, `full_name`; resolve SQL/ZIP identities |
| Agencies | `public.coalition_agencies` | Existing text `id` |
| Coalition organizations | `public.coalition_advocacy_orgs` | Existing text `id`; do not merge the 49/50 sets by name alone |
| Advocacy organizations | `public.advocacy_organizations` | Existing integer `id` |
| Targets | `public.advocacy_targets` | UUID `id`; `target_id` is not a unique conflict arbiter |
| Coalition networks | `public.advocacy_coalition_network` | UUID `id`; candidate home requires ownership reconciliation |
| Media | `public.media_outlets` | UUID `id`; verify source-to-existing identity |
| Campaigns | `public.active_campaigns` | UUID `id`; verify source-to-existing identity |
| SAIS resources/routing | Existing `sais_import` staging relations and `public.sais_resources` | Resolve import-run/source-document ancestry and approved promotion boundary |

Table existence is evidence about structure, not authority to choose that home. Full-family bindings and promotion decisions remain open. Do not introduce the absent guessed public tables `sais_routing_items`, `coalition_networks`, `reform_media_outlets` or `reform_campaigns`.

## Batch and DOCX integration

The original files have now been opened and replayed. The inventory comprises 203 Batch objects (8,374,142 bytes): 199 direct private downloads and four size/ETag-matched reference copies. All 44 ZIP copies were opened. Of the 134 DOCX files, 68 SAIS/pipeline/category copies contain 472 resource-ID occurrences representing 451 distinct IDs. The supplied 248-row SAIS NDJSON excludes 203 main-document IDs; ingesting that export alone is insufficient.

This PR now includes:

- A migration extending the **existing** `sync_luminari_corpus_source_manifest_v2()` selectors to `Batch`. Duplicate classification uses downloaded SHA256 instead of ETag/size alone. The migration creates no canonical tables, changes no bucket visibility, and performs no import or download.
- The mounted admin procedure `batch_sources.queue_batch_source_observations`, which synchronizes the existing manifest and queues only explicitly selected active Batch artifact keys. Registration does not place Batch into the legacy queue's automatic SQL execution/promotion actions.
- Authenticated private Storage downloads using the existing server service-role environment configuration. Redirects are rejected; byte size, available ETag and previously known SHA256 are checked. Missing credentials or changed bytes fail explicitly. Existing public-bucket readers retain their public download path.
- The existing atomic worker persists records, source hashes, origins and receipts in `luminari_corpus_atomic_*_v1`. Each artifact commits observations and its receipt together; repeated runs preserve per-run origins while deduplicating content records. Explicit scopes are enforced, duplicate origins are retained, and changed manifest versions are rejected. The enabled background worker resumes bounded yields and later queued work.
- One shared DOCX parser for the runtime and Python tools, with XML well-formedness checks, complete table/paragraph and package-part receipts, split metadata joins by `resource_id`, native JSON records, incomplete-fragment holds and embedded-image hashes/anchors. Auxiliary Word content parts are preserved. ZIP entries, unknown/failed members and source-only SQL are accounted for.
- The existing dossier compiler now joins split appendix tables and distinguishes numbered routing steps from statutory subsections. All 35 supplied pipeline-document copies compile to the existing `review_candidate_only` contract; its integrity and manual-review requirements remain intact.
- The existing pinned Tesseract engine processes embedded images. The original `Stuff.docx` produced 166 complete native record occurrences (161 exact distinct payloads) and OCR observations for all 29 images. The incomplete native block and every image remain subject to source review. Clipped image text is not reconstructed or asserted complete.
- The mounted admin reader `batch_sources.get_batch_source_lineage`, which reads persisted observations from the existing tables, follows original resource IDs to existing `public.sais_resources` rows, and reports field reconciliation and holds. It exposes `governed_non_public` state, not a public-resource promotion. Errors and unavailable current source versions have nullable counts.

The explicit SAIS adapter maps `family_series` to `family_key`, validates integer document numbers, and compares canonical identity evidence and mapped fields. It does not convert `EC-001`/`PS-001`/`VP-001` into invented integer identities. Pipeline and absent canonical identities remain held for their governed contracts. Nonblank conflicts remain held; the source's `VERIFIED` label does not grant publication readiness.

DOCX reconciliation manifests can bind exact `/resources/<index>` or complete `/native_records/<index>/record` objects. The manifest must retain the original source identity, artifact/record hashes, existing canonical key, observed baseline and explicit field mapping. OCR/raw observations cannot be selected as canonical records. The SQL remains rollback-only.

## Verification and remaining release gates

`docs/evidence/batch_source_integration_2026-09-11.json` records original-source replay and the bounded existing-reader evidence. Source observations include paragraphs, table rows, metadata, repeated origins and receipts; their total is **not** a count of distinct resources.

- All 203 materialized Batch objects replay through the implemented parser, including 44 ZIP copies and all 134 DOCX files. One malformed Word XML source is retained with an explicit hold. The stale `validation_report.json` manifest hashes in `batch_006 (1).zip` and `batch_008 (2).zip` are detected and held. Historical SQL files remain source-only observations pending structured reconciliation; their DELETE/REPLACE statements are never executed.
- The complete local Vitest suite passes: 317 files, 1,613 tests and two opt-in skips. The separate original-DOC6 run passes all nine tests. TypeScript, the production build and the owned-contract guard pass.
- Seventeen Python regressions cover exact source values and governed reconciliation, including complete native DOCX records.
- Behavioral runtime tests cover private authentication, source version checks, split metadata, incomplete fragments, unverified OCR, archive accounting, admin authorization, bounded execution, transactional persistence, duplicate origins, source/canonical identity matching and unavailable-versus-empty states.
- Original DOC6 bytes, SHA256 `3ad4eeb1e0f3a9dbbf79b34c9079c1c9f312d4e0bd1c34563d6dda7cde390325`, pass through the actual worker against an isolated PostgreSQL substrate using the existing migrations. All four source resource IDs are retrieved through the actual admin procedure and reconcile to the observed existing SAIS identities. No canonical rows are created or changed by that worker.
- The earlier synthetic legal test still exercises rollback-only field reconciliation through the existing Legal Library reader, including JSONB typing, sparse-field preservation and stale-baseline rejection.
- Production migrations/imports, authenticated deployed browser traversal, public Legal Library/Benefits readback for the entire corpus, and approval of held source content have **not** been performed. Those remain release/activation work. This is not a claim that all source families have already become public canonical resources.

## Reproducing the original-byte checks

Create a local manifest with `sources: [{source_name, path, sha256}]`. Paths resolve relative to that manifest. Keep the original private files outside the repository.

```sh
node scripts/replay-batch-source-corpus.mjs /review/source_manifest.json /review/replay_receipt.json
```

That replay has no database/network access and does not perform OCR. Runtime OCR uses the same DOCX parser via `parse_batch_atomic_records`; each image records its hash, Word location, engine and unverified text.

The original DOC6 persistence test is opt-in because private source bytes are not checked into Git. `LUMINARI_BATCH_REPLAY_ROOT` names a review directory containing `private-files/<original DOC6 filename>` and a read-only baseline export `sais_doc6_existing_baseline.json` of the four existing resource rows. `LUMINARI_BATCH_REPLAY_RECEIPT` optionally selects a receipt output path.

```sh
LUMINARI_BATCH_REPLAY_ROOT=/review/batch \
LUMINARI_BATCH_REPLAY_RECEIPT=/review/doc6_reader_receipt.json \
  pnpm exec vitest run server/batch-source-ingestion.test.ts
```

For deployment, apply the reviewed migration through the normal release process, provide the existing server Storage credential, and enable `FRESH_ATOMIC_CORPUS_RESUME_ENABLED` only in the background runtime. Administrators queue a bounded list of Batch keys; the web handler performs no parsing, OCR or promotion. Inspect source holds and reader results before any separately governed canonical activation.

## Naming and ownership

New owned contracts use snake_case. Touched atomic worker exports and callers were normalized; the existing `getPool` and `adminProcedure` imports are normalized at their boundaries. Node, Express, PostgreSQL-driver, JSZip, Saxes, Zod, tRPC and Tesseract APIs retain externally required names such as `createHash`, `loadAsync`, `arrayBuffer`, `rowCount`, `createCaller`. The legacy-input field names in preserved original documents are source evidence, not newly invented runtime contract names. No computed-property casing evasion is used. Unrelated legacy naming across the repository is not certified by this PR.
