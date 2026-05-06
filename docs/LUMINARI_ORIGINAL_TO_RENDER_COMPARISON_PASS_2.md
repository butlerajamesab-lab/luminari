# Luminari Original Manus → Render Comparison Pass 2

## Scope

Original baseline:

```text
https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/
```

Render preview:

```text
https://luminari.onrender.com
```

This pass adds user-side live Render evidence from direct browser checks and corrects two comparison assumptions:

1. `/categories` is not a required original-baseline surface.
2. CivicMap does not need to match the old original map exactly because the desired direction is the upgraded CivicMap path.

No Atlas changes.
No Supabase data changes.
No production activation.

---

## 1. Verified

### Render preview is live

The Render app renders multiple product surfaces.

### User-side route evidence received

User reported:

- `/docket` does not work.
- `/civic-map` page works but the actual map does not render.
- CivicMap has no visible population/data.
- `/mudroom` works.
- `/workshop` works.
- `/architecture-map` does not work.
- Several routes show the wrong screen or not the actual intended surface.
- `/categories` was never part of the required original product surface.
- The old original CivicMap does not need to be preserved exactly; the goal is the upgraded CivicMap path.

### Screenshot comparison evidence

#### Pipeline / category exploration

Render showed:

```text
Where is the obstacle showing up in your life right now?
0 categories
0 pipelines
0 situations mapped
No categories match ""
```

Corrected classification:

- Surface exists.
- It is extra / non-baseline unless explicitly adopted later.
- It should not block original-to-Render parity because categories were not part of the original required product surface.
- Preview only.

#### Action Path page

Render showed:

```text
Luminari: Your Action Path
Housing & Eviction
Employment & Wages
Benefits & Food Assistance
Healthcare & Insurance
Disability & Accommodations
Other Crisis
```

Classification:

- Page renders.
- It is an alternate/static guided flow.
- It does not replace the original landing/intake surface.
- Preview only.

#### CivicMap

User reported:

```text
/civic-map page works, but the actual map does not render and no population/data is visible.
```

Corrected classification:

- CivicMap is an upgrade target, not an exact old-map parity requirement.
- The missing map/data still matters because the upgraded map must eventually work.
- This is an upgrade/integration blocker, not proof that the original product comparison failed.
- Do not activate CivicMap yet.

---

## 2. Current comparison board

| Surface | Render evidence | Status | Activation decision |
|---|---|---|---|
| Landing / intake | Renders and visually resembles original welcome/obstacle prompt | Partial match | Preview only; continue checks |
| The Lighthouse | Renders from screenshots | Present | Preview only; verify interactions |
| Mudroom | User reports works | Working | Safe as preview |
| Workshop | User reports works | Working | Safe as preview |
| Pipelines | Original had Pipeline Map / Explore Pipelines entry; Render has alternate category/action surfaces | Needs original-route clarification | Preview only |
| `/categories` | Shows 0 categories, 0 pipelines, 0 situations mapped | Extra / non-baseline route | Not an original-parity blocker; preview only |
| Civic Map | Shell works, actual map missing, no population visible | Upgrade target incomplete | Do not activate CivicMap yet |
| Viewfinder | Nav/page evidence exists, full behavior not verified | Unverified | Do not activate |
| Docket Room | User reports does not work | Broken | Do not activate |
| Legal Library | Not yet verified in this pass | Unverified | Do not activate |
| Barrier Explorer | Renders from screenshot | Present, but connected behavior unverified | Preview only |
| Community Board | Original has board; Render full-board behavior unverified | Partial/unverified | Do not activate |
| Integrity / Architecture | Architecture Map reported not working | Broken | Do not activate |
| Action Path | Renders but is alternate flow | Extra/static candidate | Preview only |

---

## 3. Unverified

Still unverified:

- Exact broken behavior for `/docket`.
- Exact broken behavior for `/architecture-map`.
- Whether `/architecture` differs from `/architecture-map`.
- Whether `/verify` works.
- Whether `/legal-library` works.
- Whether `/viewfinder` has live/meaningful data.
- Whether `/resources` works.
- Whether CivicMap failure is map-library, data, API, geodata, or CSS/container sizing.
- Which route is the correct Render equivalent for original Pipeline Map / Explore Pipelines.

---

## 4. Contradictions / Drift

### Drift: `/categories` is required because it exists in Render

False.

User clarified categories were not part of the original required product surface. It is an extra/non-baseline route unless explicitly adopted later.

### Drift: CivicMap must match the old original map exactly

False.

User clarified the upgraded CivicMap is desired. The old original map is not the activation standard. The standard is a working upgraded CivicMap path.

### Drift: Page renders means surface works

False.

The CivicMap shell renders, but the actual upgraded map and population are missing.

### Drift: Architecture/Integrity is ready

False.

Architecture Map is reported not working.

### Drift: Render is activation-ready

False.

Comparison gate is not passed.

---

## 5. Required proof

For the next pass, capture or inspect:

1. `/docket` screenshot and error/state.
2. `/architecture-map` screenshot and error/state.
3. `/civic-map` screenshot showing missing map area and any browser-visible errors.
4. Correct Render route for original Pipeline Map / Explore Pipelines.
5. `/legal-library` status.
6. `/viewfinder` status.
7. `/verify` status.
8. `/resources` status.

---

## 6. Next action

Patch only comparison-blocking product shell issues, not Atlas.

Priority order:

1. Fix Docket Room route.
2. Fix Architecture Map route.
3. Identify correct Pipeline Map / Explore Pipelines route and classify it.
4. Fix upgraded CivicMap map rendering and resource population as an upgrade task.
5. Verify Legal Library, Viewfinder, Resources, and Verify.

Decision rule:

```text
Render remains preview only.
No production activation.
Atlas remains paused.
Supabase data remains untouched.
```
