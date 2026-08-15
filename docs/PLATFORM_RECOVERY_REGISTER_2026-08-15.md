# Luminari Platform Recovery Register

Status: Active recovery program

Audit date: 2026-08-15

Scope: Lighthouse, Civic Genome, Docket, Rosetta, Prism, Kaleidoscope, Atlas, Esquire, Population Engine, Resource Directory, intake, registry, Supabase, Render, and GitHub contracts.

## Non-negotiable source doctrine

User-created workbooks, documents, tables, and source packages are authoritative source evidence. The platform may classify, validate, deduplicate, or withhold a derived publication, but it must never erase a source cell, silently drop a row, or equate noncanonical formatting with missing evidence.

Every source record must have:

- An immutable source artifact and content hash.
- A sheet, row, cell, page, or span locator.
- A parser version and processing receipt.
- A typed destination or an explicit review destination.
- A reason code for every withheld derived publication.
- A count in the source-to-publication reconciliation funnel.

Unknown workbook rows remain preserved as `workbook_record`; they do not disappear because they are not Resource Directory records.

## Verified root causes

### Resource and address loss

The active fresh resource snapshot contains 2,868 identities: 2,866 resolved and two conflicts. It exposes only 380 addresses. The preceding snapshot exposed 2,625 addresses.

An identity-to-identity comparison found:

| Result | Count |
|---|---:|
| Current blank-address identities | 2,488 |
| Blank identities with a bound source candidate containing an address | 2,275 |
| Blank identities with no candidate address found | 213 |
| Addresses lost between the earlier and current snapshots | 2,202 |
| Addresses retained | 372 |
| Addresses newly gained | 3 |

The loss is a projection defect, not a source-data defect. Snapshot v2.3 used `\b` as a PostgreSQL word boundary. PostgreSQL requires ARE-compatible boundaries such as `\y`; consequently all 380 surviving addresses were PO boxes and no ordinary street address passed that branch. Address quality was also incorrectly used to null source evidence.

### Hidden governed resources

The governed resource entity cohort contains 4,438 records:

| Lane | Governed records |
|---|---:|
| `state_directory_logical_record` | 4,177 |
| `registry_entity_staging_programs` | 233 |
| `domain_deep_dive_v3_13_stage` | 25 |
| `substrate_candidate_disposition` | 3 |

The prior unified view admitted only the first lane and hid 261 governed records.

The 53,603 source-candidate rows are not 53,603 public resources. They are a raw evidence union: 41,644 normalized civic candidates, 8,694 registry programs, 2,561 nonprofit records, 556 government-benefit records, and 148 national records. Publication must be identity-aware and governed; raw candidates must remain inspectable without being promoted one-for-one.

### Ingestion gaps

- The fresh Storage manifest was populated once by migration and had no continuous synchronization for later uploads, replacements, or deletions.
- The DOCX parser collapsed table-cell tabs before label extraction and rejected sparse candidates with fewer than two recognized fields.
- XLSX rows were treated primarily as Resource Directory candidates; valid non-resource sheets could be discarded.
- Fresh parsing, quality evaluation, snapshot creation, and pointer activation were separate manual/admin operations.
- Fresh snapshot identities were not bound to the public entity surface.
- 615 intake-staging records were ready, including 540 contact/resource rows and 75 statutes; none were promoted. Of these rows, 469 contain addresses.
- The SAIS package was prepared but not staged: 26 documents, 192 resource candidates, 260 routing items, 656 deadline fields, and 19 overlap groups; its child/public tables contained zero rows.
- The historical import queue contained stale paths, runaway retry counts, and superseded artifacts.

### Civic Genome and automatic decomposition

- Docket bill activation and legislative-version workers were disabled in the Lighthouse runtime, so registered versions could not reach Rosetta.
- Activation repeatedly reset degraded or terminal legislative jobs to `eligible`, defeating retry backoff and causing five-second retry loops.
- Civic Genome's operating tile queried legacy numeric Rosetta identifiers while the current pipeline writes `docket:<bill>:<version>` identifiers.
- When the newest version had no Rosetta source document, the trait query widened to historical traits and labeled them as the current snapshot.
- The user interface therefore could simultaneously report `Not ingested` and display older structural DNA.

### Kaleidoscope

Kaleidoscope is presently a validated fixture surface, not a tandem runtime. Its live health contract reports staging, no authorized persistence, an unbound Civic Genome contract, no configured handoff, empty runtime tables, and fixture-only projections.

The current code authenticates one startup-configured snapshot receipt. It does not persist a baseline, map Prism verification, queue a projection, or return a durable result to Civic Genome.

### Availability and broken access paths

