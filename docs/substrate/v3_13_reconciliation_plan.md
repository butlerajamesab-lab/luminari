# Luminari v3.13 substrate reconciliation plan

Status: pre-deployment reconciliation

This branch establishes the controlled path for bringing the generated v3.13 substrate into Lighthouse without writing the raw bundle directly into canonical production tables.

## Retrieved source bundle

| Artifact | Size / scope | SHA-256 | Deployment status |
|---|---:|---|---|
| `v3_13_full_substrate_ingest.sql` | 37,576 lines; ~14 MB; 171 files; 36,876 generated rows; 20 target families | `9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be` | Not applied to production; not yet committed because it requires normalization and duplicate repair first |
| `content_card_schema.sql` | Lighthouse station/card/binding wrapper | `42d7cc8194351b7b7c8cec2f8808b6874992bb15f6125659f920ab9a3a612abd` | Not applied |
| `20260709_000002_locations_geometry_and_trigger.sql` | Lighthouse resource-location geocoding path | `adbb11cfe187587e78877424762ebeaed8e1d3785a3ad7352e0e8e1c87696290` | Not applied |
| `20260708_000002_addresses_geocode_trigger.sql` | Generic Field Atlas address table path | `c00635f3f01faa4c452d0d6e3d3fb9318f578cf6d30c51d111f3eeb61747278e` | Hold; not part of the Lighthouse canonical path unless explicitly adapted |

## Live production verification

The following production facts were verified before opening this branch:

- `registry_programs`: 8,361 rows
- `legal_statutes`: 1,598 rows
- `coalition_advocacy_orgs`: 87 rows
- `legislator_contacts`: 12 rows
- `programs`: absent
- all checked v3.13 staging and target tables: absent
- `lighthouse_station`, `content_card`, `card_action`, and `station_binding`: absent

Therefore the generated v3.13 bundle is treated as a prepared source package, not as deployed state.

## Reconciliation doctrine

1. Preserve source evidence unchanged.
2. Normalize source hashes to a canonical full digest before deduplication.
3. Keep exploded DOCX field rows as forensic evidence only.
4. Promote complete normalized resource/program/statute records separately.
5. Never infer canonical identity from workbook row position alone.
6. Existing production tables are enriched only after exact schema and identity comparison.
7. Station bindings are created only after canonical record identity is established.
8. Every promotion batch must be countable, restartable, and reversible.

## Known blocking defects in the raw ingest

- Some records use an eight-character source hash while equivalent rows use the full hash. The current uniqueness key would admit both.
- Deep-dive resources appear both as exploded field rows and as later normalized composite rows.
- Several generated destinations overlap populated production tables and cannot be blindly inserted.
- The generated `programs` destination does not exist in production.
- The generic `public.addresses` geocoder conflicts conceptually with the existing `luminari_resource_locations` model.

## Build sequence

### Phase 1 — Control substrate

- Install reconciliation-control tables only.
- Register every source artifact and expected target family.
- Record live target existence, shape, and counts.

### Phase 2 — Safe staging

- Generate corrected staging DDL.
- Load source rows with canonical source hashes and deterministic source-row keys.
- Mark exploded field rows versus normalized composite rows.

### Phase 3 — Entity reconciliation

- Compare normalized candidates against existing canonical entities.
- Assign one disposition per candidate: `insert`, `enrich`, `duplicate`, `hold`, `reject`, or `provenance_only`.
- Produce deterministic promotion batches.

### Phase 4 — Controlled promotion

- Promote one bounded domain first.
- Verify row counts, identity collisions, contacts, locations, and legal references.
- Repeat by domain only after the prior batch passes verification.

### Phase 5 — Lighthouse rooting

- Install the station/card wrapper schema.
- Bind canonical rows to Lighthouse stations explicitly.
- Verify dark stations and substrate orphans before publication.

## Current branch scope

This first commit adds the reconciliation doctrine and a non-destructive control migration. It does not insert the 36,876 generated records and does not change production.