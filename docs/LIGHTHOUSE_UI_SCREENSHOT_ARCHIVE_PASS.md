# Lighthouse UI Recovery — Screenshot Archive Pass

## Operating Lock

Render remains preview only.
Atlas remains paused.
Supabase data remains untouched.
Production auth remains inactive / unapproved.
Service-role keys must not be exposed client-side.
Screenshots are visual baseline evidence, not implementation proof.

Architecture boundaries remain:

- Atlas = population / stream engine
- Lighthouse = human-facing UI / intelligence hub
- Prism = reasoning layer
- Rosetta = law translation layer
- Esquire = procedural / case-assistance layer
- CDA = primary structured export spine

---

## 1. Verified

### Screenshot archive located

Primary archive:

```text
https://drive.google.com/drive/folders/1sRHpFVzdtUguVt993QxES_5t1SW3_30e
```

The archive is accessible through Google Drive listing and contains March-April 2026 screenshots including Comet and Samsung Browser captures.

First visible filename families include:

- `Screenshot_20260314_*_Comet.jpg`
- `Screenshot_20260315_*_Comet.jpg`
- `Screenshot_20260316_*_Comet.jpg`
- `Screenshot_20260419_*_Samsung Browser.jpg`
- `Screenshot_20260423_*_Comet.jpg`

This confirms a time-spanning visual archive suitable for Lighthouse UI recovery comparison.

### Source route baseline verified

`PAGES.md` is the master page inventory and states there are 91 pages. Required major Lighthouse-facing and adjacent surfaces include:

- `/` Home
- `/lighthouse`
- `/mudroom`
- `/workshop`
- `/categories`
- `/civic-map`
- `/viewfinder`
- `/docket`
- `/legal-library`
- `/architecture-map`
- `/doctrine-graph`
- `/resources`
- `/benefits`
- `/barriers`
- `/templates`
- `/mission-control`
- `/sovereign-control`
- `/signal-registry`
- `/admin/knowledge-population`
- `/admin/test-scenarios`
- `/admin/resource-verification`

The clean rebuild blueprint verifies the rebuild context: 492 database tables, 84 server routers, 91 client pages, schema/ORM drift, duplicate tables, no canonical schema, no idempotent seed, and no startup integrity check.

The diagnostic router/page report verifies the older diagnostic surface included 57 tRPC routers and 84 UI page components, grouped into ingestion, signal, case/legal, structural analysis, admin/control, workbench/tools, and data/knowledge layers.

---

## 2. Baseline Artifact Inventory

### Master source artifacts

- `PAGES.md` — 91-page route/page inventory
- `LUMINARI_UI_ARCHITECTURE_—_NAVIGATION.md` — navigation hierarchy
- `LUMINARI_UI_ARCHITECTURE_—_PANELS.md` — expected panels per page
- `LUMINARI_UI_ARCHITECTURE_—_CONNECTIONS.md` — UI/backend connections
- `LUMINARI_UI_ARCHITECTURE_—_BUTTONS_&_ACTIONS.md` — click/action behavior
- `LUMINARI_—_Clean_Rebuild_Blueprint.md` — rebuild scope and canonical schema requirement
- `LUMINARI-DIAGNOSTIC-ROUTERS-PAGES.md` — older router/page diagnostic
- HTML surfaces: intake, mission control, anomaly viewfinder, asset recovery engine
- Screenshot archive: visual baseline proof and route-state recovery evidence

### Screenshot categories for inventory

Each meaningful screenshot should be tagged into one or more of these categories:

1. Lighthouse dashboard / workspace
2. Mission Control / Sovereign Control
3. Civic Map / resources
4. Legal Library
5. Signal Registry / Atlas-facing
6. Evidence / case flow
7. Intake / orientation
8. Workshop / integrity
9. Admin / control
10. Auth-gated / broken state
11. Render comparison target

---

## 3. Upgrade Overlay

Certain Render differences may be intentional upgrades and should not be treated as failures if the baseline function is preserved:

- CivicMap may be upgraded beyond the original map behavior.
- Atlas data population should remain separate from Lighthouse UI display.
- Render may use different route shells if source-backed functionality is preserved.
- Review environments use the same Supabase authentication boundary as production. Synthetic preview identities are prohibited.

Upgrade overlay does not excuse missing baseline surfaces.

---

## 4. Render Comparison Matrix — First Pass

