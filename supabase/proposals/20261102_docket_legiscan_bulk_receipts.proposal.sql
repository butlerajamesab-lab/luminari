-- PREPARED PROPOSAL ONLY. Production requires separate migration-ledger approval.
-- Source-bound append-only receipts for LegiScan's bulk ZIP transport.
create table if not exists public.docket_legiscan_bulk_member_receipt (
  archive_sha256 text not null check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  member_path text not null,
  member_sha256 text not null check (member_sha256 ~ '^[0-9a-f]{64}$'),
  member_kind text not null check (member_kind in ('bill','person','roll_call')),
  provider_record_id bigint not null check (provider_record_id > 0),
  bill_id integer,
  session_id integer,
  state text not null check (state ~ '^(US|[A-Z]{2})$'),
  change_hash text,
  payload_sha256 text,
  payload_json jsonb,
  source_observed_at timestamptz,
  imported_at timestamptz not null default now(),
  disposition text not null check (disposition in ('inserted','existing_preserved','source_preserved','held_chronology')),
  primary key (archive_sha256,member_path),
  check ((member_kind='bill' and bill_id=provider_record_id and session_id is not null)
    or (member_kind in ('person','roll_call') and bill_id is null))
);
create index if not exists docket_legiscan_bulk_member_receipt_bill
  on public.docket_legiscan_bulk_member_receipt(bill_id) where bill_id is not null;
-- Public-schema tables must fail closed through both RLS and privileges.
-- Only the service-role writer may SELECT or append source receipts. 
alter table public.docket_legiscan_bulk_member_receipt enable row level security;
revoke all on public.docket_legiscan_bulk_member_receipt from public, anon, authenticated;
grant select, insert on public.docket_legiscan_bulk_member_receipt to service_role;
-- No UPDATE/DELETE grants or public policies. No Rosetta execution authorized.
