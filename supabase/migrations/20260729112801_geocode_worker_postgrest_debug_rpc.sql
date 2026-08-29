create or replace function public.debug_geocode_worker_role()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select jsonb_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'current_role', current_role,
    'request_role', current_setting('request.jwt.claim.role', true),
    'auth_role', coalesce(auth.role()::text, null),
    'pending_visible', (select count(*) from public.coordinate_enrichment_queue_v1 where queue_status = 'pending')
  )
$function$;
revoke all on function public.debug_geocode_worker_role() from public, anon, authenticated;
grant execute on function public.debug_geocode_worker_role() to service_role;
