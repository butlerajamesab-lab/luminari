# Bounded disqualified trait purge — preparation 2026-10-17

## Admission and exact target

Remove only the 99,159 current public.civic_genome_trait rows identified by the complete ordered full-JSON SHA-256 manifest in disqualified_genome_trait_manifest_20261017.json. The nine exact engine names and counts are pinned; NULL, unexpected, changed or additional rows cause refusal. The read-only production preflight passed before preparing this PR. There are 3,048 affected bill identities, no orphan traits, no missing preserved Docket detail-cache rows and no verification-binding rows.

Required deployed code: PR #727/#728 remaining reader/Radar gates and PR #729 both persistent family-resolution gates. Latest verified Render commit before preparation is bb5de27fa8ba9e64e4b881b880c543af8bed0978, including all three. Stored family IDs are preserved, not certified as valid lineage. Selected Rosetta engines are outside this SQL project's scope and are not promoted.

## Atomic guards and conservation

The SQL is one guarded DO statement. It pins both canonical writer/view-retirement ledgers, all ten enabled writer-fence function hashes, owner-only view ACLs, table kind/owner/no inheritance/no rewrite rules, exactly the known NO ACTION incoming FK and empty bindings. It refuses any extra user trigger or any DELETE hook other than the enabled built-in NO ACTION FK check. The existing write guard remains enabled. The protected source tables are SELECT-only; no broad source-table locks stop ordinary Docket updates. Observed concurrent source drift causes rollback.

Only one production data-changing statement is allowed: DELETE from the exact manifest-pinned trait table, bounded to the nine engine names and expected removal count. SELECT on the retired trait table is revoked from application roles; owner forensic control and the write fence remain. No CASCADE, TRUNCATE, history edit, source UPDATE, queue mutation or trigger disable occurs.

Before/after checks retain counts and deterministic two-seed sums of all scalar columns plus JSON stored sizes on bills, bill versions, families, events and Docket detail cache. History retains every original version ID, entity/family link, observed/created timestamps and sealed record_hash. These are bounded conservation checks, not independent raw-byte validation or cryptographic tamper protection. Complete JSON source/history equality is also checked independently in the PostgreSQL fixture. A broad full-JSON production audit exceeded connector time limits and was not used as admission proof. The exact trait deletion manifest itself remains cryptographic and full-row.

No DELETE trigger or cascading dependency can mutate other data, and protected tables are not DML targets. Ordinary Docket source metadata stays writable after the cut. Real role-context reads and derivative INSERT rejection are tested.

## Failure and remaining work

Every drift or failed postflight aborts the transaction, restoring traits and grants; tests force failure after DELETE and inject a protected-source change to prove rollback. There is no operational rollback that republishes contaminated traits after a successful cleanup.

Current bill payloads, contaminated bill-version receipts, sealed historical embedded payloads, other structural stores/readers and Git reactivation paths remain separate. Existing historical hashes must not be silently reused after redaction. This removal is not current-engine validation or new-engine admission.
