-- Additive only. Lets the activation claim walk ready queue rows in order
-- and stop at the first match instead of joining and sorting ~198k rows
-- (measured 2.6s; claim times out at 5s once the canary allowlist is open).
-- Undo: drop index concurrently if exists public.idx_docket_bill_processing_queue_claim_order;
create index concurrently if not exists idx_docket_bill_processing_queue_claim_order
  on public.docket_bill_processing_queue (created_at, queue_id)
  where queue_state in ('eligible','degraded','submitted');
