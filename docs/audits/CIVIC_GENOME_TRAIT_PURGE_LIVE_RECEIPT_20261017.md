# Disqualified Genome trait purge — live receipt, 2026-10-17

## Result

99,159 disqualified public.civic_genome_trait rows were physically deleted. Independent production readback at 2026-10-17T02:11:59.011967+00:00 reports zero traits, zero verification-binding rows and no application SELECT access to the retired trait table.

Supabase assigned migration 20261017021051_purge_disqualified_genome_traits_20261017 in Lighthouse project wepxlinwbjrkqdzkqpar. The first request in this session returned an expired-request error; readback showed no ledger, no active purge and all traits still present. A fresh request using the identical reviewed SQL succeeded. This is a completed purge, superseding the canceled/unapplied state recorded in PR #733.

## Exact source and deployment

- Reviewed package: merged PR #732, commit 863bbf68f31864b229d4aedff2790cd71bc5aa93.
- Reviewed/prepared source: supabase/migration_sources/purge_disqualified_genome_traits_20261017.sql.
- Exact source Git blob: 96b7e647e00719e79899052d8bfaafe3482726b5.
- Exact executed SQL archive: supabase/verification/applied/20261017021051_purge_disqualified_genome_traits_20261017.sql; identical production bytes/blob.
- Canonical empty-state replay variant: supabase/migrations/20261017021051_purge_disqualified_genome_traits_20261017.sql; Git blob 65715cbd21195a5103d20f47ae4b78c15e523d1d, MD5 3ff8e77d87c695e516c994dd50e661c5. This distinct file was not the SQL executed in production.
- Production ledger: 1 statement; 22038 characters; MD5 d8cc8bd7ec06d2c9884d451050528d48; ordered array MD5 9dbc5f3a8cd4b67014f1ec8f28c02a6b.
- Pre-apply Render deployment: 46004a6e4eac6f3f32a6c582dce0f24024dc067b, dep-db9cjejm8hqs73ad1e2g, live at 2026-10-17T01:06:50.342480Z; includes PR #732 and all earlier reader/family gates.

The guarded SQL required the complete ordered pre-purge trait-row SHA-256 4c1ee67896649daee438bdc847da6dbef71f5eea37a2186d51f617ad6f170f0c, all nine exact engine names/counts, empty bindings, the sole NO ACTION FK, no delete side-effect hook/rule/inheritance, both canonical fence ledgers and all ten pinned enabled writer-function hashes. The final read-only preflight passed without DML immediately before retry.

## Independent conservation observations

Before/after count and two-seed metadata checks match exactly for:
- bills: 39,408;
- bill versions: 38,498;
- families: 35,203;
- events: 265,446;
- Docket detail-cache source records: 13,769;
- projection history rows: 520,443.

The manifest compares all scalar columns and stored JSON sizes on the first five surfaces; history compares version IDs, entity/family links, observation/creation timestamps and sealed record hashes. It is bounded conservation evidence, not independent raw-byte validation or cryptographic tamper protection. The exact trait manifest is full-row cryptographic evidence. Protected tables were not DML targets; no delete hook or cascading dependency could mutate them. CI separately compared complete source/history fixture JSON, rejected malicious DELETE hooks and forced post-delete rollback.

All ten write-fence trigger names, enabled states and function MD5s remain unchanged. Trait SELECT ACLs now exclude anon/authenticated/service_role; service_role retains existing DELETE/maintenance bits, not INSERT or UPDATE. Live role-context probes denied all three role reads (42501), and a privileged DEFAULT VALUES trait INSERT was rejected by the existing quarantine (55000). No probe mutation was retained. Ordinary Docket metadata continuity was verified in the PostgreSQL fixture, not asserted from a new production write.

Machine-readable exact pre/post observations: supabase/verification/genome_trait_purge_live_20261017021051.json.

## Rosetta boundary and remaining cleanup

Fresh independent Rosetta readback at 2026-10-17T02:12:05.960893+00:00 reports its retired namespace absent; canonical source-content rows 19,464 and document rows 27,700; selected V12 engine/read identities valid with unchanged installed hashes. No Rosetta engine, source table, selected target or hold was modified by this Lighthouse migration.

Still present and quarantined: 3,082 current bill legacy assembly payloads, 9,428 version receipts with legacy engine metadata and 104,741 historical snapshots with embedded legacy assembly. No historical row was deleted or rewritten. These need separate source-reference reconciliation and explicit source-only historical retirement provenance. No engine admission or automatic replay was initiated.

The dedicated PostgreSQL 17 test passed; broad suite retains its three pre-existing failures and the unrelated Viewfinder migration parity/cron replay issues remain. No checks were suppressed. Successful purge rollback means transaction failure restores pre-state; there is no operational rollback that republishes the successfully retired traits.

## HTTP observations and replay limitation

After the purge, GET /api/health returned 200. The first GET /api/docket/search?q=housing&limit=2 returned 500: Render diagnostics at 2026-10-17T02:13:53.322Z record docket_full_corpus_search failing after 5,003 ms at its existing 5,000 ms query deadline (Query read timeout). A repeat returned 200, two preserved source results and explicit structural quarantine; its source query took 3,630 ms at 02:14:20.597Z. The retrieved route SQL reads Docket detail/state caches and source Radar facts. This is one recovered probe, not general performance or intake proof; no timeout or query behavior was changed.

The exact executed production SQL is immutable under supabase/verification/applied/20261017021051_purge_disqualified_genome_traits_20261017.sql. Automatic fresh replay uses the repository's existing REPLAY_ALIAS_RECEIPTS mechanism with an explicit production-ledger MD5 / replay Git-blob pair. The canonical replay variant never DELETEs data: it only accepts an empty trait/binding state with the existing write fence intact, then installs/verifies final application SELECT denial. A populated target is refused and still requires the separate exact manifest-pinned production action. No production SQL or ledger row was rewritten.

The ledger auditor additionally verifies the archived executed SQL against both its original MD5 and Git blob, the actual production receipt, and the exact canonical replay blob. Seven local tests prove missing/changed archive, wrong/duplicate receipt, changed replay and missing alias fail. Dedicated PostgreSQL 17 tests exercise actual empty-state grant retirement, source/history conservation, nonempty refusal and disabled-fence refusal alongside the original strict production-purge tests. Full repository reset still encounters the unrelated earlier cron failure; the added replay case has independent execution coverage and no checks are suppressed.
