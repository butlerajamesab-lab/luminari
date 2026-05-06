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

This pass adds user-side live Render evidence from direct browser checks.

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
- Architecture Map does not work.
- Several routes show the wrong screen or not the actual intended surface.

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

Classification:

- Surface exists.
- Data/population is missing.
- Does not match the original populated Pipeline Map expectation.
- Do not activate yet.

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

---

## 2. Current comparison board

| Surface | Render evidence | Status | Activation decision |
|---|---|---|---|
| Landing / intake | Renders and visually resembles original welcome/obstacle prompt | Partial match | Preview only; continue checks |
| The Lighthouse | Renders from screenshots | Present | Preview only; verify interactions |
| Mudroom | User reports works | Working | Safe as preview |
| Workshop | User reports works | Working | Safe as preview |
| Pipelines / Categories | Shows 0 categories, 0 pipelines, 0 situations mapped | Broken-empty | Do not activate |
| Civic Map | Shell works, actual map missing, no population visible | Broken/partial | Do not activate |
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
- Whether pipeline/category empty state is from missing seed data, API failure, or frontend query mismatch.

---

## 4. Contradictions / Drift

### Drift: Page renders means surface works

False.

The CivicMap shell renders, but the actual map and population are missing.

### Drift: Pipeline page exists means pipelines are restored

False.

The page currently reports 0 categories, 0 pipelines, and 0 situations mapped.

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
4. `/categories` or pipeline page network/API response if visible.
5. `/legal-library` status.
6. `/viewfinder` status.
7. `/verify` status.
8. `/resources` status.

---

## 6. Next action

Patch only comparison-blocking product shell issues, not Atlas.

Priority order:

1. Fix or restore pipeline/category population.
2. Fix CivicMap map rendering and resource population.
3. Fix Docket Room route.
4. Fix Architecture Map route.
5. Verify Legal Library, Viewfinder, Resources, and Verify.

Decision rule:

```text
Render remains preview only.
No production activation.
Atlas remains paused.
Supabase data remains untouched.
```
