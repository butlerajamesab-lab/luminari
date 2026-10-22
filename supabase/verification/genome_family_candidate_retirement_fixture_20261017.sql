-- DISPOSABLE POSTGRESQL ONLY. Never load into a production project.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.docket_bill_detail_cache (bill_id integer PRIMARY KEY, bill jsonb NOT NULL);
CREATE TABLE public.docket_bill_source_document (source_document_key text PRIMARY KEY);
CREATE TABLE public.civic_genome_bill (genome_bill_id uuid PRIMARY KEY);
CREATE TABLE public.civic_genome_family (family_id uuid PRIMARY KEY);
CREATE TABLE public.civic_genome_event (event_id uuid PRIMARY KEY);
CREATE TABLE public.civic_genome_unresolved_family_candidate (
  unresolved_candidate_id uuid PRIMARY KEY,
  genome_bill_id uuid NOT NULL,
  methodology_version text NOT NULL,
  resolution_reason text NOT NULL,
  similarity_breakdown_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz
);
INSERT INTO public.docket_bill_detail_cache VALUES (1,'{"legislation":"source-preserved"}'::jsonb);
INSERT INTO public.docket_bill_source_document VALUES ('text:1:source-a');
INSERT INTO public.civic_genome_bill VALUES ('00000000-0000-4000-8000-000000000001'::uuid);
INSERT INTO public.civic_genome_family VALUES ('00000000-0000-4000-8000-000000000001'::uuid);
INSERT INTO public.civic_genome_event VALUES ('00000000-0000-4000-8000-000000000002'::uuid);
-- Exact population shape, intentionally DIFFERENT canonical identities from
-- production: the untouched production SHA pins MUST reject this fixture.
INSERT INTO public.civic_genome_unresolved_family_candidate (
  unresolved_candidate_id, genome_bill_id, methodology_version,
  resolution_reason, similarity_breakdown_json
)
SELECT
 ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 'weighted-confirmed-traits-v2',
 'insufficient_confirmed_traits',
 jsonb_build_object('fixture_id',i,'sharedConfirmedTraitCount',0)
FROM generate_series(1,8713) AS i;
