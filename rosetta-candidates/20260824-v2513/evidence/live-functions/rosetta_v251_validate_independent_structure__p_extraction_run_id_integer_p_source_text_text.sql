CREATE OR REPLACE FUNCTION public.rosetta_v251_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb; v_typing_mismatch integer; v_penalty_actor_mismatch integer; v_status text;
begin
 v_base:=public.rosetta_v25_validate_independent_structure(p_extraction_run_id,p_source_text);
 select count(*)::integer into v_typing_mismatch from public.accountability_route route cross join lateral public.rosetta_v251_accountability_kind(route.trigger_condition) expected where route.extraction_run_id=p_extraction_run_id and (route.enforcement_type is distinct from expected.enforcement_type or route.enforcement_direction is distinct from expected.enforcement_direction or route.clause_type is distinct from expected.clause_type);
 select count(*)::integer into v_penalty_actor_mismatch from public.accountability_route route where route.extraction_run_id=p_extraction_run_id and route.enforcement_type='source_stated_penalty_rule' and (nullif(btrim(coalesce(route.enforcement_actor,'')),'') is null or route.enforcement_actor ~* '\mis\s+guilty\M|\mmay\s+be\s+sentenced\M');
 v_status:=case when coalesce(v_base->>'status','fail')='pass' and v_typing_mismatch=0 and v_penalty_actor_mismatch=0 then 'pass' else 'fail' end;
 return v_base||jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v251','accountability_typing_mismatch_count',v_typing_mismatch,'penalty_actor_mismatch_count',v_penalty_actor_mismatch);
end;$function$
