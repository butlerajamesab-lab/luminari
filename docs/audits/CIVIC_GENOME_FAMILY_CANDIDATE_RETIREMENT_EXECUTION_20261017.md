# Civic Genome legacy family-candidate physical retirement — LIVE execution receipt

**Date:** 2026-10-17 · **Source authority:** Lighthouse Supabase `wepxlinwbjrkqdzkqpar`
**Result:** **APPLIED — 8,713 disqualified derivatives physically retired**, directly as a guarded DML transaction.

## Authorization and scope
The operator explicitly requested: **“Execute deletions.”** This cut removes only `public.civic_genome_unresolved_family_candidate` records from retired methodology `weighted-confirmed-traits-v2`. It is not a re-ingestion, Rosetta engine change, Docket bill deletion, or Civic Genome architecture reset.

## Exact executable artifact
`supabase/migration_sources/purge_disqualified_genome_family_candidates_20261017_PREPARED.sql` as committed at Git blob `801f4d6091777f8f6f6b237a72fae187d7f26f86` in draft PR #742.

**Important status correction:** Though its source file retains `PREPARED` in the filename, its guarded SQL **was executed and committed in the live project** this turn. It must **never** be replayed against an empty target as an active Supabase migration. The execution used `execute_sql` (DML), not `apply_migration`: **no new Supabase migration-ledger entry was created**. Treat this signed-source Git artifact plus contemporaneous production readback as the operational execution receipt until formally reconciled; do not invent a ledger version.

## Before — independent production evidence
- Count: **8,713**, all `weighted-confirmed-traits-v2`.
- Resolved rows: **0**; none recorded new activity in previous seven days; latest observed candidate September 15.
- Incoming FK dependencies: **0**; noninternal table triggers: **0**.
- Ordered row-ID SHA-256: `200aa0159005c2900021593119c08cfb6ccd2489ab0f227bcaa03ff1bc659784`
- Ordered full-row SHA-256: `fbe7f0a79fcf4bbd8399d1c241b595e6d13e39b4da327406cc30be61b2a69e77`.
- Matching immutable production SHA hashes also appeared in the pre-reviewed SQL. The same transaction demanded every source-protection check, and raised on any drift.

## Execution and after
The exact reviewed `BEGIN ... DO ... COMMIT` block returned successfully. The transaction's internal count/full-row hash and source-conservation checks passed.

Subsequent independent `SELECT` readback returned:
| Surface | Rows | Outcome |
|---|---:|---|
| `civic_genome_unresolved_family_candidate` | **0** | 8,713 obsolete derivatives physically removed |
| `docket_bill_source_document` | 38,498 | source preserved |
| `docket_bill_detail_cache` | 13,769 | source preserved |
| `civic_genome_bill` | 39,408 | identity rows preserved |
| `civic_genome_family` | 35,203 | family identity preserved |
| `civic_genome_event` | 265,446 | event population preserved by within-transaction conservation check |

The source and Genome tables were **not** targets of UPDATE or DELETE. The SQL had no CASCADE, no dependency bypass and no engine execution. Counts outside the transaction can change legitimately via unrelated activity; the pre/post counts compared *inside* the transaction were equal.

## What is **not** retired yet
- 3,082 current bill payloads with old Rosetta assembly/receipt fields.
- 9,428 bill-version extraction receipts and processing queue rows; 20 leases still need a governed retirement after permanent conveyor shutdown.
- 104,741 contaminated sealed historical bill snapshots, which also contain legitimate timestamped source history and cannot be silently rewritten.
- Dormant engine-specific readers, replays and old runtime implementation paths remain governed by separate draft PRs.

**Do not treat this completed candidate purge as clearing any other contamination surface, and do not replay it.**
