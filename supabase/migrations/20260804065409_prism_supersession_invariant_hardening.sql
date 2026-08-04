begin;

create or replace function public.enforce_lighthouse_prism_supersession()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  replacement_state text;
  replacement_created_at timestamptz;
  replacement_claim_assertion_id text;
  replacement_evidence_document_id text;
  replacement_evidence_fingerprint text;
  replacement_source_content_hash text;
  replacement_rule_set_id text;
  replacement_completion timestamptz;
begin
  if new.bridge_state <> 'superseded' then
    return new;
  end if;

  if new.superseded_by_request_id is null then
    raise exception 'superseded_request_requires_replacement';
  end if;

  select
    completed.bridge_state,
    completed.created_at,
    completed.claim_assertion_id,
    completed.evidence_document_id,
    completed.evidence_fingerprint,
    completed.source_content_hash,
    completed.rule_set_id,
    receipt.prism_completion_timestamp
  into
    replacement_state,
    replacement_created_at,
    replacement_claim_assertion_id,
    replacement_evidence_document_id,
    replacement_evidence_fingerprint,
    replacement_source_content_hash,
    replacement_rule_set_id,
    replacement_completion
  from public.lighthouse_prism_verification_requests completed
  join public.lighthouse_prism_verification_receipts receipt
    on receipt.request_id = completed.request_id
  where completed.request_id = new.superseded_by_request_id;

  if not found
     or replacement_state <> 'completed'
     or replacement_created_at <= new.created_at
     or replacement_claim_assertion_id is distinct from new.claim_assertion_id
     or replacement_evidence_document_id is distinct from new.evidence_document_id
     or replacement_evidence_fingerprint is distinct from new.evidence_fingerprint
     or replacement_source_content_hash is distinct from new.source_content_hash
     or replacement_rule_set_id is distinct from new.rule_set_id then
    raise exception 'invalid_prism_supersession_replacement';
  end if;

  new.failure_class := 'superseded_by_completed_request';
  new.superseded_at := replacement_completion;
  return new;
end;
$$;

revoke execute on function public.enforce_lighthouse_prism_supersession()
  from public, anon, authenticated;
grant execute on function public.enforce_lighthouse_prism_supersession()
  to service_role;

drop trigger if exists trg_lighthouse_prism_supersession_invariant
  on public.lighthouse_prism_verification_requests;
create trigger trg_lighthouse_prism_supersession_invariant
before insert or update of bridge_state, superseded_by_request_id, superseded_at
on public.lighthouse_prism_verification_requests
for each row
execute function public.enforce_lighthouse_prism_supersession();

update public.lighthouse_prism_verification_requests failed
set superseded_at = receipt.prism_completion_timestamp,
    updated_at = now()
from public.lighthouse_prism_verification_requests completed
join public.lighthouse_prism_verification_receipts receipt
  on receipt.request_id = completed.request_id
where failed.bridge_state = 'superseded'
  and completed.request_id = failed.superseded_by_request_id;

comment on function public.enforce_lighthouse_prism_supersession() is
  'Fails closed unless a superseded Lighthouse Prism request points to a later completed, receipt-backed request with the same governed claim, document, evidence fingerprint, source-content hash, and rule-set family. Derives superseded_at from the immutable Prism completion timestamp.';

commit;
