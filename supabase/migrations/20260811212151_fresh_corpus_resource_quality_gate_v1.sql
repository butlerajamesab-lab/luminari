create or replace function public.luminari_clean_resource_name_v1(p_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(regexp_replace(coalesce(p_name,''), '\s+VERIFIED\s*$', '', 'i'), '\s+\[[^]]+\]\s*★?\s*$', '', 'i')), '')
$$;

create or replace function public.luminari_resource_name_invalid_v1(p_name text)
returns boolean
language sql
immutable
as $$
  select case
    when public.luminari_clean_resource_name_v1(p_name) is null then true
    when length(public.luminari_clean_resource_name_v1(p_name)) < 4 then true
    when public.luminari_clean_resource_name_v1(p_name) ~ '^[0-9]+$' then true
    when public.luminari_clean_resource_name_v1(p_name) ~* '^(https?://|www\.)' then true
    when public.luminari_clean_resource_name_v1(p_name) ~* '^[a-z0-9.-]+\.[a-z]{2,}(/|$)' then true
    when public.luminari_clean_resource_name_v1(p_name) ~ '^[0-9() +.\-]+$'
         and length(regexp_replace(public.luminari_clean_resource_name_v1(p_name),'\D','','g')) >= 7 then true
    when public.luminari_clean_resource_name_v1(p_name) ~* '^(no dedicated portal|no portal|use phone|online portal|not available|n/?a\b|none\b|dial\b|call\b|text\b)' then true
    when public.luminari_clean_resource_name_v1(p_name) ~* '^\d{1,6}\s+.*(street|\sst\.?\b|avenue|\save\.?\b|road|\srd\.?\b|boulevard|blvd|drive|\sdr\.?\b|lane|highway|hwy|suite|room|plaza|parkway|pkwy)' then true
    else false end
$$;

create table if not exists public.luminari_corpus_resource_quality_v1 (
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  quality_version text not null,
  candidate_key text not null references public.luminari_corpus_candidate_v1(candidate_key),
  artifact_key text not null references public.luminari_corpus_source_artifact_v1(artifact_key),
  artifact_role text not null,
  source_locator text not null,
  effective_name text,
  normalized_name_key text,
  state_code text,
  jurisdiction text,
  category text,
  organization_name text,
  phone text,
  email text,
  website_url text,
  website_domain text,
  phone_key text,
  source_record_id text,
  source_priority integer not null default 0,
  quality_state text not null,
  quality_reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  primary key(run_id,quality_version,candidate_key)
);
comment on table public.luminari_corpus_resource_quality_v1 is 'Quality gate over fresh resource candidates. Quarantined/review-held rows remain inspectable and are never silently deleted.';

create table if not exists public.luminari_corpus_resource_identity_v1 (
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  quality_version text not null,
  identity_key text not null,
  resolution_state text not null,
  canonical_name text not null,
  normalized_name_key text not null,
  state_code text,
  jurisdiction text not null,
  category text,
  canonical_candidate_key text not null references public.luminari_corpus_candidate_v1(candidate_key),
  organization_name text,
  phone text,
  email text,
  website_url text,
  candidate_count integer not null,
  candidate_keys jsonb not null,
  source_artifacts jsonb not null,
  observed_domains jsonb not null,
  observed_phones jsonb not null,
  source_record_ids jsonb not null,
  identity_receipt_hash text not null,
  created_at timestamptz not null default now(),
  primary key(run_id,quality_version,identity_key),
  check (identity_receipt_hash ~ '^[0-9a-f]{64}$')
);
comment on table public.luminari_corpus_resource_identity_v1 is 'Deterministic resource identities derived only from quality-passed fresh corpus candidates. Conflicts remain explicit.';

create index if not exists luminari_corpus_resource_quality_state_idx on public.luminari_corpus_resource_quality_v1(run_id,quality_version,quality_state,state_code);
create index if not exists luminari_corpus_resource_identity_state_idx on public.luminari_corpus_resource_identity_v1(run_id,quality_version,resolution_state,state_code);
revoke all on public.luminari_corpus_resource_quality_v1 from anon,authenticated;
revoke all on public.luminari_corpus_resource_identity_v1 from anon,authenticated;

