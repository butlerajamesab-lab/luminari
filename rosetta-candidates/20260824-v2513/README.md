# Rosetta 2.5.13 repair packet

Status: **isolated candidate; not deployed or promoted**.

Rosetta is a distinct first-class Luminari platform for deterministic
five-layer decomposition. Docket Room is
its upstream producer of exact law/version source artifacts. This packet
repairs Rosetta's deterministic decomposition substrate; it does not repair or
replace the currently separate Docket Room runtime.

Start with [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md). The important
rule is simple: do not install this packet in production. Validate it in an
empty disposable PostgreSQL database, replay the complete immutable corpus,
and review the complete object-field diff first.

Parser behavior is global-only. Exact bills, jurisdictions, provider records,
run IDs, and observed dates may appear in regression fixtures, but never in
the generator or generated engine. A source that lacks universally valid
evidence is rejected or left unresolved; it is never made to pass by a
document-shaped rule.

## What is in here

- `migrations/01–18`: durable source/attempt receipts, a byte-faithful 2.5.11
  control, C1–C7 isolated lanes, the composed 2.5.13 candidate, sealed corpus,
  replay runner, complete diff, promotion gates, request-only promotion/
  cutover records, and security lockdown.
- `migrations/99_cleanup_rollback.sql`: disposable-environment cleanup only;
  it refuses a database containing `public.extraction_run`.
- `tests/`: strict SQL tests plus separate-process transaction and all-lane
  replay drivers.
- `tools/generate.py`: deterministic lane/convergence generator.
- `tools/replay_manifest_worker.py`: claim → observe → finalize in separate
  committed transactions; historical expected outcomes never decide whether
  the parser runs.
- `tools/extract_html_source.py`: fail-closed semantic-container extraction for
  HTML sources with raw/extracted SHA-256 receipt.
- `evidence/`: captured 2.5.11 definitions, schema evidence, 2.5.12 span
  reference, measured actor distribution, and 1,038 quarantine run IDs.

## Verify the packet bytes

```bash
sha256sum -c SHA256SUMS
python3 tests/static_checks.py
python3 tools/check_control_fidelity.py
```

## Run in a disposable PostgreSQL database

With the optional local `pgserver` runner installed:

```bash
python3 tests/capture_evidence.py
```

Or with `psql` and an empty disposable database:

```bash
ROSETTA_TEST_DATABASE_URL='postgresql://...' \
ROSETTA_DISPOSABLE_ACK=I_UNDERSTAND \
python3 tests/capture_evidence.py
```

By default the current-run transcript is written to
`/tmp/rosetta-v2513-current-runtime-validation.txt` (or `RUNNER_TEMP` in
CI). Set `ROSETTA_CURRENT_VALIDATION_OUTPUT` to another path in an existing
directory outside this checksummed packet. The capture script refuses to
overwrite any packet file, including the immutable historical transcript.

The runner aborts if it finds `public.extraction_run`, `rosetta_v2513`, or
`rosetta_replay`. A current zero-exit invocation is the only valid runtime PASS
for newly generated SQL. The packet preserves the source-locked August 24
PostgreSQL 17 preview-branch receipt in
`tests/SUPABASE_BRANCH_VALIDATION_RESULTS.json` as **historical evidence**. Its
validated migration hashes are recorded separately in
`PACKAGE_MANIFEST.json`; it cannot validate later generator output. Pull
requests run the current bytes against an empty isolated PostgreSQL 17 service.
Neither the historical receipt nor that bounded CI gate is a full-corpus
replay claim.

## Full-corpus replay

After the disposable runtime tests pass, load the exact immutable sources and
exact 2.5.11 control runs, freeze the authorized campaign membership and its
whole-corpus denominator, seal the corpus, load the quarantine run IDs, and
apply `../20260901-global-replay-truth/migrations/07_truth_first_quarantine_sweep.sql`.
The worker fails before reading or claiming a manifest unless that migration's
`truth_observation_*` contract is installed; it never falls back to the legacy
expectation-gated executor or retry-chain claim path. Then run:

```bash
test -n "$ROSETTA_REPLAY_DATABASE_URL"
python3 tools/replay_manifest_worker.py \
  MANIFEST_UUID v2513_ \
  rosetta-v3-deterministic-sql-2.5.13 \
  rosetta-five-layer-structural-correctness-2.5.13 worker-name
```

The campaign success target is complete, truthful accounting for every frozen
member, not universal parsing. Apply the following operating contract:

- execute each source at most once in a candidate campaign; do not
  automatically retry it in the same campaign;
- if a prior worker left a committed pending outcome, bind and finalize that
  outcome without another parser call; if it left no outcome, never adopt it
  for re-execution—leave an active lease alone and quarantine an expired lease
  as an invocation-ambiguous terminal failure;
- persist every observed terminal result, including rejection, deferral,
  timeout, and terminal failure, as an immutable quarantine disposition;
- count a member only after its exact evidence exists: an observed-result
  binding for completion/rejection/deferral, or a same-attempt non-retryable
  terminal receipt for timeout/failure; a bare state label stays unaccounted;
- continue with later manifest members after a non-success instead of allowing
  one document to abort or poison the remaining corpus;
- calculate quarantine share against the frozen whole-corpus denominator, not
  against only the sources attempted so far;
- emit an early warning when quarantine reaches 10%, and require a generalized
  pattern review when it reaches 15%; neither threshold stops the sweep; and
- group review findings by failure class, document class, provider family, and
  media type. Never add a production parser branch for a literal source,
  bill, jurisdiction, provider record, run ID, or observed date.

At the exact 10% and 15% crossings, the standalone Render worker emits a
structured `rosetta_quarantine_checkpoint` event immediately to stderr (and
repeats both events in its final JSON receipt); Render therefore exposes the
checkpoint while later members continue processing. The immutable attempts,
receipts, and bindings remain the underlying quarantine evidence. The
snapshot-backed migration-07 campaign path additionally persists its
checkpoint and whole-stack pattern-review events in PostgreSQL.

No source may disappear from the manifest. Previously rejected and quarantined
sources remain first-class members; unprocessed sources remain explicitly
unaccounted until attempted. Corpus accounting, candidate compatibility, and
promotion are separate decisions. A completely accounted campaign can contain
honest non-successes without claiming they parsed, while compatibility and
promotion gates may still block on regressions or unexplained object-field
changes.
