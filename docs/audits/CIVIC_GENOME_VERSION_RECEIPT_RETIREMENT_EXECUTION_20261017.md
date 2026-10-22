# Genome obsolete version receipt and queue retirement — executed

**Production status: APPLIED and independently verified. DO NOT REPLAY.** Lighthouse Supabase project `wepxlinwbjrkqdzkqpar`, 2026-10-17.

Executed exact `supabase/migration_sources/purge_disqualified_genome_version_receipts_20261017_PREPARED.sql` Git blob `ae869be803f527ca59c3374e7ef3ade3100c3563` by `execute_sql` (single guarded BEGIN / DO / COMMIT). No Supabase migration-ledger identity was assigned. CI `Civic Genome obsolete version receipt retirement preflight` ran disposable PostgreSQL fixture and passed, job `117529264372`.

Prerequisites independently met before execution: PR #743 permanently disabled retired Docket-to-Rosetta auto-decomposition, merged at `5a8b61ddea5dd0722e93b9f1c6cbce87efb21fda` and LIVE on BOTH Lighthouse web + Prism canary; 20 old leases retired by exact #745 DML, with zero remaining active old leases.

The SQL enforced the pre-delete exact identities / full-row hash of **9,428** old version rows and **9,428** queue rows, no unknown receipt keys, six enumerated disqualified engine versions only, unchanged Docket source hashes, preserved all bill/family/event counts, unchanged all protected version/source tuple fields, enabled exact trigger hashes, terminal-state-monotone two-phase reset, and zero downstream version results. The queue hash after lease retirement was independently recomputed as `792a67d68533bb57b88143c0335c53859c3294b580dc030c444a542b62ab238d`; original version full-row hash remained `3727cfd4ac781b812c941755c1cce0a8da233945bcc2dc36f060ad06dbf17121`.

**Independent post-commit readback**:
- Old `civic_genome_bill_version.rosetta_extraction_run_id` count: **0**; any version assembly / Prism verification / terminal-success-derived state: **0**.
- Total `civic_genome_bill_version` preserved: **38,498**, equal to original `docket_bill_source_document` **38,498**.
- Legislative-version queue count **18,955**, down from 28,383 (exactly **9,428 physically removed**).
- Old 20 terminal lease markers: **0** remaining after deletion. A separate unassociated queue claim remains and was not touched.
- Civic Genome projection history, old bill payloads, obsolete generation target: **0** each.
- Original Docket detail cache **13,769**; Genome bill identities **39,408**; families **35,203**; legislative events **265,446**.

Do not reapply the retirement script despite the filename suffix. Any later Rosetta engine admission must begin with independent source-bound selected-runtime proofs and never inherit these removed derivatives.
