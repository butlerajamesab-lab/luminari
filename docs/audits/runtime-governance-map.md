# Runtime Governance Map

Production incident recovery and stop/go thresholds are governed by
[`LIGHTHOUSE_STABILIZATION_RUNBOOK.md`](../LIGHTHOUSE_STABILIZATION_RUNBOOK.md).

This document is the working runtime-control map for Lighthouse. The goal is to stop recurring pool-saturation and contract-drift incidents by treating every runtime surface as part of one governed system rather than as separate page bugs.

## Current invariant

No user-visible page refresh should fan out into enough concurrent DB work to saturate the shared PostgreSQL pool.

With the current pool size, runtime dashboards must not issue uncoalesced bursts of database reads. Polling dashboards must use bounded read-through caching, in-flight dedupe, stale-on-error fallback where safe, and explicit runtime envelopes.

## Runtime families

| Runtime family | Mount / entry | Current posture | Required governance |
| --- | --- | --- | --- |
| tRPC | `/api/trpc` | Default context no longer DB-hydrates profile | Keep DB profile resolution opt-in per procedure |
| Health liveness | `/api/health` | DB-free | Must remain DB-free |
| DB diagnostics | `/api/db-diagnostic`, `/api/system/health` | DB-touching diagnostics | Must be bounded, non-stampeding, and expose pool stats rather than pretending liveness failed |
| Ingestion Control | `/api/ingestion-control` | Hot read containment added for queue/candidate reads | Migrate all read endpoints to shared cache/dedupe pattern; write/actions remain uncached |
| Mission Control | tRPC dashboard panels | High fan-out polling surface | Collapse repeated count queries, add shared read cache on server, safe render guards on client |
| Canonical Core | `canonicalCore.*` | Table-count sweep read path | Cache table-count sweep; do not run full sweep on every polling tick |
| Admin Dashboard | `adminDashboard.*` | Multiple repeated count queries | Aggregate/cache count queries per polling interval |
| Conveyor | `/api/conveyor` | Needs audit | Verify DB-touch count and add dedupe/cache for read-only status endpoints |
| Civic Map | `/api/civic-map` | Needs audit | Cache read-only map bounds/detail/index reads where applicable |
| Atlas proxy | `/api/atlas` | Proxy boundary | Do not add DB work here unless explicitly required |
| Docket / LegiScan | `/api/docket` | Stable; do not touch | Leave unchanged unless a verified defect appears |

## Rules

1. Runtime liveness and DB diagnostics are separate. `/api/health` must not acquire a DB client.
2. Default auth/context may preserve token identity, but must not hydrate DB profile by default.
3. Read-only polling endpoints need short TTL caching and in-flight dedupe.
4. Expensive count sweeps must be cached or batched.
5. Client render code must not crash on missing runtime data; missing data must render unavailable/zero/diagnostic state.
6. Contract adapters must preserve existing frontend runtime fields while DB identifiers remain canonical.
7. New runtime mounts require explicit justification. Missing-route proof first; no speculative mounts.
8. LegiScan `/api/docket` is excluded from pool-churn remediation unless direct evidence proves it is broken.

## Immediate backlog

1. Replace ingestion-control local cache implementation with `server/runtime/read_through_cache.ts`.
2. Add shared cache around `canonicalCore.health` table-count sweep.
3. Add shared cache around `adminDashboard.systemHealth`, `caseActivity`, `structuralSignals`, and `workQueue` read panels.
4. Add safe number/time formatter guards in Mission Control and Architecture-linked pages.
5. Run `node scripts/audit-runtime-surfaces.mjs` before runtime PRs and include the changed counts in PR notes.
6. Add CI advisory step for runtime surface audit after the app stabilizes.

## Non-goals

- No schema redesign for this pass.
- No LegiScan changes.
- No broad naming-convention churn.
- No one-off page patches without tracing the runtime boundary.
