BEGIN;

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_api_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingested_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_lighthouse_signal_bridge_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_lighthouse_resource_bridge_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_lighthouse_judicial_signal_bridge_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_lighthouse_legal_bridge_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_verification_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metadata_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_statutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_case_law ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_civic_resource ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_signal_bridge_public_read ON public.atlas_lighthouse_signal_bridge_v1;
CREATE POLICY atlas_signal_bridge_public_read ON public.atlas_lighthouse_signal_bridge_v1 FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS atlas_resource_bridge_public_read ON public.atlas_lighthouse_resource_bridge_v1;
CREATE POLICY atlas_resource_bridge_public_read ON public.atlas_lighthouse_resource_bridge_v1 FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS atlas_judicial_bridge_public_read ON public.atlas_lighthouse_judicial_signal_bridge_v1;
CREATE POLICY atlas_judicial_bridge_public_read ON public.atlas_lighthouse_judicial_signal_bridge_v1 FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS atlas_legal_bridge_public_read ON public.atlas_lighthouse_legal_bridge_v1;
CREATE POLICY atlas_legal_bridge_public_read ON public.atlas_lighthouse_legal_bridge_v1 FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS legal_statutes_public_read ON public.legal_statutes;
CREATE POLICY legal_statutes_public_read ON public.legal_statutes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS legal_case_law_public_read ON public.legal_case_law;
CREATE POLICY legal_case_law_public_read ON public.legal_case_law FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS metadata_machines_public_read ON public.metadata_machines;
CREATE POLICY metadata_machines_public_read ON public.metadata_machines FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS machine_outputs_public_read ON public.machine_outputs;
CREATE POLICY machine_outputs_public_read ON public.machine_outputs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS machine_verification_requirements_public_read ON public.machine_verification_requirements;
CREATE POLICY machine_verification_requirements_public_read ON public.machine_verification_requirements FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS civic_resources_public_read ON public.normalized_civic_resource;
CREATE POLICY civic_resources_public_read ON public.normalized_civic_resource FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS api_source_registry_public_read ON public.api_source_registry;
CREATE POLICY api_source_registry_public_read ON public.api_source_registry FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS detected_signals_authenticated_read ON public.detected_signals;
CREATE POLICY detected_signals_authenticated_read ON public.detected_signals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cases_authenticated_read ON public.cases;
CREATE POLICY cases_authenticated_read ON public.cases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS claims_authenticated_read ON public.claims;
CREATE POLICY claims_authenticated_read ON public.claims FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS findings_authenticated_read ON public.findings;
CREATE POLICY findings_authenticated_read ON public.findings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS snapshots_authenticated_read ON public.snapshots;
CREATE POLICY snapshots_authenticated_read ON public.snapshots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pipeline_runs_authenticated_read ON public.pipeline_runs;
CREATE POLICY pipeline_runs_authenticated_read ON public.pipeline_runs FOR SELECT TO authenticated USING (true);

COMMIT;
