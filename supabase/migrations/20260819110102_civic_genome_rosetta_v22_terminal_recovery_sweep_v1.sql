begin;

do $recovery$
declare
  v_target public.civic_genome_rosetta_generation_target%rowtype;
  v_target_count integer:=0;
  v_receipt_count integer:=0;
  v_queue_count integer:=0;
begin
  -- FRESH_REPLAY_EMPTY_GUARD_BEGIN
  -- This is a one-time production data repair, not schema seed data. A fresh
  -- replay has no legislative versions, queue rows, or Docket source rows and
  -- therefore has nothing that can be truthfully recovered. Preserve every
  -- original fail-closed assertion as soon as any of those substrates exists.
  if not exists (select 1 from public.civic_genome_bill_version limit 1)
     and not exists (
       select 1 from public.civic_genome_legislative_version_queue limit 1
     )
     and not exists (select 1 from public.docket_bill_source_document limit 1)
  then
    return;
  end if;
  -- FRESH_REPLAY_EMPTY_GUARD_END

  select * into v_target
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
  for share;

  if not found
     or v_target.engine_version <> 'rosetta-v3-deterministic-sql-2.5.11'
     or v_target.rule_set_version <> 'rosetta-five-layer-structural-correctness-2.5.11'
     or v_target.rule_manifest_hash <> '3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639'
     or v_target.validation_test_name <> 'independent_structure_v2511' then
    raise exception using
      errcode='55000',
      message='civic_genome_rosetta_v22_recovery_unexpected_current_generation',
      detail=coalesce(row_to_json(v_target)::text,'null');
  end if;

  with ranked as (
    select version.*,
           row_number() over(
             partition by version.genome_bill_id
             order by version.stage_rank desc,
                      version.provider_sequence desc,
                      version.created_at desc,
                      version.bill_version_id desc
           ) as rn
    from public.civic_genome_bill_version version
  ), current_version as (
    select * from ranked where rn=1
  )
  select count(*)::integer into v_target_count
  from current_version version
  join public.civic_genome_legislative_version_queue queue
    on queue.bill_version_id=version.bill_version_id
  join public.docket_bill_source_document docket
    on docket.source_document_key=version.source_document_key
  where queue.queue_state='permanent_failure'
    and queue.last_failure_class='unknown'
    and queue.last_error_code like '%rosetta_v22_amendment_operation_not_found%'
    and version.document_family='amendment'
    and version.rosetta_source_document_id is not null
    and (nullif(docket.source_url,'') is not null or nullif(docket.provider_url,'') is not null);

  if v_target_count=0 then
    raise exception 'civic_genome_rosetta_v22_recovery_no_targets';
  end if;
  if v_target_count>100 then
    raise exception using
      errcode='54000',
      message='civic_genome_rosetta_v22_recovery_target_count_exceeds_bound',
      detail=v_target_count::text;
  end if;

  with ranked as (
    select version.*,
           row_number() over(
             partition by version.genome_bill_id
             order by version.stage_rank desc,
                      version.provider_sequence desc,
                      version.created_at desc,
                      version.bill_version_id desc
           ) as rn
    from public.civic_genome_bill_version version
  ), target as (
    select version.bill_version_id,
           version.failure_code as prior_failure_code,
           queue.attempt_count as prior_attempt_count,
           queue.last_failure_class as prior_failure_class,
           queue.last_error_code as prior_error_code
    from ranked version
    join public.civic_genome_legislative_version_queue queue
      on queue.bill_version_id=version.bill_version_id
    join public.docket_bill_source_document docket
      on docket.source_document_key=version.source_document_key
    where version.rn=1
      and queue.queue_state='permanent_failure'
      and queue.last_failure_class='unknown'
      and queue.last_error_code like '%rosetta_v22_amendment_operation_not_found%'
      and version.document_family='amendment'
      and version.rosetta_source_document_id is not null
      and (nullif(docket.source_url,'') is not null or nullif(docket.provider_url,'') is not null)
  )
  update public.civic_genome_bill_version version
     set receipt_json=coalesce(version.receipt_json,'{}'::jsonb)||jsonb_build_object(
           'legislative_version_recovery_contract','civic-genome-rosetta-v22-terminal-recovery-sweep-v1',
           'legislative_version_recovery_reason','obsolete_rosetta_v22_amendment_operation_terminal_reclassified_under_current_v2511',
           'legislative_version_recovery_requeued_at',now(),
           'legislative_version_recovery_previous_failure_code',target.prior_failure_code,
           'legislative_version_recovery_previous_queue_failure_class',target.prior_failure_class,
           'legislative_version_recovery_previous_queue_error_code',target.prior_error_code,
           'legislative_version_recovery_previous_queue_attempt_count',target.prior_attempt_count,
           'legislative_version_recovery_target_engine_version',v_target.engine_version,
           'legislative_version_recovery_target_rule_set_version',v_target.rule_set_version,
           'legislative_version_recovery_target_rule_manifest_hash',v_target.rule_manifest_hash
         ),
         updated_at=now()
    from target
   where version.bill_version_id=target.bill_version_id;
  get diagnostics v_receipt_count=row_count;

  if v_receipt_count<>v_target_count then
    raise exception using
      errcode='55000',
      message='civic_genome_rosetta_v22_recovery_receipt_count_mismatch',
      detail=jsonb_build_object('target_count',v_target_count,'receipt_count',v_receipt_count)::text;
  end if;

  with ranked as (
    select version.*,
           row_number() over(
             partition by version.genome_bill_id
             order by version.stage_rank desc,
                      version.provider_sequence desc,
                      version.created_at desc,
                      version.bill_version_id desc
           ) as rn
    from public.civic_genome_bill_version version
  ), target as (
    select queue.queue_id
    from ranked version
    join public.civic_genome_legislative_version_queue queue
      on queue.bill_version_id=version.bill_version_id
    join public.docket_bill_source_document docket
      on docket.source_document_key=version.source_document_key
    where version.rn=1
      and queue.queue_state='permanent_failure'
      and queue.last_failure_class='unknown'
      and queue.last_error_code like '%rosetta_v22_amendment_operation_not_found%'
      and version.document_family='amendment'
      and version.rosetta_source_document_id is not null
      and (nullif(docket.source_url,'') is not null or nullif(docket.provider_url,'') is not null)
  )
  update public.civic_genome_legislative_version_queue queue
     set queue_state='eligible',
         priority=least(queue.priority,-1000),
         attempt_count=0,
         next_attempt_at=now(),
         locked_at=null,
         locked_by=null,
         completed_at=null,
         last_failure_class=null,
         last_error_code=null,
         updated_at=now()
    from target
   where queue.queue_id=target.queue_id;
  get diagnostics v_queue_count=row_count;

  if v_queue_count<>v_target_count then
    raise exception using
      errcode='55000',
      message='civic_genome_rosetta_v22_recovery_queue_count_mismatch',
      detail=jsonb_build_object('target_count',v_target_count,'queue_count',v_queue_count)::text;
  end if;
end;
$recovery$;

commit;
