# Runtime Contract Reconciliation Audit

Date: 2026-07-02  
Scope: server routers, tRPC procedures, API routes, ingestion engines/workers, promotion adapters, Mission Control/runtime services, ingestion-control, client consumers, and existing helper/normalizer/guard/contract layers.  
Rule observed: this audit does not change backend/schema/ingestion behavior.

## Executive finding

There is **no single canonical runtime response envelope** spanning Luminari runtime data. The closest existing boundary is the `ingestion_control` engine plus REST router pair because it carries `success`, action metadata, rows, counts, dry-run/apply state, backend error codes, diagnostics, and promotion feature-flag state through to the UI. However, that boundary is local to ingestion-control and is not governed as a shared runtime contract.

Observed facts:

- Frontend guards in `client/src/lib/data-guard.ts` are render-safety utilities, not an API envelope contract.
- `server/runtime/registry-contract-normalization.ts` normalizes specific registry/lens iterability shapes, not producer response envelopes.
- Runtime services return bespoke shapes such as `runtimeState`, `metrics`, `surface`, `convergence`, or raw operational summaries.
- Ingestion-control returns `{ success, ... }` envelopes for REST and tRPC-backed engine functions, but not every endpoint returns the same fields or validates output with a shared schema.
- Backend errors are best preserved in ingestion-control REST responses via `{ success:false, error, message, diagnostic_code/stdout_preview/stderr_preview }`; many tRPC procedures rely on thrown errors or direct returns.

Inferred conclusion:

- The canonical boundary should become a governed server-side runtime response envelope emitted at router/procedure boundaries and consumed by client pages/components before rendering. It should not be another UI `safeArray` layer.

## Producer / consumer contract table

