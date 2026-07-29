# Geocode worker PostgREST zero-row boundary

Date: 2026-07-29
Project: Lighthouse Supabase (`wepxlinwbjrkqdzkqpar`)
Status: **resolved in production**

## Production sequence

1. PR #245 repaired the scheduled worker authentication boundary.
2. PR #249 increased the `pg_net` request timeout to 120 seconds and reduced the cron batch size to 10.
3. Live verification proved the request reached the Edge Function but PostgREST suppressed all row and RPC bodies.
4. PR #250 replaced only the worker's PostgREST data path with bounded direct PostgreSQL over the Edge runtime's existing `SUPABASE_DB_URL`.
5. PR #250 passed the complete GitHub build and health-check workflow and merged as `62ab5f47e3a038c18d45092430baf6d96e1ce5e1`.
6. `geocode-queue-worker` version 14 was deployed from the merged repository source.

## Verified zero-row boundary

Before repair:

- `coordinate_enrichment_queue_v1` contained 3,192 pending rows.
- all 3,192 rows were claimable under the `< 5 attempts` gate;
- direct PostgreSQL as `service_role` could read and claim the rows;
- every available Edge service key received HTTP 200 with `[]` for direct PostgREST row selection;
- every available Edge service key received HTTP 200 with `null` for scalar RPC results;
- the Edge runtime exposed `SUPABASE_DB_URL`;
- a bounded direct PostgreSQL probe from the Edge runtime returned the authoritative pending count of 3,192.

## Implemented repair

The production worker now:

- validates the complete Vault-backed `x-cron-secret` before queue access;
- connects through `SUPABASE_DB_URL` with `postgres.js`;
- limits database concurrency to one connection;
- claims a bounded batch with `FOR UPDATE SKIP LOCKED`;
- increments attempt accounting at claim time;
- requeues transient upstream failures;
- deterministically fails invalid, unsupported, permanent-error, and no-result rows;
- writes canonical resource coordinates and queue completion in one transaction;
- verifies final queue mutation before counting completion;
- always closes the database connection.

No schema ownership, RLS policy, Atlas authority, Docket Room behavior, LegiScan behavior, or canonical resource ownership was changed.

## Production acceptance receipt

Two explicit live probes were executed after deployment:

```text
probe 1
claimed: 1
completed: 1
failed: 0
requeued: 0
finalize_failures: 0
HTTP: 200

probe 2
claimed: 10
completed: 10
failed: 0
requeued: 0
finalize_failures: 0
HTTP: 200
```

Resulting live state at the receipt boundary:

```text
pending: 3,181
completed: 11
processing: 0
cron schedule: */15 * * * *
cron batch size: 10
caller timeout: 120000 ms
worker version: 14
```

The first completed record updated its matching canonical `normalized_civic_resource` row with latitude, longitude, and geocode precision in the same transaction as queue completion.

## Cleanup receipt

- temporary SQL invocation and role-diagnostic functions were dropped;
- the pre-existing public debug Edge Function was replaced with an inert HTTP 410 endpoint;
- no queue rows remained stranded in `processing`;
- the production cron remains active and will continue draining ten bounded rows every fifteen minutes.

## Durable authority

- PR #250: direct PostgreSQL worker repair
- merge commit: `62ab5f47e3a038c18d45092430baf6d96e1ce5e1`
- production Edge Function: `geocode-queue-worker` version 14
- this document is the production incident and acceptance receipt.
