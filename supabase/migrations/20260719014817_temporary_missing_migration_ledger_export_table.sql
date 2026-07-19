create table public.missing_migration_ledger_export_tmp as
select m.version,
       m.name as migration_name,
       replace(replace(encode(convert_to(m.statements[1], 'UTF8'), 'base64'), E'\n', ''), E'\r', '') as content_b64
  from supabase_migrations.schema_migrations m
 where m.version = any(array[
   '20260529061843','20260605224132','20260605225538','20260605231514',
   '20260609093826','20260609122541','20260612180131','20260612180225',
   '20260613083723','20260613094359','20260613100249','20260614205300',
   '20260614213814','20260614213931','20260622063640','20260705144336',
   '20260713055919','20260713074738','20260713075935','20260713081607',
   '20260713081625','20260713082050','20260713083902','20260713084033',
   '20260713084401','20260713084626','20260713091637','20260713093123',
   '20260713095140','20260713102826','20260713105316','20260713172413',
   '20260713172504','20260714091011'
 ]::text[])
 order by m.version;

alter table public.missing_migration_ledger_export_tmp enable row level security;
revoke all on table public.missing_migration_ledger_export_tmp from public, authenticated, service_role;
grant select on table public.missing_migration_ledger_export_tmp to anon;
create policy anon_read_missing_migration_ledger_export_tmp
on public.missing_migration_ledger_export_tmp
for select
to anon
using (true);

notify pgrst, 'reload schema';
