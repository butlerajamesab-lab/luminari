# Reuse the suspended Prism canary for archive-only Docket activation

**Status: PREPARED / NOT DEPLOYED / NOT RESUMED.** This is a conversion of the
existing Render instance, **not** a new paid service or a new activation path.

## Existing service and immutable boundaries

- Render workspace: `tea-d7rogkegvqtc73bli0o0`
- Existing background worker: `srv-da9c7a1f2nfc73f2ee8g`
- Existing service name: `lighthouse-prism-canary` (may be renamed in the UI **after** proof)
- Git repository/branch: `butlerajamesab-lab/luminari` / `main`
- Existing build command: `corepack pnpm install --frozen-lockfile && corepack pnpm build:prism-worker`
- Existing start command: `NODE_ENV=production node dist/prism-rosetta-worker.js`
- Existing plan: `0.5c-512mb`, 1 instance; suspended by user
- The build and start commands deliberately stay unchanged. After this
  change is reviewed and merged, `build:prism-worker` creates an *explicit
  worker-lane dispatcher* at the same output path. The original Prism canary
  source and legacy build script remain available, but no legacy worker
  imports can execute on the archive-only lane.
- Never resume before exact deployed-commit confirmation and environment
  verification. Never touch or merge PR #791 as part of this conversion.

## 2026-11-13 Render connector blocker

An attempt to set the archive-only configuration on the **suspended**
`lighthouse-prism-canary` service using the connected Render
`update_environment_variables` action was rejected with HTTP 400:
`cannot deploy suspended service`. Treat the environment as **not
updated**; this attempt did not authorize or perform a service resume.

The connected Render actions do not expose an existing-service
build/start-command edit or a resume-with-new-deployment operation.
**Do not resume the historical `prism-rosetta-worker.js` artifact**
to work around this error: it can initialize legacy Prism/Rosetta
workers, paid API routes and other cross-service processing.

Safe remaining steps: exact-branch CI/review in a non-paid setting;
switch existing service build to the reviewed dispatcher and set the
archive-only config in Render **before** starting the service, using
a supported operator action that atomically prevents the old runtime
from starting. If Render cannot do that while suspended, keep it
suspended and do not improvise a resume/redeploy sequence. A fresh
paid service or Supabase preview must not be created without separate
approval.

## P1 production amendment-integrity hold (2026-11-14)

