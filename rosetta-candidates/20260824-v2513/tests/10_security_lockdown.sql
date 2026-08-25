-- tests/10_security_lockdown.sql — the candidate is not an accidental API.
\set QUIET on

do $$
declare v_missing_rls integer;v_public_execute integer;v_public_schema integer;
        v_mutable_search_path integer;
begin
  select count(*) into v_missing_rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('rosetta_v2513','rosetta_replay')
    and c.relkind in ('r','p') and not c.relrowsecurity;
  if v_missing_rls<>0 then
    raise exception 'TEST_FAIL security: % candidate/replay tables lack RLS',v_missing_rls;
  end if;

  select count(*) into v_public_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname in ('rosetta_v2513','rosetta_replay')
    and a.grantee=0 and a.privilege_type='EXECUTE';
  if v_public_execute<>0 then
    raise exception 'TEST_FAIL security: PUBLIC can execute % internal functions',v_public_execute;
  end if;

  select count(*) into v_public_schema
  from pg_namespace n
  cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  where n.nspname in ('rosetta_v2513','rosetta_replay')
    and a.grantee=0 and a.privilege_type='USAGE';
  if v_public_schema<>0 then
    raise exception 'TEST_FAIL security: PUBLIC has usage on % internal schemas',v_public_schema;
  end if;

  select count(*) into v_mutable_search_path
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('rosetta_v2513','rosetta_replay')
    and not exists(
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
      where setting like 'search_path=%');
  if v_mutable_search_path<>0 then
    raise exception 'TEST_FAIL security: % internal functions retain caller-mutable search_path',
      v_mutable_search_path;
  end if;
  raise notice 'PASS 10 candidate/replay schemas deny PUBLIC, pin function search_path, and enable RLS';
end $$;
