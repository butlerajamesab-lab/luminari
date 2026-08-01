# Prism V2 Frontend Receipt

## Scope

This change is frontend-only.

It does not add or modify:

- database schemas or migrations;
- RLS policies or grants;
- backend routes or RPC functions;
- Prism verification engines or rule sets;
- Rosetta, Atlas, Civic Genome, or Lighthouse ownership contracts;
- production seed data;
- browser service-role credentials;
- direct writes to protected Prism tables.

## Source material

The workspace is based on the supplied Prism V2 command-center references and the Luminari batch export dated 2026-08-01.

Batch contract:

- schema version: `2.0`;
- source system: `luminari`;
- records: `56`;
- validation state: preserved from each source record;
- payload representation: compact JSON, gzip-compressed and base64-segmented for static delivery;
- compact JSON SHA-256: `fe7123988407f46b7a5300336ce4daf44b9d863d38d69732afd516e5191cd595`;
- semantic comparison against the uploaded JSON: equal.

## Frontend surfaces

- `/prism` — Dashboard
- `/prism/control-room` — instance browser and selected-instance workspace
- `/prism/correlation-map` — deterministic read-only correlation graph
- `/prism/provenance` — traceability index
- `/prism/export` — client-side filtered JSON export

Selected-instance views:

- Friction
- Evidence
- Correlations
- Pathways
- Verification
- Provenance
- Escalation

## Deterministic frontend correlation rule

The supplied Prism V2 frontend rule is preserved without replacement:

- same problem type: `+0.35`;
- same system: `+0.30`;
- same jurisdiction: `+0.25`;
- same normalized jurisdiction level: `+0.10`;
- friction-alignment contribution: up to `+0.10`;
- acceptance threshold: `0.25`;
- strong edge: friction-alignment score above `0.75`;
- unordered edge pairs are deduplicated deterministically.

Expected conformance values:

- nodes: `56`;
- deduplicated edges: `365`;
- jurisdiction-system hotspots: `17`;
- matches for `PI-0035CO`: `13`.

These values are derived in the browser and are labeled separately from persisted source facts. They are not stored as canonical Prism findings or verification receipts.

## Epistemic boundary

The frontend does not upgrade batch validation into Prism verification.

Where a canonical Prism receipt is absent from the batch payload, the UI states `not_observed_in_batch`. The Escalation tab presents the known state-machine structure without inferring a current state or permitting browser mutation.
