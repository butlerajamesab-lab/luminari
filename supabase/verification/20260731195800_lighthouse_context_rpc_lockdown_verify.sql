select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as proconfig,
  has_function_privilege('public', p.oid, 'execute') as public_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = 'public.get_lighthouse_context_view(text)'::regprocedure;

do $verify$
declare
  target regprocedure := 'public.get_lighthouse_context_view(text)'::regprocedure;
  configuration text;
begin
  if has_function_privilege('public', target, 'execute')
     or has_function_privilege('anon', target, 'execute')
     or has_function_privilege('authenticated', target, 'execute') then
    raise exception 'Lighthouse context RPC remains browser executable';
  end if;

  if not has_function_privilege('service_role', target, 'execute') then
    raise exception 'Lighthouse context RPC service_role execution is missing';
  end if;

  select coalesce(array_to_string(proconfig, ','), '')
  into configuration
  from pg_proc
  where oid = target;

  if configuration not like '%search_path=pg_catalog, public%' then
    raise exception 'Lighthouse context RPC search_path is not fixed: %', configuration;
  end if;
end
$verify$;
