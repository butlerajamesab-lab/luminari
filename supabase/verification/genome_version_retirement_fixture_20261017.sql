-- DISPOSABLE PostgreSQL ONLY. Independent fake Docket rows and old version
-- receipts. Never execute in production.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.docket_bill_detail_cache (bill_id integer PRIMARY KEY, bill jsonb NOT NULL);
CREATE TABLE public.docket_bill_source_document (
  source_document_key text PRIMARY KEY, source_bill_id integer NOT NULL, raw_source jsonb NOT NULL
);
CREATE TABLE public.civic_genome_bill (genome_bill_id uuid PRIMARY KEY);
CREATE TABLE public.civic_genome_family (family_id uuid PRIMARY KEY);
CREATE TABLE public.civic_genome_event (event_id uuid PRIMARY KEY);

CREATE TABLE public.civic_genome_bill_version (
  bill_version_id uuid PRIMARY KEY,
  genome_bill_id uuid NOT NULL REFERENCES public.civic_genome_bill,
  source_document_key text NOT NULL REFERENCES public.docket_bill_source_document,
  source_bill_id integer NOT NULL,
  rosetta_source_document_id bigint,
  rosetta_extraction_run_id text,
  assembly_run_id uuid,
  prism_verification_run_id uuid,
  processing_state text NOT NULL,
  failure_code text,
  receipt_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.civic_genome_legislative_version_queue (
  queue_id uuid PRIMARY KEY,
  bill_version_id uuid NOT NULL REFERENCES public.civic_genome_bill_version,
  queue_state text NOT NULL,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- These two fixtures intentionally reproduce the relevant behavior of the
-- real production terminal-state and writer-quarantine triggers.
CREATE OR REPLACE FUNCTION public.guard_civic_genome_bill_version_terminal_state()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE v_attempted_state text := new.processing_state;
BEGIN
  IF old.processing_state IN ('verified','verified_with_findings')
    AND v_attempted_state IN ('source_ingested','extracted','assembled','verification_partial') THEN
    new.processing_state:=old.processing_state;
    new.receipt_json:=coalesce(new.receipt_json,'{}'::jsonb)
       ||jsonb_build_object('terminal_state_regression_prevented',jsonb_build_object(
         'preserved_state',old.processing_state,'attempted_state',v_attempted_state));
  END IF;
  RETURN new;
END;$body$;

CREATE OR REPLACE FUNCTION public.civic_genome_block_bill_version_rosetta_receipt_v1()
RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rosetta_extraction_run_id IS NOT NULL OR NEW.assembly_run_id IS NOT NULL
       OR NEW.processing_state IN ('assembled','verified','verified_with_findings') THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='write quarantined';
    END IF;
  ELSE
    IF (NEW.rosetta_extraction_run_id IS NOT NULL
       AND NEW.rosetta_extraction_run_id IS DISTINCT FROM OLD.rosetta_extraction_run_id)
       OR (NEW.processing_state IN ('assembled','verified','verified_with_findings')
       AND NEW.processing_state IS DISTINCT FROM OLD.processing_state) THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='write quarantined';
    END IF;
  END IF;
  FOR v_key IN
    SELECT key FROM jsonb_object_keys(coalesce(NEW.receipt_json,'{}'::jsonb)) AS f(key)
     WHERE key ~ '^(rosetta_|assembly_|prism_)'
       OR key IN ('current_rosetta_status','family_resolution_status')
  LOOP
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='receipt quarantined';
    END IF;
    IF NEW.receipt_json -> v_key IS DISTINCT FROM OLD.receipt_json -> v_key THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='receipt quarantined';
    END IF;
  END LOOP;
  RETURN NEW;
END;$body$;

CREATE OR REPLACE FUNCTION public.genome_fixture_noop_version_trigger()
RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN RETURN NEW; END;$body$;
CREATE OR REPLACE FUNCTION public.genome_fixture_noop_queue_trigger()
RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN RETURN NEW; END;$body$;

CREATE TRIGGER civic_genome_bill_version_enqueue_prism_v22
AFTER INSERT OR UPDATE OF assembly_run_id ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER civic_genome_bill_version_lineage_guard
BEFORE INSERT OR UPDATE OF genome_bill_id ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER civic_genome_bill_version_prism_late_binding
BEFORE INSERT OR UPDATE OF assembly_run_id ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER civic_genome_bill_version_terminal_state_guard
BEFORE UPDATE OF processing_state ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.guard_civic_genome_bill_version_terminal_state();
CREATE TRIGGER civic_genome_guard_rosetta_generation_upgrade_version_v1
BEFORE UPDATE OF receipt_json ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER enqueue_docket_current_authoritative_version_v1
AFTER INSERT ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER wake_civic_genome_amendments_for_base_v1
AFTER UPDATE OF receipt_json ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_version_trigger();
CREATE TRIGGER zz_civic_genome_block_bill_version_rosetta_receipt_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_bill_version_rosetta_receipt_v1();
CREATE TRIGGER preserve_legislative_version_queue_state_v1
BEFORE UPDATE ON public.civic_genome_legislative_version_queue
FOR EACH ROW EXECUTE FUNCTION public.genome_fixture_noop_queue_trigger();

INSERT INTO public.docket_bill_detail_cache SELECT i,jsonb_build_object('source_bill_id',i,'raw_bill','immutable') FROM generate_series(1,6) AS i;
INSERT INTO public.docket_bill_source_document
SELECT 'text:'||i||':'||i,i,jsonb_build_object('original','Docket payload remains untouched','source_bill_id',i)
FROM generate_series(1,6) AS i;
INSERT INTO public.civic_genome_bill VALUES ('00000000-0000-4000-8000-000000000001'::uuid);
INSERT INTO public.civic_genome_family VALUES ('11111111-1111-4111-8111-111111111111'::uuid);
INSERT INTO public.civic_genome_event VALUES ('22222222-2222-4222-8222-222222222222'::uuid);

-- Temporarily disable fixture-only quarantine to seed PRE-EXISTING retired data.
ALTER TABLE public.civic_genome_bill_version DISABLE TRIGGER zz_civic_genome_block_bill_version_rosetta_receipt_v1;
INSERT INTO public.civic_genome_bill_version (
  bill_version_id,genome_bill_id,source_document_key,source_bill_id,
  rosetta_source_document_id,rosetta_extraction_run_id,processing_state,
  failure_code,receipt_json,created_at,updated_at
)
SELECT
 ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 'text:'||i||':'||i, i, i, i::text,
 (ARRAY['verified','verified_with_findings','assembled','failed','source_ingested','failed'])[i],
 CASE WHEN i IN (4,6) THEN 'rosetta_old_execution_failed' ELSE NULL END,
 jsonb_build_object(
  'docket_source_document_key','text:'||i||':'||i,
  'provider_document_id', i::text, 'provider_document_type', 'Original',
  'provider_hash',repeat('f',32), 'registered_at','2026-08-01T00:00:00Z',
  'source_byte_hash',repeat('a',64), 'source_content_hash',repeat('b',64),
  'source_document_id',i,'source_url','https://legislature.example.gov/doc/'||i,
  'source_version','source-v1','text_extractor_version','official-html-v1',
  'rosetta_source_identity_hash',repeat('d',64),
  'rosetta_source_content_id','content:'||i,
  'docket_authority_sha256', repeat('e',64),
  'rosetta_engine_version',(ARRAY[
    'rosetta-v3-deterministic-sql-2.2.0','rosetta-v3-deterministic-sql-2.3.0',
    'rosetta-v3-deterministic-sql-2.4.0','rosetta-v3-deterministic-sql-2.5.8',
    'rosetta-v3-deterministic-sql-2.5.10','rosetta-v3-deterministic-sql-2.5.11'
  ])[i],
  'rosetta_extraction_run_id',i::text,'rosetta_output_content_hash',repeat('c',64),
  'assembly_run_id','retired-assembly-'||i,'assembly_trait_count',10,
  'prism_output_hash',repeat('e',64),'family_resolution_status','insufficient_confirmed_traits',
  'source_fallback_recovery_reason','old-worker-retry','terminal_state_regression_prevented',jsonb_build_object('old','verified')
 ),
 '2026-08-01T00:00:00Z'::timestamptz,'2026-08-01T00:00:00Z'::timestamptz
FROM generate_series(1,6) AS i;
ALTER TABLE public.civic_genome_bill_version ENABLE TRIGGER zz_civic_genome_block_bill_version_rosetta_receipt_v1;

INSERT INTO public.civic_genome_legislative_version_queue
  (queue_id,bill_version_id,queue_state,locked_at,locked_by,next_attempt_at,updated_at)
SELECT ('11111111-1111-4111-8111-'||lpad(i::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 (ARRAY['completed','eligible','submitted','permanent_failure','degraded','completed'])[i],
 CASE WHEN i=3 THEN '2026-10-01T00:00:00Z'::timestamptz ELSE NULL END,
 CASE WHEN i=3 THEN 'fixture-worker-lease' ELSE NULL END,
 '2026-10-17T00:00:00Z'::timestamptz,
 '2026-10-17T00:00:00Z'::timestamptz
FROM generate_series(1,6) AS i;
