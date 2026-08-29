create or replace function public.debug_geocode_candidate_probe(p_candidate text)
returns table(candidate_length integer, candidate_hash_hex text)
language sql
security definer
set search_path = pg_catalog, extensions
as $function$
  select length(coalesce(p_candidate,''))::integer,
         encode(extensions.digest(coalesce(p_candidate,''),'sha256'),'hex')
$function$;
grant execute on function public.debug_geocode_candidate_probe(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