- World Index assembled more than 50,000 signal events and roughly 70,000 nodes in the Lighthouse process, repeatedly exceeding the Render memory limit and restarting the service.
- Registry client components call an unmounted `trpc.registry` root and then hide failures behind hard-coded counts.
- Registry queries use MySQL placeholders/result handling against PostgreSQL, and Benefits Navigator sends `state` while the server expects `stateCode`.
- The interpretation gate expects status `ok`, while the service returns `success`; all read/action/export requests are rejected.
- The dispatcher export is not an object with a callable `dispatch` method.
- Several mounted capabilities are stubs or fake-success facades: AKB, live-signal emission, form extraction, parts of operational workflow, and several Docket projections.
- Universal Intake hides pre-cutover entities, relationships, and chronology when no sealed canonical projection exists.
- Public Docket warming and cache-cost mutations appear reachable without an admin boundary.
- Typed client/server checking is disabled by `AppRouter = any` and broad TypeScript exclusions, allowing endpoint drift into production.

## Recovery already applied to live infrastructure

### Supabase

- Installed a source-address preservation contract that separates source evidence from formatting quality.
- Activated snapshot `v2.6.0-source-address-preservation-20260815` only after identity-set, source-value, provenance, and receipt checks passed. It retains 2,866 resolved identities and two conflicts while restoring 2,632 source-backed addresses, up from 380.
- Replaced the governed unified-resource gate with the exact four approved lanes. The view now contains 13,132 rows: 8,694 registry programs plus 4,438 governed entities.
- Added continuous Storage-to-manifest synchronization with change detection and tombstones. The first receipt observed 154 Storage objects, 154 active manifest artifacts, no missing artifacts, and seven pending extractions.
- Added a candidate-first quality index to avoid full quality-lane scans during field projection.
- Added a legislative queue state guard so activation cannot erase worker leases, retry delays, or terminal failures.

### Render

- Enabled `DOCKET_BILL_ACTIVATION_QUEUE_ENABLED` and `LEGISLATIVE_VERSION_QUEUE_ENABLED`.
- Set both new workers to concurrency one for a controlled recovery.
- Verified both workers started in the live deployment.
- Reprioritized the selected bill's unprocessed versions for proof of the automatic chain. Both its enrolled and chaptered versions completed Rosetta decomposition, Prism verification, and assembly without an operator action. All four registered versions now have version-scoped source, extraction, assembly, and verification receipts.

## Code repair tranche

### Continuous, button-free source reconciliation

The fresh corpus runtime now:

1. Synchronizes the two authoritative Storage buckets into an immutable manifest.
2. Detects new, changed, missing, or parser-stale artifacts.
3. Queues an idempotent rebuild automatically.
4. Processes bounded batches from the actual production import chain.
5. Repeats reconciliation on a bounded interval without starting the historical infinite worker.
6. Uses run-scoped candidate keys so an unchanged candidate can participate in a new run without being stranded on the earlier run.

Full automatic publication remains a required follow-on gate: quality evaluation, snapshot sealing, invariant checks, and atomic current-pointer activation must be chained through durable jobs rather than a user button.

### Workbook preservation and routing

Every nonempty XLSX row now produces a typed source candidate with its immutable workbook hash, decoded cell map, sheet and row locator, parser rule, destination, and routing state. Preamble and header rows are retained as `workbook_context`; formulas, cell type/style metadata, and duplicate header names remain traceable. The parser has no 100,000-row cutoff and commits candidates in heartbeat-protected batches, so a large authored workbook can resume idempotently without being flattened, silently truncated, or mistaken for an absent source.

| Workbook sheet family | Type | Destination |
|---|---|---|
| Resource directories, hotlines, clean/partial programs | `resource` | Resource Directory |
| Oversight bodies | `oversight_body` | Enforcement Intelligence |
| Coalition agencies | `agency` | Atlas |
| Key/state contacts | `contact_record` | Population Engine |
| Address audits | `resource_contact_audit` | Resource review |
| Tribal tables/matrices | `tribal_governance_record` | Population Engine |
| Advocacy targets/domains/networks | typed Atlas records | Atlas |
| Federal enforcement pathways | `enforcement_pathway` | Prism |
| Patterns and strategy paths | typed projection inputs | Kaleidoscope |
| Platform specification | `platform_specification` | Control plane |
| County overrides/state cards | jurisdiction types | Population Engine |
| Unknown sheet | `workbook_record` | Operator review, source preserved |

## Prioritized remaining repairs

### P0 — Data recovery and truthfulness

