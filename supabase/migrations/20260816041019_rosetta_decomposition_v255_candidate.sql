begin

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v254_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.5.4%' then
    raise exception 'rosetta_v255_expected_v254_base_missing';
  end if;
  v_definition := replace(v_definition,'FUNCTION public.run_rosetta_v3_extraction_v254_base(','FUNCTION public.run_rosetta_v3_extraction_v255_base(');
  v_definition := replace(v_definition,'rosetta-v3-deterministic-sql-2.5.4','rosetta-v3-deterministic-sql-2.5.5');
  v_definition := replace(v_definition,'rosetta-five-layer-structural-correctness-2.5.4','rosetta-five-layer-structural-correctness-2.5.5');
  v_definition := replace(v_definition,'-v254-','-v255-');
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v254_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.5.4%' then
    raise exception 'rosetta_v255_expected_v254_finalizer_missing';
  end if;
  v_definition := replace(v_definition,'FUNCTION public.rosetta_v254_finalize_extraction(','FUNCTION public.rosetta_v255_finalize_extraction(');
  v_definition := replace(v_definition,'rosetta-v3-deterministic-sql-2.5.4','rosetta-v3-deterministic-sql-2.5.5');
  v_definition := replace(v_definition,'rosetta-five-layer-structural-correctness-2.5.4','rosetta-five-layer-structural-correctness-2.5.5');
  v_definition := replace(v_definition,'-v254-','-v255-');
  v_definition := replace(v_definition,'public.rosetta_v254_canonical_output','public.rosetta_v255_canonical_output');
  v_definition := replace(v_definition,'rosetta-structural-correctness-v254','rosetta-structural-correctness-v255');
  v_definition := replace(v_definition,'exact_source_structure_v254','exact_source_structure_v255');
  v_definition := replace(v_definition,'rosetta_v254_canonical_output_unavailable','rosetta_v255_canonical_output_unavailable');
  v_definition := replace(v_definition,'public.rosetta_v24_amendment_operations','public.rosetta_v255_amendment_operations');
  execute v_definition;
end;
$migration$

create or replace function public.rosetta_v255_canonical_output(p_extraction_run_id integer)
returns jsonb
language sql
stable
strict
set search_path = pg_catalog, public
as $$
  with base as (
    select public.rosetta_v254_canonical_output(p_extraction_run_id) as value
  ),
  structural as (
    select coalesce(law.structural_representations,'[]'::jsonb) as value
    from public.v_rosetta_operator_law_view_v1 law
    where law.extraction_run_id=p_extraction_run_id
  ),
  counts as (
    select count(*)::integer as structural_count
    from public.rosetta_structural_representation representation
    where representation.extraction_run_id=p_extraction_run_id
  )
  select case when base.value is null then null else
    base.value || jsonb_build_object(
      'contract','rosetta-canonical-law-view-v255',
      'handoff_contract_version','rosetta-civic-genome-handoff-v2',
      'structural_representations',coalesce(structural.value,'[]'::jsonb),
      'row_counts',coalesce(base.value->'row_counts','{}'::jsonb)
        || jsonb_build_object('structural_representations',counts.structural_count)
    ) end
  from base
  left join structural on true
  cross join counts;
$$

create or replace function public.rosetta_v255_reconcile_structural_correctness(p_extraction_run_id integer)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare v_base jsonb;
begin
  v_base:=public.rosetta_v254_reconcile_structural_correctness(p_extraction_run_id);
  return v_base||jsonb_build_object('contract','rosetta-structural-reconciliation-v255');
end;
$$

