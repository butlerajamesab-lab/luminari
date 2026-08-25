CREATE OR REPLACE FUNCTION public.run_rosetta_v3_extraction_v2511_candidate(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '180s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;
  v_receipt jsonb;
  v_run_id integer;
  v_finalized boolean:=false;
  v_manifest_hash text;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_objects jsonb;
  v_structural jsonb;
  v_independent jsonb;
begin
  select manifest_hash into v_manifest_hash
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.11'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
    and is_active=true;
  if v_manifest_hash is null then raise exception 'rosetta_v2511_active_manifest_missing'; end if;

  v_base:=public.run_rosetta_v3_extraction_v2511_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  v_run_id:=nullif(v_base->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_base||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;

  if coalesce(v_base->>'run_status','')<>'completed'
     or coalesce(v_base->>'admissibility_state','')<>'admissible' then
    return v_base||jsonb_build_object('rule_manifest_hash',v_manifest_hash,'handoff_contract_version','rosetta-civic-genome-handoff-v2');
  end if;

  select exists(
    select 1
    from public.extraction_run run
    join public.extraction_manifest manifest on manifest.extraction_run_id=run.id
    join public.validation_result independent on independent.extraction_run_id=run.id
      and independent.test_name='independent_structure_v2511'
      and independent.test_result='pass'
      and independent.failure_count=0
    join public.validation_result output_hash on output_hash.extraction_run_id=run.id
      and output_hash.test_name='output_hash_verified'
      and output_hash.test_result='pass'
      and output_hash.failure_count=0
    where run.id=v_run_id
      and run.engine_version='rosetta-v3-deterministic-sql-2.5.11'
      and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
      and run.rule_manifest_hash=v_manifest_hash
      and run.run_status='completed'
      and run.admissibility_state='admissible'
      and run.output_content_hash is not null
      and manifest.status='clean'
      and manifest.admissibility_state='admissible'
      and manifest.output_hash=run.output_content_hash
  ) into v_finalized;

  if not v_finalized then
    v_receipt:=public.run_rosetta_v3_extraction_v2511_candidate_base(
      p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
      p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
    );
    if coalesce(v_receipt->>'run_status','')<>'completed'
       or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then
      return v_receipt;
    end if;
    v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  else
    v_receipt:=v_base||jsonb_build_object(
      'replayed',true,
      'exact_final_replay',true,
      'replay_contract','rosetta-finalized-generation-immutable-replay-v2511'
    );
  end if;

  select manifest.row_counts into v_row_counts
  from public.extraction_manifest manifest
  where manifest.extraction_run_id=v_run_id;
  v_coverage:=public.rosetta_v2511_final_coverage(v_run_id);
  select coalesce(law.objects,'[]'::jsonb),coalesce(law.structural_representations,'[]'::jsonb)
    into v_objects,v_structural
  from public.v_rosetta_operator_law_view_v1 law
  where law.extraction_run_id=v_run_id;
  select details into v_independent
  from public.validation_result
  where extraction_run_id=v_run_id and test_name='independent_structure_v2511';

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.11',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.11',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'coverage',coalesce(v_coverage,'{}'::jsonb),
    'row_counts',coalesce(v_row_counts,'{}'::jsonb),
    'objects',coalesce(v_objects,'[]'::jsonb),
    'structural_representations',coalesce(v_structural,'[]'::jsonb),
    'independent_structure_v2511',v_independent
  );
end;
$function$
