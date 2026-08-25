CREATE OR REPLACE FUNCTION public.rosetta_v2511_refresh_final_coverage_receipts(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_run public.extraction_run%rowtype;
  v_coverage jsonb;
  v_layer_count integer;
  v_terminal boolean;
  v_details jsonb;
begin
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v2511_extraction_run_not_found'; end if;
  v_coverage:=public.rosetta_v2511_final_coverage(p_extraction_run_id);
  select count(*)::integer,coalesce(bool_and(value->>'status' in ('populated','not_applicable')),false)
    into v_layer_count,v_terminal from jsonb_each(v_coverage);
  v_terminal:=v_terminal and v_layer_count=5;
  v_details:=jsonb_build_object('contract','rosetta-final-five-layer-coverage-v2511','coverage',v_coverage,'layer_count',v_layer_count,'terminal',v_terminal);

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-coverage-final',p_extraction_run_id,'five_layer_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2511-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-no-pending-final',p_extraction_run_id,'no_pending_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  return v_details||jsonb_build_object('status',case when v_terminal then 'pass' else 'fail' end);
end;
$function$