create or replace function public.rosetta_v255_reclassify_amendment_structure(
  p_extraction_run_id integer,
  p_source_text text,
  p_source_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,extensions
as $$
declare
  v_run public.extraction_run%rowtype;
  v_document record;
  v_family text:=lower(coalesce(p_source_metadata->>'docket_document_family',''));
  v_operation record;
  v_operation_count integer:=0;
  v_block_id text;
  v_representation_id text;
  v_disposition text;
  v_prune jsonb;
begin
  select * into v_run from public.extraction_run where id=p_extraction_run_id for update;
  if not found then raise exception 'rosetta_v255_extraction_run_not_found'; end if;
  select corpus_id,document_identifier into v_document from public.source_document where id=v_run.source_document_id;
  if v_family='' and v_run.source_content_id is not null then
    select lower(coalesce(source_metadata->>'docket_document_family','')) into v_family
    from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;

  delete from public.rosetta_structural_representation
  where extraction_run_id=p_extraction_run_id;

  if v_family is distinct from 'amendment' then
    return jsonb_build_object(
      'contract','rosetta-amendment-structural-representation-v255',
      'document_family',nullif(v_family,''),
      'applied',false,
      'representation_count',0
    );
  end if;

  v_disposition:=public.rosetta_v24_amendment_disposition(p_source_text,p_source_metadata);
  v_prune:=public.rosetta_v24_prune_amendment_projection(p_extraction_run_id);

  for v_operation in select * from public.rosetta_v255_amendment_operations(p_source_text) order by operation_ordinal loop
    v_operation_count:=v_operation_count+1;
    v_block_id:='blk-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');
    v_representation_id:='sr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');

    update public.hr1_raw_blocks
       set block_content_hash=encode(digest(convert_to(v_operation.operation_text,'UTF8'),'sha256'),'hex'),
           char_offset_start=v_operation.char_offset_start,
           char_offset_end=v_operation.char_offset_end
     where id=v_block_id and extraction_run_id=p_extraction_run_id;
    if not found then
      raise exception using errcode='22000',message='rosetta_v255_amendment_operation_block_missing',detail=v_block_id;
    end if;

    insert into public.rosetta_structural_representation(
      id,corpus_id,source_document_id,extraction_run_id,source_block_id,
      representation_type,representation_json,confidence,signal_status
    ) values (
      v_representation_id,v_document.corpus_id,v_run.source_document_id,p_extraction_run_id,v_block_id,
      'source_stated_amendment_operation',
      jsonb_build_object(
        'operation_ordinal',v_operation.operation_ordinal,
        'operation_kind',v_operation.operation_kind,
        'target_locator',v_operation.target_locator,
        'operation_text',v_operation.operation_text,
        'amendment_disposition',v_disposition,
        'operative_effect_applied',false,
        'representation_scope','source_instruction'
      ),1.00,'confirmed'
    );
  end loop;

  if v_operation_count=0 then raise exception 'rosetta_v255_amendment_operation_not_found'; end if;

  insert into public.layer_coverage(
    id,extraction_run_id,source_block_id,layer_name,coverage_status,reason,validated_at
  )
  select
    'lc-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amendment-nonoperative-'||lower(layer_name),
    p_extraction_run_id,
    (select id from public.hr1_raw_blocks where extraction_run_id=p_extraction_run_id and block_type='document' order by id limit 1),
    layer_name,'not_applicable',
    'Source-stated amendment instruction is preserved as a non-operative structural representation. Rosetta does not apply the instruction to underlying law in this decomposition.',
    clock_timestamp()
  from unnest(array['HELP','WORKFLOW','ACCOUNTABILITY','OVERRIDES','DEFINITIONS']) layer_name;

  return jsonb_build_object(
    'contract','rosetta-amendment-structural-representation-v255',
    'document_family','amendment',
    'applied',true,
    'amendment_disposition',v_disposition,
    'representation_count',v_operation_count,
    'operative_layer_projection','not_applied',
    'prune_receipt',v_prune
  );
end;
$$

create or replace function public.rosetta_v255_final_coverage(p_extraction_run_id integer)
returns jsonb
language sql
stable
strict
set search_path=pg_catalog,public
as $$
  select coalesce(jsonb_object_agg(
    lower(layer.layer_name),
    jsonb_build_object('status',layer.coverage_status,'reason',layer.reason,'validated_at',layer.validated_at)
    order by layer.layer_name
  ),'{}'::jsonb)
  from (
    select coverage.layer_name,
      case when bool_or(coverage.coverage_status='extraction_failed') then 'extraction_failed'
           when bool_or(coverage.coverage_status='pending_extraction') then 'pending_extraction'
           when bool_or(coverage.coverage_status='populated') then 'populated'
           else 'not_applicable' end as coverage_status,
      string_agg(distinct coverage.reason,' | ' order by coverage.reason) filter(where coverage.reason is not null) as reason,
      max(coverage.validated_at) as validated_at
    from public.layer_coverage coverage
    where coverage.extraction_run_id=p_extraction_run_id
    group by coverage.layer_name
  ) layer;
