# DB Naming Mismatch Audit Report (snake_case contract)

## Scope
- Runtime code paths only (SQL strings, query-builder column declarations used at runtime, RPC adapters/mappers touching DB row shapes).
- Excluded: pure UI/internal JS object naming and storage internal constraint names.

## High-confidence runtime-critical mismatches

✅ **Resolved in Phase 1**

| File | Line | Symbol | Previous usage | Current status |
|---|---:|---|---|---|
| `server/sunam-gate.ts` | 378 | `liveSignalId` | `INSERT INTO sunam_gate_log (..., liveSignalId, timestamp)` | Removed from INSERT column list and values. |
| `server/sunam-gate.ts` | 378 | `timestamp` | `INSERT ... timestamp` legacy alias field | Removed from INSERT column list and values. |
| `runtime/national_runtime_convergence_plan.sql` | 9 | `"createdAt"` | `max("createdAt") as latest_record` | Replaced with `max(created_at)`. |
| `runtime/national_runtime_convergence_plan.sql` | 27 | `"createdAt"` | `coalesce("createdAt", now())` | Replaced with `coalesce(created_at, now())`. |

## Remaining non-Phase-1 items

| File | Line | Symbol | Note | Priority |
|---|---:|---|---|---|
| `drizzle/schema.ts` | 4477 | `workflowId` mapped as `varchar("workflowId")` | Physical DB column appears camelCase in this table definition; requires migration decision before runtime rename. | Follow-up (Phase 3, deferred) |
| `drizzle/schema.ts` | 4978 | `workflowId` mapped as `integer("workflowId")` | Same as above. | Follow-up (Phase 3, deferred) |
| `drizzle/schema.ts` | 4997 | `workflowId` mapped as `integer("workflowId")` | Same as above. | Follow-up (Phase 3, deferred) |

## Outcome
- Zero unresolved **runtime-critical** camelCase DB identifier mismatches in Phase 1 scope.
- `workflowId` physical schema migration remains intentionally deferred per instruction.


## Verification snapshot
- Regression grep on touched runtime SQL files found no remaining `"createdAt"`, `liveSignalId`, or legacy `timestamp` DB identifier usage.
- Typecheck run (`npm run check`) fails due to broad pre-existing repository errors unrelated to Phase 1 files.
- SQL/view dry-run validation is not available in this environment without an active DB/migration target; deferred to integration pipeline.
