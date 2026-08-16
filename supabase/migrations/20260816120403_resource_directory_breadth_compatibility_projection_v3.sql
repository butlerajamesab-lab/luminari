create or replace view public.v_lighthouse_resource_directory_breadth_v3 as
select
  case
    when b.publication_lane = 'whole_corpus_current'
      then b.source_id::uuid
    else public.luminari_stable_uuid_v1(b.resource_record_uid)
  end as resource_entity_id,
  b.resource_record_uid,
  b.source_lane,
  b.source_id,
  b.publication_lane,
  b.name,
  b.organization as organization_name,
  coalesce(nullif(b.category,''), 'general_resource') as ui_category,
  b.category,
  case
    when b.publication_lane = 'whole_corpus_current'
      then coalesce(nullif(b.provenance->>'object_class',''), 'resource')
    when b.source_lane in ('registry_programs','government_benefits_registry')
      then 'program'
    else 'resource'
  end as object_class,
  case
    when b.publication_lane = 'whole_corpus_current'
      then coalesce(nullif(b.provenance->>'target_surface',''), 'resource_directory')
    else 'resource_directory'
  end as target_surface,
  b.jurisdiction_raw as jurisdiction,
  b.jurisdiction_code as state_code,
  b.phone,
  b.email,
  b.website as website_url,
  b.address,
  b.eligibility as eligibility_summary,
  b.notes as apply_notes,
  b.description,
  null::text as filing_portal,
  null::text as filing_portal_url,
  null::text as statutory_authority,
  null::text as deadline,
  null::text as hours,
  null::text as languages,
  b.verification_status as data_state,
  b.source_created_at,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'object_ref' else b.resource_record_uid end as object_ref,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'artifact_key' else null end as artifact_key,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'artifact_role' else b.source_lane end as artifact_role,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'source_locator' else b.source_lane || ':' || b.source_id end as source_locator,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'source_content_sha256' else null end as source_content_sha256,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'source_candidate_hash' else md5(b.resource_record_uid) end as source_candidate_hash,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'parser_version' else 'legacy_catalog_projection_v1' end as parser_version,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'run_id' else null end as run_id,
  case when b.publication_lane='whole_corpus_current' then 'whole_corpus_current' else 'legacy_catalog' end as current_run_role,
  case when b.publication_lane='whole_corpus_current' then 'whole_corpus_resource_directory_v2' else 'legacy_catalog_preserved' end as current_run_engine_version,
  null::timestamptz as current_run_completed_at,
  b.provenance as field_provenance,
  case when b.publication_lane='whole_corpus_current' then coalesce((b.provenance->>'legacy_identity_preserved')::boolean,false) else true end as legacy_identity_preserved,
  case when b.publication_lane='whole_corpus_current' then b.provenance->>'legacy_identity_key' else b.resource_record_uid end as legacy_identity_key,
  b.source_lane as catalog_kind,
  true as person_facing_ready,
  b.exact_name_jurisdiction_key,
  b.exact_match_record_count,
  b.corroborating_lane_count,
  b.normalized_name_key,
  b.provenance
from public.v_lighthouse_resource_catalog_breadth_v2 b
where nullif(b.name,'') is not null;

comment on view public.v_lighthouse_resource_directory_breadth_v3 is
'Compatibility projection exposing the breadth-preserving resource/program union through the existing UUID-based Resource Directory contract. Current whole-corpus UUIDs are preserved; legacy catalog rows receive deterministic stable UUIDs. No fuzzy identity merge is performed.';

revoke all on public.v_lighthouse_resource_directory_breadth_v3 from public;
revoke all on public.v_lighthouse_resource_directory_breadth_v3 from anon;
revoke all on public.v_lighthouse_resource_directory_breadth_v3 from authenticated;
grant select on public.v_lighthouse_resource_directory_breadth_v3 to service_role;
