# DOCX retained copy resolution

The DOCX audit confirmed 91 redundant physical objects in the State Enriched Registry bucket. Their source records have provenance references. Removing those objects previously broke subsequent downloads and caused manifest synchronization to mark the historical sources missing.

`resolve_luminari_corpus_storage_artifact_v1` separates the original source identity from the object supplying its bytes. Original objects take precedence. A missing original may resolve to an existing object in the same bucket only when downloaded SHA-256 and size match and the retained manifest still matches current Storage metadata and update time. An existing changed original cannot resolve to an older generation. Downloaders verify the returned size, ETag and SHA-256 before parsing; errors do not trigger weaker fallback paths.

Source artifact keys, original names, timestamps and provenance foreign keys remain intact. Synchronization treats exact retained bytes as available and prefers physical objects when choosing duplicate representatives. Losing or changing the last valid retained object makes the historical source unavailable again. Private Batch downloads continue to require the server credential, and the resolver is not executable by anonymous or authenticated client roles.

The atomic reader, typed reconciliation, state enrichment reader and legacy DOCX queue extractor use the resolver. Queue rows with already staged raw text or bytes retain their existing behavior. Unregistered queue objects retain their existing download path.

Validation on 2026-09-14:

- 29 focused tests passed, with one pre-existing opt-in test skipped.
- TypeScript compilation passed.
- An isolated PostgreSQL simulation loaded all 422 Registry source records and objects, removed exactly the 91 planned copies, and ran synchronization twice. All 91 reads resolved to the planned retained originals; source identity/version fields and every simulated provenance reference remained intact.
- Live migration `20260914033026` was applied and its exact statement receipt exported. All 439 source records still resolve, including all 422 Registry originals. No objects were removed by the migration.
- Migration ledger parity passed with no missing, unexpected, duplicate or hash-mismatched migrations. Security advisors reported no finding for the new resolver.

Reproduce the behavioral checks:

```sh
pnpm exec vitest run server/corpus-retained-copy.test.ts scripts/lib/corpus-queue-storage-resolution.test.mjs server/batch-source-ingestion.test.ts server/batch-typed-isolation.test.ts server/fresh-atomic-runner.test.ts
pnpm exec tsc --noEmit
python3 scripts/audit-supabase-migration-ledger-parity.py
```

Reproduce the full manifest simulation with exported source rows, Storage metadata and the audited duplicate plan:

```sh
node scripts/verify-docx-retained-copy-plan.mjs SOURCES.json STORAGE.json PLAN.json RECEIPT.json
```

The simulation writes only to an isolated in-memory database. Production physical removals use the Storage API after the application release is verified. The removal receipt must identify each removed object and unchanged retained object, include byte hashes, and confirm every historical source resolves after synchronization. Different generations remain separate sources.
