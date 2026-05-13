# Atlas Current State and Lighthouse Bridge

Date: 2026-05-13
Repository scope: active Lighthouse/Luminari V1 repo
Atlas repository: `https://github.com/butlerajamesab-lab/atlas`
Atlas Supabase project ref: `bjdjjgnkhxblnpdrjqtw`

## Scope

This document records Atlas's current verified role from the perspective of Lighthouse recovery. Atlas is the upstream ingestion and population machine. Lighthouse should consume only verified Atlas outputs and bridge views; Lighthouse should not treat Atlas schemas, edge functions, or temporary shims as Lighthouse-owned runtime authority.

Atlas is best understood as a partially deployed civic ingestion and signal-generation engine with proven Washington-focused pipelines, a deployed but not fully authenticated generic edge-function ingestion path, and a controlled Atlas-to-Lighthouse bridge for deterministic Open States Washington signals.

---

## Verified Role

Atlas currently owns upstream civic/legal/resource ingestion and normalization. Its role is to ingest external data, normalize it, produce entities/signals, and feed downstream products such as Lighthouse.

| Field | Value |
| --- | --- |
| System | Atlas |
| Supabase project ref | `bjdjjgnkhxblnpdrjqtw` |
| Current role | data ingestion engine / upstream population machine |
| Primary downstream target | Lighthouse |
| Strongest verified bridge | Atlas to Lighthouse, scoped to Open States Washington deterministic signals |

Atlas is not the same thing as the temporary Atlas-style bridge shim. The shim is only a temporary route adapter and does not implement Atlas ingestion, signal creation, resource backbone routes, live-stream routes, final Atlas API behavior, or database writes.

---

## Previously Verified Atlas Data Areas

Earlier platform status identified Atlas as holding Washington-focused civic/resource data and signals:

| Data Area | Count |
| --- | ---: |
| Food banks | 268 |
| Washington benefits records | 185 |
| Washington nonprofits | 125 |
| Entities | 504 |
| Signals | 52 |
| Civic map resources | 578 |
| Jurisdictions | 79 |
| Agency metrics | 533 |

Earlier verified ingestion pipelines:

| Pipeline | Records | Scope |
| --- | ---: | --- |
| `benefits_wa` | 185 | Washington only |
| `nonprofits_wa` | 125 | Washington only |
| `food_banks_king_county` | 268 | King County, Washington |
| `regulations_gov` / FCC-17-108 | 1,000 | one federal FCC proceeding |

These are real-data pipelines, but they are limited in scope. They do not establish national coverage.

---

## Population Engine Status

A later Atlas deployment path partially verified the registry-based ingestion chain:

```txt
real upstream API -> atlas-engine -> raw_records -> statutes -> ingest_jobs
```

Verified components:

| Component | Status |
| --- | --- |
| `002_atlas_infrastructure.sql` | succeeded |
| `schema_registry` | 25 rows |
| `connector_registry` | 25 rows |
| `raw_records` | present; 0 rows before test |
| `ingest_jobs` | present; 0 rows before test |
| `statutes` | present; 0 rows before test |
| `atlas-engine` Supabase Edge Function | deployed |
| Open States connector | present |
| Open States connector target table | `statutes` |

The controlled Open States test proved function invocation, registry lookup, schema lookup, and job creation/update. It failed before fetching records because Open States v3 required an API key and no valid `OPENSTATES_API_KEY` was available.

Proven invocation path:

```txt
atlas-engine invocation -> registry lookup -> schema lookup -> ingest_jobs creation/update -> upstream request attempted -> auth failure recorded
```

---

## Working Surfaces

### Existing Atlas ingestion pipelines

The Washington pipelines and the FCC proceeding pipeline produced real records, entities, and signals. They support the standalone CivicMap V2 view but remain geographically narrow.

### CivicMap V2

CivicMap V2 is live as a standalone deployment pointing directly at Atlas, not Lighthouse. It reportedly shows about 392 pins across food banks, benefits offices, nonprofits, and signals. Its limitation is data coverage: Atlas has Washington-focused data loaded, not national coverage.

### Registry infrastructure

The registry infrastructure exists and contains 25 schema rows and 25 connector rows. `raw_records`, `ingest_jobs`, `statutes`, the Open States connector, and the deployed `atlas-engine` edge function are present.

### Controlled Atlas-to-Lighthouse bridge v1

The strongest verified downstream proof is the controlled bridge from Atlas production signals to Lighthouse.

| Boundary | Object |
| --- | --- |
| Atlas approved source | `public.v_civic_map_signals_production` |
| Lighthouse destination | `public.atlas_lighthouse_signal_bridge_v1` |
| Lighthouse verified view | `public.v_atlas_lighthouse_bridge_v1_verified` |

