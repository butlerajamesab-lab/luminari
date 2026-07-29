# Geocode worker PostgREST zero-row boundary

Date: 2026-07-29
Project: Lighthouse Supabase (`wepxlinwbjrkqdzkqpar`)

## Production sequence

1. PR #245 repaired the scheduled worker authentication boundary.
2. PR #249 increased the pg_net request timeout to 120 seconds and reduced the cron batch size to 10.
3. Live verification proved the request now reaches the Edge Function and returns HTTP 200.
4. The worker still cannot obtain queue rows through PostgREST/Supabase JS.

## Verified live facts

- `coordinate_enrichment_queue_v1` contains 3,192 pending rows.
- 3,192 rows are claimable under the current `< 5 attempts` gate.
- SQL executed directly as PostgreSQL can claim queue row `id = 1` through the secure claim function.
- The same table queried through Supabase JS returns:
  - exact count: 3,192
  - returned rows: 0
  - error: null
- Scalar RPCs invoked through PostgREST return HTTP 200 with JSON `null`.
- Table-returning RPCs invoked through PostgREST return HTTP 200 with JSON `[]`.
- The Edge Function receives the complete 64-character cron secret.
- The cron secret digest matches the stored SHA-256 value in PostgreSQL.
- Direct SQL verification of the secret succeeds.
- The latest worker deployment is version 13 and uses local SHA-256 verification plus secure claim/finalize RPCs, but PostgREST still returns zero result rows.

## Current safety state

- Queue rows remain `pending`.
- No rows are stranded in `processing`.
- No canonical resource coordinates were changed by the failed verification calls.
- The cron remains bounded to 10 rows every 15 minutes with a 120-second caller timeout.
- Docket Room, LegiScan, Atlas authority, and unrelated runtime surfaces were not modified.

## First unresolved boundary

PostgREST is returning zero data rows while still returning correct exact counts and HTTP 200 responses. This is now the first demonstrated production blocker. The next repair must identify the PostgREST response-row suppression/configuration boundary or replace this worker's PostgREST data path with a database-native execution lane that preserves the same secret, claim, retry, and receipt contracts.
