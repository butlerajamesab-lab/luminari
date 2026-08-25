CREATE OR REPLACE FUNCTION public.rosetta_v2511_validate_extraction(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;
  v_run public.extraction_run%rowtype;
  v_metadata jsonb:='{}'::jsonb;
  v_family text:='';
  v_raw_expected integer:=0;
  v_status text;
begin
  v_base:=public.rosetta_v25_validate_extraction(p_extraction_run_id,p_source_text);
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v2511_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));
  v_raw_expected:=coalesce((v_base->>'expected_workflow_count')::integer,0);

  if v_family='amendment' then
    v_status:=case when
      coalesce((v_base->>'actual_workflow_count')::integer,-1)=0
      and coalesce((v_base->>'extra_workflow_count')::integer,-1)=0
      and coalesce((v_base->>'modal_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'actor_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'workflow_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'definition_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'override_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'coverage_mismatch_count')::integer,-1)=0
      then 'pass' else 'fail' end;

    return v_base||jsonb_build_object(
      'status',v_status,
      'engine_contract','rosetta-structural-self-check-v2511-amendment-projection-aware',
      'document_family','amendment',
      'raw_source_expected_workflow_count',v_raw_expected,
      'expected_workflow_count',0,
      'missing_workflow_count',0,
      'operative_workflow_expectation','zero_after_nonoperative_amendment_projection'
    );
  end if;

  return v_base||jsonb_build_object(
    'engine_contract','rosetta-structural-self-check-v2511',
    'document_family',nullif(v_family,'')
  );
end;
$function$
