# Luminari / Lighthouse Platform Audit — 2026-08-25

**Scope:** Lighthouse Supabase project `wepxlinwbjrkqdzkqpar` (all schemas), cross-checked against the `luminari` repo (client pages, tRPC routers, migrations) and the deployed UI at lighthouse.columbiacitycustomllc.com.
**Method:** exact `count(*)` on all 582 public tables (dashboard/pg_stat estimates proved stale — they under-reported badly, e.g. `registry_programs` estimated 0, actual 8,694), plus view-definition and server-router read-path tracing.

---

## 1. Headline numbers

| Metric | Value |
|---|---|
| Public tables | 582 |
| Public views | 148 |
| Side schemas | `compat` (~100 compat views), `checkpoint_contact_phase2` (archive), `private` (worker/integrity), `codex_readonly` (audit views), `sais_import` (SAIS staging) |
| Populated tables | 409 |
| Empty tables | 173 |
| Total rows (public) | ~2.18M |

**The database is not empty — it is fragmented.** Almost everything ever uploaded DID land somewhere. The problem is it landed in at least **five parallel generations of architecture**, and the UI's canonical read paths only draw from one of them.

---

## 2. The canonical wired core (what the UI actually reads)

The Library Architecture Map page is driven by `server/routers/architecture-map.ts → getArchitectureOverview`, which hardcodes the platform's **8-layer / 32-table legal-intelligence contract**. Verified against exact counts — the UI numbers are live and accurate:

| Layer | Tables (exact rows) | Total |
|---|---|---|
| L1 Statutes & Regulations | legal_statutes (1,940), legal_statute_clauses (5) | 1,945 |
| L2 Case Law & Precedent | legal_case_law (292), doctrine_registry (15), doctrine_graph_edges (15) | 322 |
| L3 Claim Elements | claim_element_matrix (60) | 60 |
| L4 Proof Frameworks | proof_frameworks (11), contradiction_templates (4), legal_contradictions (4) | 19 |
| L5 Agency Enforcement | agency_authority_map (31), contacts (2,080), agency_forms (49), enforcement_penalties (102), enforcement_viability_rules (5), interagency_referrals (10), legal_enforcement_records (245) | 2,522 |
| L6 Regulatory Guidance | regulatory_guidance (49) | 49 |
| L7 Investigation & Filing | investigation_guidance (15), filing_generator (15), workflow_definitions (6), registry_workflows (78), **evidence_sources (0)** | 114 |
| L8 Intelligence & Signals | signal_registry (173), registry_signals (59), live_signals (6), legal_weak_joints (5), litigation_barriers (10), narrative_templates (10), **pipeline_intelligence_map (0)**, **pipeline_intake_enrichments (0)**, **timeline_rules (0)**, **timeline_signals (0)** | 263 |

Plus a separate "Current Node Substrate" panel fed by `get_lighthouse_civic_object_snapshot_v1()` (the resource-directory lane), and the Knowledge Backbone page fed by `knowledge_modules` (14) / `knowledge_entries` (2,416) / `knowledge_cross_refs` (10) — which **are** populated and working.

**The five empty wired tables are exactly the holes the SAIS corpus is shaped to fill** (see §6).

---

## 3. The five generations (why everything looks scattered)

Each past work cycle created a full side-by-side stack instead of extending the wired core:

### Gen A — Wired core (above). Canonical. Keep.

### Gen B — v3_13 state-directory stack (populated, stranded)
`state_enriched_directory_v3_13` (30,250), `state_directory_row_classification` (30,250), `state_directory_*_promotion` (8 tables, ~8,700 rows), `legal_statutes_v3_13_stage` (862), `registry_programs_v3_13_stage` (1,002), `programs_v3_13_stage` (495), `domain_deep_dive_records_v3_13` (1,980), `sol_collision_analysis_v3_13` (178), `tribal_jurisdictions_addendum_v3_13` (724), `master_template_docs_v3_13` (184), `policy_layer_docs_v3_13` (147), `address_audit_v3_13` (200), + 10 more stage tables. Rows exist; promotion into wired tables mostly never ran.

### Gen C — Registry entity extraction stack (populated, stranded)
`registry_entity_extraction_v4` (101,384), `registry_entity_raw_parse_backfill` (21,151), `registry_entity_staging_*` (14 tables, ~10,300 rows), `registry_entities_*` (7 tables, 3,878 rows), `registry_entity_merge_plan` (161), `registry_programs_merge_plan` (233), `registry_raw_archive` / `raw_material_archive` (26,015 each — duplicates of each other).

### Gen D — luminari_corpus fresh-rebuild lane (populated, NO RLS)
`luminari_corpus_atomic_record_v1` (147,665) + `_origin_v1` (168,474), `luminari_corpus_candidate_v1` (73,007), `luminari_corpus_resource_quality_v1` (42,884), `luminari_corpus_resource_identity_v1` (18,172), `luminari_corpus_identity_v1` (4,800) + evidence (10,702), `luminari_resource_snapshot_identity_v1` (26,003, 9 snapshots), `luminari_civic_object_reconciliation_v1` (74,250). **This is the most complete lane — and 16 of its tables have RLS disabled (world-readable/writable with the anon key).**

### Gen E — Reviewed/current overlay lane (active, small)
`luminari_reviewed_source_*`, `luminari_situation_action_*_current_v1` (716), `luminari_claim_intake_*` (331 items), `luminari_grant_award_revision_v1` (40,123). Feeds the reviewed surfaces.