**DO NOT RESUME OR ACTIVATE THIS WORKER YET.** The [source registration
defect / release gate, issue #813](https://github.com/butlerajamesab-lab/luminari/issues/813)
was confirmed from installed Lighthouse Supabase SQL and read-only counts.
The cache trigger `docket_legislative_version_spine_registration` fires on
`docket_bill_detail_cache` INSERT or bill UPDATE and calls
`register_docket_legislative_version_spine(new.bill_id, false)`. Although the
`false` prevents version *queueing*, the function still creates amendment
source and Genome-version derivatives even when no independent amendment
attachment is verified. This happens during source admission independently
of the suspended archive activation worker.

Production contains **18,100** unbased amendment source rows and **18,100**
unbased derived Genome versions; **10,398** of each were newly created from
Nov 11 UTC onward, associated through `source_bill_id` with current
`legiscan_bulk_json` cache rows. The previous PR #771 proposal's
**7,264**-row manifest is stale; the draft PR #771 was not touched or merged.
The source cron was active at 333,827 immutable receipts / 53 archive hashes
during inspection, so source-ingestion continuation needs a separate
explicit risk decision. Neither an offline worker build nor a source receipt
is proof that the installed registration trigger is safe.

**Mandatory before any canary resumption:** independently approve and
install a forward-only canonical amendment admission guard + evidence and
same-bill base requirements; reconcile dependencies/cross-service cleanup;
prove on disposable populated PostgreSQL that the cache trigger no longer
creates unbased derivatives for source-only intake; verify live function and
constraint identity, updated orphan counts, and no paid provider calls.
Until that is done, do not work around the blocker with a feature flag or
by bypassing canonical Docket acceptance. This release hold supersedes the
preconditions below.

## Exact one-bill path witness (read-only production observation)

Montana SB26, LegiScan bill `1895898`, archive member
`MT/2025-2025_Regular_Session/bill/SB26.json`, archive
SHA-256 `a82fce3e12d5e71b45b7917f5fc5a561e07e77e2ceca27590475e9a9733359fd`,
member SHA-256
`a6f9009ecb60cff6f6cc86172da3b882c61ac1a4107a85f8d884cd1699bee437`.

The source member is preserved with `disposition=inserted` and cache
`source=legiscan_bulk_json`. Archive-origin activation queue ID
`7f76ecdd-190d-4fc3-80af-591f2d327751` is `eligible`, attempts `0`
at observation; the earlier API master-list queue row for the same bill
is `permanent_failure` from September and must not be touched.
The bill maps to Civic Genome bill
`35c6f68e-f773-4b57-b727-54ddea798508`, with four **text**
source-document keys, all registered in Civic Genome, none an
`amendment`-family derivative. Stages were Introduced, Amended
(text version), Enrolled, Amended (text version), with each version
`processing_state=registered` and `rosetta_source_document_id=NULL`
at the read-only snapshot.

**This is an observed partial path, not a completed runtime trace.**
After PR #813's independent repair/certification, require exact
identity/readiness recheck and choose **only** this witness queue ID.
The worker's claim SQL and its superseded-update CTE are both scoped
to the same ID; no other archive-origin queue job may be modified.
Any stale/wrong identity must fail before activation. The source
ZIP and master-list queue records must not be overwritten.

## Release preconditions

1. Run focused unit tests for `server/lighthouse-worker-lane.test.ts`,
   existing Docket archive-worker transport tests, TypeScript check, worker
   bundle builds and independent review. No production preview or extra paid
   Render worker is authorized by this document.
2. Merge only a clean, exact-head accepted change and verify Render has
   built **that exact commit**. The Render service must remain suspended.
3. In the **existing service's** Render dashboard, turn **auto-deploy OFF**
   before its first controlled pilot, so an unrelated push to `main` does
   not restart the one-cycle pilot.
4. Set these exact environment variables on the existing suspended service:

   ```text
   LIGHTHOUSE_WORKER_LANE=docket_archive_only
   LIGHTHOUSE_RUNTIME_ROLE=worker
   DOCKET_BILL_ACTIVATION_QUEUE_ENABLED=true
   DOCKET_BILL_ACTIVATION_SOURCE_SCOPE=legiscan_bulk_json
   DOCKET_BILL_ACTIVATION_CONCURRENCY=1
   DOCKET_BILL_ACTIVATION_QUEUE_POLL_MS=5000
   DOCKET_ARCHIVE_PILOT_MODE=one_cycle
   DOCKET_ARCHIVE_WITNESS_QUEUE_ID=7f76ecdd-190d-4fc3-80af-591f2d327751

   PRISM_ROSETTA_QUEUE_ENABLED=false
   LEGISLATIVE_VERSION_QUEUE_ENABLED=false
   DOCKET_STATE_CACHE_WARMER_ENABLED=false
   CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED=false
   ROSETTA_GENOME_ACTIVATION_QUEUE_ENABLED=false
   ROSETTA_GENOME_TARGET_SYNC_ENABLED=false
   ROSETTA_GENOME_UPGRADE_QUEUE_ENABLED=false
   FRESH_ATOMIC_CORPUS_RESUME_ENABLED=false
   ```

5. Existing `DATABASE_URL` and `LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY`
   must remain configured in the existing service without printing or
   re-entering secret values here. Remove legacy `LEGISCAN_API_KEY`,
   Rosetta credentials and Prism bridge secret from this service using the
   Render dashboard where supported. The archive-only dispatcher additionally
   deletes `LEGISCAN_API_KEY` **inside its process before importing any
   Docket code**, so inherited provider access cannot be used. Do **not**
   change environment variables on Lighthouse's web service, Rosetta, Prism,
   or the separate Docket ZIP cron.
6. Confirm no existing Docket activation queue worker is running and
   source-intake remains unaffected. In a read-only transaction, capture
   eligible/completed/failed `legiscan_bulk_json` queue counts, source
   receipt counts and latest run ID.
7. Manually resume this exact suspended Render instance only for the
   one-cycle pilot. The startup dispatcher fails closed if any required
   archive-only guard is wrong. The pilot runs **exactly one** queue claim
   cycle at concurrency one, without starting a recurring polling timer.
   It stays alive afterward for log/receipt inspection. A container restart
   can run another one-cycle claim: do not assume a durable total-job cap.
8. Verify the sole claimed queue ID and its immutable archive-source receipt,
   Civic Genome mapping, `register_docket_legislative_version_spine(..., false)`
   outcome, queue terminal classification, absence of new provider API calls,
   and absence of Rosetta/Prism execution. Record unexpected results and
   suspend before widening scope. A successful build or start is **not**
   sufficient.
9. Continuous mode requires a separate decision/acceptance (and removal of
   this one-cycle guard). Do not silently remove `DOCKET_ARCHIVE_PILOT_MODE`.

## Unchanged responsibilities

- The independent `lighthouse-docket-one-archive-5n4b` Render cron continues
  to import ZIP source members through the canonical Docket path.
- This repurposed service consumes only archive-provenance activation jobs
  using the **existing** Docket queue and version registration function.
- Legacy Prism/Rosetta workers remain in source control for their own
  later independent certification; no retired Rosetta engine is selected.
- The historical `rosetta-v2539-worker` remains separately suspended.
- No schema changes, migrations, queue surgery, paid LegiScan calls,
  downstream publication, or cross-service writes are authorized here.