$$

create or replace function public.rosetta_v255_refresh_final_coverage_receipts(p_extraction_run_id integer)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_run public.extraction_run%rowtype;
  v_coverage jsonb;
  v_layer_count integer;
  v_terminal boolean;
  v_details jsonb;
begin
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v255_extraction_run_not_found'; end if;
  v_coverage:=public.rosetta_v255_final_coverage(p_extraction_run_id);
  select count(*)::integer,coalesce(bool_and(value->>'status' in ('populated','not_applicable')),false)
    into v_layer_count,v_terminal from jsonb_each(v_coverage);
  v_terminal:=v_terminal and v_layer_count=5;
  v_details:=jsonb_build_object('contract','rosetta-final-five-layer-coverage-v255','coverage',v_coverage,'layer_count',v_layer_count,'terminal',v_terminal);

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-coverage-final',p_extraction_run_id,'five_layer_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-no-pending-final',p_extraction_run_id,'no_pending_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  return v_details||jsonb_build_object('status',case when v_terminal then 'pass' else 'fail' end);
end;
$$

create or replace function public.rosetta_v255_validate_independent_structure(p_extraction_run_id integer,p_source_text text)
returns jsonb
language plpgsql
stable
strict
set search_path=pg_catalog,public,extensions
as $$
declare
  v_base jsonb;
  v_run public.extraction_run%rowtype;
  v_metadata jsonb:='{}'::jsonb;
  v_family text:='';
  v_expected integer:=0;
  v_actual integer:=0;
  v_operative integer:=0;
  v_footer integer:=0;
  v_span_mismatch integer:=0;
  v_coverage_mismatch integer:=0;
  v_disposition_mismatch integer:=0;
  v_expected_disposition text;
  v_status text;
begin
  v_base:=public.rosetta_v253_validate_independent_structure(p_extraction_run_id,p_source_text);
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v255_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));
  select count(*)::integer into v_actual from public.rosetta_structural_representation where extraction_run_id=p_extraction_run_id;

  if v_family='amendment' then
    select count(*)::integer into v_expected from public.rosetta_v255_amendment_operations(p_source_text);
    select
      (select count(*) from public.help_entity where extraction_run_id=p_extraction_run_id)
      +(select count(*) from public.workflow_pipeline where extraction_run_id=p_extraction_run_id)
      +(select count(*) from public.accountability_route where extraction_run_id=p_extraction_run_id)
      +(select count(*) from public.entity_override where extraction_run_id=p_extraction_run_id)
      +(select count(*) from public.term_definition where extraction_run_id=p_extraction_run_id)
      into v_operative;
    select count(*)::integer into v_footer
    from public.rosetta_structural_representation
    where extraction_run_id=p_extraction_run_id
      and representation_type='source_stated_amendment_operation'
      and coalesce(representation_json->>'operation_text','') ~* '(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$';
    select count(*)::integer into v_span_mismatch
    from public.rosetta_structural_representation representation
    left join public.hr1_raw_blocks block on block.id=representation.source_block_id
    where representation.extraction_run_id=p_extraction_run_id
      and (block.id is null
        or substring(p_source_text from block.char_offset_start+1 for block.char_offset_end-block.char_offset_start) is distinct from representation.representation_json->>'operation_text'
        or block.block_content_hash is distinct from encode(digest(convert_to(coalesce(representation.representation_json->>'operation_text',''),'UTF8'),'sha256'),'hex'));
    select case when count(distinct layer_name)=5 and coalesce(bool_and(coverage_status='not_applicable'),false) then 0 else 1 end
      into v_coverage_mismatch from public.layer_coverage where extraction_run_id=p_extraction_run_id;
    v_expected_disposition:=public.rosetta_v24_amendment_disposition(p_source_text,v_metadata);
    select count(*)::integer into v_disposition_mismatch
    from public.rosetta_structural_representation
    where extraction_run_id=p_extraction_run_id
      and representation_type='source_stated_amendment_operation'
      and coalesce(representation_json->>'amendment_disposition','') is distinct from coalesce(v_expected_disposition,'');
  else
    v_expected:=0;
  end if;

  v_status:=case when coalesce(v_base->>'status','fail')='pass'
    and v_actual=v_expected
    and (v_family<>'amendment' or (v_operative=0 and v_footer=0 and v_span_mismatch=0 and v_coverage_mismatch=0 and v_disposition_mismatch=0))
    then 'pass' else 'fail' end;

  return v_base||jsonb_build_object(
    'status',v_status,'contract','rosetta-independent-structural-validation-v255',
    'document_family',nullif(v_family,''),
    'expected_structural_representation_count',v_expected,
    'actual_structural_representation_count',v_actual,
    'operative_object_count_for_amendment',v_operative,
    'structural_footer_contamination_count',v_footer,
    'structural_span_mismatch_count',v_span_mismatch,
    'amendment_coverage_mismatch_count',v_coverage_mismatch,
    'amendment_disposition_mismatch_count',v_disposition_mismatch
  );
