# ADR: Integration-Safe Nationwide Jurisdiction Substrate Ownership

Status: proposed for this PR
Date: 2026-06-07

## Decision

This PR uses **Option B** for the immediate implementation: existing Lighthouse jurisdiction tables remain the current canonical base, and this PR adds only additive assertion, alias, coverage-run, overlap-assertion, and metadata-gap layers around those existing identities.

This PR does **not** introduce a new canonical jurisdiction identity table.

## Canonical jurisdiction identity owner

Long-term platform documentation assigns shared reference geography and public jurisdiction context to Atlas. Until an Atlas canonical jurisdiction bridge is complete, verified, and adopted by runtime readers, Lighthouse must treat its existing jurisdiction tables as real operational infrastructure.

Current ownership split:

- **Long-term target owner:** Atlas, through a verified Atlas-to-Lighthouse bridge/projection.
- **Current operational base:** Lighthouse recovery/runtime tables.
- **This PR's role:** additive assertion/projection infrastructure that can reference either current Lighthouse tables or future Atlas bridge identities through `(jurisdiction_ref_table, jurisdiction_ref_id)`.
- **Not allowed in this PR:** creating a new unowned canonical jurisdiction table that competes with existing tables.

## Current canonical base

No single existing table has complete nationwide jurisdiction semantics today. Current runtime truth is distributed:

- `public.registry_jurisdictions` is the current registry/runtime jurisdiction base for registry programs, workflows, oversight bodies, signals, source traceability, World Index registry nodes, Unified Access, and Lighthouse gate surfaces.
- `public.jurisdictions` is the Layer 0 operational table used by older canonical ingestion flows, including Washington ingest and layer-based program/workflow/accountability/signal tables.
- `public.jurisdiction_hierarchy` carries existing hierarchy, parent, preemption, override, agency, statute, and filing venue semantics.
- `public.knowledge_coverage_metrics` carries existing jurisdiction × claim-type coverage metrics.
- Atlas bridge views and World Index derived jurisdiction logic remain read/projection sources, not a replacement canonical identity in this PR.

For this PR, `registry_jurisdictions` is the preferred default reference for registry-facing assertions when a current runtime jurisdiction ID exists. `jurisdictions`, `jurisdiction_hierarchy`, and Atlas bridge references remain valid reference targets when they are the source of the record being asserted.

## Canonical ID strategy

This PR uses dynamic references:

```txt
jurisdiction_ref_table + jurisdiction_ref_id
```

Examples:

- `registry_jurisdictions:j_washington`
- `registry_jurisdictions:j_washington_dc`
- `jurisdictions:42`
- `jurisdiction_hierarchy:17`
- `atlas_bridge:atlas-jurisdiction-id`

This avoids inventing a new ID namespace before a migration decision is made.

## Legacy IDs to preserve

The additive alias layer must preserve and map, where available:

- registry IDs (`j_washington`, `j_puerto_rico`, etc.)
- legacy `jurisdictions.id` and `jurisdictions.code`
- state codes
- territory codes
- FIPS and county FIPS
- Census GEOID
- GNIS identifiers
- BIA identifiers
- OpenStates IDs
- court identifiers
- display names
- alternate names
- slugs

## Runtime systems currently reading jurisdiction data

Known current readers/owners that must not be broken by this PR:

- World Index jurisdiction nodes and program nodes
- `registry_jurisdictions` consumers
- `jurisdiction_hierarchy` consumers
- `jurisdictions` Layer 0 ingestion flows
- Knowledge ingestion jurisdiction list
- Knowledge coverage / Mission Control gap surfaces
- Civic Map and geocoding behavior
- Resource Directory geography/service-area behavior
- Benefits Navigator geography
- Legal Library jurisdiction filters
- Doctrine Graph jurisdiction edge context
- Registry programs, workflows, oversight bodies, policy alerts, source traceability, and signals
- Atlas/Lighthouse bridge projection expectations

