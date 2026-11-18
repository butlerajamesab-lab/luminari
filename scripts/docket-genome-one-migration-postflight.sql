-- READ-ONLY post-install acceptance: version receipt, two function bodies,
-- original ACL/search_path and the untouched archive queue; fail loudly on drift.
\set ON_ERROR_STOP on
DO $docket_one_file_release_post$
DECLARE
  migration_name text;
  candidate_count integer;
  last_version text;
  f record;
  got_body text;
  got_config text;
  got_secdef boolean;
  completed_count bigint;
  degraded_count bigint;
  eligible_count bigint;
  queued_count bigint;
BEGIN
  SELECT COUNT(*),MAX(name) INTO candidate_count,migration_name
    FROM supabase_migrations.schema_migrations
    WHERE version='20261118063000';
  SELECT MAX(version) INTO last_version FROM supabase_migrations.schema_migrations;
  IF candidate_count<>1
    OR migration_name IS DISTINCT FROM 'docket_genome_trigger_indexed_scope'
    OR last_version IS DISTINCT FROM '20261118063000' THEN
    RAISE EXCEPTION 'docket_release_wrong_version_receipt_%_%_%',
      candidate_count,migration_name,last_version;
  END IF;

  FOR f IN SELECT * FROM (VALUES
    ('public.sync_civic_genome_lifecycle_history_v3(integer)',
     '7c09d47f69e595346b95387cbe016227b2e1fc8bfd696d10ca4d66be7da08a3b',
     'search_path=pg_catalog, public, extensions, pg_temp'),
    ('public.register_docket_legislative_version_spine(integer, boolean)',
     'b15877dc890662669e01521a4dd7b818dabb4c817d477e18ecaf533f0974e97a',
     'search_path=pg_catalog, public, extensions')
  ) AS old(signature,sha256,config)
  LOOP
    SELECT pg_get_functiondef(p.oid),array_to_string(p.proconfig,','),p.prosecdef
      INTO got_body,got_config,got_secdef
      FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature)::oid;
    IF got_body IS NULL OR got_secdef IS DISTINCT FROM true
       OR got_config IS DISTINCT FROM f.config
       OR encode(extensions.digest(convert_to(got_body,'UTF8'),'sha256'),'hex')=f.sha256
       OR position('source_identity_hash' in got_body)=0 THEN
      RAISE EXCEPTION 'docket_release_post_function_invalid_%',f.signature;
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
  IF queued_count<>198886 OR completed_count<>3 OR degraded_count<>6
     OR eligible_count<>198877 THEN
    RAISE EXCEPTION 'docket_release_post_archive_queue_changed_%_%_%_%',
      queued_count,completed_count,degraded_count,eligible_count;
  END IF;
  RAISE NOTICE
    'docket_one_file_release_postflight_pass version=20261118063000 function_bodies_changed=2 source_queue_unchanged=true';
END;
$docket_one_file_release_post$;
