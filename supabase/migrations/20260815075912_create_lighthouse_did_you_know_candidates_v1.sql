create or replace view public.v_lighthouse_did_you_know_candidates_v1 as
select
  md5(v.resource_uid || ':' || coalesce(v.name,'')) as fact_id,
  'resource_fact'::text as fact_type,
  v.name as title,
  coalesce(nullif(v.description,''),nullif(v.eligibility,''),nullif(v.notes,''),
    case
      when v.phone is not null and v.website is not null then 'Contact '||v.phone||' or visit '||v.website||'.'
      when v.phone is not null then 'Contact '||v.phone||'.'
      when v.website is not null then 'Visit '||v.website||'.'
      else null
    end) as body,
  v.category,
  v.jurisdiction_code,
  v.jurisdiction_raw,
  v.phone,
  v.website,
  v.source_lane,
  v.source_id,
  v.verification_status,
  v.metadata,
  case
    when v.verification_status ilike '%verified%' then 100
    when v.website is not null or v.phone is not null then 70
    else 40
  end as display_priority
from public.v_lighthouse_resource_catalog_v1 v
where nullif(trim(v.name),'') is not null
  and lower(trim(v.name)) not in ('information','filing / complaint portal','website','phone','contact','address','fips')
  and (
    nullif(trim(coalesce(v.description,'')),'') is not null
    or nullif(trim(coalesce(v.eligibility,'')),'') is not null
    or nullif(trim(coalesce(v.notes,'')),'') is not null
    or v.phone is not null
    or v.website is not null
  );
