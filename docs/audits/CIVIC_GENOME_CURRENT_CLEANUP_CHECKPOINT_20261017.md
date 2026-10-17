# Current Rosetta / Civic Genome cleanup checkpoint — 2026-10-17

This checkpoint separates installed containment from prepared deletion. It supersedes earlier next-step prose where that prose still lists the Docket bridge, fourteen invalidation triggers, old namespace or remaining read paths as unhandled. It does not certify a new decomposition engine.

## Fresh production observations

At 2026-10-17T01:03:23.872902+00:00, Rosetta project kjzytnzkkdpdxtqtjlew reports:
- rosetta_v2513 namespace absent (prior completed physical namespace removal).
- Canonical source-content rows: 19,464; canonical source-document rows: 27,700.
- Selected ruleset rosetta-rule-ref-v12, selected_at 2026-10-12T06:20:24.697643+00:00; selected/installed engine and read identities valid, hashes matching.
- Ruleset 0dcbf20bc25197104d52d2dad5b7a56cbe576c5928e3536ac5d7ec5ff6bcabed.
- Read contract 0fba7a298abd713d9ccf925a37716b06000d1b27146d4ade53a246acc73392ea.

These are fresh installed-state/count observations. They are not a new download or independent byte-level validation of the source artifacts. Current V12 remains selected; no new engine was promoted.

At 2026-10-17T01:03:11.923768+00:00, Lighthouse project wepxlinwbjrkqdzkqpar reports:
- Traits 99,159; bills 39,408; bill versions 38,498; families 35,203; events 265,446; historical projection rows 520,443.
- Embedded legacy current bill assemblies: 3,082.
- Bill-version receipts with legacy engine metadata: 9,428.
- Historical bill snapshots with embedded old assemblies: 104,741.
- Four structural views have postgres-only ACLs.
- Separate cancellation reconciliation confirms all ten writer-fence triggers enabled, binding rows zero and no trait-purge ledger record.

## Completed in this cut

1. PR #727: actual unconditional gates before external historical/current snapshot receipt construction and Prism structural context reads. Existing sealed records are not silently rewritten under their original hashes.
2. PR #728: source-only Radar, explicit structural quarantine, preserved velocity/calendar fields; prepared exact four-view grant cut.
3. Production migration 20261017000912_retire_genome_legacy_structural_view_access_20261016 applied/read back: four view definitions unchanged, owner-only ACLs, all twelve actual application-role SELECT probes denied, ten writer fences conserved. Exact SQL and receipt recorded in PR #730.
4. PR #729: both persistent family resolver entries reject before pool/client access or any membership/event/receipt/history mutation. Existing memberships are preserved, not certified as lineage.
5. PR #731 corrected the ledger auditor's Git-blob receipt pin. Production SQL bytes/MD5 were unchanged. Ledger checker reports no missing production migrations or hash mismatches; unrelated Viewfinder parity issue remains.
6. Render confirms 863bbf68f31864b229d4aedff2790cd71bc5aa93 live since 2026-10-17T00:26:49.061332Z (dep-db9c0s142hec73citrh0), including those gates and the prepared purge package.

See CIVIC_GENOME_STRUCTURAL_READ_CUT_LIVE_RECEIPT_20261017.md and CIVIC_GENOME_FAMILY_AUTHORITY_QUARANTINE_20261017.md for the individual boundaries.

## Trait purge: tested and merged, NOT applied

PR #732 merged as 863bbf68f31864b229d4aedff2790cd71bc5aa93. Exact prepared source:
supabase/migration_sources/purge_disqualified_genome_traits_20261017.sql
Git blob: 96b7e647e00719e79899052d8bfaafe3482726b5.

It pins 99,159 complete rows, all nine exact disqualified engine names/counts, empty binding table, sole NO ACTION incoming FK, no delete side-effect hooks/rules/inheritance, canonical write/view ledgers and ten writer-function hashes. Complete ordered trait-row SHA-256: 4c1ee67896649daee438bdc847da6dbef71f5eea37a2186d51f617ad6f170f0c.

Actual preflight passed without DML, including bounded source/identity/event/history conservation setup. PostgreSQL 17 tests passed: full fixture JSON conservation, exact dependency/manifest/fence drift rejection, missing-source refusal, malicious DELETE hook refusal, forced rollback after DELETE, rollback after injected protected-source change, real app-role read denial and ordinary Docket metadata continuity.
https://github.com/butlerajamesab-lab/luminari/actions/runs/38986169231/job/117258031657

The production apply_migration request was interrupted/canceled before a result returned. Independent readback at 2026-10-17T01:02:29.198956Z found:
- no migration named purge_disqualified_genome_traits_20261017;
- all 99,159 traits still present;
- original authenticated/service-role trait SELECT access still present;
- ten write fences enabled.

No purge took effect. Do not create an applied SQL file, invent a migration version or claim deletion from the merged PR or deployment. Renew the interrupted migration approval, rerun the guarded preflight, apply the exact merged SQL through apply_migration, then independently read the assigned ledger version, remaining rows, grants, fences and conservation evidence before recording an execution receipt.

## Remaining recovery sequence

1. Finish the prepared trait removal and exact production receipt.
2. Retire current bill payloads without firing source-registration/lifecycle side effects: UPDATE of structural_dna_json currently reaches both sync_civic_genome_lifecycle_from_bill_v3 and try_register_docket_legislative_version_spine_from_genome. Do not disable those triggers broadly. Preserve ordinary Docket behavior and source metadata.
3. Classify source references before removing mixed receipts. All 3,082 contaminated bills have registered versions. One legacy numeric source-document ID differs while URL/text hash match; sixteen bills lack an exact URL + text hash + byte hash match together in their current version receipts. These are provenance reconciliation obligations, not proof that original sources were deleted. Preserve old source reference identities/hashes on their own provenance; do not erase by a blanket rosetta_ prefix filter.
4. Remove disqualified bill-version certification/assembly metadata while retaining provider/source identities, exact source hashes, predecessor/amendment-base links, chronology and legitimate failure audit. Avoid watched version fields that enqueue jobs; preserve source_content_hash so amendment wakeups are not caused by cleanup.
5. For the 104,741 historical contaminated snapshots, create an explicit source-only retirement/redaction contract preserving original version IDs, chronology, identity links and old sealed hashes as retired provenance. Any source-only payload has its own hash; never reuse the old sealed hash or silently UPDATE append-only history. No historical deletion or redaction is yet applied.
6. Reconcile remaining Rosetta outside-schema wrappers/stores and Git reactivation paths; old namespace absence does not prove every historical mechanism is gone.
7. Independently validate candidate engine/source/rules/read/output bindings, held cases, gold evaluation and migration provenance before admission. Decomposition remains deterministic, with no AI/LLM canonical authority or old-engine fallback.

Protected Viewfinder, Atlas signals and intake provider code/data were not modified by these cuts. The existing unrelated migration-ledger/replay failures and three broad-suite failures remain explicit; no checks were suppressed.
