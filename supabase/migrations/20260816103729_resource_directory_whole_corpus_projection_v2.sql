-- Current person-facing Resource Directory projection over the whole-corpus civic-object substrate.
-- Preserves existing active-snapshot UUIDs where membership is known; assigns deterministic UUIDs otherwise.
-- Deduplicates only when rows share the same stable UUID. No fuzzy identity merge.

create or replace view public.v_lighthouse_resource_directory_whole_corpus_v2
with (security_invoker = true) as
with active_snapshot as (
  select snapshot_id
    from public.luminari_resource_snapshot_v1
   where is_current=true and status='active'
   order by activated_at desc nulls last,created_at desc
   limit 1
), snapshot_membership as (
  select distinct on (candidate_key)
         candidate_key as object_ref,
         i.resource_entity_id,
         i.identity_key
    from active_snapshot s
    join public.luminari_resource_snapshot_identity_v1 i
      on i.snapshot_id=s.snapshot_id and i.resolution_state='resolved'
   cross join lateral jsonb_array_elements_text(i.candidate_keys) as k(candidate_key)
   order by candidate_key,i.created_at desc,i.resource_entity_id
), mapped as (
  select
    c.*,
    coalesce(
      sm.resource_entity_id,
      public.luminari_resource_identity_uuid_v1(
        encode(
          digest(
            'lighthouse-resource-directory-v2|' || c.artifact_key || '|' || c.source_locator || '|' || c.object_class,
            'sha256'
          ),
          'hex'
        )
      )
    ) as stable_resource_entity_id,
    sm.resource_entity_id is not null as legacy_identity_preserved,
    sm.identity_key as legacy_identity_key,
    case
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(food|nutrition|snap|wic|pantry|meal)' then 'food_nutrition'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(mental health|behavioral health|substance|recovery|healthcare|health care|clinic|hospital|medical|medicaid|medicare)' then 'healthcare'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(housing|shelter|rent|homeless|eviction|mortgage)' then 'housing'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(domestic violence|sexual assault|crisis|safety|trafficking|victim)' then 'safety_crisis'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(legal aid|legal service|civil rights|attorney|lawyer|court help)' then 'legal_civil_rights'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(utility|utilities|energy|electric|water|heating|liheap)' then 'utilities'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(tribal|indigenous|native american|american indian|alaska native)' then 'tribal'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(employment|workforce|labor|job|unemployment|wage)' then 'employment_labor'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(disability|disabled|ada|developmental)' then 'disability'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(veteran|military|va benefit)' then 'veterans'
      when lower(concat_ws(' ',coalesce(c.category,''),coalesce(c.section_name,''),coalesce(c.organization_type,''),coalesce(c.name,''),coalesce(c.description,''))) ~ '(cash assistance|income support|tanf|ssi|ssdi|public assistance|benefit)' then 'cash_assistance'
      else 'general_resource'
    end as ui_category
  from public.v_lighthouse_resource_program_catalog_v2 c
  left join snapshot_membership sm on sm.object_ref=c.object_ref
  where c.person_facing_ready
), ranked as (
  select
    m.*,
    row_number() over (
      partition by m.stable_resource_entity_id
      order by
        m.legacy_identity_preserved desc,
        (m.object_class='resource') desc,
        m.has_access_point desc,
        m.current_run_completed_at desc nulls last,
        m.reconciled_at desc,
        m.object_ref
    ) as stable_identity_rank
  from mapped m
)
select
  stable_resource_entity_id as resource_entity_id,
  legacy_identity_preserved,
  legacy_identity_key,
  ui_category,
  civic_object_uid,object_ref,source_object_type,object_class,target_surface,run_id,current_run_role,
  current_run_engine_version,current_run_completed_at,artifact_key,artifact_role,source_locator,source_content_sha256,
  source_candidate_hash,parser_version,jurisdiction,state_code,jurisdiction_resolution_state,section_name,name,
  organization_name,category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,description,
  filing_portal,filing_portal_url,statutory_authority,deadline,hours,languages,organization_type,candidate_state,
  source_created_at,field_provenance,has_access_point,projection_state,projection_version,reconciled_at,typed_ready,
  jurisdiction_ready,direct_access_ready,data_state,catalog_kind,person_facing_ready
from ranked
where stable_identity_rank=1;

revoke all on public.v_lighthouse_resource_directory_whole_corpus_v2 from public,anon,authenticated;
grant select on public.v_lighthouse_resource_directory_whole_corpus_v2 to service_role;
