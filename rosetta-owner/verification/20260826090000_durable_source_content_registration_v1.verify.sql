do $verify$
declare
  v_signature regprocedure :=
    'public.rosetta_register_source_content_v1(integer,text,text,text,text,text,text,text,jsonb)'::regprocedure;
  v_security_definer boolean;
  v_configuration text[];
  v_parser_base_md5 text;
  v_parser_candidate_md5 text;
begin
  select procedure.prosecdef, procedure.proconfig
    into v_security_definer, v_configuration
    from pg_proc procedure
   where procedure.oid = v_signature;

  if not coalesce(v_security_definer, false)
     or v_configuration is null
     or not ('search_path=pg_catalog, public' = any(v_configuration)) then
    raise exception 'VERIFY_FAIL durable content definer path is not pinned';
  end if;

  if has_function_privilege('anon', v_signature, 'execute')
     or has_function_privilege('authenticated', v_signature, 'execute')
     or not has_function_privilege('service_role', v_signature, 'execute') then
    raise exception 'VERIFY_FAIL durable content grant posture invalid';
  end if;

  select md5(pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v2511_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  )) into v_parser_base_md5;
  select md5(pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  )) into v_parser_candidate_md5;

  if v_parser_base_md5 <> '26c098083b384af6e349e9195831a4da'
     or v_parser_candidate_md5 <> '4e69d5df22284c96300a91ecc2e5c257' then
    raise exception 'VERIFY_FAIL 2.5.11 parser definitions changed: %/%',
      v_parser_base_md5, v_parser_candidate_md5;
  end if;
end;
$verify$;

select 'PASS durable source content registration contract' as result;
