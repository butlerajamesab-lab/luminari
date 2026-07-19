create or replace function public.export_migration_ledger_for_reconciliation(p_versions text[])
returns table(version text, migration_name text, content_b64 text)
language sql
security definer
set search_path = pg_catalog, public, supabase_migrations
as $$
  select m.version,
         m.name,
         replace(replace(encode(convert_to(m.statements[1], 'UTF8'), 'base64'), E'\n', ''), E'\r', '')
    from supabase_migrations.schema_migrations m
   where m.version = any(p_versions)
   order by m.version;
$$;

revoke all on function public.export_migration_ledger_for_reconciliation(text[]) from public, anon, authenticated;
grant execute on function public.export_migration_ledger_for_reconciliation(text[]) to service_role;
