# Rosetta 2.5.13 repair packet

Status: **isolated candidate; not deployed or promoted**.

Start with [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md). The important
rule is simple: do not install this packet in production. Validate it in an
empty disposable PostgreSQL database, replay the complete immutable corpus,
and review the complete object-field diff first.

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
- `tools/replay_manifest_worker.py`: claim → execute/defer → finalize in
  separate committed transactions.
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

The runner aborts if it finds `public.extraction_run`, `rosetta_v2513`, or
`rosetta_replay`. A current zero-exit invocation is the only valid runtime PASS
receipt for a new database. This packet also carries the bounded, durable
PostgreSQL 17 preview-branch receipt in
`tests/SUPABASE_BRANCH_VALIDATION_RESULTS.json`: migrations and bounded tests
passed, a forced timeout was recorded durably, and control/C1–C7/convergence
completed against one exact-source fixture with exact source/run/output
bindings. That receipt is deliberately **not** a full-corpus replay claim.

## Full-corpus replay

After the disposable runtime tests pass, load exact immutable sources and exact
2.5.11 control runs, declare every expected terminal outcome, seal the corpus,
load the quarantine run IDs, and run:

```bash
python3 tools/replay_manifest_worker.py \
  POSTGRES_URI MANIFEST_UUID v2513_ \
  rosetta-v3-deterministic-sql-2.5.13 \
  rosetta-five-layer-structural-correctness-2.5.13 worker-name
```

No source may disappear from the manifest. Previously rejected and quarantined
sources remain first-class members. No unexplained object-field change can pass
the promotion gates.
