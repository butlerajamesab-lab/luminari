# Registry source traceability reader gap — 2026-09-12

Inspected application commit `213283d` and live Supabase project `wepxlinwbjrkqdzkqpar`. No product code or data was changed for this finding.

## Existing reader and consumer boundary

`server/registry-db.ts:getSourceTraceability` returns the placeholder `{ jurisdictionId, sources: [], lastUpdated: null }` without querying the database. Its only application call site is `canonicalRegistry.getJurisdiction` in `server/routers/registry-router.ts`, which exposes it as `source_traceability` in the public jurisdiction response. The router is mounted in `server/routers.ts`.

No current client call to `canonicalRegistry.getJurisdiction`, and no client rendering of `source_traceability`, was found in the repository. Benefits Navigator uses `canonicalRegistry.searchPrograms`. Replacing this placeholder alone would change the existing public API but would not establish a verified user interface path. External callers were not inspected.

The table name also appears in panel inventory, canonical-core inventory, export-spine inventory, migrations, and historical audits. Those references do not consume this helper or establish a source-detail drill-through. The canonical ingest writer stores these records, including their source labels and merge context.

## Live source evidence

Read-only query observed **2026-09-12 06:45:04.870496+00**:

| Check | Count |
| --- | ---: |
| `registry_source_traceability` rows | 59 |
| Distinct stored `jurisdiction_id_rst` identities | 57 |
| Direct matches from `jurisdiction_id_rst` to current `registry_jurisdictions.id` | 0 |
| Rows with a nonempty source-document array | 59 |
| Rows with nonempty conflicts | 7 |

The live columns are `id` (text), `jurisdiction_id_rst` (text), `source_documents_rst` (jsonb), `source_variants_rst` (jsonb), `notes_on_merge_rst` (text), `conflicts_rst` (jsonb), and `created_at_rst` (bigint). There is no stored source-document primary key, hash, or update timestamp in this table.

For example, `st_alaska` retains jurisdiction `j_alaska` and document labels `luminari-alaska-registry-1.docx` and `luminari-alaska-registry.docx`. A separate row, `st_ak`, uses the same stored jurisdiction with `pnw-registry-pack.json` and its own merge notes. These are distinct traceability records; neither should replace the other.

The existing `registryJurisdictionJoin` can resolve documented legacy jurisdiction encodings to canonical state metadata, subject to its ambiguity guard. This does not establish source-document identity. Filename strings cannot safely be substituted for canonical source IDs or resolved by guessed filenames, aliases, or names. The creation timestamp must not be represented as a known last-update time.

## Deferred implementation

No new projection or page was added. Before product implementation, identify an existing user or admin consumer that needs this traceability and a source-identity binding supported by stored evidence. Any resulting reader should preserve every traceability row ID, original jurisdiction ID, document labels, variants, merge notes, conflicts, and timestamp; distinguish unresolved source identity from no source information; and avoid manufacturing source links or promotions.

This finding remains open. It does not undo the existing jurisdiction-reader repairs or establish that the attachment consolidation is complete.