create or replace function public.refresh_luminari_corpus_resource_quality_v1(
  p_run_id uuid,
  p_quality_version text default 'resource_quality_v1.0.0'
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_candidates integer := 0;
  v_publishable integer := 0;
  v_review_hold integer := 0;
  v_quarantined integer := 0;
  v_resolved integer := 0;
  v_conflicts integer := 0;
begin
  insert into public.luminari_corpus_resource_quality_v1(
    run_id,quality_version,candidate_key,artifact_key,artifact_role,source_locator,effective_name,normalized_name_key,
    state_code,jurisdiction,category,organization_name,phone,email,website_url,website_domain,phone_key,source_record_id,
    source_priority,quality_state,quality_reasons,evaluated_at
  )
  with base as (
    select c.*, a.artifact_role,
      case when a.artifact_role='structured_workbook_source' then
        coalesce(nullif(c.payload->'row'->>'resource_name',''),nullif(c.payload->'row'->>'program',''),nullif(c.payload->'row'->>'name',''),c.name)
      else c.name end as proposed_name,
      case when a.artifact_role='structured_workbook_source' then
        coalesce(nullif(c.payload->'row'->>'provider_name',''),nullif(c.payload->'row'->>'organization_name',''),nullif(c.payload->'row'->>'agency_name',''),c.organization_name)
      else c.organization_name end as proposed_org,
      case when a.artifact_role='structured_workbook_source' then
        coalesce(nullif(c.payload->'row'->>'website',''),nullif(c.payload->'row'->>'website_url',''),nullif(c.payload->'row'->>'url',''),nullif(c.payload->'row'->>'application_url',''),c.website_url)
      else c.website_url end as proposed_website,
      case when a.artifact_role='structured_workbook_source' then
        coalesce(nullif(c.payload->'row'->>'phone',''),nullif(c.payload->'row'->>'contact_phone',''),c.phone)
      else c.phone end as proposed_phone,
      case
        when c.state_code ~ '^[A-Z]{2}$' then c.state_code
        when upper(coalesce(c.payload->'row'->>'state_code','')) = any(array['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','AS','MP','VI']) then upper(c.payload->'row'->>'state_code')
        when upper(coalesce(c.payload->'row'->>'coverage_values','')) = any(array['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR','GU','AS','MP','VI']) then upper(c.payload->'row'->>'coverage_values')
        when coalesce(c.payload->'row'->>'jurisdiction_id','') ~ '^[a-z]{2}-' then upper(left(c.payload->'row'->>'jurisdiction_id',2))
        else null end as proposed_state,
      lower(coalesce(c.category,'')) as category_key,
      coalesce(nullif(c.payload->'row'->>'resource_uuid',''),nullif(c.payload->'row'->>'resource_id',''),nullif(c.payload->'row'->>'fed_dir_uuid','')) as proposed_source_id
    from public.luminari_corpus_candidate_v1 c
    join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=c.artifact_key
    where c.run_id=p_run_id and c.candidate_type='resource'
  ), cleaned as (
    select b.*,
      public.luminari_clean_resource_name_v1(b.proposed_name) as clean_name,
      case
        when b.proposed_state is not null then b.proposed_state
        when b.artifact_role='structured_workbook_source' and (
          b.category_key in ('federal_resource_directory','national_hotline')
          or coalesce(b.payload->'row'->>'coverage','') ~* '(national|all 50|federal)'
          or coalesce(b.payload->'row'->>'jurisdiction','') ~* '^federal$'
        ) then 'US'
        when b.jurisdiction='US' then 'US'
        else null end as jurisdiction_key,
      case
        when b.artifact_role='state_resource_directory_source' then 100
        when b.artifact_role='structured_workbook_source' and b.proposed_source_id is not null then 95
        when b.artifact_role='structured_workbook_source' then 85
        else 50 end as priority
    from base b
  ), evaluated as (
    select cl.*,
      lower(regexp_replace(coalesce(cl.clean_name,''),'[^a-z0-9]+','','g')) as name_key,
      lower(regexp_replace(coalesce(substring(cl.proposed_website from '(?i)(?:https?://)?(?:www\.)?([^/\s]+)'),''),'^www\.','','i')) as domain_key,
      case when length(regexp_replace(coalesce(cl.proposed_phone,''),'\D','','g')) >= 10 then right(regexp_replace(cl.proposed_phone,'\D','','g'),10) else null end as phone_digits,
      case
        when cl.jurisdiction_resolution_state='conflict' then 'quarantined'
        when public.luminari_resource_name_invalid_v1(cl.clean_name) then 'quarantined'
        when cl.artifact_role='state_resource_directory_source' and not coalesce((cl.payload->>'verified_marker')::boolean,false) then 'review_hold'
        when cl.artifact_role='structured_workbook_source' and cl.category_key not in (
          'general','healthcare','food_and_nutrition','wa_resource_directory','housing_and_rent','domestic_violence_and_safety',
          'legal_aid','benefits','federal_resource_directory','tribal_and_indigenous','benefits_office','utilities','national_hotline',
          'cash_assistance_and_income','clinic','employment','housing','nonprofit','tribal_service','shelter','legal','housing_provider',
          'food_bank','hotline','program','hospital'
        ) then 'review_hold'
        when cl.artifact_role not in ('state_resource_directory_source','structured_workbook_source') then 'review_hold'
        when cl.jurisdiction_key is null then 'review_hold'
        else 'publishable_candidate' end as qstate
    from cleaned cl
  )
  select p_run_id,p_quality_version,e.candidate_key,e.artifact_key,e.artifact_role,e.source_locator,e.clean_name,
    nullif(e.name_key,''),case when e.jurisdiction_key='US' then null else e.jurisdiction_key end,e.jurisdiction_key,
    nullif(e.category,''),nullif(e.proposed_org,''),nullif(e.proposed_phone,''),e.email,nullif(e.proposed_website,''),
    nullif(e.domain_key,''),e.phone_digits,e.proposed_source_id,e.priority,e.qstate,
    to_jsonb(array_remove(array[
      case when e.jurisdiction_resolution_state='conflict' then 'jurisdiction_conflict' end,
      case when public.luminari_resource_name_invalid_v1(e.clean_name) then 'invalid_resource_name' end,
      case when e.artifact_role='state_resource_directory_source' and not coalesce((e.payload->>'verified_marker')::boolean,false) then 'source_record_not_verified_marker' end,
      case when e.artifact_role='structured_workbook_source' and e.category_key not in (
        'general','healthcare','food_and_nutrition','wa_resource_directory','housing_and_rent','domestic_violence_and_safety',
        'legal_aid','benefits','federal_resource_directory','tribal_and_indigenous','benefits_office','utilities','national_hotline',
        'cash_assistance_and_income','clinic','employment','housing','nonprofit','tribal_service','shelter','legal','housing_provider',
        'food_bank','hotline','program','hospital'
      ) then 'structured_sheet_not_resource_lane' end,
      case when e.artifact_role not in ('state_resource_directory_source','structured_workbook_source') then 'source_lane_requires_separate_projection' end,
      case when e.jurisdiction_key is null then 'jurisdiction_unresolved' end
    ]::text[],null)),now()
  from evaluated e
  on conflict(run_id,quality_version,candidate_key) do update set
    effective_name=excluded.effective_name,normalized_name_key=excluded.normalized_name_key,state_code=excluded.state_code,
    jurisdiction=excluded.jurisdiction,category=excluded.category,organization_name=excluded.organization_name,phone=excluded.phone,
    email=excluded.email,website_url=excluded.website_url,website_domain=excluded.website_domain,phone_key=excluded.phone_key,
    source_record_id=excluded.source_record_id,source_priority=excluded.source_priority,quality_state=excluded.quality_state,
    quality_reasons=excluded.quality_reasons,evaluated_at=now();

  delete from public.luminari_corpus_resource_identity_v1 where run_id=p_run_id and quality_version=p_quality_version;

  insert into public.luminari_corpus_resource_identity_v1(
    run_id,quality_version,identity_key,resolution_state,canonical_name,normalized_name_key,state_code,jurisdiction,category,
    canonical_candidate_key,organization_name,phone,email,website_url,candidate_count,candidate_keys,source_artifacts,
    observed_domains,observed_phones,source_record_ids,identity_receipt_hash
  )
  with q as (
    select q.*, c.description, c.apply_notes, c.eligibility_summary,
      row_number() over(partition by q.jurisdiction,q.normalized_name_key order by q.source_priority desc,
        (q.source_record_id is not null) desc,(q.website_domain is not null) desc,(q.phone_key is not null) desc,
        length(coalesce(c.description,'')) desc,q.artifact_key,q.candidate_key) as choice_rank
    from public.luminari_corpus_resource_quality_v1 q
    join public.luminari_corpus_candidate_v1 c on c.candidate_key=q.candidate_key
    where q.run_id=p_run_id and q.quality_version=p_quality_version and q.quality_state='publishable_candidate'
      and q.normalized_name_key is not null and q.jurisdiction is not null
  ), grouped as (
    select jurisdiction,normalized_name_key,
      count(*)::int as candidate_count,
      count(website_domain)::int as domain_observations,count(distinct website_domain)::int as distinct_domains,
      count(phone_key)::int as phone_observations,count(distinct phone_key)::int as distinct_phones,
      jsonb_agg(candidate_key order by candidate_key) as candidate_keys,
      jsonb_agg(distinct artifact_key) as source_artifacts,
      coalesce(jsonb_agg(distinct website_domain) filter(where website_domain is not null),'[]'::jsonb) as observed_domains,
      coalesce(jsonb_agg(distinct phone_key) filter(where phone_key is not null),'[]'::jsonb) as observed_phones,
      coalesce(jsonb_agg(distinct source_record_id) filter(where source_record_id is not null),'[]'::jsonb) as source_record_ids
    from q group by jurisdiction,normalized_name_key
  ), resolved as (
    select g.*,
      case when
        (g.distinct_domains>1 and g.domain_observations=g.distinct_domains and not(g.phone_observations>g.distinct_phones))
        or (g.distinct_phones>1 and g.phone_observations=g.distinct_phones and not(g.domain_observations>g.distinct_domains))
      then 'unresolved_conflict' else 'resolved' end as resolution_state
    from grouped g
  ), chosen as (
    select q.*,r.candidate_count,r.candidate_keys,r.source_artifacts,r.observed_domains,r.observed_phones,r.source_record_ids,r.resolution_state
    from q join resolved r using(jurisdiction,normalized_name_key) where q.choice_rank=1
  )
  select p_run_id,p_quality_version,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state,'sha256'),'hex'),
    ch.resolution_state,ch.effective_name,ch.normalized_name_key,ch.state_code,ch.jurisdiction,ch.category,ch.candidate_key,
    ch.organization_name,ch.phone,ch.email,ch.website_url,ch.candidate_count,ch.candidate_keys,ch.source_artifacts,
    ch.observed_domains,ch.observed_phones,ch.source_record_ids,
    encode(digest(ch.jurisdiction||'|'||ch.normalized_name_key||'|'||ch.resolution_state||'|'||ch.candidate_keys::text||'|'||ch.source_artifacts::text,'sha256'),'hex')
  from chosen ch;

  select count(*)::int,count(*) filter(where quality_state='publishable_candidate')::int,
         count(*) filter(where quality_state='review_hold')::int,count(*) filter(where quality_state='quarantined')::int
    into v_candidates,v_publishable,v_review_hold,v_quarantined
  from public.luminari_corpus_resource_quality_v1 where run_id=p_run_id and quality_version=p_quality_version;
  select count(*) filter(where resolution_state='resolved')::int,count(*) filter(where resolution_state<>'resolved')::int
    into v_resolved,v_conflicts
  from public.luminari_corpus_resource_identity_v1 where run_id=p_run_id and quality_version=p_quality_version;

  return jsonb_build_object('run_id',p_run_id,'quality_version',p_quality_version,'resource_candidates',v_candidates,
    'publishable_candidates',v_publishable,'review_hold',v_review_hold,'quarantined',v_quarantined,
    'resolved_identities',v_resolved,'identity_conflicts',v_conflicts,'evaluated_at',clock_timestamp());
end;
$$;
revoke all on function public.refresh_luminari_corpus_resource_quality_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.refresh_luminari_corpus_resource_quality_v1(uuid,text) to service_role;
