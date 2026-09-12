# Bounded atomic source runner

This is deployable code prepared for a deliberate, scoped source pass. It has
not been activated, and no production source has been queued or processed by
this checkpoint. The live manifest-function prerequisite recorded in the Batch
integration checkpoint remains unresolved until its separate migration release.

## Entry and process boundaries

Build with `pnpm run build:atomic-runner`. The emitted file is
`dist/fresh-atomic-runner.js`; `pnpm run start:atomic-runner` runs it once.
The start command does not supply production mode, grant a worker role, enable
a feature, create a run or discover a default source scope. The web and identified
Prism service remain unchanged. No Render service or environment variable was
created or changed.

Use this entrypoint as an explicitly authorized one-off process for the chosen
run, rather than adding it to a web start command or an automatically repeating
schedule. The parent validates all configuration before loading database consumers,
spawns a child with private stdout/stderr, and retains referenced IPC/watchdog
handles until it exits. A separate parent watchdog can terminate a child whose
parser blocks its event loop. The child closes its database pool on ordinary
completion or failure.

## Required configuration

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | Exact `production` |
| `LIGHTHOUSE_RUNTIME_ROLE` | Exact `worker` |
| `FRESH_ATOMIC_CORPUS_RESUME_ENABLED` | Exact `true` |
| `FRESH_ATOMIC_EXPECTED_RUN_ID` | UUID of the already queued, reviewed run |
| `FRESH_ATOMIC_ALLOWED_ARTIFACT_KEYS` | JSON array of the complete, explicitly allowed `Batch/` artifact keys; 1–500 unique keys; no traversal segments |
| `FRESH_ATOMIC_BATCH_SIZE` | Integer 1–8; default 1 |
| `FRESH_ATOMIC_MAX_BATCHES` | Integer 1–100; default 1 |
| `FRESH_ATOMIC_MAX_SECONDS` | Integer 1–900; default 120 |

The intended runtime also needs the existing database connection and private
Supabase server credential accepted by `corpus-storage-download.ts`. The code
accepts the existing credential variable names; this document grants none of
them and does not establish their deployed values or effective database role.

## Scoped execution sequence

1. Deploy the reviewed code and complete the separately verified manifest
   function migration/ledger sequence. Read back the function and service-only
   grants. The existing tables and columns were inspected read-only; this runner
   needs no additional schema or queue table.
2. Through the existing admin-only
   `batch_sources.queue_batch_source_observations` operation, register and queue
   exactly the reviewed Batch keys. Record the returned run ID and read back
   its scope. That operation is a separate authorized production write; neither
   the runner nor this checkpoint invokes it automatically.
3. Configure the one-off process with that run ID and the identical complete
   artifact list, and with an explicit bounded budget. Start the built runner
   only after runtime credentials and scope have been verified.
4. Read the output receipt and the existing run/artifact/origin receipts through
   authorized readback. A yielded run is resumed with the same run ID and scope,
   not a newly discovered active run. A terminal or unavailable expected run
   is rejected; re-running the process cannot silently advance to other work.

The processor validates engine, active state, exact `bucket_ids: ["Batch"]` and
artifact list, and existence of every active allowed source before its first
write/download. It checks the binding again between artifacts. Source selection
also has an independent pinned allowlist. An older queued run is left alone.
Private downloads retain version/byte/hash checks and receive the cancellation
signal; persistence still uses the existing per-artifact transaction.

## Budgets, shutdown and receipts

The batch budget limits attempted artifacts to batch size times batch count.
The parent enforces wall time across initialization, queries, downloads, parsing
and persistence. Between artifacts the processor checks cancellation and elapsed
time. SIGTERM/SIGINT requests child cancellation and allows up to five seconds
to drain, subject to the earlier wall-time deadline. A hard deadline terminates
the child rather than waiting indefinitely for a parser or database request.

Forced termination does not pretend the in-flight source completed. Existing
uncommitted record/origin writes roll back when their database connection closes;
a separately committed artifact claim can remain `running`. The existing
30-minute stale-lease recovery still governs that claim. An immediate re-run can
therefore report `waiting_for_active_artifacts`; it must not be relabeled as a
successful pass or cause manual receipt deletion. A transaction committed just
before termination can be present even when the parent reports a timeout, so
read back existing receipts before deciding the next pass.

The single JSON receipt contains contract, requested run ID, scope SHA-256,
allowed-source count, status, attempted-artifact count when known, elapsed time
and a fixed error code if applicable. The scope hash is over the sorted JSON
artifact-key array. It contains no object names, raw source text, arbitrary
error messages, URLs, credentials or stacks. Hard termination leaves the
attempted count unknown (`null`); the database receipts are authoritative.
Publication state remains `governed_non_public`.

Exit code 0 means the processor returned `completed`; 1 means failure or
`completed_with_failures`; 2 means yielded, waiting, stopped or timed out.
A completed source pass can still contain the adapter's existing holds. It is
not canonical publication or certification that every source record is public.

## Verification and ownership

Isolated PostgreSQL tests exercise the real processor against the actual source
and atomic migrations. They prove initial run/scope mismatch causes no mutation,
older queued work is not selected, batch limits yield and resume, cancellation
preserves the write boundary, and source origins bind only to the expected run.
Process tests kill a child in a synchronous infinite loop at the wall-time budget
and prove sensitive child output/IPC fields are excluded from the receipt.
The compiled entrypoint was executed without grants and rejected startup before
loading a database consumer.

New owned functions, locals, configuration fields and receipt fields use
snake_case. External-required names retain their Node.js/driver/API spelling
(`AbortSignal`, `process.exitCode`, `execArgv`, `rowCount`, `JSON.stringify`, etc.).
The typed queue's legacy `manifestSync` input is normalized immediately at the
boundary; the changed replay locals and internal calls use snake_case.


Final local gates for this addition: 326 test files and 1,692 tests passed;
one opt-in file and three tests were skipped. TypeScript, the standalone runner
bundle, application server bundle, health contracts, owned-name guard,
repository migration-ledger parity, stale migration references and Rosetta
ownership checks passed. No production operation was part of these checks.
