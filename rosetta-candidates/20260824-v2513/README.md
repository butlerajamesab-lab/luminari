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
