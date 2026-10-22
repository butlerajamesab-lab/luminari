# Civic Genome SQL quarantine — live execution receipt

**Applied:** 2026-10-15, Luminari Supabase `wepxlinwbjrkqdzkqpar` through the Supabase migration action. The migration applied successfully; **no physical data purge**.

**Migration version:** `20261015135444`
**Migration name:** `civic_genome_rosetta_sql_write_quarantine_v1`
**Canonical recorded source:** `supabase/migrations/20261015135444_civic_genome_rosetta_sql_write_quarantine_v1.sql`
**Production ledger statements:** 1; statement MD5 `68ad3ca961b016b0a6a37c94f2861199`.
**GitHub SQL source blob:** `c37547ff07f592ebd00abe9927cea1eeb5ae423d`.
**Luminari Render deployment before SQL:** `f7845261918674270beb445064642d0c318aad29` (live), including future-source-only historical bill snapshots.
**Rollback source:** `supabase/verification/civic_genome_rosetta_sql_write_quarantine_v1_ROLLBACK.sql`. Do not execute rollback without incident justification; it restores legacy write authority.

## Production postflight
- **10** `zz_civic_genome_%` triggers present, all enabled (includes table-name-truncated structural-representation trigger under PostgreSQL 63-byte identifier limit).
- On each of the **five derivative tables** (traits, assemblies, structural representations, source binding, generation target), `service_role` lacks INSERT and UPDATE but retains DELETE. `postgres` remains a privileged maintainer and governance still matters.
- Live SQL negative probes completed: trait INSERT, assembly INSERT, generation-target UPDATE, contaminated historical snapshot INSERT, Rosetta bill-payload UPDATE, Rosetta version-receipt UPDATE all raised the expected SQLSTATE `55000`. The DO-block probe would have thrown and rolled back if any write succeeded.
- Live Docket continuity probes completed: bill `structural_dna_json` provider-only field update and bill-version `receipt_json` provider-only update, each under exception-subtransaction rollback; neither probe persisted a mutation.
- Counts immediately after application: **99,159** old traits; **0** assembly runs; **3,082** current bills with `rosetta_assembly`; **104,741** old bill history snapshots with `rosetta_assembly`; **0** version-to-assembly links. No purge.
- Legacy generation target remains old **2.5.40/V10**; it was **not** replaced or promoted to V12.
- Protected Atlas signals, Viewfinder and intake not modified.

## Open proof obligations
1. Audit/fence `civic-genome-external-snapshot-producer.ts`, `prism-rosetta-structural-context.ts`, and four SQL views that reference legacy trait/assembly data. Existing sealed projection snapshots are preserved; they are not valid Rosetta evidence or publishable fallback.
2. Recheck direct SQL write endpoints, other derivative payload fields, privilege bypasses, and Docket projection live traffic beyond these bounded probes.
3. After readers/writers are comprehensively fenced, execute a separate approved **bounded physical purge** with immutable source conservation, FK checks, exact before/after counts, and no `CASCADE`.
4. Independently attest selected V12 runtime/source/output hashes before reentry. Rosetta engine and source data untouched.
5. The repo-wide migration ledger parity checker has an inherited unrelated Viewfinder migration version discrepancy; this receipt records the new applied SQL without weakening that check or modifying Viewfinder. Full isolated replay also has an inherited missing `cron` schema problem.

**Do not characterize the DB quarantine as the purge, as current V12 certification, or as a complete reader fence.**
