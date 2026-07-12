# Investigation: Signal layer dark in frontend (2026-07-11)

## 1. Executive summary
The main regression is in the CivicMap frontend read path: the map no longer reads signal tables/views directly and now calls `/api/civic-map/*` endpoints that return resource-layer rows (`map_layer1_points` / `map_layer2_detail`) rather than signal-layer rows. In git history, the prior direct signal reads (`detected_signals`) were removed from `client/public/civicmap.html` in the viewport-freeze change, which matches the symptom “signal world used to be lit, now dark” while DB signal data remains populated.

## 2. All signal read paths

| File | Line(s) | Table / view / RPC read | Supabase client instance | Filters / conditions | Render location |
| --- | ---: | --- | --- | --- | --- |
| `/home/runner/work/luminari/luminari/client/src/pages/SignalRegistry.tsx` | 64 | `trpc.enforcementIntel.listSignals` | Frontend: none (tRPC). Backend uses Drizzle DB pool | Backend filter excludes `signal_type` matching `contradiction_%`, `missing_evidence_%`, `inconsistency_%` | `SignalRegistry` route `/signal-registry` (`App.tsx:273`) |
| `/home/runner/work/luminari/luminari/server/routers/enforcement-intelligence.ts` | 201-205 | `signal_registry` (via `signalRegistry`) | No Supabase JS client (server DB pool) | `WHERE signal_type NOT LIKE ...` exclusions above; ordered by `signal_type` | Returned to `SignalRegistry.tsx` |
| `/home/runner/work/luminari/luminari/client/src/pages/SignalRegistry.tsx` | 66 | `trpc.enforcementIntel.listRegistrySignals` | Frontend: none (tRPC). Backend uses Drizzle DB pool | Optional `jurisdiction`, `category`, `severity`; `limit` default 100 (UI passes 200) | `SignalRegistry` route `/signal-registry` |
| `/home/runner/work/luminari/luminari/server/routers/enforcement-intelligence.ts` | 1102-1117 | `registry_signals` (via `registrySignals`) | No Supabase JS client (server DB pool) | Optional `.where(and(eq(jurisdictionId), eq(category), eq(severity)))`; ordered by `createdAt desc`; limit | Returned to `SignalRegistry.tsx` |
| `/home/runner/work/luminari/luminari/client/src/pages/StructuralDiagnosticsLens.tsx` | 211 | `trpc.dualLens.getSignalPatterns` | Frontend: none (tRPC). Backend uses Drizzle DB pool | None in UI call (`{}`) | `StructuralDiagnosticsLens` route `/diagnostics` (`App.tsx:289`) |
| `/home/runner/work/luminari/luminari/server/routers/dual-lens.ts` | 630-636 | `signal_registry` (via `signalRegistry`) | No Supabase JS client (server DB pool) | No SQL filter | Returned to `StructuralDiagnosticsLens.tsx` |
| `/home/runner/work/luminari/luminari/client/src/pages/StructuralDiagnosticsLens.tsx` | 216-220 | `trpc.dualLens.getLiveSignalsForDiagnostics`, `trpc.dualLens.getLiveSignalSummary` | Frontend: none (tRPC). Backend uses Drizzle DB pool | UI passes optional `jurisdiction`, `domain` | `StructuralDiagnosticsLens` route `/diagnostics` |
| `/home/runner/work/luminari/luminari/server/routers/dual-lens.ts` | 717-727, 799-837 | `detected_signals` (via `detectedSignals`) + `signal_registry` cross-reference | No Supabase JS client (server DB pool) | Base condition `signal_id IS NOT NULL`; optional `jurisdiction_scope`, `dataset_id`, `severity_level`; ordered `detection_timestamp desc`; limit | Returned to `StructuralDiagnosticsLens.tsx` |
| `/home/runner/work/luminari/luminari/client/src/hooks/mission/useMissionControlData.ts` | 26 | `trpc.adminDashboard.structuralSignals` | Frontend: none (tRPC). Backend uses Postgres pool | None in UI call | Mission Control surfaces (`/mission-control`, `/mission-control/full`) |
| `/home/runner/work/luminari/luminari/server/routers/admin-dashboard.ts` | 113-136 | `detected_signals` | No Supabase JS client (server DB pool) | Severity/category aggregates; critical list filtered to `severity IN ('high','critical')`; latest limit 10 | Returned to Mission Control UI |
| `/home/runner/work/luminari/luminari/client/src/pages/MissionControl.tsx` | 1003-1004 | `trpc.unified.get_unified_signals`, `trpc.unified.get_unified_signal_summary` | Frontend: none (tRPC). Backend uses Postgres pool | UI passes `limit: 20` for list | `MissionControl` route `/mission-control/full` |
| `/home/runner/work/luminari/luminari/server/unified-queries.ts` | 133-135, 152-153 | `detected_signals` | No Supabase JS client (server DB pool) | Optional filters mapped to existing cols: `stream_id/dataset_id`, `severity_level/severity`, `status`; ordered by newest timestamp col; limit/offset | Returned to Mission Control unified panels |
| `/home/runner/work/luminari/luminari/client/src/hooks/useWorldIndex.ts` | 38 | `trpc.world.getIndex` | Frontend: none (tRPC). Backend uses Postgres pool | None | Used by `/lighthouse`, `/diagnostics`, `/resources`, `/admin/analytics`, `/agency-metrics`, `/lumensend` |
| `/home/runner/work/luminari/luminari/server/services/world-index.ts` | 559-562, 591-596, 632-637, 673-676 | `detected_signals`, `atlas_lighthouse_signal_bridge_v1`, `atlas_lighthouse_judicial_signal_bridge_v1`, `signal_events` | No Supabase JS client (server DB pool) | No `WHERE` filters on these signal-source reads | Returned to `world.getIndex` consumers |
| `/home/runner/work/luminari/luminari/client/public/civicmap.html` | 75, 77 | **Current path:** fetches `/api/civic-map/bounds` and `/api/civic-map/detail/:id` (not direct signal tables) | Browser fetch only; no Supabase JS client in current file | Bounds params `north/south/east/west/limit` | `CivicMap` route `/civic-map` (`App.tsx:254`) |
| `/home/runner/work/luminari/luminari/server/routes/civic-map-router.ts` | 98, 150 | `map_layer1_points(...)`, `map_layer2_detail(...)` (resource-focused) | No Supabase JS client (server DB pool) | Spatial bounds filter + limit via function args; detail by UUID | Returned to `client/public/civicmap.html` |

