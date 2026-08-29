create or replace function public.verify_geocode_worker_cron_secret(
  p_candidate text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, vault, extensions
as $function$
  select coalesce(
    extensions.digest(coalesce(p_candidate, ''), 'sha256') =
      extensions.digest(
        (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'geocode_worker_cron_secret'
           order by created_at desc
           limit 1
        ),
        'sha256'
      ),
    false
  )
$function$;

revoke all on function public.verify_geocode_worker_cron_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_geocode_worker_cron_secret(text)
  to service_role;
