begin;

do $containment$
declare
  v_name text;
  v_relation regclass;
begin
  foreach v_name in array array[
    'v_domain_deep_dive_v3_13_stage_summary',
    'v_operational_core_governance_summary',
    'v_operational_core_legal_summary',
    'v_operational_core_bridge_summary',
    'v_operational_core_namespace_status',
    'v_generated_sql_bundle_audit',
    'v_substrate_promotion_readiness',
    'v_corpus_artifact_coverage',
    'v_generated_sql_source_coverage'
  ]
  loop
    v_relation := to_regclass(format('public.%I', v_name));
    if v_relation is not null then
      execute format(
        'revoke select on table %s from anon, authenticated',
        v_relation
      );
    end if;
  end loop;
end
$containment$;

commit;
