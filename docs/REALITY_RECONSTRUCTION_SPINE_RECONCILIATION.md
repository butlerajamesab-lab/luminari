# Reality Reconstruction Spine — Current-State Reconciliation and Implementation Plan

## Status

This document is the implementation authority for reconciling the proposed Reality Reconstruction Engine with the existing Luminari / Lighthouse platform.

It is a documentation-only architecture plan. It creates no tables, routes, UI surfaces, migrations, or runtime behavior.

## Core doctrine

Lighthouse begins with factual reconstruction, not legal framing.

The canonical sequence is:

1. raw intake capture
2. evidence preservation
3. chronology reconstruction
4. entity registry
5. relationship graph
6. authority and power structure
7. subject-state timeline
8. communications and witness records
9. pattern registry
10. cascade registry
11. rights and duties activation
12. open questions
13. action paths and generated work products

The platform must never convert a report, memory, allegation, inference, or interpretation into an established fact without preserving the source distinction.

## Architectural decision

The Reality Reconstruction Spine is not a separate product, module, or competing case system.

It is the missing deterministic substrate between existing intake surfaces and existing downstream evidence, pattern, legal, remedy, workflow, and export systems.

```text
existing intake paths
    ↓
reality reconstruction spine
    ├── existing documents and evidence
    ├── existing entities and relationships
    ├── strengthened chronology
    ├── authority, communications, witnesses, open questions
    ├── power dynamics and cascades
    ↓
existing pattern, legal, workflow, remedy, paperwork, and export systems
```

## Existing structures to preserve

The following existing structures remain canonical and must be extended rather than duplicated:

- `cases`
- documents and source evidence files
- quotes and source locations
- entities and entity roles
- relationships and relationship evidence
- claims and findings
- generic events
- evidence items
- evidence-to-event links
- evidence-to-proof links
- evidence graph edges
- audit and provenance records
- missing-record detection
- case narratives
- pattern registry and occurrences
- case-pattern links
- workflow, remedy, paperwork, and export generators

No implementation PR may create a parallel version of one of these without a written incompatibility finding.

## Prior work reconciliation

### Issue #117

Issue #117 correctly established the chronology-first intake doctrine and the twelve-layer intake spine. It remains the conceptual predecessor to this plan.

### PR #158

PR #158 contains useful source material for:

- `chronology_events`
- `power_dynamics_registry`
- `cascade_registry`
- guided-intake neutral prompts
- normalization contracts
- ingestion routing
- chronology-before-cascade invariants
- Cheryl / Rick fixture structure

PR #158 must not be merged wholesale because its branch is stale and diverged from current `main`. Its implementation should be selectively reconstructed on current `main` through bounded PRs.

## Canonical reconstruction objects

### 1. Reconstruction container

The existing case remains the workspace boundary. A reconstruction is a case-scoped factual substrate, not a replacement for `cases`.

### 2. Source registry

Every factual assertion must identify how it is known.

Required source classes:

- original document
- court filing
- medical or facility record
- direct observation
- contemporaneous communication
- witness statement
- later recollection
- third-party report
- derived calculation
- unknown

The source registry should reuse existing document, evidence, quote, and provenance structures. It should add only the metadata necessary to classify and rank source character.

### 3. Chronology record

A strict chronology record is distinct from a generic operational case event.

Required fields:

- `chronology_event_id`
- `case_id`
- `event_date`
- `event_date_precision`
- `source_date`
- `observed_event`
- `people_involved`
- `entity_ids`
- `source_references`
- `evidence_item_ids`
- `why_it_matters`
- `immediate_consequence`
- `outstanding_follow_up`
- `source_confidence_level`
- `fact_status`
- `created_from_path`
- `normalization_version`
- `created_at`
- `updated_at`

`fact_status` must distinguish at minimum:

- reported
- corroborated
- confirmed
- disputed
- superseded
- unknown

Chronology records may contain reported speech, but they may not silently promote the report into a confirmed occurrence.

### 4. Authority registry

Authority must be recorded from documents and applicable scope, never assumed from family role or job title.

Required fields:

- authority record ID
- case ID
- authority type
- holder entity ID
- subject entity ID
- source document ID
- effective date
- expiration or termination date
- scope
- conditions or contingencies
- disputed status
- verification status
- source references

Examples include power of attorney, guardianship, court order, facility designation, representative authorization, contract delegation, agency authority, and informal claimed authority.

### 5. Relationship graph

Reuse the existing relationship system. Extend relationship vocabulary only where necessary for:

