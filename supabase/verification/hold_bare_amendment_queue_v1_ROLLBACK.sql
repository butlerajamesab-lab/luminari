-- ROLLBACK for hold_bare_amendment_queue_v1: returns exactly the rows it held to eligible,
-- then restores the original queue_state check.
begin;
update public.civic_genome_legislative_version_queue
   set queue_state = 'eligible', last_failure_class = null, last_error_code = null,
       next_attempt_at = now(), updated_at = now()
 where queue_state = 'held' and last_error_code = 'no_bare_amendment_v1_hold';
alter table public.civic_genome_legislative_version_queue
  drop constraint civic_genome_legislative_version_queue_queue_state_check;
alter table public.civic_genome_legislative_version_queue
  add constraint civic_genome_legislative_version_queue_queue_state_check
  check (queue_state = any (array['eligible','submitted','completed','degraded','permanent_failure']));
commit;
