create or replace view public.v_lighthouse_resource_catalog_breadth_v2 as
with unioned as (
  select
    c.resource_uid::text as resource_record_uid,
    c.source_lane::text as source_lane,
    c.source_id::text as source_id,
    c.name::text as name,
    c.category::text as category,
    c.jurisdiction_raw::text as jurisdiction_raw,
    c.jurisdiction_code::text as jurisdiction_code,
    c.organization::text as organization,
    c.phone::text as phone,
    c.email::text as email,
    c.website::text as website,
    c.address::text as address,
    c.description::text as description,
    c.eligibility::text as eligibility,
    c.notes::text as notes,
    c.verification_status::text as verification_status,
    c.created_at as source_created_at,
    c.metadata as provenance,
    'legacy_catalog'::text as publication_lane
  from public.v_lighthouse_resource_catalog_v1 c

  union all

  select
    ('whole_corpus:' || w.resource_entity_id::text)::text as resource_record_uid,
    'whole_corpus_current'::text as source_lane,
    w.resource_entity_id::text as source_id,
    coalesce(nullif(w.name,''), nullif(w.organization_name,''))::text as name,
    coalesce(nullif(w.ui_category,''), nullif(w.category,''), nullif(w.catalog_kind,''), 'general_resource')::text as category,
    w.jurisdiction::text as jurisdiction_raw,
    w.state_code::text as jurisdiction_code,
    w.organization_name::text as organization,
    w.phone::text as phone,
    w.email::text as email,
    w.website_url::text as website,
    w.address::text as address,
    w.description::text as description,
    w.eligibility_summary::text as eligibility,
    w.apply_notes::text as notes,
    w.data_state::text as verification_status,
    w.source_created_at,
    jsonb_build_object(
      'civic_object_uid', w.civic_object_uid,
      'object_ref', w.object_ref,
      'object_class', w.object_class,
      'target_surface', w.target_surface,
      'run_id', w.run_id,
      'artifact_key', w.artifact_key,
      'artifact_role', w.artifact_role,
      'source_locator', w.source_locator,
      'source_content_sha256', w.source_content_sha256,
      'source_candidate_hash', w.source_candidate_hash,
      'parser_version', w.parser_version,
      'field_provenance', w.field_provenance,
      'legacy_identity_preserved', w.legacy_identity_preserved,
      'legacy_identity_key', w.legacy_identity_key,
      'projection_state', w.projection_state,
      'projection_version', w.projection_version,
      'person_facing_ready', w.person_facing_ready
    ) as provenance,
    'whole_corpus_current'::text as publication_lane
  from public.v_lighthouse_resource_directory_whole_corpus_v2 w
), keyed as (
  select
    u.*,
    lower(regexp_replace(coalesce(u.name,''), '[^a-z0-9]+', '', 'g')) as normalized_name_key,
    md5(
      lower(regexp_replace(coalesce(u.name,''), '[^a-z0-9]+', '', 'g'))
      || '|'
      || coalesce(u.jurisdiction_code,'')
    ) as exact_name_jurisdiction_key
  from unioned u
), group_stats as (
  select
    exact_name_jurisdiction_key,
    count(*)::int as exact_match_record_count,
    count(distinct source_lane)::int as corroborating_lane_count
  from keyed
  group by exact_name_jurisdiction_key
)
select
  k.*,
  s.exact_match_record_count,
  s.corroborating_lane_count
from keyed k
join group_stats s using (exact_name_jurisdiction_key);

comment on view public.v_lighthouse_resource_catalog_breadth_v2 is
'Breadth-preserving resource/program source-record union. Preserves the pre-existing Lighthouse resource catalog plus current whole-corpus person-facing rows. Exact-name/jurisdiction keys are corroboration hints only and do not silently merge identities.';

revoke all on public.v_lighthouse_resource_catalog_breadth_v2 from public;
revoke all on public.v_lighthouse_resource_catalog_breadth_v2 from anon;
revoke all on public.v_lighthouse_resource_catalog_breadth_v2 from authenticated;
grant select on public.v_lighthouse_resource_catalog_breadth_v2 to service_role;
