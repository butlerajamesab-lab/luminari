begin;

-- These restored case-detail tables contain gaps, deadlines, actions, and
-- outcomes.  They are server-owned Lighthouse workspace data, not a browser
-- PostgREST surface.  Keep the migration capability-gated because some older
-- production lineages contain only missing_records.
do $lockdown$
declare
  v_table_name text;
  v_policy_name text;
  v_relation regclass;
begin
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

    execute format('alter table %s enable row level security', v_relation);
    execute format(
      'revoke all privileges on table %s from anon, authenticated',
      v_relation
    );
    execute format('grant all privileges on table %s to service_role', v_relation);

    for v_policy_name in
      select p.polname
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
    loop
      execute format('drop policy if exists %I on %s', v_policy_name, v_relation);
    end loop;
  end loop;
end
$lockdown$;

commit;
