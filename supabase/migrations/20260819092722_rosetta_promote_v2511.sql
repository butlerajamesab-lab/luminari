begin

-- Schema-only preview replay: the production acceptance guard for this already-applied
-- migration is intentionally not re-executed on a data-less branch. Production
-- evidence remains authoritative; this does not constitute a new promotion proof.

create or replace function public.run_rosetta_v3_extraction(
  p_source_document_id integer,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'text/plain',
  p_source_byte_hash text default null,
  p_source_provider_hash text default null,
  p_reference_date date default null,
  p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout='120s'
set search_path=pg_catalog,public,extensions
as $$
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
$$

revoke all on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)
  from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)
  to service_role

update public.rosetta_current_generation_registry_v1
set contract='rosetta-current-generation-v1',
    engine_version='rosetta-v3-deterministic-sql-2.5.11',
    rule_set_version='rosetta-five-layer-structural-correctness-2.5.11',
    rule_manifest_hash='3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639',
    validation_test_name='independent_structure_v2511',
    promoted_at=clock_timestamp()
where singleton=true

create or replace view public.v_civic_genome_law_view_v1
with (security_invoker=true) as
select
  law.extraction_run_id,
  law.source_document_id,
  law.corpus_id,
  law.document_name,
  law.document_type,
  law.document_identifier,
  law.run_version,
  law.run_status,
  law.confidence_threshold,
  law.created_at,
  law.completed_at,
  law.objects,
  law.coverage,
  'complete'::text as provenance_state,
  law.engine_version,
  law.rule_set_version,
  law.rule_manifest_hash,
  law.configuration_hash,
  law.source_identity_hash,
  law.source_content_hash,
  law.output_content_hash,
  law.admissibility_state,
  law.source_url,
  law.source_version,
  law.media_type,
  law.source_byte_hash,
  law.source_provider_hash,
  'rosetta-civic-genome-handoff-v2'::text as handoff_contract_version,
  law.structural_representations
from public.v_rosetta_operator_law_view_v1 law
where public.rosetta_is_current_publishable_run_v1(law.extraction_run_id)

revoke select on public.v_civic_genome_law_view_v1 from anon,authenticated

grant select on public.v_civic_genome_law_view_v1 to service_role

comment on function public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Canonical Rosetta producer for registry-selected generation 2.5.11. Exact finalized replay is immutable. Operation-sheet amendments and explicitly marked full-text amendment reprints remain non-operative structural sources; unsupported zero-operation amendment formats remain rejected.'

comment on view public.v_civic_genome_law_view_v1 is
  'Current-generation Civic Genome handoff. Five operative layers remain in objects/coverage; non-operative source structures are exported separately under rosetta-civic-genome-handoff-v2.'

commit
