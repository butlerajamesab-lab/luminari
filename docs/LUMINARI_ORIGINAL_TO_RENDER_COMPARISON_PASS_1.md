# Luminari Original Manus → Render Comparison Pass 1

## Scope

Original baseline:

```text
https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/
```

Render preview:

```text
https://luminari.onrender.com
```

This pass compares the original Manus baseline against the Render preview using:

- live original Manus root text
- Render screenshots supplied during recovery
- source route inventory from `client/src/App.tsx`
- activation rules in `docs/LUMINARI_ACTIVATION_CONTROL_MAP.md`

This pass does not activate production.
This pass does not modify Atlas.
This pass does not modify Supabase data.

---

## 1. Verified

### Activation map exists

The activation control map exists:

```text
docs/LUMINARI_ACTIVATION_CONTROL_MAP.md
```

It locks:

- Render is preview, not activated production.
- Original Manus is the baseline.
- `butlerajamesab-lab/luminari` is the full app repo.
- `Lighthouse-clean` is proof surface only.
- Atlas is paused.
- Supabase data is untouched.
- Sign-in is not passed.
- Original comparison is the next gate.

### Original Manus root baseline

The original Manus root is live and shows:

- Sign In
- Welcome
- How are you today?
- What obstacle is in your way?
- Let's Start
- Community Board
- Pipeline Map
- Did You Know?
- Enter the Lighthouse
- Explore Pipelines
- Join the Workshop
- Verify Integrity
- Support the Workshop

### Render preview visible surfaces from screenshots

Render screenshots show the full app shell is rendering and includes:

- Welcome / intake surface
- The Lighthouse page
- Pipeline/category exploration
- Litigation Barrier Explorer
- navigation shell
- Sign In / Preview Mode direction
- Civic Map navigation entry
- Viewfinder navigation entry
- Docket Room navigation entry

### Route source coverage exists in full repo

`client/src/App.tsx` contains source routes for core comparison surfaces:

- `/`
- `/welcome`
- `/mudroom`
- `/lighthouse`
- `/workshop`
- `/categories`
- `/category/:categoryId`
- `/civic-map`
- `/viewfinder`
- `/docket`
- `/legal-library`
- `/barriers`
- `/integrity`
- `/architecture-map`
- `/verify`
- `/resources`
- `/mission-control`

### Health gate status

`/api/health` is passed by user browser verification.

Expected project:

```text
wepxlinwbjrkqdzkqpar
```

---

## 2. Surface comparison table

| Surface | Original Manus baseline | Render evidence | Source route | Status | Activation decision |
|---|---|---|---|---|---|
| Landing / intake | Visible on original root: Welcome, obstacle prompt, Let's Start | Render screenshot shows Welcome / intake surface | `/`, `/welcome`, `/intake`, `/guided-intake` | Partial match by screenshot/source | Do not activate yet; continue route click verification |
| The Lighthouse | Original root includes Enter the Lighthouse / Orientation hub | Render screenshot shows The Lighthouse page | `/lighthouse` | Present on Render | Safe as preview; needs interaction proof |
| Mudroom | Product entry concept in route inventory | Not directly verified by screenshot | `/mudroom` | Source-present, live status unverified | Do not activate yet |
| Workshop | Original root includes Join the Workshop | Render screenshots show workshop entry/related nav context | `/workshop`, `/workbench`, `/workbench/:caseId` | Source-present, partial screenshot support | Do not activate yet |
| Pipelines | Original root includes Pipeline Map and Explore Pipelines | Render screenshot shows pipeline/category exploration | `/categories`, `/category/:categoryId` | Partial match | Safe as preview; verify category clicks |
| Civic Map | Original product includes CivicMap route; original root does not show map content directly | Render nav shows Civic Map entry | `/civic-map` | Source-present, nav-visible; live page not verified in this pass | Do not activate yet |
| Viewfinder | Original product includes viewfinder/anomaly surface in source inventory | Render nav shows Viewfinder entry | `/viewfinder` | Source-present, nav-visible; live page not verified | Do not activate yet |
| Docket Room | Render nav shows Docket Room | Render nav-visible | `/docket`, `/docket/:slug` | Extra/expanded Render surface relative to root; source-present | Preview only |
| Legal Library | Not visible on original root; product source includes it | Not verified by screenshot in this pass | `/legal-library` | Source-present, live unverified | Do not activate yet |
| Barrier Explorer | Not visible on original root; Render screenshot shows Litigation Barrier Explorer | Render screenshot verified | `/barriers` | Extra Render surface; source-present | Preview only; do not activate as workflow |
| Community Board | Visible on original root | Not directly verified in Render screenshot as full board | `/lighthouse`, likely board section | Partial; source behavior unverified | Do not activate yet |
| Integrity / architecture | Original root includes Verify Integrity | Render likely has nav/entry; not fully verified | `/integrity`, `/verify`, `/architecture-map`, `/architecture` | Source-present; live unverified | Do not activate yet |

---

## 3. Unverified

The following still require direct browser/live verification:

- Exact Render route response for each comparison route.
- Button target for Let's Start.
- Button target for Enter the Lighthouse.
- Button target for Explore Pipelines.
- Button target for Join the Workshop.
- Button target for Verify Integrity.
- Civic Map page content and data state.
- Viewfinder page content and data state.
- Docket Room page content and data state.
- Legal Library page content and data state.
- Barrier Explorer interaction states.
- Community Board full board behavior.
- Whether Render route content visually matches original beyond root-level screenshots.
- Whether each page is static only, connected, broken, or safe to activate.

---

## 4. Contradictions / Drift

### Drift: Render preview equals activated production

False.

Render is a preview until sign-in and original-to-Render comparison pass.

### Drift: Screenshot presence equals functional parity

False.

Screenshots prove surface presence, not button behavior, data connection, or workflow readiness.

### Drift: Source route exists equals live route works

False.

Source route presence in `App.tsx` is useful, but each route still needs live verification.

### Drift: Barrier Explorer is automatically safe to activate

False.

It renders, but the page is connected to enforcement/barrier data. It must remain preview until data safety and interaction states are verified.

### Drift: Atlas can resume now

False.

Atlas remains paused.

---

## 5. Required proof

For each core route, collect:

- live URL
- HTTP/browser result
- visible title
- visible major sections
- button targets
- modal behavior
- form actions
- network/API calls if visible
- classification:
  - matches original
  - missing from Render
  - extra on Render
  - static only
  - connected
  - broken
  - safe to activate
  - do not activate yet

Core route checklist:

```text
/
/welcome
/mudroom
/lighthouse
/workshop
/categories
/civic-map
/viewfinder
/docket
/legal-library
/barriers
/integrity
/architecture-map
/verify
/resources
```

---

## 6. Next action

Run live browser route verification for the core route checklist.

Use this order:

1. `/`
2. `/welcome`
3. `/lighthouse`
4. `/mudroom`
5. `/workshop`
6. `/categories`
7. `/civic-map`
8. `/viewfinder`
9. `/docket`
10. `/legal-library`
11. `/barriers`
12. `/integrity`
13. `/architecture-map`
14. `/verify`
15. `/resources`

Decision rule:

```text
Render remains preview only.
No activation until sign-in and comparison gates pass.
Atlas remains paused.
```
