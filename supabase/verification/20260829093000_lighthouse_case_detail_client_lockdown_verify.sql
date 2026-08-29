\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_table_name text;
  v_relation regclass;
  v_rls_enabled boolean;
BEGIN
  foreach v_table_name in array array[
    'case_actions',
    'missing_records',
    'outcomes'
  ]
  loop
    v_relation := to_regclass(format('public.%I', v_table_name));
    if v_relation is null then
      continue;
    end if;

    select c.relrowsecurity
    into v_rls_enabled
    from pg_class c
    where c.oid = v_relation;

    if not v_rls_enabled then
      raise exception 'RLS is disabled on private Lighthouse table %', v_table_name;
    end if;

    if has_table_privilege('anon', v_relation, 'SELECT')
       or has_table_privilege('anon', v_relation, 'INSERT')
       or has_table_privilege('anon', v_relation, 'UPDATE')
       or has_table_privilege('anon', v_relation, 'DELETE')
       or has_table_privilege('authenticated', v_relation, 'SELECT')
       or has_table_privilege('authenticated', v_relation, 'INSERT')
       or has_table_privilege('authenticated', v_relation, 'UPDATE')
       or has_table_privilege('authenticated', v_relation, 'DELETE') THEN
      raise exception 'client table privileges remain on private Lighthouse table %', v_table_name;
    end if;

    if exists (
      select 1
      from pg_policy p
      where p.polrelid = v_relation
        and (
          '0'::oid = any(p.polroles)
          or exists (
            select 1
            from unnest(p.polroles) as policy_role(role_oid)
            join pg_roles r on r.oid = policy_role.role_oid
            where r.rolname in ('anon', 'authenticated')
          )
        )
    ) THEN
      raise exception 'client RLS policy remains on private Lighthouse table %', v_table_name;
    end if;

    if not has_table_privilege('service_role', v_relation, 'SELECT')
       or not has_table_privilege('service_role', v_relation, 'INSERT')
       or not has_table_privilege('service_role', v_relation, 'UPDATE')
       or not has_table_privilege('service_role', v_relation, 'DELETE') THEN
      raise exception 'service_role lost required access to private Lighthouse table %', v_table_name;
    end if;
  end loop;
END
$verify$;
