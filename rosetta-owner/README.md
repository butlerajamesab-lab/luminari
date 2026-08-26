# Rosetta owner database changes

This directory contains migrations for the Rosetta owner Supabase project. It is
separate from `supabase/migrations`, which belongs to Lighthouse.

## 2026-08-26 terminal-rejection and Docket-content repair

`migrations/20260826083000_terminal_rejection_repairs_and_oldest_docket_backlog_v1.sql`
adds two bounded control surfaces without replacing the active Rosetta 2.5.11
parser or promoting the 2.5.13 candidate:

- an `extraction_manifest` trigger that gives every otherwise-unrepresented
  2.5.11 terminal rejection one generic operator-repair receipt, including the
  exact run, manifest, parser, source, configuration, output, and failed
  invariant evidence;
- a service-role-only selector for the oldest `docket:*` source documents that
  still have no durable `source_document_content` row.

The historical terminal-rejection backfill is deliberately resumable. After the
migration commits, call the internal function as the database owner until it
returns zero:

```sql
select public.rosetta_backfill_terminal_rejection_repairs_v1(100);
```

Then run
`verification/20260826083000_terminal_rejection_repairs_and_oldest_docket_backlog_v1.verify.sql`.
The verification fails unless hidden terminal work is zero, all generic receipts
match their immutable extraction identities, function grants are closed, and the
two active 2.5.11 parser-definition hashes are unchanged.

Lighthouse may consume the selector only after this migration is verified. Its
worker joins the returned identifier to the exact bill-version identity and
writes a one-time `durable_content_recovery_v1` receipt before processing, while
retaining the existing `FOR UPDATE ... SKIP LOCKED` claim contract.