The bridge loaded 60 deterministic Open States Washington signals. A second run left the destination stable at 60 rows with no duplicates, proving idempotence for the controlled path.

---

## Bridge Proof Metrics

| Metric | Value |
| --- | ---: |
| Atlas raw signal count | 112 |
| Quarantined legacy signals | 52 |
| Verified deterministic signals | 60 |
| Atlas production view count | 60 |
| Lighthouse bridge table count | 60 |
| Lighthouse verified bridge view count | 60 |
| Legacy IDs bridged | 0 |
| Production IDs missing from bridge | 0 |
| Bridged IDs not in production view | 0 |
| Bridge equals production-view ID set | true |

Signal distribution:

| Signal Type | Count |
| --- | ---: |
| `classification_activity` | 20 |
| `jurisdiction_legislative_activity` | 20 |
| `new_statute_or_bill` | 20 |
| Total | 60 |

The bridge must read from `public.v_civic_map_signals_production`, not from raw `atlas.civic_map_signals`. The 52 quarantined legacy signals are intentionally excluded.

---

## Timeline Correction

There are two Atlas bridge states that must not be confused.

| Date / State | Verified Meaning |
| --- | --- |
| Earlier state, 2026-04-27 | Atlas data existed, but Atlas-to-Lighthouse automatic bridge was not verified; Lighthouse data was stale/manual; CivicMap was standalone. |
| Later state, 2026-04-30 | A controlled v1 bridge was proven for Open States Washington deterministic production signals. |

The later bridge proof partially supersedes the earlier manual-only concern, but only for the scoped Open States Washington signal path.

---

## Not Ready / Not Verified

| Area | Current State |
| --- | --- |
| Final Atlas TypeScript API | not verified / not built in available artifacts |
| Atlas resource backbone routes | not present in temporary bridge shim |
| Atlas live-stream routes | not present in temporary bridge shim |
| Generic authenticated Open States ingestion | not proven; blocked by missing API key |
| CourtListener ingestion | not proven; unauthenticated probe returned HTTP 401 |
| Open States WA query adapter | needs verification or patch; generic fetcher may not translate `jurisdiction = WA` correctly |
| National data coverage | not present |
| Automatic continuous Atlas-to-Lighthouse sync | controlled bridge proven; continuous sync not independently verified |
| Atlas-to-Prism native bridge | not verified |
| Atlas-to-Rosetta native bridge | not verified |
| Atlas-to-Esquire native bridge | not final; temporary shim/composition only |
| Full domain-layer packaging | conceptual/planned unless repo/package inspection proves otherwise |

---

## Atlas Proper vs Temporary Shim

Atlas proper is the ingestion/population engine:

```txt
external sources -> connector registry -> schema registry -> atlas-engine -> raw_records -> domain tables -> signals -> verified production views -> downstream bridge tables/views
```

The temporary Atlas-style bridge shim is only a route adapter exposing paths such as:

```txt
GET /cases/:caseId/esquire-view
GET /cases/:caseId/law-view
GET /cases/:caseId/reasoning-view
GET /jurisdictions/:jurisdiction/lighthouse-context
GET /cases/:caseId/full-view
```

The shim does not ingest, normalize, create signals, infer law, infer jurisdiction, write to databases, or implement final Atlas routes.

---

## Lighthouse Consumption Rules

Allowed Lighthouse uses:

- consume `public.v_atlas_lighthouse_bridge_v1_verified`
- display verified bridged Atlas signals with provenance
- keep quarantined legacy signals excluded
- treat the Atlas bridge as read-only Lighthouse context
- preserve Atlas IDs and source-view lineage in downstream UI/export surfaces

Forbidden Lighthouse uses:

- reading raw `atlas.civic_map_signals` directly as production truth
- bridging quarantined legacy signals
- forcing Atlas records into Lighthouse case/finding schemas without a bridge contract
- treating the temporary shim as final Atlas API
- claiming national Atlas coverage before data is loaded and verified

---

## Safest Next Build Step

The safest next Atlas build sequence is:

1. Set a valid `OPENSTATES_API_KEY`.
2. Rerun the controlled Open States Washington test.
3. Patch the Open States adapter if `jurisdiction = WA` is not translated correctly for the upstream API.
4. Verify `raw_records` and `statutes` upserts.
5. Schedule the controlled Atlas-to-Lighthouse bridge.
6. Make Lighthouse consume `public.v_atlas_lighthouse_bridge_v1_verified`.

After this path is proven, Atlas can credibly serve as the ingestion spine: ingest first, verified production views second, downstream products third.