- caregiving
- representation
- authority chain
- access control
- dependency
- communication path
- reporting line
- provider relationship
- family relationship
- witness-to-event relationship

Every material edge must support source references.

### 6. Communications registry

A communication is not merely an uploaded text or email. It is a dated interaction capable of linking people, subjects, requests, responses, follow-up, and supporting evidence.

Required fields:

- communication ID
- case ID
- date and time
- method
- sender entity ID
- recipient entity IDs
- subject
- exact or summarized content
- source evidence IDs
- request made
- response received
- follow-up required
- related chronology IDs
- confidentiality or sensitivity marker

### 7. Witness registry

Witnesses must be first-class case-scoped records rather than generated targets only.

Required fields:

- witness ID
- case ID
- entity ID
- category
- relationship to subject
- events personally observed
- source references
- records possessed
- contact status
- willingness status
- declaration or testimony status
- credibility notes limited to sourced facts

### 8. Interaction and visitation ledger

Use a domain-neutral interaction ledger capable of representing visits, calls, meetings, care conferences, inspections, appointments, and attempted contacts.

Required fields:

- interaction ID
- case ID
- interaction type
- date
- arrival and departure
- location
- participants
- purpose
- observed condition
- witnesses
- evidence IDs
- related chronology IDs
- access result
- restriction reason and source

The elder-care specialization may label this view a visitation ledger without creating a separate canonical table.

### 9. Subject-state timeline

Track changes in a person or entity over time separately from event narration.

Domains include:

- health
- capacity
- housing
- placement
- finances
- caregiving capacity
- transportation
- documentation burden
- access status
- legal status
- other

Every state entry must point to chronology and source records.

### 10. Power dynamics registry

Selectively rebuild the neutral structural model from PR #158.

It may capture:

- authority holder
- access controller
- gatekeeper
- documentation holder
- communication bottleneck
- dependency path
- exclusion event
- bypass concern
- disputed authority
- burden shift
- user capacity limit
- procedural barrier

It must not encode motive, wrongdoing, retaliation, abuse, or illegality as fact unless independently established and sourced.

### 11. Pattern registry

Reuse the existing pattern infrastructure.

Case-level pattern creation must require linked chronology records. Cross-case pattern creation must preserve each contributing case as an independent evidence lane.

Pattern creation cannot precede chronology reconstruction.

### 12. Cascade registry

A cascade describes an evidence-supported sequence of downstream effects.

Required links:

- trigger chronology record
- immediate effect
- secondary effect
- affected people and entities
- related chronology records
- related state changes
- related power records
- evidence sources
- confidence level
- open questions

A cascade may express trajectory. It may not express unsupported causation.

### 13. Rights and duties activation

The Legal Library and procedural systems remain the substantive authority sources.

The reconstruction spine adds a linking and activation layer that records:

- potentially relevant right or duty
- factual trigger records
- pattern, authority, or cascade links
- statutory or regulatory source
- applicability status
- confidence
- unresolved prerequisites

Chronology must remain unchanged when a legal issue is activated.

### 14. Open questions registry

Open questions must be first-class records so uncertainty remains visible.

Required fields:

- question ID
- case ID
- question
- why it matters
- records or witnesses needed
- related chronology IDs
- assigned action
- status
- resolution
- resolved source IDs

### 15. Decision log

Preserve why a case-management or advocacy decision was made.

Required fields:

- decision ID
- case ID
- date
- decision maker
- authority
- decision
- reasons
- evidence considered
- alternatives considered
- result
- review date

### 16. Action paths and generated products

Reuse existing investigation workflow, remedy, paperwork, narrative, and export systems.

Generated products must consume the same canonical reconstruction and include source maps where applicable.

Target outputs:

- executive summary
- one-page timeline
- full chronology
- evidence index
- witness index
- communications log
- interaction or visitation ledger
- authority index
- open questions report
- record request checklist
- attorney packet
- hearing notebook
- ombudsman packet
- grievance packet
- agency complaint packet
- action queue

No fact should be manually rewritten into multiple output systems.

## Source confidence doctrine

Source confidence measures the character and corroboration of the source, not whether the system likes or believes a person.

The final vocabulary must be selected once and reused across chronology, evidence, witnesses, patterns, and cascades.

Recommended ordered vocabulary:

1. unknown
2. reported
3. direct_observation
4. contemporaneous_record
5. independently_corroborated
6. primary_document_confirmed

A separate `fact_status` must preserve dispute, supersession, and contradiction without overloading confidence.

## Case identifier blocker

Before any new foreign key is introduced, current case identifier usage must be reconciled.

