create or replace function public.preserve_legislative_version_queue_state_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  -- A recurring activation sweep may discover a normal stage priority, but it
  -- must not erase a lower repair/backfill priority before the worker claims
  -- it. Explicit reprioritization remains possible by choosing a lower value.
  new.priority:=least(old.priority,new.priority);

  if old.queue_state in ('submitted','degraded','permanent_failure')
     and new.queue_state='eligible'
     and new.last_error_code is not distinct from old.last_error_code
     and new.last_failure_class is not distinct from old.last_failure_class then
    new.queue_state:=old.queue_state;
    new.next_attempt_at:=old.next_attempt_at;
    new.locked_at:=old.locked_at;
    new.locked_by:=old.locked_by;
    new.completed_at:=old.completed_at;
  end if;
  return new;
end;
$$;

comment on function public.preserve_legislative_version_queue_state_v1() is
  'Prevents recurring bill activation from collapsing worker priority, leases, backoff, and terminal failures. Intentional replay must clear prior failure fields.';
