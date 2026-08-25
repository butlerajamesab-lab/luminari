CREATE OR REPLACE FUNCTION public.run_rosetta_v3_extraction(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '180s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_receipt jsonb;
  v_was_finalized boolean:=false;
  v_configuration_json jsonb;
  v_configuration_hash text;
  v_expected_content_hash text;
begin
  v_configuration_json:=jsonb_build_object(
    'reference_date',p_reference_date,
    'text_extractor_version',coalesce(nullif(btrim(p_text_extractor_version),''),'unknown'),
    'normalization_version','rosetta-normalize-whitespace-v2',
    'parsing_projection_version','rosetta-layout-projection-v25',
    'confidence_mode','binary_exact_match_only'
  );
  v_configuration_hash:=encode(digest(convert_to(v_configuration_json::text,'UTF8'),'sha256'),'hex');
  v_expected_content_hash:=lower(regexp_replace(coalesce(p_expected_source_content_hash,''),'^sha256:',''));

  select exists(
    select 1
    from public.extraction_run run
    join public.source_document_content content on content.source_content_id=run.source_content_id
    join public.extraction_manifest manifest on manifest.extraction_run_id=run.id
    join public.validation_result independent on independent.extraction_run_id=run.id
      and independent.test_name='independent_structure_v2511'
      and independent.test_result='pass'
      and independent.failure_count=0
    join public.validation_result exact_source on exact_source.extraction_run_id=run.id
      and exact_source.test_name='exact_source_structure_v2511'
      and exact_source.test_result='pass'
      and exact_source.failure_count=0
    join public.validation_result output_hash on output_hash.extraction_run_id=run.id
      and output_hash.test_name='output_hash_verified'
      and output_hash.test_result='pass'
      and output_hash.failure_count=0
    where run.source_document_id=p_source_document_id
      and content.source_version=p_source_version
      and content.source_url=p_source_url
      and content.source_content_hash=v_expected_content_hash
      and run.engine_version='rosetta-v3-deterministic-sql-2.5.11'
      and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
      and run.rule_manifest_hash='3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639'
      and run.configuration_hash=v_configuration_hash
      and run.run_status='completed'
      and run.admissibility_state='admissible'
      and run.output_content_hash is not null
      and manifest.status='clean'
      and manifest.admissibility_state='admissible'
      and manifest.output_hash=run.output_content_hash
  ) into v_was_finalized;

  v_receipt:=public.run_rosetta_v3_extraction_v2511_candidate(
    p_source_document_id,
    p_source_text,
    p_expected_source_content_hash,
    p_source_url,
    p_source_version,
    p_media_type,
    p_source_byte_hash,
    p_source_provider_hash,
    p_reference_date,
    p_text_extractor_version,
    p_source_metadata
  );

  return v_receipt||jsonb_build_object(
    'replayed',v_was_finalized,
    'canonical_producer_contract','rosetta-current-producer-v2511',
    'canonical_replay_contract',case when v_was_finalized
      then 'rosetta-finalized-generation-immutable-replay-v2511'
      else 'rosetta-final-generation-produced-v2511'
    end
  );
end;
$function$