Current code contains both numeric case-ID contracts and UUID-oriented work. No migration may be approved until the canonical `cases.id` type and all active route contracts are verified against live Supabase and current runtime code.

## Implementation sequence

### PR 1 — Architecture reconciliation

Scope:

- this implementation authority document
- current-surface mapping
- explicit reuse/new/extend decisions
- no runtime changes

Acceptance:

- no duplicate subsystem proposed
- Issue #117 and PR #158 disposition recorded
- case-ID blocker recorded

### PR 2 — Chronology contract and compatibility design

Scope:

- define strict chronology types and validation
- map generic `events` to chronology compatibility behavior
- define evidence/source linking
- no destructive migration

Acceptance:

- generic operational events remain functional
- chronology cannot contain unsourced legal conclusions
- source confidence and fact status are separate

### PR 3 — Chronology persistence and existing Timeline integration

Scope:

- bounded migration after live schema verification
- chronology CRUD/API
- evidence links
- update the existing Timeline page rather than creating a duplicate page

Acceptance:

- case ownership enforced
- chronology displayed in date order with source and confidence
- disputed and superseded records remain visible

### PR 4 — Authority, communications, witnesses, interactions, open questions, decisions

Scope:

- add missing first-class registries
- reuse entity and evidence structures
- add APIs and bounded UI surfaces inside the existing case workspace

Acceptance:

- no free-floating names when an entity link exists
- every material assertion supports source references
- visitation is a view of the generic interaction ledger

### PR 5 — Power dynamics, state timeline, and cascades

Scope:

- selectively rebuild PR #158 concepts on current `main`
- enforce chronology prerequisites
- preserve neutral structural wording

Acceptance:

- cascade requires chronology
- unsupported motive and causation are prohibited
- state changes remain source-linked

### PR 6 — Pattern and rights/duties activation bridge

Scope:

- link case chronology to existing pattern infrastructure
- add rights/duties activation records consuming Legal Library authority
- preserve chronology immutability

Acceptance:

- no pattern without chronology support
- no right/duty activation without factual trigger links
- no legal conclusion written into chronology

### PR 7 — Generated products

Scope:

- feed existing workflow, remedy, paperwork, narrative, and export systems
- generate source-mapped reconstruction products

Acceptance:

- one canonical correction propagates to all generated outputs
- no duplicate hand-maintained timeline or evidence index

### PR 8 — Guided intake evolution

Scope:

- replace broad narrative dependence with progressive reconstruction capture
- retain a low-burden entry path
- ask neutral questions for people, events, documents, authority, access, urgent deadlines, and immediate preservation

Acceptance:

- existing case creation remains functional
- intake can be paused and resumed
- user is not required to know legal terminology
- action recommendations remain downstream

## Janine validation fixture

The first implementation validation should use a fully isolated Janine Family Advocacy Reconstruction fixture.

The fixture must not identify the matter as a restraining-order project, lawsuit, or dispute against a named person. It should test:

- family entity graph
- authority records and disputed scope
- court-document evidence lane
- long-term visitation history
- facility interaction records
- communications
- witnesses
- access restrictions
- mother's expressed wishes as sourced reports
- caregiver burden and travel
- open questions
- rights/duties held pending document review
- multiple action pathways

The Janine fixture must remain separate from the Cheryl / Rick fixture.

## Kline Galland cross-case boundary

Facility-level pattern analysis is a distinct project.

Each family remains an independent evidence lane:

- Cheryl / Rick
- Janine / mother
- third family

No allegation, conclusion, or evidence automatically transfers between lanes.

Only after each lane has its own chronology, sources, evidence registry, and open questions may the existing pattern infrastructure evaluate recurring facility-level patterns.

## Non-goals

This plan does not authorize:

- replacing the existing case system
- creating a parallel evidence system
- merging PR #158 wholesale
- changing Docket Room, Civic Genome, Rosetta, Atlas, or Mission Control
- introducing runtime AI interpretation
- generating legal conclusions from intake narratives
- changing deployed Supabase without a separately approved migration
- merging any implementation PR without verification

## Validation requirements for every implementation PR

- inspect current `main` before editing
- verify live Supabase schema before migration work
- preserve existing routes and deployed frontend behavior
- run contract and naming checks
- run targeted tests
- report exact files changed
- report existing structures reused
- report schema additions and compatibility decisions
- report unresolved blockers with exact errors

## Final invariant

Lighthouse preserves reality once and generates many lawful, advocacy, administrative, and organizational views from that same source-grounded record.

Observation first.

Chronology second.

Patterns third.

Rights and duties fourth.

Action last.
