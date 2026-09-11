# Integration diagnostic ledger v1

This ledger is the source-controlled acceptance companion for issue #383.

## Authoritative boundaries

- Legal Library / Knowledge Backbone legal authority boundary: `public.v_lighthouse_legal_authority_catalog_v2`
- Resource Directory boundary: `public.v_lighthouse_resource_program_catalog_v2`
- Workflow / accountability boundary: `public.v_lighthouse_workflow_accountability_catalog_v1`
- Case attachment boundary: `public.v_lighthouse_case_attachable_objects_v1`
- Signal lineage boundary: `public.v_signal_lineage`

## Current break in the runtime contract

The legal-library runtime previously required `legal_catalog_ready` before a current-corpus legal authority could appear. That meant the substrate could be populated through `v_lighthouse_legal_authority_catalog_v2` and `luminari_corpus_candidate_v1` while active runtime surfaces still rendered zero rows. This PR preserves the catalog/view boundary but stops silently treating unpublished current rows as absent: catalog-ready rows still win, and non-ready rows now surface as explicit substrate observations instead of being discarded.

## Case Action Context contract

`case_action_context_v1` is a bounded retrieval contract that combines existing legal, resource, workflow, filing, enforcement, and signal read surfaces for a single case/problem context.

Guardrails:

- No writes, promotions, or production mutations.
- No new parallel schema.
- No invented findings or convergences.
- Returned rows keep their native semantics: source-backed observations, case links, signals, or legacy compatibility rows.
- Filing deadlines remain source-text-only unless an incident date is supplied.

## Fixtures

The ledger fixture lives at `config/integration-diagnostic-ledger-v1.json`.

It records:

- source-family coverage
- canonical object families per source family
- graph-edge coverage
- runtime projection coverage
- stranded/unpublished record accounting
- known empty-surface vs populated-substrate mismatch classes

## Availability and measurement semantics

Each projection has an explicit `availability.status`: `available`, `empty`, `unavailable`, or `error`. Successful zero counts are empty. Missing relations/access failures are unavailable; other query failures are errors. Failed counts remain null with error code/message retained. One projection failure does not erase measurements from another.

`catalog_ready` and `stranded` measure publication-readiness predicates. They do not establish runtime visibility. Legal `visible` is measured separately through the existing runtime statistics reader and has its own `legal_runtime_measurement.availability`; resource/workflow visibility is null until measured. The configured `runtime_projection_coverage` entries say `measurement_state: not_measured` and are not route execution evidence. Family row totals are null if any constituent count fails; totals are not distinct-entity counts.

In Case Action Context, `resources.attached_to_case` and `signals.lineage` are nullable. On a successful empty query they are empty arrays. On failure they are null, with `resources.attachment_availability` or `signals.availability` retaining the failure. Consumers must inspect availability rather than treating null as zero results. Case-resource link measurements include only links whose `removed_at` is null.

Regression tests cover successful emptiness, missing relations, query errors, independent surface measurements, incomplete totals, and a successful measured-zero mismatch. These checks do not certify deployment, authorization, query performance, or user-facing traversal.
