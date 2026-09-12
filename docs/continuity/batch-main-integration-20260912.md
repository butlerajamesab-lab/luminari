# Batch integration with deployed workbook and intake repairs

Observed September 12, 2026. This checkpoint integrates PR #637 head
`0af46fafd412e99d3536cc10ef96b4d81e4050a0` with main
`fb3aac60c498417ddeb7099e3c5b98dcda72b6e3`, which includes #638, #635 and #634.
The remote PR remained a draft and had no returned review threads when inspected.

The prior working directory was inspected read-only: it was clean at
`d4688fc06e41d8ba16f9f2daf4c77829266fd6f9`, tree
`0d0afaa1586a16285091c9830f6348c7d1663797`, matching the published PR tree.
That establishes file identity, not whether the other conversation remains active.
This integration was prepared in a separate worktree.

## Preserved behavior

The atomic-parser conflicts were resolved by retaining the workbook resolver,
structural subset validation, shared-string checks and exported workbook parser,
alongside the private downloader, Batch parser, transactional writes and
`atomic_record` type. The typed workbook parser keeps UTF-8 stream decoding.
Parser identifiers remain `fresh_atomic_parser_v1.0.2` and
`fresh_registry_typed_parser_v1.2.4`.

No migration bytes, startup activation flags, canonical promotion rules or public
bucket policies were changed. The existing worker loop still requires all three:
production mode, explicit `LIGHTHOUSE_RUNTIME_ROLE=worker`, and
`FRESH_ATOMIC_CORPUS_RESUME_ENABLED=true`. The committed Render service remains
configured as `web`. Atomic selection includes private Batch only through an
explicit source/bucket scope; the legacy typed worker excludes Batch.

## Connected scope defects repaired

The initial combined code excluded Batch from typed selection but included it in
remaining-work and finalized-artifact counts. Isolated PostgreSQL tests reproduced
a typed pass stuck at `remaining=1` even though the only remaining source was
private and ineligible. Automatic replay also compared typed receipts against the
all-bucket manifest, and an exact-duplicate link to a private copy could suppress
the eligible typed source entirely.

The repair applies the same eligibility boundary to selection and remaining work,
counts actual typed artifact receipts at finalization, and compares automatic
replay against a fingerprint and count of eligible source versions. The fingerprint
excludes derived hashes and observation timestamps so parsing does not trigger a
new replay. Private Batch changes do not trigger typed replay; actual typed-source
changes still do. A typed source is parsed when its globally preferred duplicate
belongs to the excluded private lane. The original global duplicate relationship
is preserved in the manifest.

The typed execution engine is now `fresh_corpus_reconciliation_v1.2.5` because
source selection and completion semantics changed. Earlier run receipts and
parser versions are not relabeled.

## Verification performed on the combined code

| Gate | Result |
| --- | --- |
| Full repository suite | 325 test files passed, one opt-in file skipped; 1,686 tests passed, three skipped |
| Original DOC6 source through actual atomic worker and admin reader in isolated PostgreSQL | Nine tests passed; 753 source observations; four existing SAIS identities read back; retries preserved origins without duplicating content |
| Exact workbook audit | SHA-256 `a8edb63c60d7a7738446260f288b81a89dd5e7844d5c63532f40a3df4552eb12`; all 201 sheets and 74,921 nonempty rows still match the committed receipt |
| TypeScript and production build | Passed; server bundle and health contracts rechecked after the scope repair |
| Migration-ledger, ownership, stale-reference and contract guards | Passed against the repository's stored receipts; this is not a fresh live-production migration comparison |
| Batch migration | Existing filename and repository-only checksum unchanged |

The original DOC6 hash was
`3ad4eeb1e0f3a9dbbf79b34c9079c1c9f312d4e0bd1c34563d6dda7cde390325`.
Readback retained `SAIS-AT-001` through `SAIS-AT-004`, using the previously captured
canonical baseline inside an isolated database. Those are source-bound identity
checks, not new live-production assertions.

## Remaining release boundaries

The migration, private storage credentials, enabled worker and deployed admin
readback must be verified in the intended environment before a production source
pass is claimed complete. The existing identified Lighthouse background service
starts the Prism runner, which does not import atomic startup. No atomic runner
was identified or activated in this release; this is not a claim that every
possible runner was inspected. Feature-flag values were not verified by this
checkpoint, and setting a flag alone does not add that missing import.
This checkpoint performed no production migration,
private download, production replay, worker activation or canonical publication.
The local original-source test mocked transport while reading actual original bytes.