| producer | endpoint/procedure | consumer(s) | returned shape | assumed shape | normalizer used | validation used | failure behavior | drift risk | recommended fix |
|---|---|---|---|---|---|---|---|---|---|
| Corpus import queue engine | `list_corpus_import_queue(input)` | REST `/api/ingestion-control/corpus-import-queue`; tRPC `ingestionControl.list_corpus_import_queue`; `client/src/pages/ingestion_control.tsx` | `{ success:true, status_filter, limit, row_count, summary_counts, rows }`; rows from `map_queue_row` include queue identifiers, text char counts, policy, blocked reason, next action | UI expects `success`, `rows: visible_queue_row[]`, object `summary_counts`; row fields such as `next_action`, `policy_class`, `raw_text_chars` | `map_queue_row`; `classify_policy` | Input zod only in tRPC; REST clamps query; UI checks `Array.isArray(result.rows)` and `typeof summary_counts === "object"`; no shared output schema | DB errors mapped in REST to `{ success:false,error,diagnostic_code,message }`; engine exceptions bubble | Medium: REST and tRPC share engine, but tRPC enum omits `ready_for_review` while REST allows it | Promote this shape into canonical envelope; align REST/tRPC input enums; add output schema at router boundary |
| Queue row detail engine | `get_corpus_import_queue_row({ id })` | REST `/api/ingestion-control/corpus-import-queue/:id`; tRPC `get_corpus_import_queue_row`; row detail panel | Success returns `{ success:true,row:{...map_queue_row, raw_text_preview, payload} }`; not found returns `{ success:false,row:null,error }` | UI assumes `row` non-null when `success` true; detail payload optional | `map_queue_row` | zod for tRPC id; REST id parser; no output schema | REST maps not found to 404 and exceptions to `{ success:false,error,message }` | Low/medium: good local envelope but not globally governed | Use shared runtime result envelope with `data.row`, `state`, `diagnostics` |
| DOCX extraction route | REST `/corpus-import-queue/:id/extract-docx` and `/extract-docx-drain` | ingestion-control page actions | Returns command diagnostic: `success`, `action`, `dry_run`, `state_changed`, `command_failed`, `command_summary`, `stdout_preview`, `stderr_preview`, row/before_row for per-row | UI treats JSON parse, `success=false`, `command_failed`, and extraction failure counts as failure; accepts partial success | `parse_command_json`, `failed_rows_from_stdout`, `row_state_changed`; external script output shape is implicit | REST id/body parsing only; UI checks content-type and failure booleans | Non-JSON command output => 409 with previews; partial success => 200 warning; exceptions preserve stdout/stderr | High: external script stdout is an implicit contract | Define script diagnostic envelope and validate before returning |
| DOCX normalization route | REST `/corpus-import-queue/normalize-docx-drain` | ingestion-control page | Returns `{ success:true, action, runtime_ms, summary:{ normalized_rows }, ... }` (route-local SQL update) | UI assumes `summary.normalized_rows` exists for status message | None beyond SQL result mapping | None shared | Exceptions return `{ success:false, action, error, message, runtime_ms }` | Medium: shape differs from extraction diagnostics | Fold into same runtime action envelope |
| Candidate creation engine | `create_candidates_from_ready_queue()` | REST `/create-candidates-from-ready`; ingestion-control page | `{ success:true, action, runtime_ms, target_table, extractor_version, processed_rows, candidate_count, inserted_count, skipped_count, rows, last_candidate_conveyor_result }` | UI type requires `processed_rows` and `candidate_count`; displays row-level counts | Candidate extraction uses `extract_candidates_from_text`, `classify_fragment`, deterministic field binding, content hash | No zod/output schema; DB insert constraints only | REST exceptions return `{ success:false, action, error, message }` | Medium: candidate row object is locally known but ungovened | Make candidate conveyor result a named contract |
| Candidate summary engine | `get_registry_entity_candidates_summary()` | REST `/registry-entity-candidates/summary`; ingestion-control candidate panel | `{ success:true, table, total_candidate_count, candidate_type_breakdown, document_family_breakdown, promotion_lane_breakdown, verification_status_breakdown }` | UI verifies table string, numeric count, and arrays | SQL aggregation only | UI runtime checks; no backend output validation | REST returns `{ success:false,error,message }` on exception | Medium: UI enforces shape client-side | Move validation to server boundary and reuse generated client type |
| Candidate review engine | `list_registry_entity_candidates({ limit })` | REST `/registry-entity-candidates`; ingestion-control panel | `{ success:true, table, canonical_promotion_enabled, total_candidate_count, candidate_type_breakdown, recent_candidates }`; candidates include adapter/block fields | UI checks table, count, breakdown, `recent_candidates` array; apply button reads `canonical_promotion_enabled`, `write_adapter_status`, `material_scope` | `operator_candidate_row`, `verify_registry_candidate`, `promotion_write_adapter_status`, material classifier | Backend computes verification/adapters; UI checks only container shape | REST exceptions return `{ success:false,error,message }` | High: UI promotion enablement depends on backend flag/adapter semantics encoded in ad hoc fields | Canonicalize candidate review item contract and server-side `state`/`can_apply` decision |
| Candidate verification engine | `verify_registry_entity_candidates_dry_run(input)` | REST `/registry-entity-candidates/verify-dry-run`; ingestion-control panel | `{ success:true,dry_run:true,processed_count,promotable_count,human_review_count,context_fragment_count,provenance_mismatch_count,would_insert_count,...,blocked_count,error_count,verified_count,lane_counts,blocked_reasons,sample_* }` | UI type requires `processed_count`, `verified_count`, `blocked_count`, `lane_counts`, `blocked_reasons`, sample arrays | `verify_registry_candidate`; candidate field/value resolvers | REST clamps input; no output schema | REST exceptions return `{ success:false,error,message }` | Medium/high: verification output and promotion output overlap but differ | Create shared `verification_summary` subobject used by dry-run and apply |
| Candidate promotion/apply engine | `promote_registry_entity_candidates_apply(input)` | REST `/registry-entity-candidates/promote-apply`; ingestion-control panel | Success/failure envelope includes `success`, `dry_run`, `canonical_promotion_enabled`, `feature_flag_enabled`, `target_hint`, `processed_count`, counts, `run_id`, `results`, optional `error/message`; early blockers for unsupported lane, disabled flag, missing target tables | UI expects all count fields and preserves backend error panel/result if `run_id` exists; apply button also blocks locally unless `canonical_promotion_enabled` and safe adapters | `verify_registry_candidate`, `promotion_write_adapter_status`, `classify_candidate_material_scope`, write adapters | Feature flag gate; required column checks; no output schema | Returns 409 for `success:false` in REST; preserves specific backend blockers (`canonical_promotion_feature_flag_disabled`, `no_safe_*`) | High: canonical apply blockers are explicit but not modeled as governed state | Move dry-run/feature-flag blockers into canonical `state.can_apply=false` with reasons, not ad hoc UI logic |
| tRPC ingestion metrics/signals | `server/routers/ingestion.ts` procedures (`stats`, signal summary/list, scheduler/manual triggers, classifiers) | Mission Control panels and ingestion consumers via tRPC | Direct returns from unified queries, scheduler, classifier/deduper engines; shapes vary by procedure | Consumers generally assume procedure-specific objects/arrays | `get_unified_ingestion_metrics`, `get_unified_signal_summary`, `get_unified_signals`, entity classifiers | zod input on selected procedures; no common response envelope | tRPC error propagation or direct engine errors | High: multiple ingestion surfaces not reconciled with ingestion-control contract | Wrap runtime-facing tRPC ingestion procedures in canonical envelope while preserving data payload |
| Mission Control runtime convergence | `getMissionControlRuntimeConvergence()` and compat router | Mission Control compatibility panels | `{ runtimeState, convergence, panels, warnings/metrics }` style bespoke object | Clients assume snake_case/camelCase mix depending router mapping | Service-level convergence mapping | None observed at boundary | Direct return; failures depend on caller | Medium/high: Mission Control names differ from ingestion-control envelopes | Canonical runtime envelope should allow `data`, `state`, `diagnostics`, `source` |
| Operational core runtime | `server/runtime/operational-core-*`, `server/services/operational-core-runtime-service.ts`, routers | Operational core and guided intake compat consumers | Bespoke activation/runtime summaries | Consumers assume service-specific fields | `operational-core-runtime-bindings`, activation orchestrator | None shared | Direct returns | Medium | Register under canonical envelope at router boundary |
| Architecture map runtime | `architecture-map-runtime-service` and router | Architecture map runtime UI/compat | Router maps service state into `{ runtime_state, ... }` | Consumers assume router-transformed snake_case | Service adapter | None shared | Direct returns | Medium: router transforms are implicit contracts | Declare transform contract or eliminate ungoverned shape conversion |
| Registry/lens runtime normalizer | `normalizePipelineRegistry`, `normalizeLensRegistry` | Runtime registry consumers | Returns iterable-safe registry objects | Consumers assume arrays are present | These functions themselves | `validateRegistryIterability`, `classifyRegistryDrift` | Drift classified as `verified`/`drifted`; no transport error preservation | Low for iterability, high if mistaken as response envelope | Keep as payload normalizer, not canonical API boundary |
| UI data guards | `safeText`, `safeNumber`, `safeArray`, `safeObject`, `validateRenderData`, etc. | Many client pages/components | Render-safe values, arrays, objects, validation result | Components can fail closed visually | Functions in `client/src/lib/data-guard.ts` | `validateRenderData` only if called | Invalid data becomes empty/fallback, which can hide backend contract drift | High if used as primary contract mechanism | Use only after server response validation; do not patch contracts with `safeArray` |

