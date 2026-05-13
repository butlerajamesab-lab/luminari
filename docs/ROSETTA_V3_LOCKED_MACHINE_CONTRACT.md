# Rosetta V3 Locked Machine Contract

Date: 2026-05-12
Source lock: `LOCKED-2026-04-22`
Repository: `https://github.com/butlerajamesab-lab/rosetta`

## Scope

This document records the Rosetta / Luminari V3 contract as an external integration contract for the active Lighthouse/Luminari V1 repository.

Rosetta owns the law-to-constants substrate: source legal/service/template material is decomposed into help entities, workflows, accountability routes, overrides, definitions, forms, deadlines, and operational constants. Lighthouse may consume Rosetta outputs, but Lighthouse does not own Rosetta's schema, extraction pipeline, validation suite, or Supabase deployment.

This contract should be applied to the Rosetta repo and Rosetta recovery-staging repo. It is kept here only so Lighthouse recovery knows what shape Rosetta outputs must have before they are consumed.

---

## V3 Build Sequence

Rosetta V3 is a five-layer mathematical machine for legal decomposition. It requires:

- PostgreSQL 15+ or Supabase
- `pgcrypto` extension
- superuser or schema-owner DDL role

### Step 1: Schema DDL

```bash
psql -f v3_locked_schema.sql
```

Creates, in order:

1. `pgcrypto` extension
2. infrastructure tables: `corpus`, `source_document`, `extraction_run`, `extraction_run_config`, `extraction_manifest`, `hr1_raw_blocks`
3. cross-cutting entity resolution: `actor_canon`, `actor_alias`
4. Layer 1 HELP: `help_entity`
5. Layer 2 WORKFLOW: `workflow_pipeline`, `workflow_step`
6. Layer 3 ACCOUNTABILITY: `accountability_route`, `escalation_node`, `appeal_pathway`
7. Layer 4 OVERRIDES: `entity_override`
8. Layer 5 DEFINITIONS: `term_definition`, `term_definition_affected_steps`
9. audit tables: `layer_coverage`, `extraction_drift_log`, `validation_result`
10. 20 indexes
11. 6 extraction contract views
12. `verify_extraction_hashes()` function
13. RLS enabled on all 20 tables

### Step 2: Seed Data

```bash
psql -f v3_seed_hr1_chips_ca.sql
```

Seeds 110 rows across three domains:

- HR1 / Medicaid community engagement: `run_id = 8`
- CHIPS Act semiconductor incentives section 4652: `run_id = 9`
- California Tenant Protection section 1946.2: `run_id = 10`

Each seed domain covers all five layers, `layer_coverage`, manifest rows, and actor normalization.

### Step 3: Validation

```bash
psql -f v3_validation_queries.sql
```

Validation queries V1-V17 return rows only on failure. Empty result set means the invariant holds.

### Step 4: Hash Verification

```sql
SELECT * FROM verify_extraction_hashes(8);
SELECT * FROM verify_extraction_hashes(9);
SELECT * FROM verify_extraction_hashes(10);
```

Each run returns three checks:

1. `manifest_exists`
2. `block_hashes_present`
3. `no_unresolved_drift`

---

## Five-Layer Output Contract

Every extraction run must map output to exactly five orthogonal layers. Every source block must have a `layer_coverage` row for every layer. No silent gaps are allowed.

| Layer | Question | Mathematical Shape | Target Tables |
| --- | --- | --- | --- |
| HELP | What exists? | Entity set | `help_entity` |
| WORKFLOW | What must happen? | Total order over actors, verbs, and deadlines | `workflow_pipeline`, `workflow_step` |
| ACCOUNTABILITY | What if it does not happen? | Directed escalation graph | `accountability_route`, `escalation_node`, `appeal_pathway` |
| OVERRIDES | What is different here? | Exception operators and interval algebra | `entity_override` |
| DEFINITIONS | What do the words mean? | Term rewriting system | `term_definition`, `term_definition_affected_steps` |

---

## Cross-Cutting Formal Systems

