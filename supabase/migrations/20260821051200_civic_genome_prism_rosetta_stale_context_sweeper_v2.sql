begin;

-- Some obsolete Prism Rosetta queue rows become safely supersedable only after
-- their successor same-source assembly completes Prism verification. Keep the
-- repair bounded, idempotent, and limited to queue state plus successor-version
-- receipt metadata.

create or replace function public.supersede_civic_genome_prism_rosetta_stale_context_v2(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_target_count integer := 0;
  v_receipt_count integer := 0;
  v_queue_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using
      errcode = '22023',
      message = 'civic_genome_prism_rosetta_stale_context_sweeper_invalid_limit',
      detail = coalesce(p_limit::text, 'null');
  end if;

  with replacement_candidate as (
    select
      queue.queue_id,
      queue.assembly_run_id as stale_assembly_run_id,
      queue.genome_bill_id,
      queue.prism_rule_set_id,
      queue.prism_rule_set_version,
      queue.expected_trait_count as stale_expected_trait_count,
      queue.attempt_count as stale_attempt_count,
      queue.last_failure_class as stale_failure_class,
      queue.last_error_code as stale_error_code,
      stale_assembly.source_document_id,
      stale_assembly.extraction_run_id as stale_extraction_run_id,
      replacement_version.bill_version_id as replacement_bill_version_id,
      replacement_version.assembly_run_id as replacement_assembly_run_id,
      replacement_version.rosetta_extraction_run_id as replacement_extraction_run_id,
      replacement_assembly.trait_count as replacement_trait_count,
      replacement_queue.queue_state as replacement_queue_state,
      row_number() over (
        partition by queue.queue_id
        order by replacement_version.stage_rank desc,
                 replacement_version.provider_sequence desc,
                 replacement_version.created_at desc,
                 replacement_version.bill_version_id desc
      ) as rn
    from public.civic_genome_prism_verification_queue queue
    join public.civic_genome_assembly_run stale_assembly
      on stale_assembly.assembly_run_id = queue.assembly_run_id
    join public.civic_genome_bill_version replacement_version
      on replacement_version.genome_bill_id = queue.genome_bill_id
     and replacement_version.rosetta_source_document_id = stale_assembly.source_document_id
     and replacement_version.assembly_run_id is not null
     and replacement_version.assembly_run_id is distinct from queue.assembly_run_id
     and replacement_version.rosetta_extraction_run_id is distinct from stale_assembly.extraction_run_id
    join public.civic_genome_assembly_run replacement_assembly
      on replacement_assembly.assembly_run_id = replacement_version.assembly_run_id
     and replacement_assembly.genome_bill_id = queue.genome_bill_id
     and replacement_assembly.source_document_id = stale_assembly.source_document_id
     and replacement_assembly.extraction_run_id = replacement_version.rosetta_extraction_run_id
     and replacement_assembly.run_status = 'completed'
     and replacement_assembly.verification_state = 'complete'
    left join public.civic_genome_prism_verification_queue replacement_queue
      on replacement_queue.assembly_run_id = replacement_assembly.assembly_run_id
     and replacement_queue.prism_rule_set_id = queue.prism_rule_set_id
     and replacement_queue.prism_rule_set_version = queue.prism_rule_set_version
    where queue.queue_state = 'permanent_failure'
      and queue.prism_rule_set_id = 'prism-rosetta-structural-binding'
      and queue.prism_rule_set_version = '2.3.0'
      and queue.last_failure_class = 'unknown'
      and queue.last_error_code = 'prism_rosetta_document_context_not_unique'
      and not exists (
        select 1
        from public.civic_genome_bill_version exact_version
        join public.docket_bill_source_document exact_document
          on exact_document.source_document_key = exact_version.source_document_key
        where exact_version.genome_bill_id = queue.genome_bill_id
          and exact_version.assembly_run_id = queue.assembly_run_id
          and exact_version.rosetta_source_document_id = stale_assembly.source_document_id
          and exact_version.rosetta_extraction_run_id = stale_assembly.extraction_run_id
      )
  ), target as (
    select *
    from replacement_candidate
    where rn = 1
      and (
        replacement_trait_count = 0
        or replacement_queue_state = 'completed'
      )
    order by queue_id
    limit p_limit
  ), receipt_update as (
    update public.civic_genome_bill_version version
       set receipt_json = coalesce(version.receipt_json, '{}'::jsonb) || jsonb_build_object(
             'prism_rosetta_stale_context_sweeper_contract',
             'civic-genome-prism-rosetta-stale-context-sweeper-v2',
             'prism_rosetta_stale_context_swept_at', now(),
             'prism_rosetta_stale_context_reason',
             'obsolete_prism_queue_assembly_no_longer_matches_completed_successor_same_source_rosetta_context',
             'prism_rosetta_stale_context_queue_id', target.queue_id,
             'prism_rosetta_stale_context_previous_assembly_run_id', target.stale_assembly_run_id,
             'prism_rosetta_stale_context_previous_extraction_run_id', target.stale_extraction_run_id,
             'prism_rosetta_stale_context_previous_expected_trait_count', target.stale_expected_trait_count,
             'prism_rosetta_stale_context_previous_attempt_count', target.stale_attempt_count,
             'prism_rosetta_stale_context_previous_failure_class', target.stale_failure_class,
             'prism_rosetta_stale_context_previous_error_code', target.stale_error_code,
             'prism_rosetta_stale_context_replacement_assembly_run_id', target.replacement_assembly_run_id,
             'prism_rosetta_stale_context_replacement_extraction_run_id', target.replacement_extraction_run_id,
             'prism_rosetta_stale_context_replacement_trait_count', target.replacement_trait_count,
             'prism_rosetta_stale_context_replacement_queue_state', target.replacement_queue_state,
             'prism_rule_set_id', target.prism_rule_set_id,
             'prism_rule_set_version', target.prism_rule_set_version
           ),
           updated_at = now()
      from target
     where version.bill_version_id = target.replacement_bill_version_id
     returning version.bill_version_id
  ), queue_update as (
    update public.civic_genome_prism_verification_queue queue
       set queue_state = 'superseded',
           locked_at = null,
           locked_by = null,
           completed_at = null,
           last_failure_class = 'superseded_by_successor_rosetta_document_context',
           last_error_code = 'prism_rosetta_stale_document_context_superseded',
           updated_at = now()
      from target
     where queue.queue_id = target.queue_id
     returning queue.queue_id
  )
  select
    (select count(*)::integer from target),
    (select count(*)::integer from receipt_update),
    (select count(*)::integer from queue_update)
    into v_target_count, v_receipt_count, v_queue_count;

  if v_receipt_count <> v_target_count or v_queue_count <> v_target_count then
    raise exception using
      errcode = '55000',
      message = 'civic_genome_prism_rosetta_stale_context_sweeper_count_mismatch',
      detail = jsonb_build_object(
        'target_count', v_target_count,
        'receipt_count', v_receipt_count,
        'queue_count', v_queue_count
      )::text;
  end if;

  return v_queue_count;
end;
$function$;

create or replace function public.trigger_civic_genome_prism_rosetta_stale_context_sweeper_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.prism_rule_set_id = 'prism-rosetta-structural-binding'
     and new.prism_rule_set_version = '2.3.0'
     and new.queue_state = 'completed' then
    perform public.supersede_civic_genome_prism_rosetta_stale_context_v2(100);
  end if;

  return new;
end;
$function$;

drop trigger if exists civic_genome_prism_rosetta_stale_context_sweeper_v2
on public.civic_genome_prism_verification_queue;

create trigger civic_genome_prism_rosetta_stale_context_sweeper_v2
after insert or update of queue_state
on public.civic_genome_prism_verification_queue
for each row
when (new.queue_state = 'completed')
execute function public.trigger_civic_genome_prism_rosetta_stale_context_sweeper_v2();

select public.supersede_civic_genome_prism_rosetta_stale_context_v2(100);

revoke all on function public.supersede_civic_genome_prism_rosetta_stale_context_v2(integer)
from public, anon, authenticated, service_role;

revoke all on function public.trigger_civic_genome_prism_rosetta_stale_context_sweeper_v2()
from public, anon, authenticated, service_role;

comment on function public.supersede_civic_genome_prism_rosetta_stale_context_v2(integer) is
  'Supersedes obsolete Prism Rosetta 2.3 document-context queue failures only after a same-source successor assembly has completed or has no Prism-eligible traits. Immutable Prism requests, receipts, runs, and bindings remain unchanged.';

comment on trigger civic_genome_prism_rosetta_stale_context_sweeper_v2
on public.civic_genome_prism_verification_queue is
  'Runs the bounded stale-context supersession sweeper whenever a Prism Rosetta 2.3 queue row becomes completed.';

commit;
