CREATE OR REPLACE FUNCTION public.rosetta_v25_enrich_objects_with_spans(p_extraction_run_id integer, p_objects jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_object jsonb; v_type text; v_id text; v_metadata jsonb; v_span jsonb; v_steps jsonb; v_step jsonb; v_step_span jsonb; v_new_steps jsonb; v_result jsonb:='[]'::jsonb;
begin
 for v_object in select value from jsonb_array_elements(coalesce(p_objects,'[]'::jsonb)) loop
  v_type:=v_object->>'source_object_type'; v_id:=v_object->>'source_object_id';
  if v_type in ('accountability_route','entity_override','term_definition') then
   v_metadata:=coalesce(v_object->'metadata','{}'::jsonb);
   v_span:=public.rosetta_v25_span_json(v_type,v_id,coalesce(v_metadata->'source_span','{}'::jsonb));
   v_metadata:=jsonb_set(v_metadata,'{source_span}',v_span,true); v_object:=jsonb_set(v_object,'{metadata}',v_metadata,true);
  elsif v_type='workflow_pipeline' then
   v_steps:=coalesce(v_object#>'{normalized_value,steps}','[]'::jsonb); v_new_steps:='[]'::jsonb;
   for v_step in select value from jsonb_array_elements(v_steps) loop
    v_step_span:=public.rosetta_v25_span_json('workflow_step',v_step->>'step_id','{}'::jsonb);
    if coalesce(v_step_span->>'span_status','')='resolved' then v_step:=v_step||jsonb_build_object('source_span',v_step_span); end if;
    v_new_steps:=v_new_steps||jsonb_build_array(v_step);
   end loop;
   v_object:=jsonb_set(v_object,'{normalized_value,steps}',v_new_steps,true);
  end if;
  v_result:=v_result||jsonb_build_array(v_object);
 end loop;
 return v_result;
end;$function$
