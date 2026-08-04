begin;

alter table public.lighthouse_prism_verification_requests
  add column if not exists superseded_by_request_id text null,
  add column if not exists superseded_at timestamptz null;

alter table public.lighthouse_prism_verification_requests
  drop constraint if exists lighthouse_prism_verification_requests_superseded_by_request_id_fkey,
  add constraint lighthouse_prism_verification_requests_superseded_by_request_id_fkey
    foreign key (superseded_by_request_id)
    references public.lighthouse_prism_verification_requests(request_id)
    on delete restrict;

alter table public.lighthouse_prism_verification_requests
  drop constraint if exists lighthouse_prism_verification_requests_bridge_state_check,
  drop constraint if exists lighthouse_prism_verification_requests_superseded_state_check,
  add constraint lighthouse_prism_verification_requests_bridge_state_check
    check (bridge_state = any (array[
      'pending'::text,
      'completed'::text,
      'degraded'::text,
      'conflict'::text,
      'permanent_failure'::text,
      'superseded'::text
    ])),
  add constraint lighthouse_prism_verification_requests_superseded_state_check
    check (
      (bridge_state = 'superseded'
        and superseded_by_request_id is not null
        and superseded_at is not null
        and failure_class = 'superseded_by_completed_request')
      or
      (bridge_state <> 'superseded'
        and superseded_by_request_id is null
        and superseded_at is null)
    );

create index if not exists idx_lighthouse_prism_requests_superseded_by
  on public.lighthouse_prism_verification_requests(superseded_by_request_id)
  where superseded_by_request_id is not null;

with successful_matches as (
  select
    failed.request_id as failed_request_id,
    completed.request_id as completed_request_id,
    receipt.retrieved_at as completed_at,
    row_number() over (
      partition by failed.request_id
      order by receipt.retrieved_at desc, completed.request_id
    ) as match_rank
  from public.lighthouse_prism_verification_requests failed
  join public.lighthouse_prism_verification_requests completed
    on completed.request_id <> failed.request_id
   and completed.claim_assertion_id = failed.claim_assertion_id
   and completed.evidence_document_id = failed.evidence_document_id
   and completed.evidence_fingerprint = failed.evidence_fingerprint
   and completed.source_content_hash = failed.source_content_hash
   and completed.rule_set_id = failed.rule_set_id
   and completed.rule_set_version = failed.rule_set_version
   and completed.bridge_state = 'completed'
  join public.lighthouse_prism_verification_receipts receipt
    on receipt.request_id = completed.request_id
  where failed.bridge_state = 'degraded'
    and failed.failure_class = 'transient_upstream'
    and not exists (
      select 1
      from public.lighthouse_prism_verification_receipts failed_receipt
      where failed_receipt.request_id = failed.request_id
    )
), selected_matches as (
  select failed_request_id, completed_request_id, completed_at
  from successful_matches
  where match_rank = 1
)
update public.lighthouse_prism_verification_requests failed
set bridge_state = 'superseded',
    failure_class = 'superseded_by_completed_request',
    superseded_by_request_id = selected.completed_request_id,
    superseded_at = selected.completed_at,
    updated_at = now()
from selected_matches selected
where failed.request_id = selected.failed_request_id;

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
  receipt.retrieved_at,
  r.superseded_by_request_id,
  r.superseded_at
from public.lighthouse_prism_verification_requests r
left join public.lighthouse_prism_verification_receipts receipt
  on receipt.request_id = r.request_id;

revoke all on table public.v_lighthouse_prism_verification_status
  from public, anon, authenticated;
grant select on table public.v_lighthouse_prism_verification_status
  to service_role;

comment on column public.lighthouse_prism_verification_requests.superseded_by_request_id is
  'Later successful request with the same claim, document, evidence fingerprint, source-content hash, and Prism rule contract. The original failed request and attempts remain preserved.';
comment on column public.lighthouse_prism_verification_requests.superseded_at is
  'Completion time of the later matching Prism receipt used to classify this historical request as superseded.';

commit;
