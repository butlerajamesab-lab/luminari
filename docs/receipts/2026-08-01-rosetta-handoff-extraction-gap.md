# Rosetta handoff extraction gap receipt

Date: 2026-08-01

Observed production state for Docket source `1965149`:

- Rosetta source document `13` exists.
- Rosetta extraction run `14` exists with `run_status = in_progress` and `admissibility_state = pending`.
- No source-content receipt, deterministic engine receipt, output hash, layer coverage, manifest, validation rows, or five-layer objects exist for run `14`.
- Civic Genome assembly remains correctly closed.

Exact break:

The administrator UI invokes `civicGenome.ingest_docket_bill_to_rosetta_source`, which previously created only the source identity and blank extraction run. The same UI offered assembly only after a completed admissible extraction, leaving no action that invoked the already-present deterministic `process_docket_bill_through_rosetta` mutation.

Repair:

The administrator handoff mutation now executes the complete bounded Docket -> Rosetta extraction -> Civic Genome assembly orchestration. It reuses the exact source document and existing extraction run through the existing deterministic/idempotent contracts. The explicit full-pipeline mutation remains available.

No RLS policy was weakened. No anonymous write path was added. No runtime AI or probabilistic extraction was introduced.
