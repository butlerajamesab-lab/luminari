# Luminari Render Preview Gate Report

## 1. Verified

### Full app deployment state

- Full app repo: `butlerajamesab-lab/luminari`
- Render preview URL: `https://luminari.onrender.com`
- Original reference baseline: `https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/`
- Render frontend is rendering product surfaces based on screenshots supplied during recovery.
- The browser `Invalid URL` crash was fixed in `client/src/const.ts` by changing login URL construction to use a safe base/fallback.
- The visible `SECTION: CLIENT ENTRY & ROUTING` leak was found in `client/index.html` and removed in commit `6efab12c0a35a0b7335ea94b1603bf7bde705765`.
- The preview-open patch was added in commit `768cdf0b3fcb1d4aabac9299d513ba660d9197a3` to prevent the broken sign-in path from blocking exploration.
- Atlas was not modified.
- Supabase data was not modified.
- Atlas backfill remains paused.

### Original Manus root baseline

The original Manus root is live and Manus-hosted:

```text
https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/
```

Verified visible root sections:

- Sign In
- Welcome
- How are you today?
- What obstacle is in your way?
- Let's Start
- Community Board
- Pipeline Map
- Did You Know?
- Orientation hub / Enter the Lighthouse
- Explore Pipelines
- Workshop
- Integrity
- Support the Workshop

### Repo route baseline

`client/src/App.tsx` contains the full Lighthouse/Luminari page shell and routes for, at minimum:

- `/welcome`
- `/intake`
- `/case/:id`
- `/luminari-intake`
- `/guided-intake`
- `/benefits`
- `/my-applications`
- `/discover`
- `/guide/:caseId`
- `/shared/:token`
- `/mission-control`
- `/`
- `/lighthouse`
- `/civic-map`
- `/viewfinder`
- `/docket`
- `/docket/:slug`
- `/lumensend`
- `/legal-library`
- `/agency-metrics`
- `/civil-gideon`
- `/mental-health`
- `/categories`
- `/category/:categoryId`
- `/doctrine-graph`
- `/barriers`
- `/signal-registry`
- `/enforcement-intel`
- `/deadline-calculator`
- `/contradiction-scoring`
- `/enforcement-pathway`
- `/investigation-workflow`
- `/architecture-map`
- `/architecture`
- `/filing-generator`
- `/proof-frameworks`
- `/claim-elements`
- `/claim-denial-analysis`
- `/investigation-guidance`
- `/command-board`
- `/resolve`
- `/diagnostics`
- `/mudroom`
- `/workshop`
- `/workbench/:caseId`
- `/workbench`
- `/evidence-lab`
- `/shop-office`
- `/resources`
- `/sovereign-control`
- `/mission-control/governance`
- `/verify`
- `/business-analytics`

### Sign-in implementation state from source

`client/src/const.ts` generates a login URL using:

- `VITE_OAUTH_PORTAL_URL`, with fallback to `window.location.origin`
- `VITE_APP_ID`, with fallback to `luminari-lighthouse`
- redirect URI: `/api/oauth/callback`

`server/_core/index.ts` currently stubs OAuth routes. All `/api/oauth/*` requests return a disabled response. Therefore:

```text
Sign In button visible/renderable does not equal sign-in working.
OAuth/session flow is not active yet.
```

### Preview-open decision

The app is allowed to remain live as preview for inspection.

It is not production-activated.

---

## 2. Unverified

The following are not verified yet:

- Live `GET https://luminari.onrender.com/api/health` response from an external browser after the latest deploy.
- Live root fetch from this environment; tool DNS/cache access to Render failed during verification.
- Live route-by-route status for every route in `client/src/App.tsx`.
- Live button click behavior across pages.
- Live modal states.
- Live form actions.
- Runtime network calls from the browser.
- Whether every original Manus page has a matching Render page.
- Whether every Render page matches original visual/function intent.
- Whether sign-in can create a real session.
- Whether Supabase auth is used for sign-in/session.
- Whether post-login redirect works.
- Whether any protected workflows should remain blocked.

---

## 3. Contradictions / Drift

### Drift 1 — Sign In works because the button renders

False.

The frontend can generate a URL safely now, but backend OAuth is still stubbed.

### Drift 2 — Render preview equals activated production

False.

Render preview is live for inspection only. Production/custom-domain activation waits for sign-in and original-to-Render comparison gates.

### Drift 3 — The strict Atlas-chain proof page is the full app

False.

The full app now lives in `butlerajamesab-lab/luminari`. `Lighthouse-clean` remains a temporary proof surface only.

### Drift 4 — Atlas can resume because Render renders

False.

Atlas backfill remains paused until the Render product shell, comparison gate, and activation gates pass.

---

## 4. Required proof

### Sign-in gate

Verify:

1. Sign In button target after preview-open patch.
2. Whether Sign In is hidden/neutralized or still clickable.
3. `VITE_OAUTH_PORTAL_URL` production value.
4. `VITE_APP_ID` production value.
5. `/api/oauth/callback` route behavior.
6. Session cookie creation.
7. Post-login redirect.
8. Supabase auth/session involvement.
9. Missing env vars.

Current expected state:

```text
Sign-in remains disabled/not active during preview.
```

### Original-to-Render comparison gate

Compare original Manus vs Render across:

- Landing / intake
- The Lighthouse
- Mudroom
- Workshop
- Pipelines
- Civic Map
- Viewfinder
- Docket Room
- Legal Library
- Barrier Explorer
- Community Board
- Integrity / architecture

Each surface must be classified:

- matches original
- missing from Render
- extra on Render
- static only
- connected
- broken
- safe to activate
- do not activate yet

### Health gate

Verify in browser:

```text
https://luminari.onrender.com/api/health
```

Expected:

```json
{
  "ok": true,
  "supabaseProject": "wepxlinwbjrkqdzkqpar"
}
```

---

## 5. Next action

1. Deploy latest preview-open commit if not already deployed:

```text
768cdf0b3fcb1d4aabac9299d513ba660d9197a3
```

2. Browser-check:

```text
https://luminari.onrender.com/api/health
```

3. Run live route comparison beginning with:

- `/`
- `/lighthouse`
- `/mudroom`
- `/workshop`
- `/categories`
- `/civic-map`
- `/viewfinder`
- `/docket`
- `/legal-library`
- `/barriers`
- `/integrity`
- `/architecture-map`

4. Keep app live as preview only.
5. Do not resume Atlas.
6. Do not claim production activation until both gates pass.
