begin;

-- Complete the private client-read containment batch. The preceding migration
-- revoked client privileges from these tables; remove the matching permissive
-- authenticated policies as defense in depth.

do $containment$
declare
  v_table_name text;
  v_policy_name text;
  v_relation regclass;
begin
  for v_table_name, v_policy_name in
    select policy.table_name, policy.policy_name
    from (values
      ('evidence_profiles', 'authenticated_all_access_evidence_profiles'),
      ('evidence_sources', 'authenticated_all_access_evidence_sources'),
      (
        'evidence_to_element_links',
        'authenticated_all_access_evidence_to_element_links'
      )
    ) as policy(table_name, policy_name)
  loop
    v_relation := to_regclass(format('public.%I', v_table_name));
    if v_relation is not null then
      execute format(
        'drop policy if exists %I on %s',
        v_policy_name,
        v_relation
      );
    end if;
  end loop;
end
$containment$;

commit;
