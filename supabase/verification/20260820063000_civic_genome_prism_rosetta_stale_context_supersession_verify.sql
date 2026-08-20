with unresolved_stale_context as (
  select queue.queue_id
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
    when (select count(*) from unresolved_stale_context)=0
     and (select receipt_count from superseded_receipts)=(select queue_count from superseded_queue)
     and (select queue_count from superseded_queue)>0
    then 'pass'
    else 'fail'
  end as civic_genome_prism_rosetta_stale_context_supersession_v1,
  (select count(*)::integer from unresolved_stale_context) as unresolved_stale_context_count,
  (select queue_count from superseded_queue) as superseded_queue_count,
  (select receipt_count from superseded_receipts) as supersession_receipt_count;
