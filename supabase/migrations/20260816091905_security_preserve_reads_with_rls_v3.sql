-- Preserve existing anon/authenticated read behavior on the 20 currently public-read tables,
-- while enabling RLS so future write grants cannot silently expose mutations.

ALTER TABLE public.governance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.governance_snapshots FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.state_enriched_directory_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.state_enriched_directory_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.coalition_advocacy_orgs_v3_13_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.coalition_advocacy_orgs_v3_13_stage FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.ingest_staging_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.ingest_staging_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.registry_programs_v3_13_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.registry_programs_v3_13_stage FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.domain_deep_dive_records_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.domain_deep_dive_records_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.policy_layer_docs_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.policy_layer_docs_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.sol_collision_analysis_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.sol_collision_analysis_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.specification_extraction_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.specification_extraction_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.tribal_jurisdictions_addendum_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.tribal_jurisdictions_addendum_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.address_audit_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.address_audit_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.advocacy_targets_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.advocacy_targets_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.benefits_cascade_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.benefits_cascade_stages FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.legal_aid_wa_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.legal_aid_wa_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.legal_statutes_v3_13_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.legal_statutes_v3_13_stage FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.legislator_contacts_v3_13_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.legislator_contacts_v3_13_stage FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.luminari_batch_exports_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.luminari_batch_exports_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.luminari_uuid_exports_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.luminari_uuid_exports_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.master_template_docs_v3_13 ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.master_template_docs_v3_13 FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.programs_v3_13_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY luminari_public_read_v1 ON public.programs_v3_13_stage FOR SELECT TO anon, authenticated USING (true);

-- These tables already have RLS enabled and no policies, so anon/authenticated have zero effective access today.
-- Remove their broad direct grants to keep them fail-closed even if RLS is accidentally altered later.
REVOKE ALL PRIVILEGES ON TABLE
  public.contacts,
  public.docket_bill_state_cache,
  public.omnidirectional_contradiction_clusters,
  public.omnidirectional_domain_packs,
  public.omnidirectional_edge_constraints,
  public.omnidirectional_edge_types,
  public.omnidirectional_graph_edges,
  public.omnidirectional_graph_health_snapshots,
  public.omnidirectional_graph_nodes,
  public.omnidirectional_graph_paths,
  public.omnidirectional_graph_snapshots,
  public.omnidirectional_node_types,
  public.omnidirectional_traversal_rulesets
FROM anon, authenticated;