### Parallel "master" tables holding the same kind of thing
- **Resources:** `registry_programs` (8,694) vs `normalized_civic_resource` (41,644) vs `luminari_resource_entities` (6,890) vs `nonprofit_registry` (2,561) vs `government_benefits_registry` (556)
- **Claims:** `claim_catalog` (48) vs `canonical_claim_catalog` (9) vs `strategy_claim_catalog` (12) vs `knowledge_entries` claim_catalog module
- **Deadlines:** `deadline_rules` (71) vs `legal_workflow_deadlines` (109) vs `statute_of_limitations` (22) vs `registry_deadline_rules` (**0 — the SAIS target**)
- **Contacts:** `contacts` (2,080) vs `registry_contacts` (2,125) vs `luminari_resource_contact_points` (10,293)
- **Statutes:** `legal_statutes` (1,940) vs `legal_statutes_v3_13_stage` (862) vs `raw_sections` (2,479)

---

## 4. The SAIS lane — built, registered, routed… and empty

Everything needed for the SAIS series already exists:

- `public.sais_resources` — canonical target (migration `20260717142334`), 0 rows
- `luminari_document_family_contracts` — **`systemic_abuse_intelligence` contract already registered and active** (19 families total). The FK blocker identified earlier does not exist.
- `sais_import` schema — full staging design: `source_document`, `import_run`, `resource_candidate`, `deadline_field`, `routing_item`, `overlap_candidate` — all 0 rows
- `v_sais_civic_objects_v1` — **the routing brain is already written**: deterministically classifies each SAIS candidate by `organization_type` into `object_class` and routes it to a target surface: `resource_directory`, `legal_library`, `workflow_and_accountability`, or `evidence_reference`
- `v_sais_resource_directory_candidates_v2`, `v_sais_unified_resources_v1` — publication views, ready

So the correct ingest path is **sais_import staging → typed candidates → promote → sais_resources + registry_deadline_rules → routed by the existing views into the surfaces the 8-layer map already displays.** No new architecture required. This is the one lane that was designed cohesively and never loaded.

---

## 5. Domain 1 (intake) blockage — why convergence is 0

- `intake_signals` (Domain 1): **0** — nothing promotes into it
- `intake_staging`: **615 rows sitting unpromoted** (`intake_promotion_log`: 0)
- `intake_sessions` 14, `intake_layer_runs` 140, `intake_artifacts` 171 — intake runs happen; their output stops in staging
- `signal_convergences`: **0** — convergence requires one canonical record from each domain; Domain 1 is empty, so convergence is structurally impossible until intake promotion runs
- Domain 2 (`legal_patterns` 7,182) and Domain 3 (`live_data_signals` 1,020) are healthy

---

## 6. Where the SAIS corpus lands in the 8-layer map (the cohesion answer)

The 27 master docs (198 resources) + 16 pipeline dossiers (116 resources) map onto the wired contract — including its five empty tables:

| SAIS content | Wired target | Layer |
|---|---|---|
| 314 resources (typed candidates) | `sais_resources` → routed by `v_sais_civic_objects_v1` | feeds L1/L2/L5/L7 surfaces |
| Federal authorities / statutory citations per resource | `legal_statutes` supplement + `luminari_legal_authorities` (0) | L1 |
| 5-clock deadline matrices | `registry_deadline_rules` (0) + `timeline_rules` (**0, empty wired table**) | L7/L8 |
| 145-pipeline keys & categories | `pipeline_intelligence_map` (**0, empty wired table**) + `pipeline_intake_enrichments` (**0**) | L8 |
| Investigation steps, records-preservation guidance | `investigation_guidance`, `evidence_sources` (**0**) | L7 |
| Agency routing (survey agency, APS, MFCU, ombudsman…) | `agency_authority_map` / `contacts` supplement via staging overlap check | L5 |
| Deadline-clock runtime for cases | `timeline_signals` (**0**) | L8 |
| 56-jurisdiction tables (row-level UNVERIFIED) | `sais_import` staging only — quarantined from canonical until verified | — |

Loading SAIS this way fills **all five empty wired tables** and gives Domain 1 the resource substrate intake needs to promote its 615 stranded staging rows.

---

## 7. Security (unchanged, still open)

17 tables with RLS disabled — now confirmed to include the **147,665-row `luminari_corpus_atomic_record_v1` and 168,474-row `_origin_v1`** plus the whole corpus lane and `civic_genome_rosetta_generation_upgrade_queue`. Anyone with the anon key can read/modify them. Remediation migration (enable RLS + service-role policies) is prepared on request; not auto-applied because blanket-enable would lock out service workers.

---

## 8. Recommended cohesion sequence

1. **Load SAIS through its designed lane** (§4) — the single highest-leverage move: fills 5 empty wired tables, activates Domain 1's substrate, zero new architecture.
2. **Run intake promotion** for the 615 stranded `intake_staging` rows → first `intake_signals` → first non-zero convergence becomes possible.
3. **Declare the wired core canonical** and freeze new side-lanes: one rule — new content lands in wired tables or in `sais_import`-style staging that promotes into them.
4. **Reconcile resource masters** (§3 parallel tables) using `luminari_civic_object_reconciliation_v1` (74,250-row ledger already built for exactly this) → one current master per object class.
5. **Archive, don't delete**: move Gen B/C staging and `compat`/`checkpoint_contact_phase2` into an `archive` schema (reversible, provenance-preserving) so the active schema reads clean.
6. **RLS remediation** for the 17 exposed tables with service-role policies.
7. Merge/retire duplicate `v_*` view generations (e.g. 4 generations of `v_civic_map_runtime*`, 3 of `v_lighthouse_graph_edges*`) down to one current view per surface.

*Exact per-table row counts: `audit/lighthouse_exact_row_counts.csv` (582 tables) and `.json`.*