| System | Tables / Columns | Mathematical Role |
| --- | --- | --- |
| Entity resolution | `actor_canon`, `actor_alias` | Equivalence classes over raw actor strings |
| Temporal resolution | `entity_override.effective_date`, `entity_override.sunset_date`, `entity_override.temporal_status` | Allen-style interval consistency |
| Confidence classification | `extraction_run_config`, `*.confidence`, `*.signal_status` | One-dimensional decision boundary classifier |
| Cryptographic provenance | `extraction_manifest`, `extraction_drift_log`, `hr1_raw_blocks.*_hash` | SHA-256 content hashing, zero raw bill text stored |

---

## Provenance Spine

Every canonical row in Rosetta layer tables carries:

| Column | Meaning |
| --- | --- |
| `corpus_id` | FK to corpus |
| `source_document_id` | FK to source document |
| `extraction_run_id` | FK to extraction run |
| `canon_version` | interpretation version |
| `source_block_id` | FK to hashed raw block |

V1 validates that provenance spine columns are present and non-null on canonical rows.

---

## Confidence and Signal Status

Every canonical layer row carries `confidence` and `signal_status`.

| Column | Allowed Values |
| --- | --- |
| `confidence` | decimal score from `0.00` through `1.00` |
| `signal_status` | `confirmed`, `tentative`, `human_review_required` |

Default classification:

```txt
confidence >= threshold           -> confirmed
threshold > confidence >= review  -> tentative
confidence < review               -> human_review_required
```

Default thresholds:

```txt
threshold = 0.85
review = 0.70
```

V10 validates confidence range. V12 validates confidence-to-status mapping.

---

## Layer Coverage Enforcement

For each `(extraction_run_id, source_block_id)`, `layer_coverage` must contain exactly five rows:

```txt
HELP
WORKFLOW
ACCOUNTABILITY
OVERRIDES
DEFINITIONS
```

Allowed `coverage_status` values:

- `populated`
- `not_applicable`
- `pending_extraction`
- `extraction_failed`

When a layer is `not_applicable`, `reason` is required. Completed runs must not contain `pending_extraction` or `extraction_failed` rows.

V11 validates five-layer coverage and no incomplete entries on completed runs.

---

## Extraction Contract Views

Rosetta exposes six extraction contract views:

| View | Purpose |
| --- | --- |
| `v_extraction_help` | Help entities joined to source blocks |
| `v_extraction_workflow` | Pipelines, ordered steps, actor canonicalization, and source blocks |
| `v_extraction_accountability` | Accountability routes, escalation nodes, appeal pathways, actors, and source blocks |
| `v_extraction_overrides` | Overrides with canonical actors and source blocks |
| `v_extraction_definitions` | Definitions with affected workflow steps and source blocks |
| `v_layer_coverage_summary` | Aggregated layer coverage per source block |

Lighthouse should prefer these views or explicitly versioned API outputs over direct table coupling.

---

## Validation Checklist

| # | Invariant | Pass Condition |
| --- | --- | --- |
| V1 | Provenance spine | 0 rows returned |
| V2 | Required field nulls | 0 rows returned |
| V3 | Orphan references | 0 rows returned |
| V4 | FK integrity | 0 rows returned |
| V5 | Actor normalization | 0 rows returned |
| V6 | Temporal consistency | 0 rows returned |
| V7 | Term-to-step linkage | 0 rows returned |
| V8 | Appeal coverage | 0 rows returned |
| V9 | Enforcement direction | 0 rows returned |
| V10 | Confidence range | 0 rows returned |
| V11 | Layer coverage | 0 rows returned |
| V12 | Confidence-to-signal-status mapping | 0 rows returned |
| V13 | Content hash presence | 0 rows returned |
| V14 | Manifest integrity | 0 rows returned |
| V15 | Row count sanity | 0 rows returned |
| V16 | Escalation node ordering | 0 rows returned |
| V17 | Workflow step ordering | 0 rows returned |

---

## RLS and Deployment Boundary

The locked schema enables RLS on all 20 tables but does not define production policies. Client-side access will not work until Rosetta-specific policies are created.

Minimum dev/test policy pattern:

```sql
CREATE POLICY "allow_all" ON <table> FOR ALL USING (true);
```

This is not a Lighthouse migration. Lighthouse must not deploy Rosetta DDL into the Lighthouse Supabase project. Rosetta DDL belongs in the Rosetta Supabase project and Rosetta repository.

---

## Rollback Warning

The source package notes this teardown command:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

This command is destructive. It may be acceptable for isolated local test databases, but it must not be run against production, preview, or canonical substrate lineages during recovery.

---

## Locked Package Manifest

The Rosetta V3 locked package identifies these files and hashes:

| SHA-256 | Path |
| --- | --- |
| `6a84194028923979168031397c60624f013d2539893f4ba10bc8b3f566ad1ef6` | `./01_foundation/FOUNDATION_README.md` |
| `2dc92333687fa1112bf1a999d3715c818346597940dc18978fe2a2de4108f4c8` | `./01_foundation/v3_build_sequence.md` |
| `c7e5752be2fd6fbcc735e416f7c413b0b01e232b97a19f25ea80b19812fe8d9d` | `./01_foundation/v3_extraction_output_contract.md` |
| `04c1158fb8d09824688d1e060d31dbe28c10dc3b3796d2b7bea4822b16eee260` | `./01_foundation/v3_locked_machine_manifest.json` |
| `3a9f9cdd16440dc780b1bb664f59f2dc083f6c3c1a6627edd06d409df5c94dee` | `./01_foundation/v3_locked_schema.sql` |
| `c92b0ab785a746f07985d7124aec8e594ff55945c3bd47e88e4b363925e750bc` | `./01_foundation/v3_seed_hr1_chips_ca.sql` |
| `d14210d20c27203478b8a0712c573b084f0c370f7113d0f96e6b4b5fb9e605e8` | `./01_foundation/v3_validation_queries.sql` |
| `ed9a5651b78ee8832019a8b2ba7ab74c0c57c68821fdd0c287464220aedcbc6e` | `./02_tests/build_positive.py` |
| `af43d2b1c9e923c1423df6837258067fcc1ba93544faf630f7c8a6fb04c7939a` | `./02_tests/negative_v11.sql` |
| `ee333e7f17ec4771a1a5924217960192a5f73ce8b8568fd262e0c8aea5a4a185` | `./02_tests/negative_v12.sql` |
| `962f2622a56cc119f0b2fca248cc9f26f93f8b2fa3cebd615a8f98cbedcbc570` | `./02_tests/negative_v6.sql` |
| `c2f9e619d5fe4c43ae8ec5755208e7b6f7145e6e719b5c7f04ccabc446418b7d` | `./02_tests/negative_v8.sql` |
| `fa780f610e9923cd403cc3acf8d8ab1575badc076694c10337eae55825c5a1b1` | `./02_tests/real_law_positive.sql` |
| `b6ad378e1585c3d0bb4544ab778f2037e67a3a75a383c09bf22a1ccf0e90687b` | `./02_tests/run_tests.sh` |
| `d68137cf31488188b43728ae8af45e46fbe96c724d79cce495ce03926feb94ee` | `./02_tests/test_report.md` |
| `cecfdaaec0dc16d2712fe9539a21271af7c77f365a862beca2df90369fa3e03f` | `./README.md` |

---

## Lighthouse Consumption Rule

Lighthouse/Luminari V1 should consume Rosetta as a source of validated law-to-action constants only after Rosetta validation passes V1-V17 and hash checks pass for the relevant extraction run.

Allowed Lighthouse uses:

- display Rosetta-derived help entities and workflows
- link Lighthouse intake/case patterns to Rosetta workflow constants
- use Rosetta accountability routes, appeal pathways, deadlines, and definitions as read-only guidance data
- preserve Rosetta provenance fields in any downstream display or export

Forbidden Lighthouse uses:

- treating Rosetta tables as Lighthouse-owned tables
- copying Rosetta DDL into the Lighthouse schema as a shortcut
- using Rosetta outputs without validation status and provenance spine
- running destructive Rosetta teardown commands against any canonical Supabase project
