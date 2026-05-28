# DB Naming Fix Plan (post-approval)

## Phase 1 — low-risk runtime fixes
1. `server/sunam-gate.ts`
   - Remove legacy `liveSignalId` and `timestamp` entries from `sunam_gate_log` INSERT column list and corresponding values.
   - Keep canonical snake_case columns only (`live_signal_id`, `decided_at`, `created_at`, etc.).
2. `runtime/national_runtime_convergence_plan.sql`
   - Replace `"createdAt"` with `created_at` in both view definitions.

## Phase 2 — verification
1. Static search regression checks for forbidden identifiers in SQL/runtime DB code:
   - `canonicalEntityName|entityRole|liveSignalId|scoreBreakdown|sunamScore|createdAt|updatedAt|workflowId`
2. Typecheck/tests (targeted first):
   - sunam gate router/service tests if available.
   - SQL/view lint or migration dry-run if available.

## Phase 3 — medium-risk follow-up (requires migration approval)
1. Audit `workflowId` physical camelCase columns declared in `drizzle/schema.ts`.
2. If DB still uses camelCase physically, prepare migration:
   - add snake_case columns
   - backfill
   - dual-write/compat period
   - cutover + remove old columns

## Success criteria
- Zero runtime-critical camelCase DB identifiers in SQL paths.
- Tests passing.
- No unresolved high-risk items.
