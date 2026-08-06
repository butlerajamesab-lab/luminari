do $verify$
declare
  v_missing text[];
  v_trigger_count integer;
  v_public_execute_count integer;
begin
  select array_agg(expected.object_name order by expected.object_name)
    into v_missing
  from (
    values
      ('table:docket_jurisdiction_activation_run', to_regclass('public.docket_jurisdiction_activation_run') is not null),
      ('table:docket_bill_processing_queue', to_regclass('public.docket_bill_processing_queue') is not null),
      ('table:docket_jurisdiction_activation_bill', to_regclass('public.docket_jurisdiction_activation_bill') is not null),
      ('function:register_docket_jurisdiction_activation', to_regprocedure('public.register_docket_jurisdiction_activation(text,integer,text,jsonb,integer,timestamptz,text)') is not null),
      ('function:refresh_docket_jurisdiction_activation_run', to_regprocedure('public.refresh_docket_jurisdiction_activation_run(uuid)') is not null)
  ) as expected(object_name, present)
  where not expected.present;

  if v_missing is not null then
    raise exception 'docket_jurisdiction_activation_missing_objects:%', array_to_string(v_missing, ',');
  end if;

  select count(*)::integer
    into v_trigger_count
  from information_schema.triggers
  where trigger_schema = 'public'
    and event_object_table = 'docket_bill_state_cache'
    and trigger_name = 'docket_state_cache_enqueue_activation';

  if v_trigger_count <> 1 then
    raise exception 'docket_state_cache_activation_trigger_count:%', v_trigger_count;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.docket_bill_processing_queue'::regclass
      and conname = 'docket_bill_processing_generation_unique'
  ) then
    raise exception 'docket_bill_processing_deduplication_constraint_missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.docket_jurisdiction_activation_bill'::regclass
      and conname = 'docket_jurisdiction_activation_bill_pkey'
  ) then
    raise exception 'docket_jurisdiction_activation_membership_key_missing';
  end if;

  select count(*)::integer
    into v_public_execute_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in (
      'register_docket_jurisdiction_activation',
      'refresh_docket_jurisdiction_activation_run'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated')
    and privilege_type = 'EXECUTE';

  if v_public_execute_count <> 0 then
    raise exception 'docket_jurisdiction_activation_public_execute_present:%', v_public_execute_count;
  end if;

  if exists (
    select 1
    from public.docket_bill_processing_queue
    where source_bill_id <= 0
       or summary_fingerprint !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'docket_bill_processing_invalid_identity';
  end if;

  if exists (
    select 1
    from public.docket_jurisdiction_activation_bill binding
    left join public.docket_jurisdiction_activation_run activation
      on activation.activation_id = binding.activation_id
    left join public.docket_bill_processing_queue queue
      on queue.queue_id = binding.queue_id
    where activation.activation_id is null
       or queue.queue_id is null
       or binding.state <> activation.state
       or binding.session_id <> activation.session_id
       or binding.source_bill_id <> queue.source_bill_id
  ) then
    raise exception 'docket_jurisdiction_activation_binding_mismatch';
  end if;
end;
$verify$;

select
  count(*) as activation_count,
  sum(bill_count) as reported_bill_count,
  sum(registered_bill_count) as registered_bill_count,
  sum(completed_bill_count) as completed_bill_count,
  sum(source_unavailable_count) as source_unavailable_count,
  sum(failed_bill_count) as failed_bill_count
from public.docket_jurisdiction_activation_run;

select queue_state, count(*) as queue_count
from public.docket_bill_processing_queue
group by queue_state
order by queue_state;
