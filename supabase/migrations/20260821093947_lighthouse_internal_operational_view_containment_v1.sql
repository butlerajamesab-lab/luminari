begin;

revoke select on table
  public.v_domain_deep_dive_v3_13_stage_summary,
  public.v_operational_core_governance_summary,
  public.v_operational_core_legal_summary,
  public.v_operational_core_bridge_summary,
  public.v_operational_core_namespace_status,
  public.v_generated_sql_bundle_audit,
  public.v_substrate_promotion_readiness,
  public.v_corpus_artifact_coverage,
  public.v_generated_sql_source_coverage
from anon, authenticated;

commit;
