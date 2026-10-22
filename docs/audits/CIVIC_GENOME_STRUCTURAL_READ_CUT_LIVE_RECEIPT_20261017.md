# Civic Genome structural read quarantine — live receipt, 2026-10-17

## Repository and deployment

PR #727 merged as 2a7bffc3332831a0296f5a72d739db504a64311b; Render dep-db99p20ae00c738ld7v0 reported that exact commit live at 2026-10-16T21:53:43.829058Z. Actual-gate tests reject historical/current external snapshot construction and Prism structural context before DB, hashing, fetch or owner lookup. This is code/deployment evidence, not a claim that every downstream consumer was exercised.

PR #728 merged as 73d865d4957ad35f9d039dbcff38bbb5986a633d. Render dep-db9boc61egvs73clegd0 reported it live at 2026-10-17T00:08:46.944422Z before SQL application. Docket Radar now queries source velocity and calendar facts without trait/binding aggregation. Live GET /api/docket/search?q=housing&limit=2 returned 200 and two preserved bills, 2139565 and 2126971, with structural_state=quarantined, explicit reason, drift=[], drift_coverage=false and source Radar fields present. Their velocity counts were zero/calendar NULL, so this probe alone does not prove nonzero facts; the PGlite test executes actual route SQL against nonzero source fixtures.

## Applied SQL and independent readback

Supabase project wepxlinwbjrkqdzkqpar accepted migration 20261017000912_retire_genome_legacy_structural_view_access_20261016.
- Canonical exact file: supabase/migrations/20261017000912_retire_genome_legacy_structural_view_access_20261016.sql.
- Reviewed prepared source blob: 1fc17005d93bd6ece8b50614da58a4fa82cd71cf; exact bytes unchanged at merged commit.
- One statement, 8,684 characters; statement MD5 0dcc197ff30adf74f88ed4d358f572dd; array MD5 2d464a8a5d7d803636ae8902d2214ee5.
- Four original view definitions/owners were pinned and remain unchanged. All four ACLs now contain owner postgres only; no application grants.
- Independent role-context SELECT LIMIT 0 probes failed with 42501 for all 12 view/role combinations (anon, authenticated, service_role). These probes made no data changes.
- All ten write-quarantine trigger names, tables, enabled states and function hashes match their preflight.
- Canonical write-fence ledger 20261015135444 remained pinned.
- Atomic permission cut verified count conservation internally; independent pre/post observation also matches: traits 99,159; bills 39,408; versions 38,498; history 520,443; families 35,203; events 265,446.
- No data deletion, sealed-history rewrite, family reassignment, engine modification or runtime promotion. Owner forensic access remains.

Exact full readbacks: supabase/verification/genome_structural_read_cut_live_20261017.json. Rollback: supabase/verification/retire_genome_legacy_structural_view_access_20261016_ROLLBACK.sql; it restores old access and is not recovery admission.

## Validation and limitations

Targeted CI at a5d4d1e8f7acde2e78490741efe33f8a32de7996: five files/22 tests, TypeScript and production builds passed. PostgreSQL 17 tested real role denial, original ACL restoration, definition/ACL/fence drift refusal, forced post-cut rollback, continued source-metadata updates and blocked derivative INSERT.
- https://github.com/butlerajamesab-lab/luminari/actions/runs/38984651593/job/117253170826
- https://github.com/butlerajamesab-lab/luminari/actions/runs/38984651593/job/117253170988

Full suite after the test correction: 2,443 passed, 3 failed, 1 skipped, identical failing tests to base main: Viewfinder route contract, source-gap exact-text fixture and system-visibility route parity. None suppressed. Migration parity still rejects the unrelated local Viewfinder migration; fresh full DB replay lacks cron at that existing migration. This cut does not fix those issues or prove complete end-to-end source/decomposition validity.

## Remaining cleanup

Family resolution still needs its independent actual-gate cut (PR #729 at preparation time). Direct trait-table privileges/remaining structural consumers need separate consideration. The 99,159 traits, contaminated current bill/version receipts, and 104,741 embedded-assembly historical snapshots are not removed by this permission cut. Retire those derivatives with canonical-source/identity/event conservation and explicit historical redaction provenance. Existing sealed hashes must never be silently reused for redacted JSON. No new engine is admitted.
