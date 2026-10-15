# Civic Genome / Rosetta anti-recontamination: live seam inventory

**Observed 2026-10-15, read-only SQL + GitHub source inspection.**
**Status:** independent partial census; **no production migration or deletion executed by this audit**.
The source of truth for deployed code is Lighthouse main at merge `7584140b278cbff03f09ac7a26d24fa3299b9992` (#720; #721 writer hold included). DB-side hold is **prepared only** under PR #722. Never infer that this document authorizes execution or grants contamination authority.

## 1. Live contaminated data and SQL writer surface

| Source | Observed |
|---|---:|
| public.civic_genome_trait | 99,159 legacy rows |
| public.civic_genome_assembly_run | 0 rows |
| public.civic_genome_rosetta_source_binding | 0 |
| public.civic_genome_rosetta_structural_representation | 0 |
| public.civic_genome_prism_verification_binding | 0 |
| public.civic_genome_bill current rows with rosetta_assembly | 3,082 |
| public.civic_genome_bill current rows with rosetta_source_receipt | 3,082 |
| public.civic_genome_bill_version receipt_json with rosetta_engine_version | 9,428 |
| public.civic_genome_bill_version receipt_json with assembly_run_id | 8,601 |
| public.civic_genome_bill_version with relational assembly_run_id | 0 |
| Lighthouse current generation target | stale 2.5.40 / rule-reference V10 |

The current assembly target trigger checks against the *stored stale target* and returns unchanged rows if rosetta_engine_version is blank. There is no trait INSERT/UPDATE trigger, and service_role retains write grants before proposed #722 is installed. Thirteen SQL functions in public/private textually mention one or more of the trait, assembly or target tables; textual hits are **not** a complete pg_depend graph.

## 2. Additional historical projection source — NEW AND IMPORTANT

**261,478** `civic_genome_projection_entity_version` bill-version snapshots and **258,965** family-version snapshots currently exist. Do not blanket-delete either history population.

Of the bill snapshots, **104,741** rows across **1,514 distinct bill entities** have the embedded key:

`record_json -> 'structural_dna_json' -> 'rosetta_assembly'`

Recorded engine breakdown of those exact 104,741 embedded payloads:

| Embedded engine | Snapshot rows |
|---|---:|
| rosetta-v3-deterministic-sql-2.5.11 | 79,063 |
| rosetta-v3-deterministic-sql-2.3.0 | 10,883 |
| rosetta-v3-deterministic-sql-2.4.0 | 7,266 |
| rosetta-v3-deterministic-sql-2.5.8 | 5,181 |
| rosetta-v3-deterministic-sql-2.5.10 | 2,301 |
| rosetta-v3-deterministic-sql-2.2.0 | 47 |
| **Total** | **104,741** |

These are historical snapshots of documented contaminated derivatives, **not 104,741 distinct bills** and **not authority to replay**. The source chronology and bill/family identities must survive. Removing or masking embedded derivative keys inside a sealed historical record changes its hash and cannot be silently done; a separately versioned redacted read representation or qualified forensic access contract is required.

## 3. Read paths not covered by #720

- `server/civic-genome-external-snapshot-producer.ts` builds historical family datasets with `to_jsonb(b)` or `civic_genome_projection_entity_version.record_json` (full bill payload) and separately aggregates raw rows from `public.civic_genome_trait`. Thus legacy derivations can still enter external snapshots even when public bill-detail endpoints are fenced. A change to its data contract requires snapshot hash/version compatibility, not silent replacement.
- `server/services/prism-rosetta-structural-context.ts` directly queries `public.civic_genome_trait` for assembly peer rows, with additional current publication and source-hash checks elsewhere in the request path. Whether any caller can actually receive old traits as an eligible binding is NOT yet independently established. Audit and fail closed before deleting traits.
- Database views referencing trait/assembly source text: `public.docket_bill_drift_delta`, `public.docket_bill_impact_callouts`, `public.docket_bill_obligation_checklist`, `public.v_civic_genome_prism_verification_status`. Read-only counts observed **0 rows** in the first three; that is not a future safety guarantee. The status view row count was not independently established. No matching materialized views were found by the scoped definition-string search.
- Atlas signals, Anomaly Viewfinder and all intake surfaces are protected from modification by user directive. They were not changed.

## 4. Governing implementation order and release rule

1. Prove SQL INSERT/UPDATE isolation in disposable Postgres (#722 currently passes its independent CI), then run production-shaped preflight and promote through the canonical Supabase migration/ledger process. No direct untracked SQL.
2. Re-read installed triggers/grants and run rollback-only negative probes; verify Docket writes continue, source/identity hashes remain intact, and no old replay/queue can reintroduce traits. Document actual production receipt.
3. Independently fence/repoint the external snapshot producer, Prism structural reader, and four SQL views as needed. Historical version hash preservation **must** be designed, not presumed.
4. Only then perform a bounded source-preserving physical purge of derivations and invalid certifications, including current bill payloads and historical projection derivative-access policy, with FK checks, exact pre/post counts, and no CASCADE. Retain legitimate bill/family/legislative source history.
5. Independently attest V12 before any re-entry; never promote old 2.5.4/2.5.40 or other legacy outputs via fallback.

**No physical purge is authorized or executed by this report.**
