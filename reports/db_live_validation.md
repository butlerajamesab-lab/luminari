# DB Live Validation (Supabase) — 2026-05-27

## Environment / Tooling
- Attempted direct Supabase REST validation against project `wepxlinwbjrkqdzkqpar`.
- Supabase CLI is not installed in this container (`supabase: command not found`).
- Network egress to Supabase REST endpoint is blocked in this environment (`CONNECT tunnel failed, response 403`).

## Queries/requests executed (with evidence)

### 1) View definition and runtime-view checks
Attempted smoke reads:
- `GET /rest/v1/v_runtime_signal_scroll?select=*&limit=1`
- `GET /rest/v1/v_enforcement_record_tallies?select=*&limit=1`

Result:
- `curl: (56) CONNECT tunnel failed, response 403`

### 2) sunam_gate_log write-contract checks
Attempted smoke read:
- `GET /rest/v1/sunam_gate_log?select=*&limit=1`

Result:
- `curl: (56) CONNECT tunnel failed, response 403`

### 3) Legacy identifier DB-object scan
Planned runtime-facing object scans (views/tables metadata and definitions) could not run due to blocked connectivity.

### 4) Dependency + runtime checks
Planned dependency checks and simple count/select smoke queries could not run against live DB due to blocked connectivity.

## Local code + SQL contract validation (completed)
Even though live DB was unreachable, local Phase 1 contract fixes are present:
- `runtime/national_runtime_convergence_plan.sql` uses `created_at` (no `"createdAt"` in touched view definitions).
- `server/sunam-gate.ts` INSERT uses canonical snake_case columns only; legacy `liveSignalId` and `timestamp` aliases were removed.

## Pass/Fail per requested check
1. Confirm current runtime-facing view definitions in DB are snake_case-safe: **FAIL (blocked by connectivity)**.
2. Validate `sunam_gate_log` live table column support for updated INSERT: **FAIL (blocked by connectivity)**.
3. Scan runtime-facing DB objects for listed legacy camelCase identifiers: **FAIL (blocked by connectivity)**.
4. Re-run DB dependency checks and smoke queries on touched views/tables: **FAIL (blocked by connectivity)**.

## Residual risks
- Live DB state may differ from repository SQL/code state because direct validation was not possible in this environment.
- Potential drift risk remains until live validation is executed from an environment with Supabase network access and service-role credentials.

## Deferred items (explicit)
- Phase 3 `workflowId` physical schema migration remains deferred intentionally (out of scope for this task and explicitly requested not to execute).
