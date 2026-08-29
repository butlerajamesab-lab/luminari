
CREATE TABLE public.sais_resources (
  resource_id text PRIMARY KEY,
  family_key text NOT NULL DEFAULT 'systemic_abuse_intelligence' REFERENCES public.luminari_document_family_contracts(family_key),
  document_number integer NOT NULL,
  resource_category text NOT NULL,
  subcategory text,
  jurisdiction_level text,
  jurisdiction text,
  organization_name text NOT NULL,
  organization_type text,
  service_type text,
  official_url text,
  official_contact text,
  what_it_does text,
  statutory_authority text,
  statutory_authority_url text,
  case_stage text CHECK (case_stage IS NULL OR case_stage IN (
    'prevention', 'active_harm', 'emergency', 'investigation',
    'administrative_complaint', 'litigation', 'appeal', 'recovery', 'long_term_monitoring'
  )),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED')),
  last_verified_at date,
  notes text,
  revision text NOT NULL DEFAULT 'v1.0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sais_resources_document_number ON public.sais_resources(document_number);
CREATE INDEX idx_sais_resources_category ON public.sais_resources(resource_category);
CREATE INDEX idx_sais_resources_jurisdiction ON public.sais_resources(jurisdiction);
CREATE INDEX idx_sais_resources_case_stage ON public.sais_resources(case_stage) WHERE case_stage IS NOT NULL;

ALTER TABLE public.sais_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON public.sais_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_only" ON public.sais_resources FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.sais_resources IS 'Canonical resource content for the Systemic Abuse Intelligence Series. Every SAIS document appendix row lands here. Deadline detail (appeal/continued-benefits/hearing/reconsideration/judicial-review) lives separately in registry_deadline_rules, joined via source_extraction_id = resource_id. Identity/dedup tracking lives in luminari_canonical_id_registry, joined via source_pk = resource_id. case_stage was intentionally deferred from per-document authoring to this migration, per the SAIS production contract established across Docs 11-15.';
COMMENT ON COLUMN public.sais_resources.case_stage IS 'Where in the case lifecycle this resource is typically used: prevention, active_harm, emergency, investigation, administrative_complaint, litigation, appeal, recovery, long_term_monitoring. Backfilled at migration time, not authored per-document.';
