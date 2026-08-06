do $verify$
declare
  v_source_constraint text;
  v_version_constraint text;
begin
  select pg_get_constraintdef(oid)
    into v_source_constraint
  from pg_constraint
  where conrelid = 'public.docket_bill_source_document'::regclass
    and conname = 'docket_bill_source_document_chamber_check';

  select pg_get_constraintdef(oid)
    into v_version_constraint
  from pg_constraint
  where conrelid = 'public.civic_genome_bill_version'::regclass
    and conname = 'civic_genome_bill_version_chamber_check';

  if v_source_constraint is null or v_source_constraint not like '%char_length(chamber)%' then
    raise exception 'docket_source_document_chamber_contract_not_repaired';
  end if;
  if v_version_constraint is null or v_version_constraint not like '%char_length(chamber)%' then
    raise exception 'civic_genome_bill_version_chamber_contract_not_repaired';
  end if;

  if exists (
    select 1
    from public.docket_bill_processing_queue
    where last_error_code = 'docket_civic_genome_projection_pending'
       or last_error_code like 'new_row_for_relation__docket_bill_source_document__violates_check_constraint__docket_bill_source_document_chamber_check_%'
  ) then
    raise exception 'recoverable_docket_activation_failure_not_reset';
  end if;
end;
$verify$;

select queue_state, count(*) as queue_count
from public.docket_bill_processing_queue
group by queue_state
order by queue_state;
