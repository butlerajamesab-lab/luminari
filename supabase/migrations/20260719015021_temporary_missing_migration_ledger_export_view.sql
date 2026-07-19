create or replace view public.missing_migration_ledger_export_v
with (security_invoker = false)
as
select version, migration_name, content_b64
from public.missing_migration_ledger_export_tmp;

revoke all on public.missing_migration_ledger_export_v from public, authenticated, service_role;
grant select on public.missing_migration_ledger_export_v to anon;

notify pgrst, 'reload schema';
