# Supabase Migration Ledger Reconciliation — 2026-08-02

Status: source-control reconciliation receipt. No historical production migration is replayed by this receipt.

## Problem

Lighthouse production recorded 218 Supabase migration versions, while 50 of those versions were absent from `supabase/migrations`. Several historical SQL bodies existed locally under timestamps different from the versions recorded by production. Supabase preview branch creation therefore failed before it could reproduce the Lighthouse baseline.

## Repair doctrine

- Historical SQL bodies with an identified production counterpart are moved byte-for-byte to the production-recorded version.
- Remote-only production receipts use the repository's established `*_recovered_placeholder.sql` pattern and execute only `select 1`.
- Two source bodies associated with one combined production receipt are preserved under `supabase/migration_sources/` and represented in the active migration ledger by one no-op receipt.
- No historical production DDL is rewritten or replayed.
- The existing Civic Map RPC contract is reasserted through one genuinely new, idempotent migration: `20260803000100_reassert_civicmap_map_rpc_contracts.sql`.

## Acceptance contract

The source-controlled parity test requires:

1. all 218 production versions observed on 2026-08-02 to exist locally;
2. no duplicate 14-digit migration versions;
3. no unclassified local-only 14-digit versions;
4. exactly one bounded new migration pending production application.

After production application, the fixture and expected-new set must be advanced together in a follow-up receipt.
