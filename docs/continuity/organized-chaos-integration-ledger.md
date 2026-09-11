# Organized chaos integration ledger (issue #383 acceptance gates)

This ledger defines the **authoritative seed corpus ingestion and consolidation flow** for Luminari.

Constitutional boundary from #383 is preserved:

- **Atlas** creates and populates canonical substrate records.
- **Lighthouse** observes, reflects, and governs route-facing read surfaces.
- No downstream UI surface may invent a second canonical state.

## Corpus families (authoritative)

The full seed corpus families are tracked through one reproducible lineage:

1. legal
2. enforcement
3. intake
4. case law
5. weak joints
6. resources
7. workflows
8. signals
9. advocacy
10. coalition
11. legislators
12. agencies
13. targets
14. media
15. campaigns

Legacy compatibility layers remain preserved; they are read-only compatibility overlays and are not promoted as a second canonical spine.

## Build pipeline: registry + advocacy lane

### 1) `scripts/build_registry.py`

`build_registry.py` starts from a spine SQLite database and builds a measurable registry from source-controlled seed files.

It performs:

- quote-aware SQL statement parsing and INSERT row extraction;
- JSON, JSONL, CSV, SQL ingestion;
- XLSX sheet/row ingestion;
- ZIP archive member ingestion for supported embedded file types;
- SHA256 deduplication across all sources;
- manifesting to `source_manifest` and `data_asset`;
- record-to-route correlation in `record_correlation`;
- coverage/index views:
  - `v_registry_coverage`
  - `v_table_index`;
- verification summary output (tables, rows, orphans, uncovered routes, top tables).

### 2) `scripts/advocacy_lane_import.py`

`advocacy_lane_import.py` is the **authoritative advocacy/reform intelligence import lane builder**.

It consumes:

- `sais_escalation_advocacy_registry.json`
- `legal_case_law_priority1.json`
- `20260417095403_023_seed_legislators_agencies_coalitions.sql`
- `lighthouse_legislators_complete(2).zip`
- `coalition_agencies_import_snake_case.json` (31-agency v2)
- `coalition_advocacy_orgs_import_snake_case.json` (50-org canonical)
- `advocacy_organizations_import_snake_case.json` (49-org comparison set)
- `advocacy_targets_import_snake_case.json` (16-target preferred)
- `coalition_intelligence_complete.REPAIRED.json` (media + campaigns)

And generates:

- `supabase_import_unified.sql`

Output sections are emitted in per-section transactions with ON CONFLICT-safe writes for:

- SAIS escalation resources and routing items
- case law
- legislators
- agencies
- coalition networks
- advocacy organizations (canonical dedupe)
- advocacy targets
- media outlets
- active campaigns

## Source-to-table lineage

| Source family | Primary source files | Canonical write tables |
|---|---|---|
| Legal + case law | SQL/JSON family inputs | `legal_case_law`, legal-family registry tables |
| Enforcement | SQL/JSON/CSV family inputs | enforcement-family registry tables |
| Intake | SQL/JSON/CSV family inputs | intake-family registry tables |
| Weak joints | SQL/JSON family inputs | weak-joint registry tables |
| Resources | XLSX + CSV + JSON | resource-family registry tables |
| Workflows | SQL/JSON | workflow-family registry tables |
| Signals | SQL/JSON | signal-family registry tables |
| Advocacy | SAIS + advocacy org imports | `sais_resources`, `sais_routing_items`, `advocacy_organizations` |
| Coalition | 023 + coalition imports | `coalition_networks`, `coalition_advocacy_orgs` |
| Legislators | 023 + zipped directory | `legislator_contacts` |
| Agencies | 023 + v2 agency import | `coalition_agencies` |
| Targets | preferred target import + 023 extras | `advocacy_targets` |
| Media | repaired intelligence JSON | `reform_media_outlets` |
| Campaigns | repaired intelligence JSON | `reform_campaigns` |

## Deduplication and integrity ledger notes

- Dedup identity is SHA256 for raw source payloads in `source_manifest`.
- Duplicate payloads are retained in manifest history and marked as duplicates (`duplicate_of`).
- Advocacy org dedupe rule: **canonical 50-org set wins**, 49-org comparison set only fills missing identities.
- Targets merge rule: preferred 16-target set is baseline; 023 records only add non-duplicate extras.
- Integrity exception tracking (example): batch checksum failures such as `batch_004` are recorded in lineage notes and do not silently promote records.

## Generation lineage taxonomy

- **SQL Family A**: direct SQL seed sources and migration-like inserts
- **JSONL Family B**: line-oriented extracted corpus sources
- **Advocacy lane**: authoritative reform intelligence import builder output (`supabase_import_unified.sql`)

## Correlation routing keywords and runtime routes

`build_registry.py` maps content keywords to runtime route surfaces through `roots_route` and `record_correlation`.

| Keyword class | Runtime route |
|---|---|
| legal, case law | `/legal-library` |
| enforcement | `/enforcement-pathway` |
| intake | `/intake` |
| weak joint | `/diagnostics` |
| resource | `/resources` |
| workflow | `/investigation-workflow` |
| signal | `/signal-registry` |
| advocacy, coalition, legislators, agencies, targets, media, campaigns | `/mission-control/governance` |
| default/unmatched | `/architecture-map` |

This mapping enforces the #383 acceptance gate that a UI count of zero cannot be treated as empty substrate evidence when backing records are present in the canonical ingestion substrate.
