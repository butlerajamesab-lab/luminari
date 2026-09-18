-- Track bounded observation of parked Rosetta current-result holds.
-- This timestamp is not an execution attempt and does not authorize Rosetta work.
alter table public.civic_genome_legislative_version_queue
  add column if not exists current_result_checked_at timestamptz;

comment on column public.civic_genome_legislative_version_queue.current_result_checked_at is
  'Last read-only observation of a parked exact Rosetta current result. Does not represent parser execution, replay, retry, or queue attempt consumption.';

create index if not exists idx_legislative_version_current_result_hold_observation
  on public.civic_genome_legislative_version_queue(
    current_result_checked_at asc nulls first,
    updated_at asc,
    queue_id
  )
  where queue_state='degraded'
    and last_failure_class='awaiting_current_result';

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid='public.civic_genome_legislative_version_queue'::regclass
      and tgname='preserve_legislative_version_queue_state_v1'
      and not tgisinternal
  ) then
    raise exception 'legislative-version queue monotonicity guard is missing';
  end if;
end;
$$;