## Compatibility views/adapters required

This PR does not require runtime pages to switch immediately. Required follow-up adapters:

1. World Index adapter that reads active `jurisdiction_assertions` and joins to existing node IDs without replacing existing jurisdiction nodes.
2. Registry adapter that resolves `registry_jurisdictions` IDs through `jurisdiction_aliases`.
3. Knowledge ingestion jurisdiction list adapter that emits current labels plus assertion/gap counts.
4. Mission Control coverage adapter that reads `jurisdiction_coverage_runs` and `jurisdiction_coverage_items` as reproducible snapshots.
5. Civic Map/Resource Directory service-area adapter that links assertion rows to county FIPS, Census GEOID, service-area geometry refs, and regional/legal-aid/tribal service areas.
6. Legal Library and Doctrine Graph adapter that treats jurisdiction assertions as context on records/edges, not as replacement canonical law identity.

## Write policy

Allowed writers:

- ingestion and extraction pipelines may write queued/candidate `jurisdiction_assertions`
- audit/review workflows may update review and promotion status
- coverage jobs may write `jurisdiction_coverage_runs` and `jurisdiction_coverage_items`
- compatibility/backfill jobs may write `jurisdiction_aliases`
- gap detection may write `jurisdiction_metadata_gaps`

Read-only projections:

- World Index, Lighthouse pages, Resource Directory, Benefits Navigator, Legal Library, Doctrine Graph, and Civic Map should initially read from these additive tables only through compatibility adapters.
- Existing canonical/runtime jurisdiction tables are not rewritten by this PR.

## Migration and backfill path

Required migration path after this PR:

1. Inventory all rows from `registry_jurisdictions`, `jurisdictions`, `jurisdiction_hierarchy`, Atlas bridge jurisdiction IDs, and free-text jurisdiction columns.
2. Populate `jurisdiction_aliases` with active mappings from legacy IDs and display names to existing canonical refs.
3. Backfill `jurisdiction_assertions` for existing registry programs, legal statutes, legal case law, resources, workflows, oversight bodies, signals, deadline rules, and coverage rows.
4. Generate `jurisdiction_metadata_gaps` for records with unknown, missing, ambiguous, tribal, rural/service-area, or mixed jurisdiction metadata requiring review.
5. Generate coverage runs with reproducible source inventory hashes.
6. Add runtime adapters one surface at a time.
7. Only after Atlas canonical jurisdiction identity is verified, add a migration that maps existing refs to Atlas refs and preserves compatibility views.

## Tribal handling

Tribal jurisdiction must not be flattened into state or federal logic. This PR keeps tribal-specific assertion metadata on assertion records so tribal identity, federal recognition status, source authority, tribal government/court names, service/reservation area, state overlap, BIA/IHS/BIE overlap, ICWA relevance, Public Law 280 relevance, and treaty/reserved-rights references can be retained before a final tribal identity table exists.

Future Atlas or Lighthouse canonical tribal identity tables may replace these assertion metadata fields with normalized references. Assertions must preserve the original evidence and source authority during that migration.

## Rural and service-area handling

This PR does not populate geometries. It reserves explicit fields for county FIPS, Census GEOID, service-area geometry references, regional service areas, legal-aid service areas, tribal service areas, travel-barrier flags, remote/phone/online intake availability, and rural/frontier classification. Geometry and distance calculation should be owned by Atlas/Civic Map or a dedicated geospatial store, then referenced from assertions.

## Explicitly out of scope for this PR

- Creating a new canonical jurisdiction identity table.
- Replacing `registry_jurisdictions`, `jurisdictions`, or `jurisdiction_hierarchy`.
- Rewriting runtime pages to consume assertions directly.
- Populating all counties, municipalities, tribal nations, courts, agencies, or service areas.
- Populating service-area geometry.
- Claiming nationwide data coverage.
- Promoting heuristic jurisdiction detections directly to canonical runtime truth.
