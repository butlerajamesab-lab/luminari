begin;

create or replace function public.civic_genome_observe_rosetta_generation_target_v1(
  p_contract text,
  p_engine_version text,
  p_rule_set_version text,
  p_rule_manifest_hash text,
  p_validation_test_name text,
  p_promoted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_current public.civic_genome_rosetta_generation_target%rowtype;
  v_superseded integer:=0;
  v_satisfied integer:=0;
  v_same boolean:=false;
begin
  if nullif(btrim(p_contract),'') is null
     or nullif(btrim(p_engine_version),'') is null
     or nullif(btrim(p_rule_set_version),'') is null
     or p_rule_manifest_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_validation_test_name),'') is null
     or p_promoted_at is null then
    raise exception using errcode='22023',message='civic_genome_rosetta_generation_target_invalid';
  end if;

  select * into v_current
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
  for update;

  if found then
    if p_promoted_at < v_current.promoted_at then
      return jsonb_build_object(
        'contract','civic-genome-rosetta-target-observation-v2',
        'accepted',false,
        'stale_observation_ignored',true,
        'stored_promoted_at',v_current.promoted_at,
        'observed_promoted_at',p_promoted_at,
        'engine_version',v_current.engine_version,
        'rule_set_version',v_current.rule_set_version,
        'rule_manifest_hash',v_current.rule_manifest_hash,
        'validation_test_name',v_current.validation_test_name,
        'superseded_job_count',0,
        'satisfied_job_count',0
      );
    end if;

    v_same := p_promoted_at=v_current.promoted_at
      and p_contract=v_current.contract
      and p_engine_version=v_current.engine_version
      and p_rule_set_version=v_current.rule_set_version
      and p_rule_manifest_hash=v_current.rule_manifest_hash
      and p_validation_test_name=v_current.validation_test_name;

    if p_promoted_at=v_current.promoted_at and not v_same then
      raise exception using
        errcode='22000',
        message='civic_genome_rosetta_generation_target_same_promotion_conflict',
        detail=jsonb_build_object(
          'stored_engine_version',v_current.engine_version,
          'stored_rule_set_version',v_current.rule_set_version,
          'stored_rule_manifest_hash',v_current.rule_manifest_hash,
          'stored_validation_test_name',v_current.validation_test_name,
          'promoted_at',v_current.promoted_at,
          'observed_engine_version',p_engine_version,
          'observed_rule_set_version',p_rule_set_version,
          'observed_rule_manifest_hash',p_rule_manifest_hash,
          'observed_validation_test_name',p_validation_test_name
        )::text;
    end if;
  end if;

  insert into public.civic_genome_rosetta_generation_target(
    target_name,contract,engine_version,rule_set_version,rule_manifest_hash,
    validation_test_name,promoted_at,observed_at,updated_at
  ) values (
    'current',p_contract,p_engine_version,p_rule_set_version,p_rule_manifest_hash,
    p_validation_test_name,p_promoted_at,now(),now()
  )
  on conflict(target_name) do update set
    contract=excluded.contract,
    engine_version=excluded.engine_version,
    rule_set_version=excluded.rule_set_version,
    rule_manifest_hash=excluded.rule_manifest_hash,
    validation_test_name=excluded.validation_test_name,
    promoted_at=excluded.promoted_at,
    observed_at=excluded.observed_at,
    updated_at=now();

  update public.civic_genome_rosetta_generation_upgrade_queue queue
     set queue_state='superseded',
         locked_at=null,
         locked_by=null,
         last_error_code='rosetta_generation_target_superseded',
         last_error_detail='A newer monotonic Rosetta current-generation receipt replaced this queued target before completion.',
         updated_at=now()
   where queue.queue_state in ('eligible','retry','running')
     and (
       queue.target_engine_version is distinct from p_engine_version
       or queue.target_rule_set_version is distinct from p_rule_set_version
       or queue.target_rule_manifest_hash is distinct from p_rule_manifest_hash
       or queue.target_validation_test_name is distinct from p_validation_test_name
       or queue.target_promoted_at is distinct from p_promoted_at
     );
  get diagnostics v_superseded=row_count;

  -- Same-target work may become unnecessary when the canonical legislative-version
  -- path independently restores and assembles the exact current Rosetta generation.
  -- Reconcile only non-running jobs and preserve their prior failure fields verbatim.
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
    select *
    from ranked
    where rn=1
  )
  update public.civic_genome_rosetta_generation_upgrade_queue queue
     set queue_state='superseded',
         locked_at=null,
         locked_by=null,
         updated_at=now()
    from current_version version,
         public.civic_genome_rosetta_source_binding binding,
         public.civic_genome_assembly_run assembly
   where queue.queue_state in ('eligible','retry','dead_letter')
     and queue.target_engine_version=p_engine_version
     and queue.target_rule_set_version=p_rule_set_version
     and queue.target_rule_manifest_hash=p_rule_manifest_hash
     and queue.target_validation_test_name=p_validation_test_name
     and queue.target_promoted_at=p_promoted_at
     and version.genome_bill_id=queue.genome_bill_id
     and version.rosetta_source_document_id=queue.source_document_id
     and version.processing_state='assembled'
     and version.failure_code is null
     and version.rosetta_extraction_run_id is not null
     and version.assembly_run_id is not null
     and binding.source_document_id=queue.source_document_id
     and binding.genome_bill_id=queue.genome_bill_id
     and binding.source_identity_hash=queue.source_identity_hash
     and binding.rosetta_engine_version=queue.target_engine_version
     and binding.rosetta_rule_set_version=queue.target_rule_set_version
     and binding.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash
     and assembly.assembly_run_id=version.assembly_run_id
     and assembly.genome_bill_id=queue.genome_bill_id
     and assembly.source_document_id=queue.source_document_id
     and assembly.extraction_run_id=version.rosetta_extraction_run_id
     and assembly.run_status='completed'
     and assembly.verification_state='complete'
     and assembly.rosetta_engine_version=queue.target_engine_version
     and assembly.rosetta_rule_set_version=queue.target_rule_set_version
     and assembly.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash
     and assembly.rosetta_source_identity_hash=queue.source_identity_hash;
  get diagnostics v_satisfied=row_count;

  return jsonb_build_object(
    'contract','civic-genome-rosetta-target-observation-v2',
    'accepted',true,
    'stale_observation_ignored',false,
    'engine_version',p_engine_version,
    'rule_set_version',p_rule_set_version,
    'rule_manifest_hash',p_rule_manifest_hash,
    'validation_test_name',p_validation_test_name,
    'promoted_at',p_promoted_at,
    'superseded_job_count',v_superseded,
    'satisfied_job_count',v_satisfied,
    'observed_at',now()
  );
end;
$$;

revoke all on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz)
  to service_role;

comment on function public.civic_genome_observe_rosetta_generation_target_v1(text,text,text,text,text,timestamptz) is
  'Monotonic Rosetta generation target observer. Lower promoted_at receipts are ignored, equal promoted_at identity conflicts fail closed, older incomplete targets are superseded, and same-target non-running queue work is superseded only after the current bill version, source binding, and completed verified assembly independently prove the exact target generation.';

commit;
