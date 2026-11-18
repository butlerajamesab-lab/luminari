-- READ-ONLY release gate for the one-file Docket -> Genome function migration.
-- Execute on Lighthouse production via psql, never by running the SQL migration
-- body directly or manually editing supabase_migrations.schema_migrations.
\set ON_ERROR_STOP on
DO $docket_one_file_release_pre$
DECLARE
  existing_version text;
  candidate_count integer;
  queued_count bigint;
  completed_count bigint;
  degraded_count bigint;
  eligible_count bigint;
  fn record;
  actual_hash text;
BEGIN
  SELECT MAX(version) INTO existing_version FROM supabase_migrations.schema_migrations;
  IF existing_version IS DISTINCT FROM '20261118010000' THEN
    RAISE EXCEPTION 'docket_release_unexpected_remote_latest_version_%',existing_version;
  END IF;
  SELECT COUNT(*) INTO candidate_count
    FROM supabase_migrations.schema_migrations
    WHERE version='20261118063000';
  IF candidate_count <> 0 THEN
    RAISE EXCEPTION 'docket_release_target_version_already_present_%',candidate_count;
  END IF;

  FOR fn IN SELECT * FROM (VALUES
    ('public.sync_civic_genome_lifecycle_history_v3(integer)',
     '7c09d47f69e595346b95387cbe016227b2e1fc8bfd696d10ca4d66be7da08a3b',
     'search_path=pg_catalog, public, extensions, pg_temp'),
    ('public.register_docket_legislative_version_spine(integer, boolean)',
     'b15877dc890662669e01521a4dd7b818dabb4c817d477e18ecaf533f0974e97a',
     'search_path=pg_catalog, public, extensions')
  ) AS expected(signature,sha256,config)
  LOOP
    SELECT encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'UTF8'),'sha256'),'hex')
      INTO actual_hash
      FROM pg_proc p WHERE p.oid=to_regprocedure(fn.signature)::oid
        AND p.prosecdef
        AND array_to_string(p.proconfig,',')=fn.config;
    IF actual_hash IS DISTINCT FROM fn.sha256 THEN
      RAISE EXCEPTION 'docket_release_function_preflight_mismatch_%',fn.signature;
    END IF;
  END LOOP;

  SELECT
    COUNT(*) FILTER(WHERE q.queue_state='completed'),
    COUNT(*) FILTER(WHERE q.queue_state='degraded'),
    COUNT(*) FILTER(WHERE q.queue_state='eligible'),
    COUNT(*)
  INTO completed_count,degraded_count,eligible_count,queued_count
  FROM public.docket_bill_processing_queue q
  JOIN public.docket_jurisdiction_activation_bill b ON b.queue_id=q.queue_id
  JOIN public.docket_jurisdiction_activation_run a ON a.activation_id=b.activation_id
  WHERE a.source='legiscan_bulk_json';

  IF queued_count <> 198886 OR completed_count <> 3
     OR degraded_count <> 6 OR eligible_count <> 198877 THEN
    RAISE EXCEPTION
      'docket_release_queue_changed_total_%_completed_%_degraded_%_eligible_%',
      queued_count,completed_count,degraded_count,eligible_count;
  END IF;
  RAISE NOTICE
    'docket_one_file_release_preflight_pass latest=20261118010000 target_absent=true function_hashes=2 queue_unchanged=true';
END;
$docket_one_file_release_pre$;
