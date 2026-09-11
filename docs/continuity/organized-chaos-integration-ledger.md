# Seed preservation and governed reconciliation ledger

Observed 2026-09-11. This work prepares source observations and bounded reconciliation previews. It does not establish complete source-to-runtime integration or authorize a production import. Atlas owns canonical creation/promotion; Lighthouse reads and governs existing canonical objects.

## Source preservation

`scripts/build_registry.py` produces a local SQLite observation registry from explicit SQL, JSON, JSONL, NDJSON, CSV, XLSX and ZIP inputs. Raw artifact hashes and source paths identify origins. Duplicate artifact bytes receive separate manifest entries; this does not assert that different artifacts describe distinct canonical entities.

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

## Batch bucket inspection

Lighthouse's private `Batch` bucket contains 203 objects, 8,374,142 bytes: 44 ZIP, 134 DOCX, seven JSON, three CSV, two NDJSON, seven Markdown, three MJS, one HTML and two extensionless files. Inventory and live database inspection were read-only. Private object bytes and archive members were not downloaded or certified in this inspection.

No Batch origins were found in the inspected source manifest, corpus import queue, atomic receipts/origins, or intake artifacts. The deployed source-manifest function selects only `State Enriched Registry bucket` and `Everything backbone related`; the storage trigger queues only the former. The existing atomic downloader constructs public URLs, so private Batch reads also need authenticated storage access.

There are 18 repeated size/ETag groups within Batch, covering 24 extra object copies. Thirty-one Batch objects have size/ETag matches in public buckets with existing manifest entries and content hashes. These are duplicate candidates, not verified byte identities. Some similarly named batch ZIPs have different sizes/ETags. Preserve every origin and verify bytes before deduplicating.

A separate reviewed change must register Batch through the existing manifest, use authenticated downloads, retain member-level hashes and receipts, and reconcile against existing records. This PR does not run that registration or change bucket visibility.

## Verification and remaining release gates

- Sixteen Python regressions check exact extracted values, empty sheets, explicit failures, duplicate origins, metadata retention, typed fields and non-destructive bindings.
- The isolated PGlite test executes generated reconciliation against the observed legal table shape and calls the actual `searchRuntimeCaseLaw` reader. It verifies canonical ID, values, omitted-field preservation, rollback and stale-baseline rejection.
- The runtime test is synthetic and bounded. It does not establish original-corpus identity reconciliation, UI behavior, production persistence, authorization, or deployment success.
- Before full replay: account for every source/member, review family-specific canonical bindings, prove representative original-source hashes through governed persistence and actual readers, and verify the user-facing or governed non-public state.
