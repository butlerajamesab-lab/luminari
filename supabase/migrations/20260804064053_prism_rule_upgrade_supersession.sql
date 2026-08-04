begin;

with successful_rule_upgrades as (
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
   and completed.rule_set_version <> failed.rule_set_version
   and completed.created_at > failed.created_at
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
  from successful_rule_upgrades
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

comment on column public.lighthouse_prism_verification_requests.superseded_by_request_id is
  'Later successful request for the same claim, document, evidence fingerprint, source-content hash, and Prism rule-set family. The request identity may differ because a later declared rule-set version replaced the failed attempt. Original requests and attempts remain preserved.';

commit;
