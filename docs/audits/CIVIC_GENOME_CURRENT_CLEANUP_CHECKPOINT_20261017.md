# Current Rosetta / Civic Genome cleanup checkpoint — 2026-10-17

## Current truth

**The 99,159 disqualified Lighthouse traits have been physically removed.** Supabase migration 20261017021051_purge_disqualified_genome_traits_20261017 is installed and independently verified. Trait count is zero; verification-binding count is zero; application SELECT on the retired trait table is denied; all ten writer fences are enabled and unchanged.

This supersedes the earlier canceled/unapplied checkpoint in PR #733. That earlier record was correct at its observation time. The successful retry and exact applied SQL are recorded in CIVIC_GENOME_TRAIT_PURGE_LIVE_RECEIPT_20261017.md and supabase/verification/genome_trait_purge_live_20261017021051.json.

## Conserved boundaries

- Lighthouse bills 39,408; versions 38,498; families 35,203; events 265,446; Docket detail-cache records 13,769; historical projection rows 520,443. Independent before/after bounded metadata checks match for all six surfaces.
- Rosetta retired rosetta_v2513 namespace remains absent. Canonical source-content rows 19,464 and source-document rows 27,700 remain; selected V12 and installed engine/read identities match. These count/identity checks do not substitute for independent byte-level validation of original artifacts.
- Source data, source intake, source history, identity links, predecessor/amendment bases and selected engine were not migration DML targets. Viewfinder, Atlas signals and intake provider code were not modified.

## Completed containment and cleanup

PR #727 fenced external historical/current snapshot receipt construction and Prism structural context before interpretation reads. PR #728 made Radar source-only with an explicit unavailable structural state; canonical migration 20261017000912 closed application access to four structural views with definitions preserved. PR #729 fenced both persistent family-resolution entry points before any database access or assignment/event mutation. Existing family membership is preserved, not independently certified as shared lineage. PR #731 corrected the applied view receipt's Git-blob pin.

PR #732 prepared the exact bounded trait purge and PostgreSQL 17 failure/rollback/source-preservation tests; its merged package was deployed before application. The actual purge was subsequently applied as 20261017021051. Do not confuse this completed deletion with removal of the other payloads below, or with validation/admission of a new engine.

## Remaining work, in order

1. Current bill payloads: 3,082 still contain old assemblies. Updating structural_dna_json reaches lifecycle and legislative-version registration triggers. A narrowly tested retirement contract must preserve ordinary Docket behavior without cleanup causing source/queue side effects; do not disable triggers broadly.
2. Preserve source references before removing mixed receipts. All affected bills have registered versions, but one old numeric source-document ID differs while URL/text hash match; sixteen bills lack an exact URL + text hash + byte hash match together in their version receipts. Those require provenance reconciliation, not a blanket rosetta_ prefix deletion.
3. Bill-version receipts: 9,428 still contain old engine metadata. Retire old certification while preserving canonical source identities/hashes, provider receipts, source_content_hash, chronology, predecessor/amendment-base links and legitimate failure audit. Avoid watched columns that enqueue work.
4. Historical snapshots: 104,741 still embed old assemblies. Use an explicit source-only retirement/redaction contract preserving original version IDs, chronology, identity links and original sealed hashes as retired provenance. Redacted records need distinct hashes. No historical cleanup has been applied.
5. Reconcile remaining Rosetta outside-schema wrappers/stores and Git reactivation paths. Old namespace absence is not proof every old mechanism is gone.
6. Independently validate the new engine's source/rule/read/output binding, held cases, gold evaluation and migration provenance before admission. Keep deterministic execution, no AI/LLM canonical authority and no retired-engine fallback.

The inherited three broad-suite failures and separate Viewfinder migration parity/cron replay issues remain explicit; no checks suppressed.

Post-purge HTTP health returned 200; Docket search hit its 5-second query deadline once and then succeeded with source results and structural quarantine. Search performance remains a separate observed limitation. The verbatim production-pinned purge file is not an empty-database replay recipe; clean replay remains unproven and needs an explicit strategy for this guarded data cut.