## Existing helpers / normalizers / contracts

Observed:

- `client/src/lib/data-guard.ts`: `safeText`, `safeNumber`, `safeArray`, `safeObject`, `validateRenderData`, `stableKey`, `isValidData`, `isValidArrayData`, `isMockDisabled`, `safeJsonParse`.
- `server/runtime/registry-contract-normalization.ts`: `normalizePipelineRegistry`, `normalizeLensRegistry`, `validateRegistryIterability`, `classifyRegistryDrift`.
- `server/engines/ingestion_control.ts`: queue contract helpers (`map_queue_row`, `classify_policy`), candidate extraction/binding/classification helpers, `verify_registry_candidate`, promotion adapter helpers, material-scope classifier, feature flag check.
- `server/routes/ingestion_control_router.ts`: REST response helpers (`clamp_integer`, `read_queue_row_id`, `parse_command_json`, `failed_rows_from_stdout`, `row_state_changed`) and endpoint-local JSON envelopes.
- `server/routers/ingestion-control-router.ts`: tRPC zod input validation for queue list/detail.
- `server/runtime/resource-query-reconciliation.ts`, `signal-query-reconciliation.ts`, `trend-contract-authority.ts`: reconciliation/authority utilities for specific runtime payloads.
- `server/runtime/runtime-drift-ledger.ts`: drift recording surface.
- `server/canonical-guard.ts`, `server/canonical-enforcement.ts`, `server/lib/determinism.ts`: canonical/determinism enforcement utilities that are not response-envelope contracts.
- `shared/jurisdiction-substrate.ts`, `shared/api-connector-types.ts`: shared domain payload types and normalization, not a runtime response envelope.

