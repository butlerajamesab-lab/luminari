\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_expected bytea;
  v_actual bytea;
  v_signature text;
BEGIN
  foreach v_signature in array array[
    'public.digest(text,text)',
    'public.pg_advisory_xact_lock(integer,bigint)'
  ]
  loop
    if to_regprocedure(v_signature) is null then
      raise exception 'required legacy resolution bridge is missing: %', v_signature;
    end if;

    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      raise exception 'legacy resolution bridge ACL is not service-role-only: %', v_signature;
    end if;
  end loop;

  v_expected := extensions.digest(convert_to('Lighthouse UTF-8 receipt', 'UTF8'), 'sha256');
  v_actual := public.digest('Lighthouse UTF-8 receipt', 'sha256');

  if v_actual is distinct from v_expected then
    raise exception 'text digest bridge changed pgcrypto output';
  end if;

  perform public.pg_advisory_xact_lock(76004001, 4294967297::bigint);
END
$verify$;
