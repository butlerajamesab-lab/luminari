# Unified Master Registry — Architecture Note

**Version:** 1.0.0
**Date:** 2026-03-06
**Scope:** R.E.A.D. (Relational Evidence Articulation Device) integration layer

---

## 1. Purpose

The Unified Master Registry is a read-only integration layer that connects the engine's independent subsystems — pipeline resolver, lens engine, benefits navigator, and FOIA generator — through a shared reference structure. It does not replace or modify any existing engine. It provides a single lookup point where, given a `pipeline_id`, the system can resolve the full support context: which lenses activate, which benefits apply, which records the person is entitled to, which oversight bodies accept complaints, and what workflow steps the case follows.

---

## 2. Architecture

```
User Input
    │
    ▼
Pipeline Resolver ──────────────────────────────────┐
    │                                                │
    │  pipeline_id                                   │
    ▼                                                ▼
┌─────────────────────────────────────────────────────────────┐
│              Unified Master Registry (read-only)            │
│                                                             │
│  unified_pipeline_registry.json                             │
│    ├── default_lenses[]     → lens_registry.json            │
│    ├── program_ids[]        → benefits_registry.json        │
│    ├── benefit_categories[] → benefits_registry.json        │
│    ├── records_entitlements[] → records_entitlements.json    │
│    ├── oversight_entities[]  → oversight_registry.json      │
│    ├── workflow_id           → workflows.json               │
│    ├── foia_profile{}        → foia-generator.ts            │
│    ├── pattern_signals[]     (future: pattern engine)       │
│    └── escalation_profile{}  (future: escalation engine)    │
└─────────────────────────────────────────────────────────────┘
    │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼
Lens Engine  Benefits   FOIA Gen   Oversight   Workflow
             Navigator             Referral    Guidance
```

---

## 3. File Structure

| File | Location | Contents | Entry Count |
|---|---|---|---|
| `unified_pipeline_registry.json` | `server/config/` | Master pipeline entries with all cross-references | 9 pipelines |
| `workflows.json` | `server/config/` | Procedural step definitions per pipeline | 9 workflows |
| `oversight_registry.json` | `server/config/` | Oversight entities with complaint pathways | 30 entities |
| `records_entitlements.json` | `server/config/` | Records a person is legally entitled to obtain | 51 records |
| `unified-registry.ts` | `server/` | TypeScript loader with typed lookup functions | — |
| `unified-registry.test.ts` | `server/` | Vitest validation: schema, cross-refs, loader | 41 tests |

---

## 4. Transformation Steps

The unified registry resolves context through the following deterministic steps:

**T1.** `pipeline_id` is received from the pipeline resolver (e.g., `"domestic_violence"`).

**T2.** `getUnifiedPipeline(pipeline_id)` returns the master entry or `null` if the pipeline is not yet expanded.

**T3.** `resolvePipelineContext(pipeline_id)` assembles the full context object:
  - `pipeline` — the master entry with all cross-reference arrays
  - `workflow` — the procedural steps for this pipeline type
  - `oversight` — the oversight entities that accept complaints for this pipeline
  - `records` — the records entitlements applicable to this pipeline

**T4.** Each downstream system reads only the fields it needs:
  - Lens engine reads `default_lenses[]` — no change to existing lens activation logic
  - Benefits navigator reads `program_ids[]` and `benefit_categories[]` — supplements existing signal matching
  - FOIA generator reads `foia_profile.agencies[]` and `foia_profile.record_types[]` — supplements existing AKB lookup
  - Future UI surfaces read `oversight`, `records`, `workflow` for user-facing guidance

---

## 5. Cross-Reference Integrity

Every ID in the unified registry is validated against its source registry. The test suite enforces:

| Cross-Reference | Source Registry | Validation |
|---|---|---|
| `pipeline_id` | `pipeline_registry.json` | Must exist as canonical pipeline |
| `default_lenses[]` | `lens_registry.json` | Each lens_id must exist |
| `program_ids[]` | `benefits_registry.json` | Each program id must exist |
| `benefit_categories[]` | `benefits_registry.json` | Each category must exist |
| `workflow_id` | `workflows.json` | Must reference valid workflow |
| `oversight_entities[]` | `oversight_registry.json` | Each entity_id must exist |
| `records_entitlements[]` | `records_entitlements.json` | Each record_id must exist |

Bidirectional consistency is also enforced: if pipeline A references oversight entity B, then entity B's `applicable_pipelines` array must include pipeline A.

---

## 6. Current Coverage

The 9 pipelines in Phase 1 span 6 of the 15 pipeline categories:

| Pipeline ID | Category | Lenses | Programs | Records | Oversight | Workflow Steps |
|---|---|---|---|---|---|---|
| `domestic_violence` | family | 5 | 13 | 6 | 4 | 7 |
| `tenant_rights` | housing | 5 | 10 | 6 | 4 | 6 |
| `insurance_claim_denial` | insurance | 6 | 11 | 6 | 4 | 6 |
| `wage_theft` | employment | 5 | 10 | 6 | 4 | 6 |
| `child_welfare` | family | 5 | 13 | 6 | 4 | 6 |
| `debt_collection_abuse` | financial | 5 | 9 | 6 | 4 | 6 |
| `guardianship_abuse` | elder | 5 | 10 | 6 | 4 | 6 |
| `elder_abuse` | elder | 5 | 13 | 6 | 5 | 6 |
| `family_separation_case` | immigration | 5 | 13 | 6 | 4 | 6 |

Remaining 149 pipelines across 9 uncovered categories can be expanded using the same schema.

---

## 7. Expansion Protocol

To add a new pipeline to the unified registry:

1. Add the pipeline entry to `unified_pipeline_registry.json` with all required fields.
2. Add the corresponding workflow to `workflows.json`.
3. Add any new oversight entities to `oversight_registry.json` (reuse existing entities where applicable).
4. Add any new records entitlements to `records_entitlements.json` (reuse existing records where applicable).
5. Run `npx vitest run server/unified-registry.test.ts` to validate all cross-references.

No code changes are required. The loader indexes are rebuilt from JSON at module init.

---

## 8. Design Constraints

- **Read-only overlay.** The unified registry does not write to any existing engine's state. It is a lookup layer.
- **No runtime mutations.** All data is loaded from JSON at module initialization. There is no API to modify the registry at runtime.
- **Backward compatible.** Existing engines continue to function identically whether or not the unified registry is consulted. The `hasUnifiedEntry()` function allows conditional enrichment.
- **JSON-first.** All data lives in JSON files under `server/config/`. No data is embedded in TypeScript. This allows non-technical contributors to edit the registry without touching code.
- **Deterministic.** Given the same `pipeline_id`, the same context is always returned. No LLM calls, no probabilistic matching.