### Supabase direct-call grep result (requested)
- `supabase.from(` and `supabase.rpc(` calls in **current frontend** (`client/src`, `client/public`) for signal tables/views/RPCs: **none found**.
- TanStack/SWR explicit query keys containing `signal`: **none found** (tRPC hook usage dominates).

## 3. Suspicious commits

| SHA | Date | Author | Files touched | What changed |
| --- | --- | --- | --- | --- |
| `db84337ef3ef23191cd94e43ed1803bd8ae9ffa4` | 2026-05-28 | butlerajamesab-lab | `client/public/civicmap.html`, `server/routes/civic-map-router.ts` | Removed browser Supabase reads including `.from('detected_signals')`; switched CivicMap to `/api/civic-map/*` viewport API backed by map-layer functions (resource path). |
| `d2f2064f862c6f6619ad42f779cea0e689be8f61` | 2026-05-27 | butlerajamesab-lab | `server/routes/civic-map-router.ts` | Added CivicMap API routes based on `normalized_civic_resource` (later map-layer functions), not explicit signal views/tables. |
| `2b33b1ef6bc39bf81b412716681e748f434cf6ef` | 2026-05-24 | butlerajamesab-lab | `client/public/civicmap.html` | Changed direct Supabase query contracts to snake_case; this commit still used direct browser Supabase reads before later removal. |
| `ed609ceed01b23c74774a9ad89a741568fd7038f` | 2026-06-18 | butlerajamesab-lab | `client/src/pages/SignalRegistry.tsx`, `server/routers/enforcement-intelligence.ts`, `drizzle/schema.ts` | Renamed UI/API field contracts to snake_case for signal surfaces; high-risk for frontend/back-end contract drift if partially rolled out. |
| `1d88c223971d046a6a5e4c656d9a84ed5d0ebf15` | 2026-06-26 | butlerajamesab-lab | many files incl. `server/routers/admin-dashboard.ts`, `server/routers/enforcement-intelligence.ts` | Large naming migration; signal payload field names and dashboard response keys adjusted (potential downstream UI mismatch). |
| `380b238bd12e8f70d44164793f844d863f547529` | 2026-05-31 | butlerajamesab-lab | `server/_core/context.ts` | Added Supabase bearer-token auth resolution into tRPC context (auth/session wrapper changed). |
| `b85e2df6e3d02b52c1eefc11f5085fc9a960f7b0` | 2026-06-01 | butlerajamesab-lab | `server/_core/context.ts` | Reworked context user resolution via snake_case resolver and forwarded Supabase session handling (client-role/auth behavior changed again). |
| `db54e976f7436eff142ec129394edd78c0ad7c06` | 2026-06-07 | butlerajamesab-lab | `tools/gpt-website-renderer/.env.example` | `.env*` touched in 60-day window (not a frontend signal path, but included per request). |

