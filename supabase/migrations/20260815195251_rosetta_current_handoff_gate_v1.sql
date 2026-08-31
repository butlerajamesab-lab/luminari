begin

create or replace function public.rosetta_is_current_publishable_run_v1(p_extraction_run_id integer) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from public.extraction_run run
  where run.id=p_extraction_run_id
    and run.run_status in ('completed','validated')
    and run.admissibility_state='admissible'
    and run.engine_version='rosetta-v3-deterministic-sql-2.5.3'
    and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.3'
    and exists(select 1 from public.validation_result validation where validation.extraction_run_id=run.id and validation.test_name='independent_structure_v253' and validation.test_result='pass' and validation.failure_count=0)
    and public.rosetta_blocking_structural_repair_count(run.id)=0
    and not exists(
      select 1 from public.extraction_run newer
      where newer.source_document_id=run.source_document_id and newer.id>run.id
        and newer.run_status in ('completed','validated') and newer.admissibility_state='admissible'
        and newer.engine_version='rosetta-v3-deterministic-sql-2.5.3'
        and newer.rule_set_version='rosetta-five-layer-structural-correctness-2.5.3'
        and exists(select 1 from public.validation_result newer_validation where newer_validation.extraction_run_id=newer.id and newer_validation.test_name='independent_structure_v253' and newer_validation.test_result='pass' and newer_validation.failure_count=0)
        and public.rosetta_blocking_structural_repair_count(newer.id)=0
    )
 );
$$

create or replace view public.v_rosetta_operator_law_view_v1 with (security_invoker=true) as
select law.extraction_run_id,law.source_document_id,law.corpus_id,law.document_name,law.document_type,law.document_identifier,law.run_version,law.run_status,law.confidence_threshold,law.created_at,law.completed_at,public.rosetta_v25_enrich_objects_with_spans(law.extraction_run_id,law.objects) objects,law.coverage,law.provenance_state,law.engine_version,law.rule_set_version,law.rule_manifest_hash,law.configuration_hash,law.source_identity_hash,law.source_content_hash,law.output_content_hash,law.admissibility_state,law.source_url,law.source_version,law.media_type,law.source_byte_hash,law.source_provider_hash
from public.v_civic_genome_law_view_v1_internal law

create or replace view public.v_civic_genome_law_view_v1 with (security_invoker=true) as
select law.extraction_run_id,law.source_document_id,law.corpus_id,law.document_name,law.document_type,law.document_identifier,law.run_version,law.run_status,law.confidence_threshold,law.created_at,law.completed_at,public.rosetta_v25_enrich_objects_with_spans(law.extraction_run_id,law.objects) objects,law.coverage,'complete'::text provenance_state,law.engine_version,law.rule_set_version,law.rule_manifest_hash,law.configuration_hash,law.source_identity_hash,law.source_content_hash,law.output_content_hash,law.admissibility_state,law.source_url,law.source_version,law.media_type,law.source_byte_hash,law.source_provider_hash
from public.v_civic_genome_law_view_v1_internal law
where public.rosetta_is_current_publishable_run_v1(law.extraction_run_id)

revoke all on function public.rosetta_is_current_publishable_run_v1(integer) from public,anon,authenticated

grant execute on function public.rosetta_is_current_publishable_run_v1(integer) to service_role

revoke select on public.v_rosetta_operator_law_view_v1 from anon,authenticated

revoke select on public.v_civic_genome_law_view_v1 from anon,authenticated

grant select on public.v_rosetta_operator_law_view_v1 to service_role

grant select on public.v_civic_genome_law_view_v1 to service_role

comment on view public.v_civic_genome_law_view_v1 is 'Current canonical Rosetta handoff. Civic Genome sees only the latest per-source Rosetta 2.5.3 generation that passed independent_structure_v253 with zero blocking structural repairs.'

comment on view public.v_rosetta_operator_law_view_v1 is 'Rosetta operator/history inspection view. Preserves access to historical and rejected generations without making them eligible for Civic Genome handoff.'

commit
