create or replace function public.export_missing_migration_ledger_json_reconciliation()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'version', version,
    'migration_name', migration_name,
    'content_b64', content_b64
  ) order by version), '[]'::jsonb)
  from public.missing_migration_ledger_export_tmp;
$$;

revoke all on function public.export_missing_migration_ledger_json_reconciliation() from public, authenticated, service_role;
grant execute on function public.export_missing_migration_ledger_json_reconciliation() to anon;
notify pgrst, 'reload schema';
