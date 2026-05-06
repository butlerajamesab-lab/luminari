# LUMINARI ACTIVATION CONTROL MAP

## Purpose

This document is the control map for moving the Luminari/Lighthouse Render preview toward activated production without losing the original Manus product structure or crossing platform boundaries.

It is a coordination artifact only. It does not activate workflows, modify Atlas, mutate Supabase data, or enable sign-in.

---

## 1. Verified

### Current deployment posture

- Full application repo: `butlerajamesab-lab/luminari`
- Render preview URL: `https://luminari.onrender.com`
- Original product/reference baseline: `https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/`
- Temporary strict-chain proof repo: `butlerajamesab-lab/Lighthouse-clean`
- Lighthouse Supabase project: `wepxlinwbjrkqdzkqpar`
- Atlas remains paused.
- Supabase data remains untouched for this phase.

### Render preview state

- Full app repo deploys on Render.
- Frontend renders after prior runtime URL fix.
- `/api/health` was verified by user browser check.
- Public-facing sign-in promise was reduced to preview mode.
- `client/index.html` leaked artifact was removed.

### Sign-in state

- Current sign-in status: not passed.
- OAuth/backend auth routes are not verified as production-ready.
- Preview-open mode is intentional while comparison is underway.

---

## 2. Unverified

The following are not production-verified:

- Real sign-in.
- Session creation.
- Post-login redirect.
- `auth.me` tRPC route.
- `auth.logout` tRPC route.
- Supabase Auth integration, if any.
- Full original-to-Render route parity.
- All buttons, forms, modals, and linked flows.
- Runtime data connections for all 91 page components.
- CivicMap live data equivalence.
- Viewfinder, Docket Room, Legal Library, Workshop, and Pipeline behavior.
- Custom-domain production behavior.

---

## 3. Contradictions / Drift

### Drift: Render preview equals activated production

False.

Render currently functions as a preview surface. It is not activated production until sign-in and original comparison gates pass.

### Drift: Sign-in works because the app renders

False.

The app renders in preview-open mode. That does not prove OAuth, session, or auth router behavior.

### Drift: Lighthouse-clean is the full app

False.

`Lighthouse-clean` is a temporary strict-chain proof surface only. The full app repo is `butlerajamesab-lab/luminari`.

### Drift: CivicMap V2 replaces original CivicMap

False until explicitly verified and accepted.

CivicMap V2 remains a standalone Atlas-facing candidate/reference surface. The original CivicMap remains the product baseline until comparison proves otherwise.

### Drift: Atlas can resume because Render loads

False.

Atlas backfill remains paused until Lighthouse/Luminari consumption and display gates are deliberately passed.

---

## 4. Required proof gates

### Gate A — Preview health

Required proof:

- `https://luminari.onrender.com/api/health` returns healthy JSON.
- Response identifies the Lighthouse Supabase project `wepxlinwbjrkqdzkqpar`.
- App shell loads without browser runtime crash.

Status: partially passed by user browser verification. Keep evidence attached in screenshots or logs.

### Gate B — Original-to-Render visual parity

Compare:

- Original: `https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space/`
- Render: `https://luminari.onrender.com`

Classify each surface:

- matches original
- missing from Render
- extra on Render
- static only
- connected
- broken
- safe to activate
- do not activate yet

Core surfaces:

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

### Gate C — Sign-in/auth

Required proof:

- Sign In button target is correct.
- `/api/oauth/callback` exists and does not return 503.
- `auth.me` exists or equivalent session route exists.
- `auth.logout` exists or equivalent logout route exists.
- Session cookie is created.
- Post-login redirect works.
- Service-role key is not exposed client-side.

Current status: not passed.

### Gate D — Data safety

Required proof:

- No service-role key in browser-exposed bundle.
- No Supabase data mutation during preview comparison.
- No Atlas queue/backfill changes during comparison.
- Any connected data surfaces have explicit read/write boundaries.

Current status: enforce as lock.

### Gate E — Atlas resume gate

Do not resume Atlas backfill until:

- Render preview is stable.
- Original-to-Render comparison is complete.
- Strict Atlas chain display is integrated or intentionally deferred.
- CivicMap path is reconciled.
- Sign-in/auth direction is accepted.

---

## 5. Next action

### Immediate action

Perform the original-to-Render comparison pass.

Output must include:

1. Verified
2. Unverified
3. Contradictions / Drift
4. Required proof
5. Next action

### Working rule

Render may remain public as preview. Do not call it activated production.

### Activation rule

No feature is activated merely because a page renders. Activation requires:

- route proof
- interaction proof
- data proof
- security proof
- comparison proof

---

## Platform boundaries

- Atlas: upstream population/source/signal/queue system. Paused.
- Lighthouse/Luminari: user-facing civic intelligence application.
- Prism: reasoning/relationship/conflict layer.
- Rosetta: structured legal text/law translation layer.
- Esquire: pro se/case assistance workflow layer.

Do not collapse these systems into one product or database.
