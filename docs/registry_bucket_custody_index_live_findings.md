# Lighthouse Registry Bucket Custody Index — Live Findings

## Retrieval boundary

Retrieved live from Lighthouse Supabase project `wepxlinwbjrkqdzkqpar` and source-controlled on branch `agent/lighthouse-registry-bucket-custody-index`.

No raw registry source rows were deleted or rewritten.

## Storage buckets

| Bucket | Objects | Notes |
|---|---:|---|
| `State Enriched Registry bucket` | 137 | State/territory registries, resource directories, deep dives, federal/claim/SOL/benefits overlays |
| `Everything backbone related` | 17 | SQL bundles, workbook, archive, structured JSON/JSONL artifacts |
| `case-documents` | 21 | User/case uploads; private |

## Confirmed substrate state

`corpus_import_queue` contains 157 queued objects from `State Enriched Registry bucket`:

| Status | Rows |
|---|---:|
| `candidates_created` | 124 |
| `pending_bucket_content_scan` | 22 |
| `review_required` | 11 |

The state bucket queue has:

- 145 rows missing `sha256`.
- 33 rows missing `raw_text`.
- 33 rows missing `normalized_text`.

`corpus_artifact_manifest` has 137 manifest rows for the state bucket:

- 117 parsed.
- 0 staged.
- 0 reconciled.
- 0 promoted.
- 137 missing `source_sha256`.

The v3.13 full SQL substrate handoff row is completed:

- queue id: `271`
- source: `Everything backbone related/v3_13_full_substrate_ingest.sql`
- verified SHA-256: `9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be`
- files ingested: 171
- declared records: 36,876
- observed total: 36,876
- target tables: 20
- policy: `staging_only_no_canonical_writes_no_delete`

## Live projection state

The live unified registry projection contains 11,871 rows:

| Realm | Rows |
|---|---:|
| `registry_programs` | 8,694 |
| `nonprofit_registry` | 2,561 |
| `government_benefits_registry` | 556 |
| `legal_aid_organizations` | 60 |

State-directory promotion tables show significant completed canonical targeting:

| Lane | Inserted/enriched rows | Jurisdiction coverage |
|---|---:|---:|
| resource identity groups | 1,776 inserted | 55 jurisdictions |
| organization resources | 1,156 inserted | 52 jurisdictions |
| field information | 1,246 inserted + 295 enriched | 40 / 39 jurisdictions |
| legal | 342 inserted | 51 jurisdictions |
| oversight | 1,264 inserted | 51 jurisdictions |
| workflow | 301 inserted | 55 jurisdictions |
| profile | 716 inserted | 56 jurisdictions |
| portability | 3 enriched | 3 jurisdictions |

## Fixes in this branch

1. `v_registry_resources_unified` now normalizes `registry_programs.created_at` from epoch milliseconds when needed. This fixed 4,606 impossible future timestamps in the live projection without mutating source rows.
2. `resourceDirectoryCompatRouter.getResources` now reads `public.v_registry_resources_unified` instead of returning only operational placeholder surfaces.

## Remaining blockers

1. The storage/materialization worker still has stalled rows:
   - 11 DOCX rows in `review_required` from `storage_materialization_failed`.
   - 20 DOCX rows still in `pending_bucket_content_scan`.
2. `corpus_artifact_manifest.source_sha256` is unpopulated for state-bucket artifacts.
3. `corpus_artifact_manifest` is not yet reflecting staged/reconciled/promoted state for artifacts that already contributed to downstream promotion tables.
4. `sais_resources` remains empty.
5. `registry_deadline_rules` remains empty.

## Doctrine

Do not treat Supabase Storage custody as canonical integration.

Correct chain:

```text
storage object
→ corpus/import queue
→ artifact manifest
→ extracted/staged unit
→ candidate disposition
→ canonical target/projection
→ promotion receipt/accounting
→ frontend/API surface
```