1. **Complete rich-field access around the activated address-preserving snapshot.**
   - The activation gate passed: 2,866 resolved identities, two conflicts, source-candidate provenance for every restored address, a matching recomputed receipt hash, and an unchanged identity set.
   - Keep addresses in list/detail surfaces independently of geocoding and extend the same preservation contract to rejected phone, email, website, description, eligibility, and application-note values after sampled validation.

2. **Finish the selected bill proof and backfill all registered versions.**
   - Prove `source_ingested → decomposition → verification → publication` for every current version.
   - Preserve the last verified decomposition while a newer version is pending, labeled explicitly as prior-version analysis.
   - Never label historical traits as current.

3. **Chain fresh publication automatically.**
   - `storage_changed → manifest_synced → parse → route → identity → quality → sealed_snapshot → invariant_check → atomic_activate`.
   - Auto-retry transient failures; send terminal failures to a repair queue with reason codes.

4. **Repair DOCX/PDF and sparse-row extraction.**
   - Preserve table cells before whitespace normalization.
   - Support row/column semantics and sparse legitimate records.
   - Extract supported PDFs rather than reducing every PDF to a document reference.
   - Publish parser coverage and per-artifact row counts.

5. **Reconcile stranded corpora.**
   - Identity-match and stage the 615 intake rows.
   - Seed, verify, and promote the SAIS package.
   - Reconcile stale historical queue receipts; cap retries and supersede missing old paths with newer parsed artifacts.

6. **Restore canonical registry access.**
   - Mount one registry facade, convert queries to PostgreSQL parameters and `result.rows`, align `stateCode`, remove hard-coded fallback metrics, and derive all counts from governed stages.

7. **Fix the action/read facade.**
   - Align status contracts, implement a real dispatcher, replace MySQL SQL, bind every read to a snapshot hash, remove fake-success responses, and add route-contract tests.

8. **Bound World Index memory.**
   - Server-side pagination/filtering, materialized graph projections, bounded node/edge construction, and cache versioning. Raising memory is only temporary mitigation.

9. **Secure exposed write/data surfaces.**
   - Put Docket warming/mutations behind admin authorization.
   - Review the 36 exposed public tables reported without RLS; add explicit policies before enabling RLS so recovery data is not accidentally locked out.

### P1 — Cross-platform durability

1. Build Kaleidoscope's authenticated tandem chain:
   - Rosetta verified version.
   - Prism verification binding.
   - Civic Genome immutable snapshot outbox.
   - Kaleidoscope durable receiver/input ledger.
   - Versioned state-baseline binding.
   - Projection queue/worker.
   - Result and receipt store.
   - Read-only Civic Genome result link.

2. Restore typed API contracts and include the client/server files in CI TypeScript checking.
3. Replace empty/stub AKB, signals, and form-extraction paths or label them unavailable instead of operational.
4. Backfill pre-cutover cases and correct Timeline copy.
5. Repair Atlas connector credentials, endpoints, schemas, and uniquely registered streams; mark downstream outputs stale when a connector is degraded.
6. Configure real Render health checks for Lighthouse, Rosetta, Prism, Kaleidoscope, Atlas, and Esquire.
7. Reconcile Rosetta's Render branch with `main`.
8. Repair notification `.returning(...)` and scheduler `as_of` failures.

### P2 — Complete access and navigation

- Add Docket, Audit Trail, Signal Registry, Patterns, and Legal Library total-aware pagination.
- Add Resource Directory candidate/provenance drilldown and a defects-only operator lane.
- Restore addresses and rich fields to list/detail contracts without requiring map coordinates.
- Add geocoding as a separate enrichment lane with its own health and staleness state.
- Move all major routes into one responsive navigation shell.
- Preserve case identity in workspace navigation.

## Production gates

A component or page is not healthy unless these gates pass:

1. Source count gate.
2. Parsed row/cell/span count gate.
3. Provenance and content-hash gate.
4. Valid/system time gate.
5. Typed destination gate.
6. Identity/conflict gate.
7. Source-field preservation gate.
8. Authorized-writer gate.
9. Staleness propagation gate.
10. Reproducibility and receipt gate.
11. Public-pointer atomicity gate.
12. Human review gate for high-impact external action.

## Definition of done

- No admissible bill or source package requires a user to press a decomposition, assembly, or publication button.
- Every workbook row and cell is traceable, even when it is not a public resource.
- Missing public data is explainable by a recorded stage and reason, never by silent loss.
- Current-version UI never borrows historical analysis without an explicit prior-version label.
- Kaleidoscope consumes only versioned, Prism-bound Civic Genome snapshots and cannot mutate upstream legal truth.
- Public resources retain source-attached addresses and other source fields; validation and geocoding are additive metadata.
- Counts reconcile from Storage through public display, and every delta is inspectable.
