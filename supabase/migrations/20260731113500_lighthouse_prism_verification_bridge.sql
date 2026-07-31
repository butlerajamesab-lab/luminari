create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lighthouse_prism_verification_requests (
  request_id text primary key,
  lighthouse_case_id text not null,
  evidence_document_id text not null,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-fA-F0-9]{64}$'),
  source_content_hash text not null check (source_content_hash ~ '^[a-fA-F0-9]{64}$'),
  claim_assertion_id text not null,
  rule_set_id text not null,
  rule_set_version text not null,
  requested_checks jsonb not null,
  originating_lighthouse_commit text not null,
  originating_lighthouse_runtime_version text not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  bridge_state text not null default 'pending' check (bridge_state in (
    'pending',
    'completed',
    'degraded',
    'conflict',
    'permanent_failure'
  )),
  failure_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lighthouse_prism_verification_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  request_id text not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in (
    'completed',
    'reused',
    'conflict',
    'transient_failure',
    'permanent_failure',
    'degraded'
  )),
  http_status integer,
  failure_class text,
  created_at timestamptz not null default now()
);

create table if not exists public.lighthouse_prism_verification_receipts (
  prism_verification_receipt_id uuid primary key,
  request_id text not null unique references public.lighthouse_prism_verification_requests(request_id),
  prism_engine_version text not null,
  rule_set_id text not null,
  rule_set_version text not null,
  rule_set_hash text not null check (rule_set_hash ~ '^[a-f0-9]{64}$'),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  verification_status text not null check (verification_status in (
    'user_reported',
    'document_stated',
    'supported_by_one_source',
    'supported_by_multiple_sources',
    'contradicted',
    'disputed',
    'incomplete',
    'unresolved',
    'verified'
  )),
  supported_findings jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  unresolved_conditions jsonb not null default '[]'::jsonb,
  cited_evidence_identifiers jsonb not null default '[]'::jsonb,
  deterministic_replay_key text not null check (deterministic_replay_key ~ '^[a-f0-9]{64}$'),
  prism_completion_timestamp timestamptz not null,
  retrieved_at timestamptz not null default now()
);

create index if not exists lighthouse_prism_requests_case_idx
  on public.lighthouse_prism_verification_requests(lighthouse_case_id, created_at desc);
create index if not exists lighthouse_prism_attempts_request_idx
  on public.lighthouse_prism_verification_attempts(request_id, created_at desc);
create index if not exists lighthouse_prism_receipts_status_idx
  on public.lighthouse_prism_verification_receipts(verification_status, retrieved_at desc);

create or replace function public.prevent_lighthouse_prism_receipt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Mirrored Prism verification receipts are immutable';
end;
$$;

drop trigger if exists lighthouse_prism_receipts_immutable
  on public.lighthouse_prism_verification_receipts;
create trigger lighthouse_prism_receipts_immutable
before update or delete on public.lighthouse_prism_verification_receipts
for each row execute function public.prevent_lighthouse_prism_receipt_mutation();

create or replace view public.v_lighthouse_prism_verification_status
with (security_invoker = true)
as
select
  r.request_id,
  r.lighthouse_case_id,
  r.evidence_document_id,
  r.claim_assertion_id,
  r.bridge_state,
  r.failure_class,
  receipt.prism_verification_receipt_id,
  receipt.prism_engine_version,
  receipt.rule_set_id,
  receipt.rule_set_version,
  receipt.rule_set_hash,
  receipt.input_hash,
  receipt.output_hash,
  receipt.verification_status,
  receipt.supported_findings,
  receipt.contradictions,
  receipt.missing_evidence,
  receipt.unresolved_conditions,
  receipt.cited_evidence_identifiers,
  receipt.deterministic_replay_key,
  receipt.prism_completion_timestamp,
  receipt.retrieved_at
from public.lighthouse_prism_verification_requests r
left join public.lighthouse_prism_verification_receipts receipt
  on receipt.request_id = r.request_id;

alter table public.lighthouse_prism_verification_requests enable row level security;
alter table public.lighthouse_prism_verification_requests force row level security;
alter table public.lighthouse_prism_verification_attempts enable row level security;
alter table public.lighthouse_prism_verification_attempts force row level security;
alter table public.lighthouse_prism_verification_receipts enable row level security;
alter table public.lighthouse_prism_verification_receipts force row level security;

revoke all on table public.lighthouse_prism_verification_requests from public, anon, authenticated;
revoke all on table public.lighthouse_prism_verification_attempts from public, anon, authenticated;
revoke all on table public.lighthouse_prism_verification_receipts from public, anon, authenticated;
revoke all on table public.v_lighthouse_prism_verification_status from public, anon, authenticated;

grant select, insert, update on table public.lighthouse_prism_verification_requests to service_role;
grant select, insert on table public.lighthouse_prism_verification_attempts to service_role;
grant select, insert on table public.lighthouse_prism_verification_receipts to service_role;
grant select on table public.v_lighthouse_prism_verification_status to service_role;

revoke execute on function public.prevent_lighthouse_prism_receipt_mutation()
  from public, anon, authenticated;
