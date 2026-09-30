-- Enqueue only the one Docket-authoritative text version after a live bill-detail
-- observation. Historical versions stay registered for provenance but never
-- enter the ordinary operational queue.

create or replace function public.enqueue_docket_current_authoritative_version_v1()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_authority record;
  v_priority integer;
begin
  select *
    into v_authority
    from public.docket_current_authoritative_source_v1 authority
   where authority.source_bill_id = new.bill_id
   limit 1;

  if not found then
    return new;
  end if;

  select (version.stage_rank * 1000) + version.provider_sequence
    into v_priority
    from public.civic_genome_bill_version version
   where version.bill_version_id = v_authority.bill_version_id;

  if v_priority is null then
    raise exception 'docket_current_authoritative_version_missing'
      using errcode = '55000';
  end if;

  insert into public.civic_genome_legislative_version_queue (
    bill_version_id,
    queue_state,
    priority,
    next_attempt_at
  )
  values (
    v_authority.bill_version_id,
    'eligible',
    v_priority,
    now()
  )
  on conflict (bill_version_id) do update
     set queue_state = case
           when public.civic_genome_legislative_version_queue.queue_state = 'submitted'
             then public.civic_genome_legislative_version_queue.queue_state
           else 'eligible'
         end,
         priority = excluded.priority,
         next_attempt_at = case
           when public.civic_genome_legislative_version_queue.queue_state = 'submitted'
             then public.civic_genome_legislative_version_queue.next_attempt_at
           else now()
         end,
         completed_at = case
           when public.civic_genome_legislative_version_queue.queue_state = 'submitted'
             then public.civic_genome_legislative_version_queue.completed_at
           else null
         end,
         last_failure_class = case
           when public.civic_genome_legislative_version_queue.queue_state = 'submitted'
             then public.civic_genome_legislative_version_queue.last_failure_class
           else null
         end,
         last_error_code = case
           when public.civic_genome_legislative_version_queue.queue_state = 'submitted'
             then public.civic_genome_legislative_version_queue.last_error_code
           else null
         end,
         updated_at = now();

  return new;
end;
$function$;

revoke all on function public.enqueue_docket_current_authoritative_version_v1()
  from public, anon, authenticated;
grant execute on function public.enqueue_docket_current_authoritative_version_v1()
  to service_role;

drop trigger if exists zz_docket_current_authority_enqueue_v1
  on public.docket_bill_detail_cache;

create trigger zz_docket_current_authority_enqueue_v1
after insert or update on public.docket_bill_detail_cache
for each row
execute function public.enqueue_docket_current_authoritative_version_v1();

comment on function public.enqueue_docket_current_authoritative_version_v1() is
  'Queues exactly the Docket-authoritative live text version. Historical source versions remain audit-only and cannot be enqueued by ordinary Docket intake.';
