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
