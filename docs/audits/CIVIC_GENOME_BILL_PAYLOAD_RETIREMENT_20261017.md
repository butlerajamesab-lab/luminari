# Current bill payload retirement — prepared, not applied

Baseline: merged trait-purge receipt #734, main `8a368025b09cbb03281760427d711c576cd23041`. Traits remain physically absent. This cut concerns only 3,082 current `public.civic_genome_bill` rows. It does not retire the 9,428 bill-version receipts or rewrite 104,741 sealed historical snapshots.

## Independent source reconciliation

The read-only Lighthouse census extracted exactly six source-reference fields from each old receipt: source URL, source version, text hash, byte hash, identity hash and provider hash. All 3,082 tuples have exactly one six-field match in the separate Rosetta project's `public.source_document_content`. SHA-256 recomputation of each matching stored `source_text` equals its recorded `source_content_hash`. Each old assembly source-document ID also agrees with its canonical source-content row.

The source-only manifest is `supabase/verification/genome_bill_source_reconciliation_20261017.json`. It retains those six historical reference fields, original bill identity and canonical content/document IDs, not engine outputs or certifications. These are stored-source consistency findings, not independent re-download or original-artifact byte proof.

Sixteen bills do not have one registered version receipt simultaneously matching the old URL/text hash/byte hash. Eight Massachusetts/New York examples retain different historical byte hashes; eight Vermont examples retain provider URLs while version receipts use official URLs. All sixteen historical tuples still match Rosetta canonical storage exactly. Do not overwrite these differences or substitute a text match for byte identity. The manifest records the version alternatives.

DC B26-0775 additionally has an older assembly source ID 5329 while its matching registered bill version names 984. The historical source tuple resolves to canonical source ID 5329. Numeric IDs are not interchangeable proof of document identity. No version/source mapping is changed by this cut.

## Exact permitted change

Prepared SQL: `supabase/migration_sources/purge_disqualified_genome_bill_payloads_20261017.sql`.

For exactly the pinned 3,082 current bill rows, remove `structural_dna_json.rosetta_assembly` and `.rosetta_source_receipt`, set `rosetta_extraction_run_id` to NULL and `structural_dna_hash` to the existing source-only marker, the empty string. Do not assign a new structural identity or certification.

The initial ordered full-row SHA-256 is `9ceb049cd1d9575952d1a13fbeea4a52280d149d2c63c6ec5e30dff1ebbdd988`. The expected ordered full-row SHA-256 after exactly those substitutions is `f3e2f74463124a6f4a98958dd5a32d49560e33a065c25c439a232109e1f7ebab`. The transaction refuses drift and checks the exact result. Bill IDs, families, other JSON, source metadata and timestamps are unchanged.

## Trigger side effects and transaction boundary

Both AFTER INSERT/UPDATE-of-structural-DNA wrappers normally cause lifecycle/version work. Their original function definitions are pinned by MD5 (`3aa7a70a64b116272641c70d6d79ea2e` and `72e6de7ac25173268d226cecf2653bc0`), owner, ACL, trigger count/type/column and enabled state.

While holding the bill table's exclusive lock, the transaction inserts a narrowly specified early-return predicate into those two wrappers. It matches only the exact removal of both old keys, NULL run ID and empty structural hash for the six known disqualified bill engine generations, with every other bill column unchanged. Any source ID, source metadata, title, timestamp or extra-field change follows the original trigger behavior. Inserts follow the original behavior.

The exact original definitions are restored and compared before commit. No trigger is disabled; no replication-role/GUC bypass is used. The ten anti-recontamination writer fences remain enabled and definition-pinned throughout. Other sessions cannot mutate the locked bill table during this transaction. The committed runtime definitions and grants remain the originals.

The migration makes no DML changes to source storage, bill versions, events, families, Docket cache, queues or sealed snapshots. Six-surface count/two-seed metadata checks additionally refuse observed collateral drift. These metadata checks are not cryptographic full-payload proof; the target bill-row check is cryptographic and exact. Disposable PostgreSQL tests compare complete source/version/event/history fixture JSON and spy on all three trigger side-effect calls.

## Failure and rollback

This is one atomic DO statement. Any guard, source-only hash, conservation or restoration failure rolls back the data changes and transient function replacements together. Tests force failure after function replacement and after the payload update. No post-commit rollback recreates disqualified interpretation payloads. The original source references remain in canonical Rosetta storage and the source-only reconciliation manifest.

The file stays outside the active migration directory until reviewed, tested and deliberately applied. A production receipt must record the actual generated migration version, exact executed SQL, source-conservation readbacks and deployment state. A fresh-replay variant must refuse nonempty targets and must not replay a historical production deletion automatically.

No engine is promoted. Selected V12, Viewfinder, Atlas signals and intake configuration are outside this change. Existing full-replay cron, Viewfinder ledger and broad-suite failures remain separate and must not be suppressed.
