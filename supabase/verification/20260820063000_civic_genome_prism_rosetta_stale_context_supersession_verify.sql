with stale_context_failure as (
  select queue.queue_id,
         queue.assembly_run_id,
         queue.genome_bill_id,
         queue.prism_rule_set_id,
         queue.prism_rule_set_version,
         stale_assembly.source_document_id,
         stale_assembly.extraction_run_id as stale_extraction_run_id
  from public.civic_genome_prism_verification_queue queue
  join public.civic_genome_assembly_run stale_assembly
    on stale_assembly.assembly_run_id=queue.assembly_run_id
  where queue.queue_state='permanent_failure'
    and queue.prism_rule_set_id='prism-rosetta-structural-binding'
    and queue.prism_rule_set_version='2.3.0'
    and queue.last_failure_class='unknown'
    and queue.last_error_code='prism_rosetta_document_context_not_unique'
    and not exists (
      select 1
      from public.civic_genome_bill_version exact_version
      join public.docket_bill_source_document exact_document
        on exact_document.source_document_key=exact_version.source_document_key
      where exact_version.genome_bill_id=queue.genome_bill_id
        and exact_version.assembly_run_id=queue.assembly_run_id
        and exact_version.rosetta_source_document_id=stale_assembly.source_document_id
        and exact_version.rosetta_extraction_run_id=stale_assembly.extraction_run_id
    )
), replacement_candidate as (
  select stale.queue_id,
         replacement_assembly.trait_count as replacement_trait_count,
         replacement_queue.queue_state as replacement_queue_state,
         row_number() over (
           partition by stale.queue_id
           order by replacement_version.stage_rank desc,
                    replacement_version.provider_sequence desc,
                    replacement_version.created_at desc,
                    replacement_version.bill_version_id desc
         ) as rn
  from stale_context_failure stale
  join public.civic_genome_bill_version replacement_version
    on replacement_version.genome_bill_id=stale.genome_bill_id
   and replacement_version.rosetta_source_document_id=stale.source_document_id
   and replacement_version.assembly_run_id is not null
   and replacement_version.assembly_run_id is distinct from stale.assembly_run_id
   and replacement_version.rosetta_extraction_run_id is distinct from stale.stale_extraction_run_id
  join public.civic_genome_assembly_run replacement_assembly
    on replacement_assembly.assembly_run_id=replacement_version.assembly_run_id
   and replacement_assembly.genome_bill_id=stale.genome_bill_id
   and replacement_assembly.source_document_id=stale.source_document_id
   and replacement_assembly.extraction_run_id=replacement_version.rosetta_extraction_run_id
   and replacement_assembly.run_status='completed'
   and replacement_assembly.verification_state='complete'
  left join public.civic_genome_prism_verification_queue replacement_queue
    on replacement_queue.assembly_run_id=replacement_assembly.assembly_run_id
   and replacement_queue.prism_rule_set_id=stale.prism_rule_set_id
   and replacement_queue.prism_rule_set_version=stale.prism_rule_set_version
), safe_supersession_target as (
  select queue_id
  from replacement_candidate
  where rn=1
    and (
      replacement_trait_count=0
      or replacement_queue_state='completed'
    )
), unresolved_supersession_target as (
  select target.queue_id
  from safe_supersession_target target
  join public.civic_genome_prism_verification_queue queue
    on queue.queue_id=target.queue_id
  where queue.queue_state<>'superseded'
     or queue.last_failure_class<>'superseded_by_successor_rosetta_document_context'
     or queue.last_error_code<>'prism_rosetta_stale_document_context_superseded'
), superseded_receipts as (
  select count(*)::integer as receipt_count
  from public.civic_genome_bill_version version
  where version.receipt_json->>'prism_rosetta_stale_context_supersession_contract'
    = 'civic-genome-prism-rosetta-stale-context-supersession-v1'
), superseded_queue as (
  select count(*)::integer as queue_count
  from public.civic_genome_prism_verification_queue queue
  where queue.queue_state='superseded'
    and queue.last_failure_class='superseded_by_successor_rosetta_document_context'
    and queue.last_error_code='prism_rosetta_stale_document_context_superseded'
)
select
  case
    when (select count(*) from unresolved_supersession_target)=0
     and (select receipt_count from superseded_receipts)=(select queue_count from superseded_queue)
     and (select queue_count from superseded_queue)>0
    then 'pass'
    else 'fail'
  end as civic_genome_prism_rosetta_stale_context_supersession_v1,
  (select count(*)::integer from unresolved_supersession_target) as unresolved_supersession_target_count,
  (select count(*)::integer from stale_context_failure) as unresolved_stale_context_count,
  (select count(*)::integer from safe_supersession_target) as safe_supersession_target_count,
  (select queue_count from superseded_queue) as superseded_queue_count,
  (select receipt_count from superseded_receipts) as supersession_receipt_count;
