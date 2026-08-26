# Rosetta owner database changes

This directory contains migrations for the Rosetta owner Supabase project. It is
separate from `supabase/migrations`, which belongs to Lighthouse.

## 2026-08-26 terminal-rejection and Docket-content repair

`migrations/20260826083000_terminal_rejection_repairs_and_oldest_docket_backlog_v1.sql`
adds two bounded control surfaces without replacing the active Rosetta 2.5.11
parser or promoting the 2.5.13 candidate:

- a bounded classifier that gives every otherwise-unrepresented 2.5.11 terminal
  rejection one generic operator-repair receipt, including the exact run,
  manifest, parser, source, configuration, output, and failed-invariant evidence;
- a service-role-only selector for the oldest `docket:*` source documents that
  still have no durable `source_document_content` row.

The historical terminal-rejection backfill is deliberately resumable. After the
migration commits, call the internal function as the database owner until it
returns zero:

```sql
select public.rosetta_classify_terminal_rejections_v1(100);
```

Then run
`verification/20260826083000_terminal_rejection_repairs_and_oldest_docket_backlog_v1.verify.sql`.
The verification fails unless hidden terminal work is zero, all generic receipts
match their immutable extraction identities, function grants are closed, and the
two active 2.5.11 parser-definition hashes are unchanged.

Lighthouse may consume these functions only after this migration is verified.
Before each queue claim, its service role runs the bounded classifier and then
loads the oldest unbound identities. The worker joins each returned identifier
to the exact bill-version identity and writes a bounded, ordinal
`durable_content_recovery_v1` receipt before processing, while retaining the
existing `FOR UPDATE ... SKIP LOCKED` claim contract. This avoids replacing the
parser or taking an exclusive trigger-installation lock on continuously active
extraction tables.

## 2026-08-26 durable source-content transaction boundary

`migrations/20260826090000_durable_source_content_registration_v1.sql` adds the
service-role-only `rosetta_register_source_content_v1` RPC. Lighthouse calls it
after exact source acquisition and before the active parser RPC. It computes the
same source identity as 2.5.11, inserts idempotently, and fails closed if an
existing source version differs in any immutable identity field.

This is a separate HTTP/PostgreSQL transaction. A later parser rejection or
timeout can therefore remain fail-closed without rolling back the acquired
`source_document_content` row. Run
`verification/20260826090000_durable_source_content_registration_v1.verify.sql`
before deploying the corresponding Lighthouse worker change.
