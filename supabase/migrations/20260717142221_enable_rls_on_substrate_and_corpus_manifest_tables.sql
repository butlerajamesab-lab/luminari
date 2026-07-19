ALTER TABLE public.substrate_source_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substrate_target_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substrate_candidate_disposition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substrate_promotion_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_deep_dive_v3_13_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corpus_artifact_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_sql_source_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_sql_bundle_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.substrate_source_artifact FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.substrate_target_reconciliation FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.substrate_candidate_disposition FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.substrate_promotion_batch FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.domain_deep_dive_v3_13_stage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.corpus_artifact_manifest FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.generated_sql_source_manifest FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.generated_sql_bundle_audit FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_only" ON public.substrate_source_artifact FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.substrate_target_reconciliation FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.substrate_candidate_disposition FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.substrate_promotion_batch FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.domain_deep_dive_v3_13_stage FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.corpus_artifact_manifest FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.generated_sql_source_manifest FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_only" ON public.generated_sql_bundle_audit FOR SELECT TO authenticated USING (true);
