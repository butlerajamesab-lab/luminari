create or replace function public.luminari_harden_resource_display_name_v1(p_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(coalesce(p_name,''),'^\d{5}(-\d{4})?\s+[—-]\s+','','i')), '')
$$;

create or replace view public.v_luminari_corpus_resource_quality_hardening_v1 as
with base as (
  select q.*,c.raw_excerpt,
    public.luminari_harden_resource_display_name_v1(q.effective_name) as hardened_name,
    case when q.organization_name is null or public.luminari_resource_name_invalid_v1(q.organization_name) then null else q.organization_name end as hardened_organization_name,
    case
      when q.artifact_role='structured_workbook_source'
       and length(regexp_replace(coalesce(q.phone,''),'\D','','g')) < 10
       and coalesce(q.phone,'') !~* '(^|[^0-9])211([^0-9]|$)'
      then null else q.phone end as hardened_phone,
    case when coalesce(q.website_url,'') ~* '(https?://|www\.|[a-z0-9-]+\.[a-z]{2,})' then q.website_url else null end as hardened_website_url,
    ((length(coalesce(c.raw_excerpt,''))-length(replace(coalesce(c.raw_excerpt,''),'VERIFIED','')))/length('VERIFIED'))::int as verified_marker_count,
    ((length(coalesce(q.website_url,''))-length(replace(coalesce(q.website_url,''),' | ','')))/3)::int as website_separator_count,
    ((length(coalesce(q.phone,''))-length(replace(coalesce(q.phone,''),' | ','')))/3)::int as phone_separator_count
  from public.luminari_corpus_resource_quality_v1 q
  join public.luminari_corpus_candidate_v1 c on c.candidate_key=q.candidate_key
)
select b.*,
  lower(regexp_replace(coalesce(b.hardened_name,''),'[^a-z0-9]+','','g')) as hardened_normalized_name_key,
  case when b.hardened_website_url is not null
    then lower(regexp_replace(coalesce(substring(b.hardened_website_url from '(?i)(?:https?://)?(?:www\.)?([^/\s]+)'),''),'^www\.','','i'))
    else null end as hardened_website_domain,
  case when length(regexp_replace(coalesce(b.hardened_phone,''),'\D','','g')) >= 10
    then right(regexp_replace(b.hardened_phone,'\D','','g'),10) else null end as hardened_phone_key,
  case
    when b.quality_state='quarantined' then 'quarantined'
    when public.luminari_resource_name_invalid_v1(b.hardened_name) then 'quarantined'
    when b.artifact_role='state_resource_directory_source' and (
      b.verified_marker_count > 1
      or length(coalesce(b.raw_excerpt,'')) > 4000
      or b.website_separator_count >= 3
      or b.phone_separator_count >= 4
    ) then 'review_hold'
    else b.quality_state end as hardened_quality_state,
  b.quality_reasons
    || case when public.luminari_resource_name_invalid_v1(b.hardened_name) then '["invalid_resource_name_after_cleanup"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='state_resource_directory_source' and b.verified_marker_count>1 then '["parser_block_contains_multiple_verified_records"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='state_resource_directory_source' and length(coalesce(b.raw_excerpt,''))>4000 then '["parser_block_excessive_length"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='state_resource_directory_source' and b.website_separator_count>=3 then '["website_contact_fanout"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='state_resource_directory_source' and b.phone_separator_count>=4 then '["phone_contact_fanout"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='structured_workbook_source' and b.organization_name is not null and b.hardened_organization_name is null then '["discarded_invalid_organization_field"]'::jsonb else '[]'::jsonb end
    || case when b.artifact_role='structured_workbook_source' and b.phone is not null and b.hardened_phone is null then '["discarded_nonphone_workbook_value"]'::jsonb else '[]'::jsonb end
    || case when b.website_url is not null and b.hardened_website_url is null then '["discarded_nonwebsite_workbook_value"]'::jsonb else '[]'::jsonb end
    as hardened_quality_reasons
from base b;

revoke all on public.v_luminari_corpus_resource_quality_hardening_v1 from anon,authenticated;
