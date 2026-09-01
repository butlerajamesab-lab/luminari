do $verify$
declare
  v_risky_acl_count integer;
  v_public_table_count integer;
  v_rls_table_count integer;
begin
  select count(*)::integer
    into v_risky_acl_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');

  if v_risky_acl_count <> 0 then
    raise exception
      'client DDL-like table privileges remain: %',
      v_risky_acl_count;
  end if;

  select
    count(*)::integer,
    count(*) filter (where relation.relrowsecurity)::integer
    into v_public_table_count, v_rls_table_count
  from pg_class relation
  join pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p');

  if v_public_table_count <> v_rls_table_count then
    raise exception
      'public RLS coverage regressed: % of % tables protected',
      v_rls_table_count,
      v_public_table_count;
  end if;
end
$verify$;