The Batch source adapter's existing holds remain in force: malformed documents,
stale archive checksums, incomplete native fragments, source-only SQL, unsupported
formats and OCR are not silently promoted. Full-family canonical reconciliation,
pipeline identifiers and public Legal Library/Benefits readback remain separate
work. The 203-object historical replay receipt was inspected, not rerun in full
for this checkpoint. This is an executable source-substrate integration with
bounded isolated proof, not a certificate that all records are public.

## Live schema prerequisites checked read-only

The Lighthouse project `wepxlinwbjrkqdzkqpar` was queried through Supabase at
2026-09-12 06:49 UTC. All 77 required columns exist across the source manifest,
atomic run/artifact/record/origin tables, `public.sais_resources` and
`storage.objects`. Their relevant primary/foreign keys and status/hash constraints
are present. The six public tables have RLS enabled and grant `service_role` the
SELECT/INSERT/UPDATE privileges used by this implementation. The actual deployed
application database role was not verified. The exact admin lineage SELECT
passed `EXPLAIN ... LIMIT 0`, without returning source data.

The private Batch bucket exists. There are currently zero Batch source-manifest
rows and zero Batch atomic artifact receipts. The existing
`public.sync_luminari_corpus_source_manifest_v2()` function is present but does
not include Batch; its inspected definition MD5 is
`a2eb94c47feb1f1a7416c99c36bbc499`. Its EXECUTE permission is granted to
`service_role` and withheld from `anon` and `authenticated`.
Migration `20260911201534` is absent from the live migration ledger.

After a code-only deployment, `batch_sources.get_batch_source_lineage` has its
required database structure and can execute; the observed unregistered state
produces empty readback. The queue mutation would call the current synchronizer,
which ignores Batch, then fail its explicit `batch_manifest_source_missing`
check. The additive migration replaces that existing function; it creates no
new tables or columns. It remains necessary for queue registration. No function
invocation, migration application or production write was performed in this check.
The metadata and aggregate evidence is recorded in
`docs/evidence/batch_live_schema_readiness_2026-09-12.json`.

## Migration-ledger procedure for a provider-assigned version

The existing release guard is
`scripts/audit-supabase-migration-ledger-parity.py`, called by
`.github/workflows/supabase-migration-ledger-parity.yml`. It compares the checked-in
production receipt TSVs with exact migration versions, filenames and executable
checksums. Repository-only migrations are bound to filenames and Git blob hashes
in `APPROVED_REPOSITORY_ONLY`. A repository-only file whose bytes match a recorded
production migration fails the duplicate-body guard. Passing this stored-receipt
check does not query the current production branch. The separate
`.github/workflows/supabase-fresh-replay.yml` gate rebuilds an isolated database.

No provider migration was applied for this checkpoint. If a subsequent release
uses Supabase `apply_migration`, which assigns a new version, the registration
sequence must be completed before the next native migration application:

1. Recheck the live ledger and function immediately before applying. If the
   native integration has already recorded `20260911201534` and installed the
   expected extension, do not apply the same extension again under another
   timestamp. Coordinate the deployment and receipt commit so native migration
   execution does not race the provider application.
2. Submit the reviewed function-only SQL through `apply_migration` using the
   migration name `batch_existing_substrate_registration`. Do not call the
   synchronizer, queue a run or change worker configuration as part of this
   schema operation. Record the actual version returned by the provider, then
   read its exact `version`, `name` and ordered `statements` from
   `supabase_migrations.schema_migrations`. Never manufacture an applied receipt
   or manually insert/update migration history.
3. Reconcile the pending source filename to the provider's actual
   `<version>_<name>.sql` without changing its SQL bytes. For this currently
   unapplied draft, that means a byte-preserving rename and removal of its old
   `APPROVED_REPOSITORY_ONLY` entry. First verify the old version is absent from
   any managed target whose migration directory is being updated; the live
   production read here does not establish preview ledgers. If another target
   already records the old version, preserve its historical source and resolve
   that explicit supersession with receipts before proceeding. Do not retain
   the same pending body under an additional approved filename merely to hide
   the mismatch, or rewrite applied source into a no-op.