## Duplicate / competing contract layers

Observed:

1. Client render guards (`data-guard.ts`) compete with server response contracts by silently coercing bad values.
2. Ingestion-control REST envelopes (`success/error/message/...`) compete with tRPC direct returns and tRPC thrown errors.
3. Runtime service bespoke objects (`runtimeState`, `metrics`, `convergence`) compete with ingestion action envelopes.
4. Registry iterability normalizers compete with producer contracts only for registry/lens payloads.
5. UI page-local TypeScript types in `ingestion_control.tsx` duplicate backend engine return shapes.
6. UI page-local shape assertions duplicate missing backend output schemas.
7. External script stdout JSON for extraction/promotion is an implicit contract outside TypeScript.
8. Promotion dry-run and verification dry-run share counts conceptually but use different result field sets.
9. Feature flags are represented both as server blockers and UI disabled-button logic.
10. Empty/unavailable states are represented by empty arrays, `success:false`, HTTP status, warning strings, panel placeholders, and client fallback text depending on surface.

## Ingestion state truth table

| queue_state | storage_mode | text_present | next_action | expected worker | actual code path | blocker | recommended fix |
|---|---|---:|---|---|---|---|---|
| `pending_bucket_content_scan` for `.docx` | bucket/path-backed | no raw/normalized text | `extract_docx_queue_row` | DOCX extractor | REST per-row/drain invokes `scripts/extract-docx-corpus-queue.mjs --apply`; engine classifies row through `classify_policy` | Extraction command can fail or emit non-JSON; queue row remains blocked/review | Govern extractor diagnostic envelope and persist exact failure state |
| `pending_docx_normalization` for `.docx` | bucket/path-backed or extracted payload | raw text present, normalized missing | `normalize_docx_queue_row` | Normalization drain | REST `/normalize-docx-drain` SQL updates normalized text/chars/status | No shared worker contract; UI assumes summary shape | Promote normalization result into same action envelope |
| `ready_for_review` for `.docx` | any | normalized text present | `create_registry_candidates` | Candidate conveyor | `create_candidates_from_ready_queue()` reads ready rows and inserts `registry_entity_extraction_v4`; updates queue to `candidates_created` | Candidate classification may produce review/context/provenance holds | Expose candidate creation summary as canonical conveyor result |
| `candidates_created` with target hint `state_enriched_registry_docx_review` | any | candidate payload present | verify/promote dry-run | Verification engine | `verify_registry_entity_candidates_dry_run()` reads `registry_entity_extraction_v4` and calls `verify_registry_candidate` | Verification blocks missing source/name/citation/useful fields/provenance/lane | Share verification summary with promotion apply |
| `candidates_created` with safe target/adapters | any | candidate payload present | apply if enabled | Promotion apply | `promote_registry_entity_candidates_apply()` joins queue+candidates, checks target hint, flag, target columns, adapters, material scope | `ENABLE_CANONICAL_PROMOTION_FOR_STATE_ENRICHED_REGISTRY_DOCX_REVIEW` false blocks non-dry-run; unsafe adapters/material scope block rows | Model `can_apply` and blockers in canonical state; keep feature flag as one blocker, not assumed root cause |
| failed status containing `failed` | any | maybe | `inspect_error_then_retry_step` | Operator/retry | `classify_policy()` sets review class and blocked reason from status | Error details may be split across status, payload, stdout/stderr previews | Standardize `diagnostics.errors[]` |
| no `target_hint` | any | maybe | `set_target_hint` | Operator | REST `set-target-hint` validates allowed hints and updates queue | Missing target hint blocks routing/promotion | Represent as `state: unavailable`, reason `missing_target_hint` |
| legal/statute/authority target | any | maybe | `route_corpus_queue_dry_run` | Strict authority review | `classify_policy()` forces strict authority review/dry-run | Strict authority cannot silently merge | Represent as partial/review state with explicit governance reason |
| non-DOCX with target hint | any | maybe | `route_corpus_queue_dry_run` | Route dry-run | No generic apply worker observed in ingestion-control path | Apply path is not canonical for all hints | Add governed lane-specific worker contract before enabling apply |
| table/column target missing | any | candidate present | verify allowed, apply blocked | Promotion adapter | `promote_registry_entity_candidates_apply()` checks target/accounting/run columns | `no_safe_conveyor_run_target` or `no_safe_canonical_target` | Return structured `blockers` with missing capability |

