-- Protected runtime configuration reader for the Atlas -> Lighthouse bridge.
--
-- Secret values are provisioned directly in Supabase Vault and are never
-- committed to source control. The Node runtime reaches this function through
-- its existing PostgreSQL connection when Render-specific Atlas environment
-- variables are absent.

create or replace function public.get_atlas_bridge_runtime_config()
returns table (
  atlas_supabase_url text,
  atlas_supabase_key text
)
language sql
stable
security definer
set search_path = pg_catalog, vault
as $function$
  select
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'atlas_supabase_url'
      order by created_at desc
      limit 1
    ) as atlas_supabase_url,
    (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'atlas_supabase_publishable_key'
      order by created_at desc
      limit 1
    ) as atlas_supabase_key
$function$;

revoke all on function public.get_atlas_bridge_runtime_config()
  from public, anon, authenticated;
grant execute on function public.get_atlas_bridge_runtime_config()
  to postgres, service_role;

comment on function public.get_atlas_bridge_runtime_config() is
  'Server-only reader for Atlas bridge URL and publishable key stored in Supabase Vault.';
