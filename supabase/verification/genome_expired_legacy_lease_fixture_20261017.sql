-- DISPOSABLE PostgreSQL ONLY. Old stale queue locks must not be mistaken
-- for currently executing workers. Never apply to production.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.docket_bill_source_document (source_document_key text PRIMARY KEY);
CREATE TABLE public.civic_genome_bill_version (
  bill_version_id uuid PRIMARY KEY,
  source_document_key text NOT NULL REFERENCES public.docket_bill_source_document,
  rosetta_extraction_run_id text NOT NULL,
  receipt_json jsonb NOT NULL
);
CREATE TABLE public.civic_genome_legislative_version_queue (
  queue_id uuid PRIMARY KEY,
  bill_version_id uuid NOT NULL REFERENCES public.civic_genome_bill_version,
  queue_state text NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  locked_at timestamptz,
  locked_by text,
  last_failure_class text,
  last_error_code text,
  attempt_count integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.preserve_legislative_version_queue_state_v1()
RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp
AS $fn$
BEGIN
 IF old.queue_state IN ('submitted','degraded','permanent_failure')
    AND new.queue_state='eligible'
    AND new.last_error_code IS NOT DISTINCT FROM old.last_error_code
    AND new.last_failure_class IS NOT DISTINCT FROM old.last_failure_class THEN
    new.queue_state:=old.queue_state;
    new.next_attempt_at:=old.next_attempt_at;
    new.locked_at:=old.locked_at;
    new.locked_by:=old.locked_by;
    new.completed_at:=old.completed_at;
 END IF;
 RETURN new;
END;$fn$;
CREATE TRIGGER preserve_legislative_version_queue_state_v1
  BEFORE UPDATE ON public.civic_genome_legislative_version_queue
  FOR EACH ROW EXECUTE FUNCTION public.preserve_legislative_version_queue_state_v1();

INSERT INTO public.docket_bill_source_document
SELECT 'text:'||i||':'||i FROM generate_series(1,20) AS i;
INSERT INTO public.civic_genome_bill_version
SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
       'text:'||i||':'||i, i::text,
       jsonb_build_object(
         'rosetta_engine_version',
         (ARRAY[
         'rosetta-v3-deterministic-sql-2.2.0',
         'rosetta-v3-deterministic-sql-2.3.0',
         'rosetta-v3-deterministic-sql-2.4.0',
         'rosetta-v3-deterministic-sql-2.5.8',
         'rosetta-v3-deterministic-sql-2.5.10',
         'rosetta-v3-deterministic-sql-2.5.11'])[1+((i-1)%6)]
       )
FROM generate_series(1,20) AS i;
INSERT INTO public.civic_genome_legislative_version_queue (
 queue_id,bill_version_id,queue_state,next_attempt_at,locked_at,locked_by,
 last_failure_class,last_error_code,attempt_count,completed_at,created_at,updated_at
)
SELECT
 ('11111111-1111-4111-8111-'||lpad(i::text,12,'0'))::uuid,
 ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 CASE WHEN i<=15 THEN 'submitted' ELSE 'eligible' END,
 '2026-08-07T00:00:00Z'::timestamptz,
 '2026-08-07T00:00:00Z'::timestamptz,
 'fixture-retired-worker-'||i,
 NULL,NULL, i, NULL,
 '2026-08-07T00:00:00Z'::timestamptz,
 '2026-08-18T00:00:00Z'::timestamptz
FROM generate_series(1,20) AS i;
