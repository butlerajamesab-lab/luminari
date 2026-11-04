-- FORWARD-ONLY / PRODUCTION NOT INSTALLED. PR #763.
-- Historical bulk ZIP source receipts + canonical Docket version-admission guard.
-- Source: the exact reviewed supabase/proposals files on this branch.
-- This migration is repository-only pending independent approval; it does not
-- authorize ingesting ZIPs, running Rosetta, or reactivating unrelated workers.
-- Fail closed if an unexpected receipt relation or a changed source gate exists.
do $preflight$
begin
  if to_regclass('public.docket_legiscan_bulk_member_receipt') is not null then
    raise exception 'docket_bulk_receipt_schema_already_present_review_before_install';
  end if;
  if to_regprocedure('public.enqueue_docket_current_authoritative_version_v1()') is null then
    raise exception 'docket_bulk_source_gate_missing';
  end if;
  if md5(pg_get_functiondef('public.enqueue_docket_current_authoritative_version_v1()'::regprocedure))
     is distinct from 'aedeefd16eac77249a25640afbdc502b' then
    raise exception 'docket_bulk_source_gate_baseline_changed';
  end if;
end
$preflight$;

-- PREPARED PROPOSAL ONLY. Production requires separate migration-ledger approval.
-- Source-bound append-only receipts for LegiScan's bulk ZIP transport.
create table public.docket_legiscan_bulk_member_receipt (
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
create index docket_legiscan_bulk_member_receipt_bill
  on public.docket_legiscan_bulk_member_receipt(bill_id) where bill_id is not null;
-- Public-schema tables must fail closed through both RLS and privileges.
-- Only the service-role writer may SELECT or append source receipts. 
alter table public.docket_legiscan_bulk_member_receipt enable row level security;
revoke all on public.docket_legiscan_bulk_member_receipt from public, anon, authenticated;
grant select, insert on public.docket_legiscan_bulk_member_receipt to service_role;
-- No UPDATE/DELETE grants or public policies. No Rosetta execution authorized.

CREATE OR REPLACE FUNCTION public.enqueue_docket_current_authoritative_version_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_priority integer;
begin
  if new.document_family <> 'text' then
    return new;
  end if;

  -- Source-aware admission: historical ZIP metadata is not official text.
  -- Do not create an automatic downstream eligible task for an archive source.
  -- The original trigger remains active; live API sources remain unchanged.
  if exists (
    select 1
      from public.docket_bill_detail_cache detail
     where detail.bill_id = new.source_bill_id
       and detail.source = 'legiscan_bulk_json'
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.docket_current_authoritative_source_v1 authority
    where authority.bill_version_id = new.bill_version_id
      and authority.source_bill_id = new.source_bill_id
      and authority.source_document_key = new.source_document_key
  ) then
    return new;
  end if;

  v_priority := (new.stage_rank * 1000) + new.provider_sequence;

  insert into public.civic_genome_legislative_version_queue (
    bill_version_id,
    queue_state,
    priority,
    attempt_count,
    next_attempt_at,
    completed_at,
    locked_at,
    locked_by,
    last_failure_class,
    last_error_code
  )
  values (
    new.bill_version_id,
    'eligible',
    v_priority,
    0,
    now(),
    null,
    null,
    null,
    null,
    null
  )
  on conflict (bill_version_id) do update
     set queue_state = 'eligible',
         priority = excluded.priority,
         attempt_count = 0,
         next_attempt_at = now(),
         completed_at = null,
         locked_at = null,
         locked_by = null,
         last_failure_class = null,
         last_error_code = null,
         updated_at = now();

  return new;
end;
$function$;


-- The existing trigger remains enabled and the installed SECURITY DEFINER
-- function retains its established privilege boundary.
do $postflight$
begin
  if not exists (
    select 1 from pg_class r
    where r.oid='public.docket_legiscan_bulk_member_receipt'::regclass
      and r.relrowsecurity
  ) then
    raise exception 'docket_bulk_receipts_rls_not_enabled';
  end if;
  if has_table_privilege('anon', 'public.docket_legiscan_bulk_member_receipt', 'select')
     or has_table_privilege('authenticated', 'public.docket_legiscan_bulk_member_receipt', 'select')
     or has_table_privilege('anon', 'public.docket_legiscan_bulk_member_receipt', 'insert')
     or has_table_privilege('authenticated', 'public.docket_legiscan_bulk_member_receipt', 'insert')
  then raise exception 'docket_bulk_receipts_public_access_regression';
  end if;
  if not (
    select p.prosecdef from pg_proc p
    where p.oid='public.enqueue_docket_current_authoritative_version_v1()'::regprocedure
  ) then raise exception 'docket_bulk_source_gate_security_changed';
  end if;
end
$postflight$;
