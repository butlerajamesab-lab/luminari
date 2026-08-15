create or replace function public.preserve_legislative_version_queue_state_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  -- register_docket_bill_version_spine is called by the activation sweep. Its
  -- upsert must not erase a worker lease, retry delay, or terminal failure on
  -- every poll. An intentional replay remains possible by clearing the prior
  -- failure fields in the same update.
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

drop trigger if exists preserve_legislative_version_queue_state_v1
  on public.civic_genome_legislative_version_queue;
create trigger preserve_legislative_version_queue_state_v1
before update on public.civic_genome_legislative_version_queue
for each row execute function public.preserve_legislative_version_queue_state_v1();

comment on function public.preserve_legislative_version_queue_state_v1() is
  'Prevents recurring bill activation from collapsing leases, backoff, and terminal failures back to eligible. Intentional replay must clear prior failure fields.';

revoke all on function public.preserve_legislative_version_queue_state_v1() from public,anon,authenticated;
grant execute on function public.preserve_legislative_version_queue_state_v1() to service_role;
