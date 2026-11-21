-- hold_bare_amendment_queue_v1 (Lighthouse wepxlinwbjrkqdzkqpar)
-- The 16,622 legacy base-less amendment versions were queued `eligible` before
-- no_bare_amendment_v1. They cannot be decomposed truthfully without their base,
-- so they are HELD with that reason instead of waiting to run. The versions
-- themselves are untouched.
-- Every queue claimer (legislative version worker, amendment source completion,
-- current-result reconciliation, Rosetta ingestion driver) selects only
-- 'eligible'/'degraded', so 'held' is never claimed. When an amendment later gets
-- its base, register_docket_legislative_version_spine re-enqueues it as eligible.
-- Applied to production 2026-11-21 04:01 PT on Alexander's explicit yes: 16,622 rows held.
-- Re-running is a no-op (constraint re-created identically; no eligible base-less rows remain).
-- Undo: supabase/verification/hold_bare_amendment_queue_v1_ROLLBACK.sql
begin;

alter table public.civic_genome_legislative_version_queue
  drop constraint civic_genome_legislative_version_queue_queue_state_check;
alter table public.civic_genome_legislative_version_queue
  add constraint civic_genome_legislative_version_queue_queue_state_check
  check (queue_state = any (array['eligible','submitted','completed','degraded','permanent_failure','held']));

do $hold$
declare v_n integer;
begin
  update public.civic_genome_legislative_version_queue queue
     set queue_state = 'held',
         last_failure_class = 'amendment_base_not_proven',
         last_error_code = 'no_bare_amendment_v1_hold',
         next_attempt_at = 'infinity'::timestamptz,
         updated_at = now()
    from public.civic_genome_bill_version version
   where version.bill_version_id = queue.bill_version_id
     and version.document_family = 'amendment'
     and version.base_bill_version_id is null
     and queue.queue_state = 'eligible'
     and queue.locked_at is null;
  get diagnostics v_n = row_count;
  raise notice 'held % base-less amendment queue rows', v_n;
end $hold$;

commit;