## 4. Config check

- **Frontend Supabase env names used in code:**
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`client/src/lib/supabase.ts:3-7`)
- **Repo config files observed:**
  - `render.yaml` defines `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, and `LIGHTHOUSE_SUPABASE_URL` (project ref string points to `wepxlinwbjrkqdzkqpar`), but does **not** declare `VITE_SUPABASE_URL` in-file.
  - `.github/workflows/deploy-staging.yml` comment references staging project `wepxlinwbjrkqdzkqpar`; envs use secret-backed `SUPABASE_URL`/keys.
  - `render.preview.runtime.yaml` contains `SUPABASE_PROJECT_REF` set to a **different** ref (`ickuyayatfmbtbayiqvd`) for preview runtime.
  - `field-atlas-streaming/.env.example` includes `SUPABASE_URL=https://wepxlinwbjrkqdzkqpar.supabase.co`.
- **Deploy platform reality check limitation:**
  - Actual deployed env values in Render/Manus/Vercel/Railway cannot be verified from repo-only inspection.

## 5. Ranked root-cause hypotheses

1. **CivicMap signal read-path regression (highest confidence)**  
   **Evidence:** commit `db84337...` removes direct browser reads of `detected_signals` and switches to `/api/civic-map/*`; current server endpoints for those routes read resource-layer map functions, not signal-layer sources. This directly explains a “dark/empty signal layer” while DB signal tables still have rows.

2. **Auth/session read-role drift affecting signal procedures (medium confidence)**  
   **Evidence:** back-to-back context/auth wrapper commits (`380b238...`, `b85e2df...`) changed how user identity is resolved for tRPC requests. If any signal routes depend on auth-derived visibility or role assumptions, request context changes can zero out effective reads.

3. **Environment misroute / ref mismatch across runtime surfaces (medium-low confidence)**  
   **Evidence:** repo shows mixed project-ref signals (`wepx...` in several places vs `icku...` in preview runtime config) and frontend code requiring `VITE_SUPABASE_URL` while render config in-repo does not explicitly define it. A miswired deploy env could point frontend/runtime components to the wrong project or incomplete env set.

## 6. Recommended next action (read-only, no fixes proposed)

1. **For read-path regression hypothesis:**
   - In browser devtools on deployed app, capture network calls for `/civic-map` and verify whether any response payload includes signal rows (or only resource map-layer rows).  
   - Compare with pre-regression behavior by replaying the old `civicmap.html` query path in a local read-only checkout of commit `2b33b1e...` (no DB writes).

2. **For auth/session drift hypothesis:**
   - Invoke a signal tRPC endpoint (e.g., `adminDashboard.structuralSignals`) with and without auth session on the same environment and compare row counts/payload shape.  
   - Confirm request context user resolution path used (session openId/email vs forwarded Supabase session token).

3. **For env misroute hypothesis:**
   - Read-only verify deployed environment variable names and target project ref in deployment dashboard(s) against the repo contract (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and expected `wepx...` ref for Lighthouse surfaces).

