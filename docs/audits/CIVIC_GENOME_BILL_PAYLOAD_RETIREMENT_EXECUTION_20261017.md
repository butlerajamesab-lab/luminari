# Civic Genome bill-payload retirement — production execution receipt

Date: 2026-10-17. Project: Lighthouse Supabase `wepxlinwbjrkqdzkqpar`.

**Status: APPLIED, POST-VERIFIED. DO NOT REPLAY.** This receipt records a successful production execution, not a proposed migration.

## Exact executed artifact
- GitHub PR: https://github.com/butlerajamesab-lab/luminari/pull/746
- SQL path: `supabase/migration_sources/purge_disqualified_genome_bill_payloads_20261017.sql`
- Exact executed Git blob SHA: `ca64e5e46f10277f067925ec4450fc809f34cbfc`
- Contents: 25,233 UTF-8 characters; guarded DO block, initially pinned to 3,082 rows.
- Execution: `Supabase.execute_sql`, direct atomic PostgreSQL statement (NOT `apply_migration`); no Supabase migration-ledger identity was created or claimed.
- Preceding isolated fixture: `Genome bounded bill payload purge` job `117500228677`, SUCCESS, PR head `bc5311161d10923b0abd2c90b286b6a21b42c23f`.
- Previous first attempt (old script) aborted and fully rolled back because physical `pg_column_size()` fingerprints changed for bill metadata during updates. Production diagnostic DETAIL identified ONLY the bill metadata conservation surface. New version uses content MD5 of unchanged six JSONB bill metadata fields in both seeds/both snapshots; exact original/expected full-row SHA-256 checks, all six surface guards and enabled triggers remained.

## Independently verified post-commit counts

| Query surface | Verified |
| --- | ---: |
| `civic_genome_bill` records bearing `rosetta_assembly`, `rosetta_source_receipt` or nonnull `rosetta_extraction_run_id` | **0** |
| Current bills with source-only empty `structural_dna_hash` | **3,082** |
| `civic_genome_projection_entity_version` | **0** |
| `civic_genome_bill_version` rows still bearing old `rosetta_extraction_run_id` | **9,428** (not yet retired) |
| `docket_bill_source_document` | 38,498 |
| `docket_bill_detail_cache` | 13,769 |
| `civic_genome_bill` | 39,408 |
| `civic_genome_family` | 35,203 |
| `civic_genome_event` | 265,446 |
| `civic_genome_trait`, `civic_genome_assembly_run`, `civic_genome_unresolved_family_candidate` | 0 each |

## Post-commit trigger/function restoration
- Three application triggers on `civic_genome_bill` remained installed and enabled.
- Original `sync_civic_genome_lifecycle_from_bill_v3()` MD5: `3aa7a70a64b116272641c70d6d79ea2e`.
- Original `try_register_docket_legislative_version_spine_from_genome()` MD5: `72e6de7ac25173268d226cecf2653bc0`.

## Execution boundary
Never rerun the applied purge to make migration parity pass. No Docket original, current Rosetta rule library, or Atlas/Viewfinder/intake source was deleted. The separately scoped 9,428 version receipts/legacy queues and permanent old-conveyor retirement remain pending and must be verified independently.