## Top 10 systemic contract violations

Observed facts:

1. No shared response envelope is imported by routers/procedures; each producer returns a bespoke object.
2. Some output validation occurs in the UI instead of at server runtime boundaries.
3. REST and tRPC surfaces for the same engine are not fully aligned (`ready_for_review` allowed in REST but absent from the tRPC list enum).
4. External script stdout JSON is trusted as a runtime producer contract without schema validation.
5. Backend unavailable, partial, empty, and failed states are represented inconsistently (`success:false`, HTTP status, empty arrays, warnings, disabled controls, panel placeholders).
6. Verification and promotion share concepts but expose different count/sample shapes.
7. Feature flag state is split between server error fields and client disabled-button logic.
8. UI local TypeScript aliases duplicate backend return shapes without compile-time linkage.
9. Registry contract normalization governs iterability only, not transport/envelope semantics.
10. Client safety guards can mask producer drift by converting invalid data to empty values.

Inferred conclusions:

- These are contract-boundary issues, not proof that extraction, binding, verification, or promotion is independently broken.
- Dry-run/feature flags are confirmed blockers for canonical apply only after candidates reach promotion and only for non-dry-run apply or unsafe lanes/targets; they are not the root cause of extraction or candidate binding failures.

## Recommended canonical runtime contract boundary

Recommended boundary: **server router/procedure exit**, immediately before JSON/tRPC response leaves the backend, with generated/inferred client types. This keeps extraction, binding, verification, and promotion engines free to use internal domain types while ensuring every runtime consumer receives one governed envelope.

Recommended envelope shape:

```ts
type RuntimeEnvelope<TData, TState = RuntimeState> = {
  success: boolean;
  source: string;
  action?: string;
  data: TData | null;
  state: TState;
  diagnostics: {
    errors: Array<{ code: string; message?: string; detail?: unknown }>;
    warnings: Array<{ code: string; message?: string; detail?: unknown }>;
    backend?: unknown;
  };
  counts?: Record<string, number>;
  flags?: Record<string, boolean | string | number | null>;
  meta?: Record<string, unknown>;
};

type RuntimeState = {
  availability: "available" | "partial" | "empty" | "unavailable";
  can_apply?: boolean;
  dry_run?: boolean;
  blockers: string[];
};
```

Closest existing structure to canonical:

- `promote_registry_entity_candidates_apply()` already carries `success`, `dry_run`, `feature_flag_enabled`, `target_hint`, counts, `run_id`, `results`, and explicit blocker `error` values.
- `list_corpus_import_queue()` already carries `success`, row data, counts, row-level next action/blockers.
- The canonical boundary should generalize these patterns rather than adding more UI guards.

