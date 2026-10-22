-- Read-only work queue for the next source-bound navigation placement pass.
-- This does not change a resource, source text, readiness, or publication.
-- A row leaves this queue only when an append-only exact-source category
-- receipt is accepted by luminari_resource_category_revision_v1.
create or replace view public.v_luminari_resource_category_review_queue_v1
with (security_invoker=true) as
select
  v.civic_object_uid,
  v.object_ref,
  public.luminari_stable_uuid_v1(v.object_ref) as resource_entity_id,
  v.run_id,
  v.artifact_key,
  v.artifact_role,
  v.source_locator,
  v.source_content_sha256,
  v.source_candidate_hash,
  v.parser_version,
  v.jurisdiction,
  v.state_code,
  v.section_name,
  v.name,
  v.organization_name,
  v.category as source_category,
  v.layer as source_layer,
  v.description,
  v.eligibility_summary,
  v.apply_notes,
  v.field_provenance,
  v.source_transcription_correction,
  v.current_run_completed_at
from public.v_lighthouse_resource_program_classified_v1 v
where v.object_class='resource'
  and v.person_facing_ready is true
  and v.reviewed_primary_category is null;

revoke all on public.v_luminari_resource_category_review_queue_v1
  from public,anon,authenticated;
grant select on public.v_luminari_resource_category_review_queue_v1 to service_role;

comment on view public.v_luminari_resource_category_review_queue_v1 is
  'Read-only exact-source queue for individually reviewed Resource Directory category receipts. Not a classifier and not a publication authority.';
