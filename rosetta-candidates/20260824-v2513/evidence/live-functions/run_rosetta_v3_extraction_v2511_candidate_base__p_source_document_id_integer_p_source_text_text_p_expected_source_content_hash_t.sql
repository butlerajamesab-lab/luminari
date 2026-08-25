CREATE OR REPLACE FUNCTION public.run_rosetta_v3_extraction_v2511_candidate_base(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '120s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
  where engine_version='rosetta-v3-deterministic-sql-2.5.11' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.11';

  v_receipt:=public.run_rosetta_v3_extraction_v2511_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  if coalesce(v_receipt->>'run_status','')<>'completed' or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then
    return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash);
  end if;
  v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;

  begin
    v_receipt:=public.rosetta_v2511_finalize_extraction(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb),v_receipt);
    v_reclassification:=public.rosetta_v2511_reclassify_amendment_structure(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb));
    v_span_receipt:=public.rosetta_v25_refresh_object_source_spans(v_run_id,p_source_text);
    v_span_repairs:=public.rosetta_v25_register_span_repairs(v_run_id);
    v_reconciliation:=public.rosetta_v2511_reconcile_structural_correctness(v_run_id);
    v_coverage:=public.rosetta_v2511_refresh_final_coverage_receipts(v_run_id);
    v_self_check:=public.rosetta_v2511_validate_extraction(v_run_id,p_source_text);
    v_independent:=public.rosetta_v2511_validate_independent_structure(v_run_id,p_source_text);
  exception when others then
    v_error:=left(sqlerrm,240);
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v2511_post_base_failure',completed_at=clock_timestamp() where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('rosetta_v2511_post_base_failure',jsonb_build_object('message',v_error)) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.11','rule_set_version','rosetta-five-layer-structural-correctness-2.5.11','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v2511_post_base_failure');
  end;

  select * into v_run from public.extraction_run where id=v_run_id;
  v_exact:=jsonb_build_object(
    'status',case when coalesce(v_independent->>'status','fail')='pass' then 'pass' else 'fail' end,
    'contract','rosetta-structural-correctness-v2511',
    'document_family',v_independent->>'document_family',
    'amendment_disposition',v_reclassification->>'amendment_disposition',
    'structural_representation_count',coalesce((v_reclassification->>'representation_count')::integer,0),
    'operative_layer_projection',v_reclassification->>'operative_layer_projection',
    'structural_footer_contamination_count',coalesce((v_independent->>'structural_footer_contamination_count')::integer,0),
    'structural_span_mismatch_count',coalesce((v_independent->>'structural_span_mismatch_count')::integer,0),
    'amendment_coverage_mismatch_count',coalesce((v_independent->>'amendment_coverage_mismatch_count')::integer,0)
  );

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-structural-correctness',v_run_id,'structural_correctness_v2',case when v_self_check->>'status'='pass' then 'pass' else 'fail' end,case when v_self_check->>'status'='pass' then 0 else 1 end,v_self_check)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-independent-structure',v_run_id,'independent_structure_v2511',case when v_independent->>'status'='pass' then 'pass' else 'fail' end,case when v_independent->>'status'='pass' then 0 else 1 end,v_independent)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-exact-source-structure',v_run_id,'exact_source_structure_v2511',case when v_exact->>'status'='pass' then 'pass' else 'fail' end,case when v_exact->>'status'='pass' then 0 else 1 end,v_exact)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  v_pass:=coalesce(v_coverage->>'status','fail')='pass'
    and coalesce(v_self_check->>'status','fail')='pass'
    and coalesce(v_independent->>'status','fail')='pass'
    and public.rosetta_blocking_structural_repair_count(v_run_id)=0;

  if not v_pass then
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v2511_final_validation_failed',completed_at=clock_timestamp() where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v2511',v_reclassification,'structural_reconciliation_v2511',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v2511',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v2511',v_independent,'exact_source_structure_v2511',v_exact) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.11','rule_set_version','rosetta-five-layer-structural-correctness-2.5.11','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v2511_final_validation_failed','independent_structure_v2511',v_independent);
  end if;

  v_output:=public.rosetta_v2511_canonical_output(v_run_id);
  if v_output is null then raise exception 'rosetta_v2511_final_canonical_output_unavailable'; end if;
  v_output_hash:=encode(digest(convert_to(v_output::text,'UTF8'),'sha256'),'hex');

  update public.extraction_run set output_content_hash=v_output_hash,run_status='completed',admissibility_state='admissible',failure_code=null,completed_at=clock_timestamp() where id=v_run_id;
  update public.extraction_manifest set output_hash=v_output_hash,row_counts=v_output->'row_counts',status='clean',admissibility_state='admissible',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v2511',v_reclassification,'structural_reconciliation_v2511',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v2511',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v2511',v_independent,'exact_source_structure_v2511',v_exact) where extraction_run_id=v_run_id;

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-output-hash',v_run_id,'output_hash_verified','pass',0,jsonb_build_object('output_content_hash',v_output_hash,'contract','rosetta-final-output-hash-v2511'))
  on conflict(extraction_run_id,test_name) do update set test_result='pass',failure_count=0,details=excluded.details,executed_at=now();

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.11',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.11',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'run_status','completed','admissibility_state','admissible','failure_code',null,
    'output_content_hash',v_output_hash,
    'structural_reclassification',v_reclassification,
    'independent_structure_v2511',v_independent
  );
end;
$function$
