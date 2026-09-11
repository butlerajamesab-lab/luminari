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