| Surface | Source Route | Baseline Evidence | Render State | Classification |
|---|---:|---|---|---|
| Home / Welcome | `/` / N/A Welcome | screenshots + PAGES | renders preview | partial |
| Lighthouse | `/lighthouse` | PAGES + screenshots | renders preview | partial |
| Mudroom | `/mudroom` | PAGES + user report | works | present / preview |
| Workshop | `/workshop` | PAGES + user report | works | present / preview |
| Pipeline / issue catalog | `/categories` + category surfaces | PAGES + screenshots | route drift; user says original was not “Categories” label | needs reconciliation |
| CivicMap | `/civic-map` | PAGES + screenshots | shell works, map/data missing | upgrade target incomplete |
| Viewfinder | `/viewfinder` | PAGES + screenshots + HTML artifact | unknown completeness | inspect/compare |
| Docket Room | `/docket` | PAGES + screenshots | broken per user | broken |
| Legal Library | `/legal-library` | PAGES + screenshots | unknown/incomplete | high-priority inspect |
| Architecture Map | `/architecture-map` | PAGES + screenshots | broken per user | broken |
| Doctrine Graph | `/doctrine-graph` | PAGES + screenshots | unknown | inspect |
| Resource Directory | `/resources` | PAGES + screenshots | unknown/incomplete | inspect |
| Benefits Navigator | `/benefits` | PAGES | unknown | inspect |
| Mission Control | `/mission-control` | PAGES + screenshots | unknown / likely gated | inspect |
| Sovereign Control | `/sovereign-control` | PAGES + screenshots | unknown / likely gated | inspect |
| Signal Registry | `/signal-registry` | PAGES + screenshots | unknown | inspect |
| Knowledge Population | `/admin/knowledge-population` | PAGES + screenshots | unknown / likely gated | inspect |
| Test Scenarios | `/admin/test-scenarios` | PAGES + screenshots | unknown / likely gated | inspect |
| Case Templates | `/templates` | PAGES + screenshots | unknown | inspect |

---

## 5. Drift Register

### Drift A — Screenshot-only recovery

Screenshots prove visual state, but cannot prove implementation, data connection, or working buttons.

Resolution: use screenshots as visual baseline; use PAGES, navigation, panels, buttons/actions, connections, repo files, and Render routes for implementation mapping.

### Drift B — Route name vs product surface

`/categories` exists in PAGES, but user notes “Categories” was not the original mental/product label.

Resolution: classify as Pipeline / issue catalog and reconcile route naming later.

### Drift C — Original combined prototype vs current platform boundaries

Original Manus screenshots show Lighthouse, Atlas-like ingestion/admin, legal library, case/test, signal, and anomaly surfaces in one prototype.

Resolution: preserve visible surfaces, but assign current ownership correctly across Atlas, Lighthouse, Prism, Rosetta, Esquire, and CDA.

### Drift D — Render preview mistaken for production

Render currently renders some surfaces but has broken/missing routes.

Resolution: Render remains preview until route comparison, sign-in/auth, data safety, and original-to-Render comparison gates pass.

---

## 6. Missing / Hidden Routes

Known or suspected missing/broken/hidden routes from user reports and baseline docs:

- `/docket` — broken
- `/architecture-map` — broken
- `/civic-map` — shell without map/data
- `/mission-control` — needs inspection for auth/gating
- `/sovereign-control` — needs inspection for auth/gating
- `/legal-library` — needs comparison against original legal library depth
- `/viewfinder` — needs comparison against original 50-state anomaly tabs
- `/signal-registry` — needs comparison against screenshot archive
- `/admin/knowledge-population` — likely admin/gated; verify route state
- `/admin/test-scenarios` — likely admin/gated; verify route state

---

## 7. Dashboard Recovery Priorities

1. Restore stable review access through a real non-production Supabase account.
2. Preserve Alexander dashboard/workspace continuity:
   - continue where you left off
   - recent ingestion/case items
   - direct access
   - guided start
   - authenticated review usability
3. Restore sidebar/nav grouping from source docs.
4. Fix broken core routes:
   - Docket Room
   - Architecture Map
   - Legal Library
   - Viewfinder
   - Resource Directory
5. Classify admin/control routes:
   - Mission Control
   - Sovereign Control
   - Knowledge Population
   - Signal Registry
6. Keep Atlas paused until Lighthouse display surfaces are safe and route-visible.

---

## 8. Next Action

Create the full screenshot-to-route inventory table.

For each screenshot:

- filename
- date/time from filename
- source app/browser
- category
- visible route or inferred route
- visible page/surface
- visible panels/modules
- visible navigation state
- likely platform ownership
- linked PAGES.md route
- Render route status
- decision: preserve / port now / port later / archive / needs proof

Then run route-by-route Render inspection against the source inventory.

No Atlas changes.
No Supabase data mutations.
No production activation.