end;
$$

with canonical_manifest as (
  select jsonb_build_object(
    'contract','S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS} plus non-operative structural representations',
    'engine_version','rosetta-v3-deterministic-sql-2.5.5',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.5',
    'inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.4','rule_set_version','rosetta-five-layer-structural-correctness-2.5.4'),
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'change',jsonb_build_object(
      'amendment_representation','Source-stated amendment instructions are non-operative structural representations, not OVERRIDES objects.',
      'amendment_page_furniture','Recognized trailing legislative page furniture is excluded from amendment-operation spans.',
      'final_validation_order','Coverage, structural self-check, independent validation, and output hash are regenerated only after the final canonical structure is fixed.'
    ),
    'source_projection','rosetta-layout-projection-v25',
    'provenance','Rosetta 2.5.5 is a new immutable staged generation. 2.5.4 remains diagnostic history and is not promoted.'
  ) manifest_json
),receipt as (
  select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') manifest_hash from canonical_manifest
)
insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
select 'rosetta-v3-deterministic-sql-2.5.5','rosetta-five-layer-structural-correctness-2.5.5',manifest_hash,manifest_json,true from receipt
on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true

create or replace function public.run_rosetta_v3_extraction_v255_candidate(
  p_source_document_id integer,p_source_text text,p_expected_source_content_hash text,
  p_source_url text,p_source_version text,p_media_type text default 'text/plain',
  p_source_byte_hash text default null,p_source_provider_hash text default null,
  p_reference_date date default null,p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout='120s'
set search_path=pg_catalog,public,extensions
as $$
declare
  v_receipt jsonb;
  v_run_id integer;
  v_manifest_hash text;
  v_reclassification jsonb;
  v_span_receipt jsonb;
  v_span_repairs jsonb;
  v_reconciliation jsonb;
  v_coverage jsonb;
  v_self_check jsonb;
  v_independent jsonb;
  v_exact jsonb;
  v_output jsonb;
  v_output_hash text;
  v_pass boolean;
  v_run public.extraction_run%rowtype;
  v_error text;
begin
  select manifest_hash into v_manifest_hash from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.5' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.5';

  v_receipt:=public.run_rosetta_v3_extraction_v255_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  if coalesce(v_receipt->>'run_status','')<>'completed' or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then
    return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash);
  end if;
  v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;

  begin
    v_receipt:=public.rosetta_v255_finalize_extraction(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb),v_receipt);
    v_reclassification:=public.rosetta_v255_reclassify_amendment_structure(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb));
    v_span_receipt:=public.rosetta_v25_refresh_object_source_spans(v_run_id,p_source_text);
    v_span_repairs:=public.rosetta_v25_register_span_repairs(v_run_id);
    v_reconciliation:=public.rosetta_v255_reconcile_structural_correctness(v_run_id);
    v_coverage:=public.rosetta_v255_refresh_final_coverage_receipts(v_run_id);
    v_self_check:=public.rosetta_v25_validate_extraction(v_run_id,p_source_text);
    v_independent:=public.rosetta_v255_validate_independent_structure(v_run_id,p_source_text);
  exception when others then
    v_error:=left(sqlerrm,240);
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v255_post_base_failure',completed_at=clock_timestamp() where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('rosetta_v255_post_base_failure',jsonb_build_object('message',v_error)) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.5','rule_set_version','rosetta-five-layer-structural-correctness-2.5.5','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v255_post_base_failure');
  end;

  select * into v_run from public.extraction_run where id=v_run_id;
  v_exact:=jsonb_build_object(
    'status',case when coalesce(v_independent->>'status','fail')='pass' then 'pass' else 'fail' end,
    'contract','rosetta-structural-correctness-v255',
    'document_family',v_independent->>'document_family',
    'amendment_disposition',v_reclassification->>'amendment_disposition',
    'structural_representation_count',coalesce((v_reclassification->>'representation_count')::integer,0),
    'operative_layer_projection',v_reclassification->>'operative_layer_projection',
    'structural_footer_contamination_count',coalesce((v_independent->>'structural_footer_contamination_count')::integer,0),
    'structural_span_mismatch_count',coalesce((v_independent->>'structural_span_mismatch_count')::integer,0),
    'amendment_coverage_mismatch_count',coalesce((v_independent->>'amendment_coverage_mismatch_count')::integer,0)
  );

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-structural-correctness',v_run_id,'structural_correctness_v2',case when v_self_check->>'status'='pass' then 'pass' else 'fail' end,case when v_self_check->>'status'='pass' then 0 else 1 end,v_self_check)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-independent-structure',v_run_id,'independent_structure_v255',case when v_independent->>'status'='pass' then 'pass' else 'fail' end,case when v_independent->>'status'='pass' then 0 else 1 end,v_independent)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-exact-source-structure',v_run_id,'exact_source_structure_v255',case when v_exact->>'status'='pass' then 'pass' else 'fail' end,case when v_exact->>'status'='pass' then 0 else 1 end,v_exact)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  v_pass:=coalesce(v_coverage->>'status','fail')='pass'
    and coalesce(v_self_check->>'status','fail')='pass'
    and coalesce(v_independent->>'status','fail')='pass'
    and public.rosetta_blocking_structural_repair_count(v_run_id)=0;

  if not v_pass then
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v255_final_validation_failed',completed_at=clock_timestamp() where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v255',v_reclassification,'structural_reconciliation_v255',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v255',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v255',v_independent,'exact_source_structure_v255',v_exact) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.5','rule_set_version','rosetta-five-layer-structural-correctness-2.5.5','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v255_final_validation_failed','independent_structure_v255',v_independent);
  end if;

  v_output:=public.rosetta_v255_canonical_output(v_run_id);
  if v_output is null then raise exception 'rosetta_v255_final_canonical_output_unavailable'; end if;
  v_output_hash:=encode(digest(convert_to(v_output::text,'UTF8'),'sha256'),'hex');

  update public.extraction_run set output_content_hash=v_output_hash,run_status='completed',admissibility_state='admissible',failure_code=null,completed_at=clock_timestamp() where id=v_run_id;
  update public.extraction_manifest set output_hash=v_output_hash,row_counts=v_output->'row_counts',status='clean',admissibility_state='admissible',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v255',v_reclassification,'structural_reconciliation_v255',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v255',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v255',v_independent,'exact_source_structure_v255',v_exact) where extraction_run_id=v_run_id;

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v255-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-output-hash',v_run_id,'output_hash_verified','pass',0,jsonb_build_object('output_content_hash',v_output_hash,'contract','rosetta-final-output-hash-v255'))
  on conflict(extraction_run_id,test_name) do update set test_result='pass',failure_count=0,details=excluded.details,executed_at=now();

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.5',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.5',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'run_status','completed','admissibility_state','admissible','failure_code',null,
    'output_content_hash',v_output_hash,
    'structural_reclassification',v_reclassification,
    'independent_structure_v255',v_independent
  );
end;
$$

revoke all on function public.run_rosetta_v3_extraction_v255_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v255_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v255_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v255_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v255_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v255_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.rosetta_v255_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged immutable Rosetta 2.5.5 candidate. Non-adopted/source-stated amendment instructions are structural evidence outside the five operative layers, and all final coverage/validation/hash receipts are regenerated only after final canonical structure.'

commit