4. Add a new dated
   `supabase/verification/production_migration_receipts_<date>_addendum.tsv`,
   with columns `version`, `name`, `statements_md5`, `statement_count`,
   `executable_md5`, and register that path in `PRODUCTION_RECEIPTS` in the
   audit script. Derive `statements_md5` from
   `md5(array_to_string(statements, E'\n'))` and count from the actual array.
   This checksum convention was verified read-only against the four-statement
   production receipt `20260511000001`. Derive `executable_md5` using the script's
   documented export convention: ordered statements, trailing whitespace trimmed,
   a missing top-level terminator restored, blank-line joins and one final
   newline. Do not split function bodies on internal semicolons.
5. Keep the reviewed SQL source bytes. If they do not equal the exported
   executable checksum because the provider normalized statement boundaries,
   register the actual `(statements_md5, Git blob SHA-1)` under the new version
   in the existing `SOURCE_CONTROLLED_APPLICATION_RECEIPTS` map after verifying
   statement equivalence. This is the existing exact-content binding mechanism;
   it is not permission to accept an unrelated body. No new generic exception
   or ledger-check bypass is needed.
6. Update the migration path in `server/batch-source-ingestion.test.ts` and
   `server/batch-typed-isolation.test.ts`. Keep dated evidence receipts unchanged
   as historical records, adding the draft-to-applied version mapping in a new
   receipt. Run the ledger and stale-reference guards, focused migration/source
   tests and required fresh replay. Read back the live function definition,
   service-only grants and actual ledger row; separately confirm the native
   production branch workflow succeeds before claiming ledger convergence.

The proposed file currently has Git blob SHA-1
`1516354fbe0818f3c96e605927e51888bf0d1d7c` and SHA-256
`31b02561b01fa5235d52290d67fc5a8cde92efe47a973f0a711db9e48edcf552`.
Neither it nor any historical migration was changed by this assessment.

## Executable runner boundary for a scoped pass (assessment before runner implementation)

The queue mutation is
`batch_sources.queue_batch_source_observations` in
`server/routers/batch-source-router.ts`. It requires an admin session, registers
storage metadata, verifies the selected active `Batch/` artifact keys and queues
that explicit scope through `queue_fresh_atomic_corpus_pass`.
The actual processor is
`resume_fresh_atomic_corpus_pass_from_database` in
`server/services/fresh-corpus-atomic-v1.ts`; it selects the oldest active run for
its engine and accepts bounded batch counts, not a caller-supplied run ID.
Queuing alone does not execute it.

The identified background service starts
`NODE_ENV=production node dist/prism-rosetta-worker.js`. Its source,
`server/prism-rosetta-worker.ts`, does not import atomic startup. The only existing
application startup import is in `server/_core/index.ts`, and the HTTP web role
cannot enable it. The package has `build:prism-worker`; it has no dedicated atomic
runner entrypoint/build command. The atomic startup timers use `unref()`, so a
new process that only imports that module is not a sufficient long-lived runner.

A production source pass therefore needs a deliberately configured runner that
actually invokes the processor. For a canary, a separate bounded entrypoint is
preferable: require explicit worker role and feature grant, bind to the expected
queued run and exact artifact scope, reject a different active run, invoke bounded
resume work, record receipts, and close the database pool on completion or failure.
The existing resume function selects by engine rather than an explicit run ID,
so a strict canary runner must verify and preserve that run binding instead of
blindly starting the generic loop. A recurring worker additionally needs a
referenced process lifetime and graceful shutdown. These are remaining runner
implementation/deployment requirements; none was added or activated here.
Private source credentials and the deployed application's effective database role
must be verified in that intended runtime before a download is claimed successful.


## Bounded standalone runner implementation

The missing entrypoint identified above is now implemented in
`server/fresh-atomic-runner.ts`, with `build:atomic-runner` and
`start:atomic-runner` package commands. It is not imported by the web process or
Prism runner. The exact requested run and complete Batch artifact scope are
validated before mutation. A bound processor selects that run directly, never
falls back to an older queued run, and restricts source selection to the pinned
allowlist. Batch and wall-time budgets, cancellation, sanitized receipts and a
separate watchdog process are implemented. The existing tables and queue mutation
remain the substrate; this entrypoint never queues a run or publishes canonical
records. Deployment instructions and limits are recorded in
`docs/continuity/bounded-atomic-runner-20260912.md`.

The typed replay locals changed by this integration are normalized to snake_case.
The old `manifestSync` option is accepted only at its input boundary and normalized
to `manifest_sync`; internal calls and emitted contracts use snake_case.
No parser behavior changed in this runner addition, so parser versions and the
historical workbook implementation receipt remain unchanged.
