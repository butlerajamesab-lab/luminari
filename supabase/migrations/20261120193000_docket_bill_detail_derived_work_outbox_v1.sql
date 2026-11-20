-- FORWARD-ONLY REPOSITORY CANDIDATE. NOT INSTALLED IN PRODUCTION.
-- Keep canonical Docket detail acceptance atomic and move its expensive
-- lifecycle/version side effects to a durable, idempotent worker queue.
-- This migration does not authorize Rosetta execution or Genome publication.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.docket_bill_detail_cache') IS NULL
     OR to_regclass('public.docket_bill_source_document') IS NULL
     OR to_regclass('public.civic_genome_bill_version') IS NULL
     OR to_regprocedure('public.sync_civic_genome_lifecycle_history_v3(integer)') IS NULL
     OR to_regprocedure('public.refresh_civic_genome_bill_temporal_projection_v2(uuid)') IS NULL
     OR to_regprocedure('public.register_docket_legislative_version_spine(integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_prerequisite_missing';
  END IF;
  IF to_regclass('public.docket_bill_detail_derived_work_v1') IS NOT NULL THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_already_exists_review_before_install';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.docket_bill_detail_cache'::regclass
      AND tgname='docket_bill_detail_cache_lifecycle_event_time_v3'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.docket_bill_detail_cache'::regclass
      AND tgname='docket_legislative_version_spine_registration'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.civic_genome_bill'::regclass
      AND tgname='civic_genome_bill_lifecycle_event_time_v3'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_expected_triggers_missing';
  END IF;
END;
$preflight$;

CREATE TABLE public.docket_bill_detail_derived_work_v1 (
  work_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_bill_id integer NOT NULL CHECK (source_bill_id > 0),
  docket_fetched_at timestamptz NOT NULL,
  work_state text NOT NULL DEFAULT 'eligible'
    CHECK (work_state IN ('eligible','leased','degraded','held','completed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error_code text,
  receipt_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_bill_id, docket_fetched_at),
  CHECK (
    (work_state = 'leased' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR (work_state <> 'leased' AND locked_at IS NULL AND locked_by IS NULL)
  ),
  CHECK ((work_state = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX docket_bill_detail_derived_work_claim_v1
  ON public.docket_bill_detail_derived_work_v1 (next_attempt_at, created_at)
  WHERE work_state IN ('eligible','degraded');
CREATE INDEX docket_bill_detail_derived_work_expired_lease_v1
  ON public.docket_bill_detail_derived_work_v1 (locked_at)
  WHERE work_state = 'leased';

ALTER TABLE public.docket_bill_detail_derived_work_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.docket_bill_detail_derived_work_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.docket_bill_detail_derived_work_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_docket_bill_detail_derived_work_v1(
  p_source_bill_id integer,
  p_docket_fetched_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_work_id uuid;
BEGIN
  IF p_source_bill_id IS NULL OR p_source_bill_id <= 0 OR p_docket_fetched_at IS NULL THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_invalid_identity';
  END IF;
  INSERT INTO public.docket_bill_detail_derived_work_v1 AS prior (
    source_bill_id, docket_fetched_at
  ) VALUES (p_source_bill_id, p_docket_fetched_at)
  ON CONFLICT (source_bill_id, docket_fetched_at) DO UPDATE
    SET work_state='eligible',
        attempt_count=0,
        next_attempt_at=now(),
        completed_at=NULL,
        last_error_code=NULL,
        receipt_json='{}'::jsonb,
        updated_at=now()
    WHERE prior.work_state IN ('held','completed')
  RETURNING work_id INTO v_work_id;
  IF v_work_id IS NULL THEN
    SELECT work.work_id INTO v_work_id
    FROM public.docket_bill_detail_derived_work_v1 work
    WHERE work.source_bill_id=p_source_bill_id
      AND work.docket_fetched_at=p_docket_fetched_at;
  END IF;
  RETURN v_work_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_docket_bill_detail_derived_work_v1(
  p_worker_id text,
  p_limit integer DEFAULT 1
) RETURNS SETOF public.docket_bill_detail_derived_work_v1
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH candidates AS (
    SELECT work.work_id
    FROM public.docket_bill_detail_derived_work_v1 work
    WHERE (work.work_state IN ('eligible','degraded') AND work.next_attempt_at <= now())
       OR (work.work_state = 'leased' AND work.locked_at < now() - interval '5 minutes')
    ORDER BY work.next_attempt_at, work.created_at, work.work_id
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 1), 5))
  )
  UPDATE public.docket_bill_detail_derived_work_v1 work
  SET work_state='leased',
      attempt_count=work.attempt_count+1,
      locked_at=now(),
      locked_by=left(coalesce(nullif(p_worker_id,''),'docket-detail-derived-worker'),200),
      completed_at=NULL,
      updated_at=now()
  FROM candidates
  WHERE work.work_id=candidates.work_id
  RETURNING work.*
$function$;

CREATE OR REPLACE FUNCTION public.process_docket_bill_detail_derived_work_v1(
  p_source_bill_id integer,
  p_docket_fetched_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_latest_fetched_at timestamptz;
  v_genome_bill_id uuid;
  v_registration jsonb;
BEGIN
  SELECT cache.fetched_at INTO v_latest_fetched_at
  FROM public.docket_bill_detail_cache cache
  WHERE cache.bill_id=p_source_bill_id;
  IF v_latest_fetched_at IS NULL THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_source_missing';
  END IF;
  IF v_latest_fetched_at IS DISTINCT FROM p_docket_fetched_at THEN
    RETURN jsonb_build_object(
      'status','superseded',
      'source_bill_id',p_source_bill_id,
      'requested_fetched_at',p_docket_fetched_at,
      'latest_fetched_at',v_latest_fetched_at
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.civic_genome_bill bill
    WHERE bill.structural_dna_json->>'source_bill_id'=p_source_bill_id::text
  ) THEN
    RETURN jsonb_build_object(
      'status','waiting_for_genome_identity',
      'source_bill_id',p_source_bill_id,
      'docket_fetched_at',p_docket_fetched_at
    );
  END IF;

  PERFORM public.sync_civic_genome_lifecycle_history_v3(p_source_bill_id);

  FOR v_genome_bill_id IN
    SELECT bill.genome_bill_id
    FROM public.civic_genome_bill bill
    WHERE bill.structural_dna_json->>'source_bill_id'=p_source_bill_id::text
  LOOP
    PERFORM public.refresh_civic_genome_bill_temporal_projection_v2(v_genome_bill_id);
  END LOOP;

  -- This is the same governed registration function used by the existing
  -- cache trigger. It does not authorize Rosetta execution.
  v_registration := public.register_docket_legislative_version_spine(p_source_bill_id,false);
  RETURN jsonb_build_object(
    'status','processed',
    'source_bill_id',p_source_bill_id,
    'docket_fetched_at',p_docket_fetched_at,
    'registration',v_registration
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_docket_bill_detail_derived_work_v1(
  p_work_id uuid,
  p_worker_id text,
  p_receipt jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_rows integer;
  v_source_bill_id integer;
  v_docket_fetched_at timestamptz;
  v_requeue boolean := false;
BEGIN
  IF p_receipt->>'status'='waiting_for_genome_identity' THEN
    SELECT work.source_bill_id, work.docket_fetched_at
      INTO v_source_bill_id, v_docket_fetched_at
    FROM public.docket_bill_detail_derived_work_v1 work
    WHERE work.work_id=p_work_id AND work.work_state='leased' AND work.locked_by=p_worker_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.civic_genome_bill bill
      WHERE bill.structural_dna_json->>'source_bill_id'=v_source_bill_id::text
    ) INTO v_requeue;
    UPDATE public.docket_bill_detail_derived_work_v1
    SET work_state=CASE WHEN v_requeue THEN 'eligible' ELSE 'held' END,
        next_attempt_at=now(),
        locked_at=NULL,
        locked_by=NULL,
        completed_at=NULL,
        last_error_code=NULL,
        receipt_json=coalesce(p_receipt,'{}'::jsonb),
        updated_at=now()
    WHERE work_id=p_work_id AND work_state='leased' AND locked_by=p_worker_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    RETURN v_rows=1;
  END IF;
  UPDATE public.docket_bill_detail_derived_work_v1
  SET work_state='completed',
      completed_at=now(),
      locked_at=NULL,
      locked_by=NULL,
      last_error_code=NULL,
      receipt_json=coalesce(p_receipt,'{}'::jsonb),
      updated_at=now()
  WHERE work_id=p_work_id AND work_state='leased' AND locked_by=p_worker_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows=1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.defer_docket_bill_detail_derived_work_v1(
  p_work_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_seconds integer DEFAULT 60
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.docket_bill_detail_derived_work_v1
  SET work_state='degraded',
      next_attempt_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_retry_seconds,60),3600))),
      locked_at=NULL,
      locked_by=NULL,
      last_error_code=left(coalesce(nullif(p_error_code,''),'unknown_docket_detail_derived_failure'),200),
      updated_at=now()
  WHERE work_id=p_work_id AND work_state='leased' AND locked_by=p_worker_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows=1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_civic_genome_lifecycle_from_detail_cache_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM public.enqueue_docket_bill_detail_derived_work_v1(new.bill_id,new.fetched_at);
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_register_docket_legislative_version_spine_from_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM public.enqueue_docket_bill_detail_derived_work_v1(new.bill_id,new.fetched_at);
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.try_register_docket_legislative_version_spine_from_genome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_source_bill_id integer;
  v_fetched_at timestamptz;
BEGIN
  IF coalesce(new.structural_dna_json->>'source_bill_id','') !~ '^[0-9]+$' THEN
    RETURN new;
  END IF;
  v_source_bill_id := (new.structural_dna_json->>'source_bill_id')::integer;
  SELECT cache.fetched_at INTO v_fetched_at
  FROM public.docket_bill_detail_cache cache
  WHERE cache.bill_id=v_source_bill_id;
  IF v_fetched_at IS NOT NULL THEN
    PERFORM public.enqueue_docket_bill_detail_derived_work_v1(v_source_bill_id,v_fetched_at);
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_civic_genome_lifecycle_from_bill_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_source_bill_id integer;
  v_fetched_at timestamptz;
BEGIN
  IF pg_trigger_depth() > 1
     OR coalesce(new.structural_dna_json->>'source_bill_id','') !~ '^[0-9]+$' THEN
    RETURN new;
  END IF;
  v_source_bill_id := (new.structural_dna_json->>'source_bill_id')::integer;
  SELECT cache.fetched_at INTO v_fetched_at
  FROM public.docket_bill_detail_cache cache
  WHERE cache.bill_id=v_source_bill_id;
  IF v_fetched_at IS NOT NULL THEN
    PERFORM public.enqueue_docket_bill_detail_derived_work_v1(v_source_bill_id,v_fetched_at);
  END IF;
  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_docket_bill_detail_derived_work_v1(integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_docket_bill_detail_derived_work_v1(text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_docket_bill_detail_derived_work_v1(integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_docket_bill_detail_derived_work_v1(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_docket_bill_detail_derived_work_v1(uuid,text,text,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_civic_genome_lifecycle_from_bill_v3()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_docket_bill_detail_derived_work_v1(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_docket_bill_detail_derived_work_v1(integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_docket_bill_detail_derived_work_v1(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_docket_bill_detail_derived_work_v1(uuid,text,text,integer) TO service_role;

COMMENT ON TABLE public.docket_bill_detail_derived_work_v1 IS
  'Durable post-acceptance work for Docket detail observations. The source cache commit is independent from lifecycle projection and version registration; no Rosetta or Genome publication authority is implied.';

DO $postflight$
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.sync_civic_genome_lifecycle_from_detail_cache_v3()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.try_register_docket_legislative_version_spine_from_cache()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.try_register_docket_legislative_version_spine_from_genome()'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.sync_civic_genome_lifecycle_from_bill_v3()'::regprocedure) THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_security_contract_failed';
  END IF;
  IF position('sync_civic_genome_lifecycle_history_v3' in
      pg_get_functiondef('public.sync_civic_genome_lifecycle_from_detail_cache_v3()'::regprocedure)) > 0
     OR position('public.register_docket_legislative_version_spine(' in
      pg_get_functiondef('public.try_register_docket_legislative_version_spine_from_cache()'::regprocedure)) > 0
     OR position('sync_civic_genome_lifecycle_history_v3' in
      pg_get_functiondef('public.sync_civic_genome_lifecycle_from_bill_v3()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_sync_still_inline';
  END IF;
  IF has_table_privilege('anon','public.docket_bill_detail_derived_work_v1','select')
     OR has_table_privilege('authenticated','public.docket_bill_detail_derived_work_v1','select') THEN
    RAISE EXCEPTION 'docket_bill_detail_derived_work_public_access_regression';
  END IF;
END;
$postflight$;

COMMIT;
